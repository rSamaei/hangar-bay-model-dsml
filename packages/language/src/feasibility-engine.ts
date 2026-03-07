/**
 * Core domain feasibility rules (SFR11–SFR16).
 *
 * Pure functions operating on AST types with no side effects or Langium
 * dependencies.  Used by both the language validators and the simulator as
 * the single source of truth for geometry and ownership checks.
 */
import type { 
    Hangar,
    HangarBay,
    ClearanceEnvelope,
    AircraftType,
    HangarDoor
} from './generated/ast.js';

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

/** SFR11: Check if aircraft fits through door with clearance. */
export function checkDoorFit(
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

/** SFR12: Check if aircraft fits in a single bay with clearance. */
export function checkBayFit(
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
 * SFR12_COMBINED: Check if aircraft fits the aggregate bay set.
 * - lateral:      sumWidth >= effectiveWingspan, minDepth >= effectiveLength
 * - longitudinal: sumDepth >= effectiveLength,  minWidth >= effectiveWingspan
 * Height check is always: minHeight >= effectiveTailHeight.
 */
export function checkBaySetFit(
    aircraft: AircraftType,
    bays: HangarBay[],
    clearance?: ClearanceEnvelope,
    span: string = 'lateral'
): RuleResult {
    const effectiveWingspan = aircraft.wingspan + (clearance?.lateralMargin ?? 0);
    const effectiveLength = aircraft.length + (clearance?.longitudinalMargin ?? 0);
    const effectiveHeight = (aircraft.tailHeight ?? aircraft.height) + (clearance?.verticalMargin ?? 0);

    const isLongitudinal = span === 'longitudinal';
    const bayNames = bays.map(b => b.name);

    let minHeight = bays[0].height;
    let limitingHeightBay = bays[0].name;
    for (const bay of bays) {
        if (bay.height < minHeight) { minHeight = bay.height; limitingHeightBay = bay.name; }
    }
    const heightFits = minHeight >= effectiveHeight;
    const violations: string[] = [];
    let primaryFits: boolean;
    let secondaryFits: boolean;
    let combinedTotal: number;
    let evidence: Record<string, any>;

    if (isLongitudinal) {
        combinedTotal = bays.reduce((s, b) => s + b.depth, 0);
        let minWidth = bays[0].width;
        let limitingWidthBay = bays[0].name;
        for (const bay of bays) {
            if (bay.width < minWidth) { minWidth = bay.width; limitingWidthBay = bay.name; }
        }
        primaryFits = combinedTotal >= effectiveLength;
        secondaryFits = minWidth >= effectiveWingspan;
        if (!primaryFits) violations.push(`sum depth ${combinedTotal.toFixed(2)}m < length ${effectiveLength.toFixed(2)}m`);
        if (!secondaryFits) violations.push(`min width ${minWidth.toFixed(2)}m (${limitingWidthBay}) < wingspan ${effectiveWingspan.toFixed(2)}m`);
        evidence = { bayNames, span, sumDepth: combinedTotal, minWidth, limitingWidthBay, minHeight, limitingHeightBay,
            effectiveWingspan, effectiveLength, effectiveHeight,
            depthFits: primaryFits, widthFits: secondaryFits, heightFits, violations };
    } else {
        combinedTotal = bays.reduce((s, b) => s + b.width, 0);
        let minDepth = bays[0].depth;
        let limitingDepthBay = bays[0].name;
        for (const bay of bays) {
            if (bay.depth < minDepth) { minDepth = bay.depth; limitingDepthBay = bay.name; }
        }
        primaryFits = combinedTotal >= effectiveWingspan;
        secondaryFits = minDepth >= effectiveLength;
        if (!primaryFits) violations.push(`sum width ${combinedTotal.toFixed(2)}m < wingspan ${effectiveWingspan.toFixed(2)}m`);
        if (!secondaryFits) violations.push(`min depth ${minDepth.toFixed(2)}m (${limitingDepthBay}) < length ${effectiveLength.toFixed(2)}m`);
        evidence = { bayNames, span, sumWidth: combinedTotal, minDepth, limitingDepthBay, minHeight, limitingHeightBay,
            effectiveWingspan, effectiveLength, effectiveHeight,
            widthFits: primaryFits, depthFits: secondaryFits, heightFits, violations };
    }
    if (!heightFits) violations.push(`min height ${minHeight.toFixed(2)}m (${limitingHeightBay}) < tail height ${effectiveHeight.toFixed(2)}m`);

    const ok = primaryFits && secondaryFits && heightFits;
    const dimLabel = isLongitudinal ? 'length' : 'wingspan';
    const dimVal = isLongitudinal ? effectiveLength : effectiveWingspan;
    const axisLabel = isLongitudinal ? 'depth' : 'width';

    return {
        ok,
        ruleId: 'SFR12_COMBINED',
        message: ok
            ? `Aircraft ${aircraft.name} fits in combined bay set [${bayNames.join(', ')}]`
            : `Aircraft '${aircraft.name}' (effective ${dimLabel} ${dimVal.toFixed(2)}m) exceeds combined bay set ${axisLabel} (${combinedTotal.toFixed(2)}m) across bays [${bayNames.join(', ')}].`,
        evidence: { ...evidence, violations }
    };
}

/** SFR13: Check if bays form a contiguous adjacency cluster. */
export function checkBayContiguity(
    bays: HangarBay[],
    bayGrid: { rows?: number; cols?: number; adjacency?: number; bays: HangarBay[] }
): RuleResult {
    if (bays.length <= 1) {
        return {
            ok: true,
            ruleId: 'SFR13_CONTIGUITY',
            message: 'Single bay requires no contiguity check',
            evidence: { bayCount: bays.length, bayNames: bays.map(b => b.name) }
        };
    }

    const adjacency = new Map<string, Set<string>>();
    for (const bay of bayGrid.bays) {
        adjacency.set(bay.name, new Set());
    }

    if (bayGrid.rows && bayGrid.cols) {
        const is8Connected = bayGrid.adjacency === 8;
        for (const bay of bayGrid.bays) {
            if (bay.row !== undefined && bay.col !== undefined) {
                const neighbors = [
                    { row: bay.row - 1, col: bay.col },
                    { row: bay.row + 1, col: bay.col },
                    { row: bay.row, col: bay.col - 1 },
                    { row: bay.row, col: bay.col + 1 },
                    ...(is8Connected ? [
                        { row: bay.row - 1, col: bay.col - 1 },
                        { row: bay.row - 1, col: bay.col + 1 },
                        { row: bay.row + 1, col: bay.col - 1 },
                        { row: bay.row + 1, col: bay.col + 1 },
                    ] : [])
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

    for (const bay of bayGrid.bays) {
        if (bay.adjacent) {
            for (const adj of bay.adjacent) {
                const adjName = adj.ref?.name;
                if (adjName) {
                    adjacency.get(bay.name)?.add(adjName);
                    adjacency.get(adjName)?.add(bay.name);
                }
            }
        }
    }

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

/** SFR14: Check if bay belongs to hangar. */
export function checkBayOwnership(bay: HangarBay, hangar: Hangar): RuleResult {
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

/** SFR15: Check if door belongs to hangar. */
export function checkDoorOwnership(door: HangarDoor, hangar: Hangar): RuleResult {
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

/** SFR16: Check for time overlap between two induction periods. */
export function checkTimeOverlap(
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

/** Run SFR11–SFR15 checks for a complete induction. */
export function validateInduction(induction: {
    aircraft: AircraftType;
    hangar: Hangar;
    bays: HangarBay[];
    door?: HangarDoor;
    clearance?: ClearanceEnvelope;
}): RuleResult[] {
    const results: RuleResult[] = [];

    if (induction.door) {
        results.push(checkDoorFit(induction.aircraft, induction.door, induction.clearance));
    }
    for (const bay of induction.bays) {
        results.push(checkBayFit(induction.aircraft, bay, induction.clearance));
    }
    if (induction.bays.length > 1) {
        results.push(checkBayContiguity(induction.bays, induction.hangar.grid));
    }
    for (const bay of induction.bays) {
        results.push(checkBayOwnership(bay, induction.hangar));
    }
    if (induction.door) {
        results.push(checkDoorOwnership(induction.door, induction.hangar));
    }

    return results;
}

/** Find all bays in a hangar where the aircraft fits individually. */
export function findSuitableBays(
    aircraft: AircraftType,
    hangar: Hangar,
    clearance?: ClearanceEnvelope
): HangarBay[] {
    return hangar.grid.bays.filter(bay => checkBayFit(aircraft, bay, clearance).ok);
}

/** Collect all failing results into a timestamped report. */
export function generateValidationReport(results: RuleResult[]): ValidationReport {
    return {
        violations: results.filter(r => !r.ok),
        timestamp: new Date().toISOString()
    };
}