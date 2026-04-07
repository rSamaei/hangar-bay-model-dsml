import type {
    Hangar,
    HangarBay,
    ClearanceEnvelope,
    AircraftType,
    HangarDoor
} from './generated/ast.js';
import { buildBayAdjacencyGraph } from './bay-adjacency.js';

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

export interface EffectiveDimensions {
    wingspan: number;
    length: number;
    height: number;
}

/** Compute aircraft dimensions enlarged by clearance margins. */
export function computeEffectiveDimensions(
    aircraft: AircraftType,
    clearance?: ClearanceEnvelope
): EffectiveDimensions {
    return {
        wingspan: aircraft.wingspan + (clearance?.lateralMargin ?? 0),
        length: aircraft.length + (clearance?.longitudinalMargin ?? 0),
        height: (aircraft.tailHeight ?? aircraft.height) + (clearance?.verticalMargin ?? 0),
    };
}

/** SFR11: Check if aircraft fits through door with clearance. */
export function checkDoorFit(
    aircraft: AircraftType,
    door: HangarDoor,
    clearance?: ClearanceEnvelope
): RuleResult {
    const eff = computeEffectiveDimensions(aircraft, clearance);

    const wingspanFits = eff.wingspan <= door.width;
    const heightFits = eff.height <= door.height;
    const ok = wingspanFits && heightFits;

    const violations: string[] = [];
    if (!wingspanFits) violations.push(`wingspan: ${eff.wingspan.toFixed(2)}m > ${door.width}m`);
    if (!heightFits) violations.push(`height: ${eff.height.toFixed(2)}m > ${door.height}m`);

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
            effectiveWingspan: eff.wingspan,
            effectiveHeight: eff.height,
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
    const eff = computeEffectiveDimensions(aircraft, clearance);

    const widthFits = eff.wingspan <= bay.width;
    const depthFits = eff.length <= bay.depth;
    const heightFits = eff.height <= bay.height;
    const ok = widthFits && depthFits && heightFits;

    const violations: string[] = [];
    if (!widthFits) violations.push(`wingspan: ${eff.wingspan.toFixed(2)}m > ${bay.width}m`);
    if (!depthFits) violations.push(`length: ${eff.length.toFixed(2)}m > ${bay.depth}m`);
    if (!heightFits) violations.push(`height: ${eff.height.toFixed(2)}m > ${bay.height}m`);

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
            effectiveWingspan: eff.wingspan,
            effectiveLength: eff.length,
            effectiveHeight: eff.height,
            clearanceName: clearance?.name,
            widthFits,
            depthFits,
            heightFits
        }
    };
}

/** Find the bay with the minimum value for a dimension, returning the min and the bay name. */
function findMinDimension(bays: HangarBay[], getter: (b: HangarBay) => number): { min: number; bayName: string } {
    let min = getter(bays[0]);
    let bayName = bays[0].name;
    for (const bay of bays) {
        const val = getter(bay);
        if (val < min) { min = val; bayName = bay.name; }
    }
    return { min, bayName };
}

/**
 * SFR12_COMBINED: Check if aircraft fits the aggregate bay set.
 * Primary axis is summed (lateral: widths, longitudinal: depths).
 * Secondary axis uses the minimum (lateral: min depth, longitudinal: min width).
 * Height check always uses the minimum bay height.
 */
export function checkBaySetFit(
    aircraft: AircraftType,
    bays: HangarBay[],
    clearance?: ClearanceEnvelope,
    span: string = 'lateral'
): RuleResult {
    const eff = computeEffectiveDimensions(aircraft, clearance);
    const isLong = span === 'longitudinal';
    const bayNames = bays.map(b => b.name);

    // Axis configuration: which dimension is summed vs which uses min
    const primaryGetter   = isLong ? (b: HangarBay) => b.depth  : (b: HangarBay) => b.width;
    const secondaryGetter = isLong ? (b: HangarBay) => b.width  : (b: HangarBay) => b.depth;
    const primaryThreshold   = isLong ? eff.length   : eff.wingspan;
    const secondaryThreshold = isLong ? eff.wingspan  : eff.length;
    const primaryLabel   = isLong ? 'depth'  : 'width';
    const secondaryLabel = isLong ? 'width'  : 'depth';
    const primaryUnit    = isLong ? 'length' : 'wingspan';
    const secondaryUnit  = isLong ? 'wingspan' : 'length';

    const combinedTotal = bays.reduce((s, b) => s + primaryGetter(b), 0);
    const secondary = findMinDimension(bays, secondaryGetter);
    const height = findMinDimension(bays, b => b.height);

    const primaryFits   = combinedTotal >= primaryThreshold;
    const secondaryFits = secondary.min >= secondaryThreshold;
    const heightFits    = height.min >= eff.height;

    const violations: string[] = [];
    if (!primaryFits) violations.push(`sum ${primaryLabel} ${combinedTotal.toFixed(2)}m < ${primaryUnit} ${primaryThreshold.toFixed(2)}m`);
    if (!secondaryFits) violations.push(`min ${secondaryLabel} ${secondary.min.toFixed(2)}m (${secondary.bayName}) < ${secondaryUnit} ${secondaryThreshold.toFixed(2)}m`);
    if (!heightFits) violations.push(`min height ${height.min.toFixed(2)}m (${height.bayName}) < tail height ${eff.height.toFixed(2)}m`);

    const ok = primaryFits && secondaryFits && heightFits;

    const evidence: Record<string, any> = {
        bayNames, span,
        [`sum${primaryLabel.charAt(0).toUpperCase() + primaryLabel.slice(1)}`]: combinedTotal,
        [`min${secondaryLabel.charAt(0).toUpperCase() + secondaryLabel.slice(1)}`]: secondary.min,
        [`limiting${secondaryLabel.charAt(0).toUpperCase() + secondaryLabel.slice(1)}Bay`]: secondary.bayName,
        minHeight: height.min, limitingHeightBay: height.bayName,
        effectiveWingspan: eff.wingspan, effectiveLength: eff.length, effectiveHeight: eff.height,
        widthFits: isLong ? secondaryFits : primaryFits,
        depthFits: isLong ? primaryFits : secondaryFits,
        heightFits, violations,
    };

    return {
        ok,
        ruleId: 'SFR12_COMBINED',
        message: ok
            ? `Aircraft ${aircraft.name} fits in combined bay set [${bayNames.join(', ')}]`
            : `Aircraft '${aircraft.name}' (effective ${primaryUnit} ${primaryThreshold.toFixed(2)}m) exceeds combined bay set ${primaryLabel} (${combinedTotal.toFixed(2)}m) across bays [${bayNames.join(', ')}].`,
        evidence
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
            ruleId: 'SFR16_CONTIGUITY',
            message: 'Single bay requires no contiguity check',
            evidence: { bayCount: bays.length, bayNames: bays.map(b => b.name) }
        };
    }

    const { adjacency } = buildBayAdjacencyGraph(bayGrid);

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
        ruleId: 'SFR16_CONTIGUITY',
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
        ruleId: 'SFR17_BAY_OWNERSHIP',
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
        ruleId: 'SFR18_DOOR_OWNERSHIP',
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
        ruleId: 'SFR23_TIME_OVERLAP',
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