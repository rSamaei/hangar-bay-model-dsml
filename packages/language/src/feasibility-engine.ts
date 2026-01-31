import type { 
    Hangar,
    HangarBay,
    ClearanceEnvelope,
    AircraftType,
    HangarDoor
} from './generated/ast.js';

// ============================================================================
// STRUCTURED EVIDENCE AND RULE RESULTS
// ============================================================================

export interface RuleResult {
    ok: boolean;
    ruleId: string;
    message: string;
    evidence: Record<string, any>;
}

export interface ValidationReport {
    violations: RuleResult[];
    timestamp: string;
}

// ============================================================================
// CORE FEASIBILITY ENGINE (SINGLE SOURCE OF TRUTH)
// ============================================================================

export class FeasibilityEngine {
    /**
     * SFR11: Check if aircraft fits through door with clearance
     */
    checkDoorFit(
        aircraft: AircraftType,
        door: HangarDoor,
        clearance?: ClearanceEnvelope
    ): RuleResult {
        const effectiveWingspan = aircraft.wingspan + (clearance?.lateralMargin ?? 0);
        const effectiveHeight = (aircraft.tailHeight ?? aircraft.height) + (clearance?.verticalMargin ?? 0);

        const wingspanFits = effectiveWingspan <= door.width;
        const heightFits = effectiveHeight <= door.height;
        const ok = wingspanFits && heightFits;

        const violations: string[] = [];
        if (!wingspanFits) violations.push(`wingspan: ${effectiveWingspan.toFixed(2)}m > ${door.width}m`);
        if (!heightFits) violations.push(`height: ${effectiveHeight.toFixed(2)}m > ${door.height}m`);

        return {
            ok,
            ruleId: 'SFR11_DOOR_FIT',
            message: ok 
                ? `Aircraft ${aircraft.name} fits through door ${door.name}`
                : `Aircraft ${aircraft.name} does not fit through door ${door.name}: ${violations.join(', ')}`,
            evidence: {
                aircraftName: aircraft.name,
                doorName: door.name,
                doorWidth: door.width,
                doorHeight: door.height,
                effectiveWingspan,
                effectiveHeight,
                clearanceName: clearance?.name,
                wingspanFits,
                heightFits
            }
        };
    }

    /**
     * SFR12: Check if aircraft fits in bay with clearance
     */
    checkBayFit(
        aircraft: AircraftType,
        bay: HangarBay,
        clearance?: ClearanceEnvelope
    ): RuleResult {
        const effectiveWingspan = aircraft.wingspan + (clearance?.lateralMargin ?? 0);
        const effectiveLength = aircraft.length + (clearance?.longitudinalMargin ?? 0);
        const effectiveHeight = (aircraft.tailHeight ?? aircraft.height) + (clearance?.verticalMargin ?? 0);

        const widthFits = effectiveWingspan <= bay.width;
        const depthFits = effectiveLength <= bay.depth;
        const heightFits = effectiveHeight <= bay.height;
        const ok = widthFits && depthFits && heightFits;

        const violations: string[] = [];
        if (!widthFits) violations.push(`wingspan: ${effectiveWingspan.toFixed(2)}m > ${bay.width}m`);
        if (!depthFits) violations.push(`length: ${effectiveLength.toFixed(2)}m > ${bay.depth}m`);
        if (!heightFits) violations.push(`height: ${effectiveHeight.toFixed(2)}m > ${bay.height}m`);

        return {
            ok,
            ruleId: 'SFR12_BAY_FIT',
            message: ok
                ? `Aircraft ${aircraft.name} fits in bay ${bay.name}`
                : `Aircraft ${aircraft.name} does not fit in bay ${bay.name}: ${violations.join(', ')}`,
            evidence: {
                aircraftName: aircraft.name,
                bayName: bay.name,
                bayWidth: bay.width,
                bayDepth: bay.depth,
                bayHeight: bay.height,
                effectiveWingspan,
                effectiveLength,
                effectiveHeight,
                clearanceName: clearance?.name,
                widthFits,
                depthFits,
                heightFits
            }
        };
    }

