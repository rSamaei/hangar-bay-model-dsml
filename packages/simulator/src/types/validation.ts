/**
 * Analysis Contract - Validation Report
 * 
 * This is the canonical machine-readable output for model validation.
 * All violations are deterministically ordered and include structured evidence.
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

/**
 * Base violation structure
 */
export interface ValidationViolation {
    ruleId: string;
    severity: ViolationSeverity;
    message: string;
    subject: ViolationSubject;
    evidence: Record<string, any>;
}

/**
 * SFR11: Door fit violation
 */
export interface DoorFitViolation extends ValidationViolation {
    ruleId: 'SFR11_DOOR_FIT';
    evidence: {
        aircraftName: string;
        doorName: string;
        rawDimensions: {
            wingspan: number;
            tailHeight: number;
        };
        effectiveDimensions: {
            wingspan: number;
            tailHeight: number;
        };
        doorDimensions: {
            width: number;
            height: number;
        };
        clearanceName?: string;
        clearanceMargins?: {
            lateral: number;
            vertical: number;
        };
        violations: {
            wingspanFits: boolean;
            heightFits: boolean;
        };
        failedConstraints: string[];
    };
}

/**
 * SFR12: Bay set fit violation
 */
export interface BaySetFitViolation extends ValidationViolation {
    ruleId: 'SFR12_BAY_FIT';
    evidence: {
        aircraftName: string;
        bayNames: string[];
        bayCount: number;
        effectiveDimensions: {
            wingspan: number;
            length: number;
            tailHeight: number;
        };
        bayMeasurements: {
            sumWidth: number;
            minDepth: number;
            minHeight: number;
            limitingDepthBay: string;
            limitingHeightBay: string;
        };
        clearanceName?: string;
        violations: {
            widthFits: boolean;
            depthFits: boolean;
            heightFits: boolean;
        };
        failedConstraints: string[];
    };
}

/**
 * SFR13: Contiguity violation
 */
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
        components?: string[][]; // disconnected components
    };
}

/**
 * SFR16: Time overlap violation
 */
export interface TimeOverlapViolation extends ValidationViolation {
    ruleId: 'SFR16_TIME_OVERLAP';
    evidence: {
        induction1: {
            id?: string;
            aircraft: string;
            hangar: string;
            bays: string[];
            timeWindow: {
                start: string;
                end: string;
            };
        };
        induction2: {
            id?: string;
            aircraft: string;
            hangar: string;
            bays: string[];
            timeWindow: {
                start: string;
                end: string;
            };
        };
        overlapInterval: {
            start: string;
            end: string;
        };
        intersectingBays: string[];
    };
}

/**
 * SCHED_FAILED: Auto-induction could not be scheduled
 */
export interface SchedulingFailedViolation extends ValidationViolation {
    ruleId: 'SCHED_FAILED';
    evidence: {
        autoInductionId: string;
        aircraft: string;
        preferredHangar?: string;
        duration: number;
        timeConstraints?: {
            notBefore?: string;
            notAfter?: string;
        };
        rejectionReasons: Array<{
            ruleId: string;
            message: string;
            hangar?: string;
            conflictingWith?: string[];
        }>;
    };
}

/**
 * Union type of all specific violations
 */
export type TypedViolation =
    | DoorFitViolation
    | BaySetFitViolation
    | ContiguityViolation
    | TimeOverlapViolation
    | SchedulingFailedViolation
    | ValidationViolation; // fallback for other rules

/**
 * Complete validation report
 */
export interface ValidationReport {
    violations: TypedViolation[];
    timestamp: string;
    summary: {
        totalViolations: number;
        byRuleId: Record<string, number>;
        bySeverity: {
            errors: number;
            warnings: number;
        };
    };
}

/**
 * Deterministic ordering for violations
 * Primary: ruleId (alphabetical)
 * Secondary: subject.type (alphabetical)
 * Tertiary: subject.name (alphabetical)
 * Quaternary: subject.id (alphabetical, if present)
 */
export function sortViolations(violations: TypedViolation[]): TypedViolation[] {
    return [...violations].sort((a, b) => {
        // Primary: ruleId
        if (a.ruleId !== b.ruleId) {
            return a.ruleId.localeCompare(b.ruleId);
        }
        
        // Secondary: subject.type
        if (a.subject.type !== b.subject.type) {
            return a.subject.type.localeCompare(b.subject.type);
        }
        
        // Tertiary: subject.name
        if (a.subject.name !== b.subject.name) {
            return a.subject.name.localeCompare(b.subject.name);
        }
        
        // Quaternary: subject.id (if both present)
        if (a.subject.id && b.subject.id) {
            return a.subject.id.localeCompare(b.subject.id);
        }
        
        // If only one has id, prefer that one first
        if (a.subject.id && !b.subject.id) return -1;
        if (!a.subject.id && b.subject.id) return 1;
        
        return 0;
    });
}