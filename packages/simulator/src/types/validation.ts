/**
 * Validation report types — the canonical machine-readable output of model validation.
 *
 * All violations are deterministically ordered and carry structured evidence so that
 * consumers (CLI, web UI, tests) can render or assert specific fields without parsing
 * message strings.
 */

export type ViolationSeverity = 'error' | 'warning';

export type SubjectType =
    | 'Induction'
    | 'AutoInduction'
    | 'Aircraft'
    | 'Hangar'
    | 'Bay'
    | 'Door';

export interface ViolationSubject {
    type: SubjectType;
    name: string;
    id?: string;
}

export interface ValidationViolation {
    ruleId: string;
    severity: ViolationSeverity;
    message: string;
    subject: ViolationSubject;
    evidence: Record<string, unknown>;
}

/** SFR11: Aircraft cannot pass through a hangar door. */
export interface DoorFitViolation extends ValidationViolation {
    ruleId: 'SFR11_DOOR_FIT';
    evidence: {
        aircraftName: string;
        doorName: string;
        rawDimensions: { wingspan: number; tailHeight: number };
        effectiveDimensions: { wingspan: number; tailHeight: number };
        doorDimensions: { width: number; height: number };
        clearanceName?: string;
        clearanceMargins?: { lateral: number; vertical: number };
        violations: { wingspanFits: boolean; heightFits: boolean };
        failedConstraints: string[];
    };
}

/** SFR12: Aircraft cannot fit in the assigned bay set. */
export interface BaySetFitViolation extends ValidationViolation {
    ruleId: 'SFR12_BAY_FIT';
    evidence: {
        aircraftName: string;
        bayNames: string[];
        bayCount: number;
        effectiveDimensions: { wingspan: number; length: number; tailHeight: number };
        bayMeasurements: {
            sumWidth: number;
            minDepth: number;
            minHeight: number;
            limitingDepthBay: string;
            limitingHeightBay: string;
        };
        clearanceName?: string;
        violations: { widthFits: boolean; depthFits: boolean; heightFits: boolean };
        failedConstraints: string[];
    };
}

/** SFR13: Assigned bay set is not contiguous (contains disconnected islands). */
export interface ContiguityViolation extends ValidationViolation {
    ruleId: 'SFR13_CONTIGUITY';
    evidence: {
        bayNames: string[];
        bayCount: number;
        connected: boolean;
        reachableCount: number;
        reachableBays: string[];
        unreachableBays: string[];
        adjacencyMode: {
            derivedFromGrid: boolean;
            explicitEdgesUsed: number;
            gridEdgesUsed: number;
        };
        components?: string[][];
    };
}

/** SFR16: Two inductions share a bay at overlapping times. */
export interface TimeOverlapViolation extends ValidationViolation {
    ruleId: 'SFR16_TIME_OVERLAP';
    evidence: {
        induction1: {
            id?: string; aircraft: string; hangar: string; bays: string[];
            timeWindow: { start: string; end: string };
        };
        induction2: {
            id?: string; aircraft: string; hangar: string; bays: string[];
            timeWindow: { start: string; end: string };
        };
        overlapInterval: { start: string; end: string };
        intersectingBays: string[];
    };
}

/** SCHED_FAILED: An auto-induction could not be placed within the search window. */
export interface SchedulingFailedViolation extends ValidationViolation {
    ruleId: 'SCHED_FAILED';
    evidence: {
        autoInductionId: string;
        aircraft: string;
        preferredHangar?: string;
        duration: number;
        timeConstraints?: { notBefore?: string; notAfter?: string };
        rejectionReasons: Array<{
            ruleId: string;
            message: string;
            hangar?: string;
            conflictingWith?: string[];
        }>;
    };
}

/** SFR_DYNAMIC_REACHABILITY: A bay is blocked by a concurrent induction occupying the access path. */
export interface DynamicReachabilityViolation extends ValidationViolation {
    ruleId: 'SFR_DYNAMIC_REACHABILITY';
    evidence: {
        inductionId?: string;
        hangarName: string;
        unreachableBays: string[];
        blockingBays: Array<{
            bayName: string;
            occupiedByInductionId?: string;
            occupiedByAircraft: string;
            overlapStart: string;
            overlapEnd: string;
        }>;
        checkedFromDoors: string[];
    };
}

/** SFR_CORRIDOR_FIT: Aircraft's effective wingspan exceeds a corridor node's width on the path to an assigned bay. */
export interface CorridorFitViolation extends ValidationViolation {
    ruleId: 'SFR_CORRIDOR_FIT';
    evidence: {
        aircraftName: string;
        effectiveWingspan: number;
        corridorNodeName: string;
        corridorWidth: number;
        unreachableBays: string[];
    };
}

export type TypedViolation =
    | DoorFitViolation
    | BaySetFitViolation
    | ContiguityViolation
    | TimeOverlapViolation
    | SchedulingFailedViolation
    | DynamicReachabilityViolation
    | CorridorFitViolation
    | ValidationViolation; // fallback for rules without a specific type

/** Complete validation report. */
export interface ValidationReport {
    violations: TypedViolation[];
    timestamp: string;
    summary: {
        totalViolations: number;
        byRuleId: Record<string, number>;
        bySeverity: { errors: number; warnings: number };
    };
}

/**
 * Returns a stable-ordered copy of `violations`.
 *
 * Order: ruleId → subject.type → subject.name → subject.id (all ascending).
 * Violations without an id sort before those with one at the same key prefix.
 */
export function sortViolations(violations: TypedViolation[]): TypedViolation[] {
    return [...violations].sort((a, b) => {
        if (a.ruleId !== b.ruleId) return a.ruleId.localeCompare(b.ruleId);
        if (a.subject.type !== b.subject.type) return a.subject.type.localeCompare(b.subject.type);
        if (a.subject.name !== b.subject.name) return a.subject.name.localeCompare(b.subject.name);
        if (a.subject.id && b.subject.id) return a.subject.id.localeCompare(b.subject.id);
        if (a.subject.id) return -1;
        if (b.subject.id) return 1;
        return 0;
    });
}
