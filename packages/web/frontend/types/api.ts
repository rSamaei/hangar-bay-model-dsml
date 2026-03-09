/**
 * Analysis Contract Types - Frontend
 * 
 * Re-exports domain types from simulator for consistency
 */

// Re-export domain model types from simulator
export type { 
    DomainModel,
    AircraftType,
    ClearanceEnvelope,
    Hangar,
    HangarBay,
    HangarDoor,
    AccessPath,
    AccessNode,
    AccessLink,
    Induction,
    AutoInduction
} from '../../../simulator/out/types/model.js';

export interface ParseResult {
    model: any;
    errors: any[];
}

// ============================================================================
// VALIDATION REPORT
// ============================================================================

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
    evidence: Record<string, any>;
}

export interface ValidationReport {
    violations: ValidationViolation[];
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

// ============================================================================
// EXPORT MODEL
// ============================================================================

export interface DerivedInductionProperties {
    wingspanEff: number;
    lengthEff: number;
    tailEff: number;
    baysRequired: number;
    connected: boolean;
}

export interface ExportedInduction {
    id: string;
    kind: 'manual' | 'auto';
    aircraft: string;
    hangar: string;
    door?: string;
    bays: string[];
    start: string;
    end: string;
    derived: DerivedInductionProperties;
    conflicts: string[];
}

export interface ExportedUnscheduledAuto {
    id: string;
    aircraft: string;
    preferredHangar?: string;
    reasonRuleId: string;
    evidence: Record<string, any>;
}

export interface ExportModel {
    airfieldName: string;
    inductions: ExportedInduction[];
    autoSchedule?: {
        scheduled: ExportedInduction[];
        unscheduled: ExportedUnscheduledAuto[];
    };
    derived: {
        adjacencyModeByHangar: Record<string, 'explicit' | 'derived'>;
    };
}

// ============================================================================
// LEGACY TYPES (for backwards compatibility during migration)
// ============================================================================

export interface LegacySimulationResult {
    schedule: Array<{
        id?: string;
        aircraft: string;
        hangar: string;
        bays: string[];
        door?: string;
        start: string;
        end: string;
    }>;
    conflicts: Array<{
        type: string;
        inductions: string[];
        message: string;
    }>;
    utilizationStats: {
        byHangar: Record<string, number>;
        byBay: Record<string, number>;
    };
}

export interface ParseResult {
    success: boolean;
    model?: any;
    lexerErrors?: any[];
    parserErrors?: any[];
    validationErrors?: any[];
}