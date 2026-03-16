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

    // ── Simulation-enriched fields (auto-inductions only) ──────────
    /** ISO-8601 — the time the aircraft wanted to be inducted. */
    requestedStart?: string;
    /** ISO-8601 — the time it was actually placed. Same as `start`. */
    actualStart?: string;
    /** ISO-8601 — the scheduled departure time. Same as `end`. */
    scheduledEnd?: string;
    /** ISO-8601 — the time the aircraft actually departed. */
    actualEnd?: string;
    /** Minutes the aircraft waited in queue before placement. */
    waitTime?: number;
    /** Minutes the departure was delayed by a blocked exit path. */
    departureDelay?: number;
    /** Structured reason why placement was delayed (null if placed immediately). */
    waitReason?: string | null;
    /** Structured reason why departure was delayed (null if no delay). */
    departureDelayReason?: string | null;
    /** Number of placement attempts before success. */
    placementAttempts?: number;
    /** Position in waiting queue when first queued (null if placed immediately). */
    queuePosition?: number | null;
}

export interface ExportedUnscheduledAuto {
    id: string;
    aircraft: string;
    preferredHangar?: string;
    reasonRuleId: string;
    evidence: Record<string, any>;
}

export interface ExportedSimulationSummary {
    simulatedDuration: number;
    totalEvents: number;
    placedCount: number;
    failedCount: number;
    maxQueueDepth: number;
    totalWaitTime: number;
    totalDepartureDelay: number;
    peakOccupancy: number;
}

export interface HangarStatistic {
    totalBays: number;
    peakOccupancy: number;
    peakOccupancyTime: string;
    avgUtilisation: number;
    totalWaitTime: number;
    totalDepartureDelay: number;
    inductionsServed: number;
    queuedAtPeak: number;
}

export interface GlobalSimulationStatistics {
    simulationWindow: { start: string; end: string };
    totalAircraftProcessed: number;
    totalWaitTime: number;
    totalDepartureDelay: number;
    avgWaitTime: number;
    maxWaitTime: number;
    maxWaitInduction: string;
    failedInductions: number;
    maxQueueDepth: number;
    maxQueueTime: string;
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
    simulation?: ExportedSimulationSummary;
    hangarStatistics?: Record<string, HangarStatistic>;
    simulationStatistics?: GlobalSimulationStatistics;
}

// ============================================================================
// SIMULATION EVENT LOG (from discrete-event simulator)
// ============================================================================

export type SimulationEventKind =
    | 'ARRIVAL_PLACED'
    | 'ARRIVAL_QUEUED'
    | 'DEPARTURE_CLEARED'
    | 'DEPARTURE_BLOCKED'
    | 'RETRY_PLACED'
    | 'DEADLINE_EXPIRED'
    | 'DEPENDENCY_UNLOCKED'
    | 'STRUCTURALLY_INFEASIBLE'
    | 'DEADLOCK_DETECTED'
    | 'SIM_EVENT_LIMIT';

export interface SimulationEventRecord {
    kind: SimulationEventKind;
    time: number;
    inductionId: string;
    aircraft?: string;
    hangar?: string;
    bays?: string[];
    door?: string;
    reason?: string;
    blockedBy?: string[];
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