    /**
     * SFR13: Check if bays are contiguous (adjacent in grid or explicit adjacency)
     */
    checkBayContiguity(
        bays: HangarBay[],
        bayGrid: { rows?: number; cols?: number; bays: HangarBay[] }
    ): RuleResult {
        if (bays.length <= 1) {
            return {
                ok: true,
                ruleId: 'SFR13_CONTIGUITY',
                message: 'Single bay requires no contiguity check',
                evidence: { bayCount: bays.length, bayNames: bays.map(b => b.name) }
            };
        }

        // Build adjacency map from grid coordinates and explicit adjacency
        const adjacency = new Map<string, Set<string>>();
        
        for (const bay of bayGrid.bays) {
            adjacency.set(bay.name, new Set());
        }

        // Add grid-derived adjacency
        if (bayGrid.rows && bayGrid.cols) {
            for (const bay of bayGrid.bays) {
                if (bay.row !== undefined && bay.col !== undefined) {
                    // Check all 4 adjacent positions
                    const neighbors = [
                        { row: bay.row - 1, col: bay.col },
                        { row: bay.row + 1, col: bay.col },
                        { row: bay.row, col: bay.col - 1 },
                        { row: bay.row, col: bay.col + 1 }
                    ];

                    for (const neighbor of neighbors) {
                        const adjacentBay = bayGrid.bays.find(
                            b => b.row === neighbor.row && b.col === neighbor.col
                        );
                        if (adjacentBay) {
                            adjacency.get(bay.name)?.add(adjacentBay.name);
                        }
                    }
                }
            }
        }

        // Add explicit adjacency (overrides)
        for (const bay of bayGrid.bays) {
            if (bay.adjacent) {
                for (const adj of bay.adjacent) {
                    const adjName = adj.ref?.name;
                    if (adjName) {
                        adjacency.get(bay.name)?.add(adjName);
                        adjacency.get(adjName)?.add(bay.name); // bidirectional
                    }
                }
            }
        }

        // Check if all selected bays form a connected component
        const selected = new Set(bays.map(b => b.name));
        const visited = new Set<string>();
        const queue = [bays[0].name];
        visited.add(bays[0].name);

        while (queue.length > 0) {
            const current = queue.shift()!;
            const neighbors = adjacency.get(current) ?? new Set();

            for (const neighbor of neighbors) {
                if (selected.has(neighbor) && !visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }

        const ok = visited.size === selected.size;

        return {
            ok,
            ruleId: 'SFR13_CONTIGUITY',
            message: ok
                ? `Bays ${bays.map(b => b.name).join(', ')} are contiguous`
                : `Bays ${bays.map(b => b.name).join(', ')} are not contiguous (${visited.size}/${selected.size} reachable)`,
            evidence: {
                bayNames: bays.map(b => b.name),
                bayCount: bays.length,
                reachableCount: visited.size,
                gridDefined: !!(bayGrid.rows && bayGrid.cols),
                adjacencyMap: Object.fromEntries(
                    Array.from(adjacency.entries()).map(([k, v]) => [k, Array.from(v)])
                )
            }
        };
    }

    /**
     * SFR14: Check if bay belongs to hangar
     */
    checkBayOwnership(bay: HangarBay, hangar: Hangar): RuleResult {
        const ok = hangar.grid.bays.includes(bay);

        return {
            ok,
            ruleId: 'SFR14_BAY_OWNERSHIP',
            message: ok
                ? `Bay ${bay.name} belongs to hangar ${hangar.name}`
                : `Bay ${bay.name} does not belong to hangar ${hangar.name}`,
            evidence: {
                bayName: bay.name,
                hangarName: hangar.name,
                hangarBays: hangar.grid.bays.map(b => b.name)
            }
        };
    }

    /**
     * SFR15: Check if door belongs to hangar
     */
    checkDoorOwnership(door: HangarDoor, hangar: Hangar): RuleResult {
        const ok = hangar.doors.includes(door);

        return {
            ok,
            ruleId: 'SFR15_DOOR_OWNERSHIP',
            message: ok
                ? `Door ${door.name} belongs to hangar ${hangar.name}`
                : `Door ${door.name} does not belong to hangar ${hangar.name}`,
            evidence: {
                doorName: door.name,
                hangarName: hangar.name,
                hangarDoors: hangar.doors.map(d => d.name)
            }
        };
    }

    /**
     * SFR16: Check for time overlap between two inductions
     */
    checkTimeOverlap(
        start1: string | Date,
        end1: string | Date,
        start2: string | Date,
        end2: string | Date
    ): RuleResult {
        const s1 = new Date(start1);
        const e1 = new Date(end1);
        const s2 = new Date(start2);
        const e2 = new Date(end2);

        const overlaps = s1 < e2 && s2 < e1;

        let overlapStart: Date | null = null;
        let overlapEnd: Date | null = null;

        if (overlaps) {
            overlapStart = s1 > s2 ? s1 : s2;
            overlapEnd = e1 < e2 ? e1 : e2;
        }

        return {
            ok: !overlaps,
            ruleId: 'SFR16_TIME_OVERLAP',
            message: overlaps
                ? `Time overlap detected: ${overlapStart?.toISOString()} to ${overlapEnd?.toISOString()}`
                : 'No time overlap',
            evidence: {
                period1: { start: s1.toISOString(), end: e1.toISOString() },
                period2: { start: s2.toISOString(), end: e2.toISOString() },
                overlaps,
                overlapInterval: overlaps && overlapStart && overlapEnd
                    ? { start: overlapStart.toISOString(), end: overlapEnd.toISOString() }
                    : null
            }
        };
    }

    /**
     * Validate a complete induction against all rules
     */
    validateInduction(induction: {
        aircraft: AircraftType;
        hangar: Hangar;
        bays: HangarBay[];
        door?: HangarDoor;
        clearance?: ClearanceEnvelope;
    }): RuleResult[] {
        const results: RuleResult[] = [];

        // SFR11: Door fit
        if (induction.door) {
            results.push(this.checkDoorFit(induction.aircraft, induction.door, induction.clearance));
        }

        // SFR12: Bay fit for each bay
        for (const bay of induction.bays) {
            results.push(this.checkBayFit(induction.aircraft, bay, induction.clearance));
        }

        // SFR13: Bay contiguity
        if (induction.bays.length > 1) {
            results.push(this.checkBayContiguity(induction.bays, induction.hangar.grid));
        }

        // SFR14: Bay ownership
        for (const bay of induction.bays) {
            results.push(this.checkBayOwnership(bay, induction.hangar));
        }

        // SFR15: Door ownership
        if (induction.door) {
            results.push(this.checkDoorOwnership(induction.door, induction.hangar));
        }

        return results;
    }

    /**
     * Find suitable bays for an aircraft in a hangar
     */
    findSuitableBays(
        aircraft: AircraftType,
        hangar: Hangar,
        clearance?: ClearanceEnvelope
    ): HangarBay[] {
        return hangar.grid.bays.filter(bay => {
            const result = this.checkBayFit(aircraft, bay, clearance);
            return result.ok;
        });
    }

    /**
     * Generate machine-readable validation report
     */
    generateValidationReport(results: RuleResult[]): ValidationReport {
        return {
            violations: results.filter(r => !r.ok),
            timestamp: new Date().toISOString()
        };
    }
}