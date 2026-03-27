/**
 * Discrete-event simulation types.
 *
 * These types define the state model, event system, and result structures for
 * the new simulation engine that replaces the greedy AutoScheduler.
 *
 * Design reference: SIMULATION_DESIGN.md §1–§11
 */

import type {
    AutoInduction as AstAutoInduction,
    AircraftType as AstAircraftType,
    ClearanceEnvelope as AstClearanceEnvelope,
    Hangar as AstHangar,
} from '../../../language/out/generated/ast.js';
// Domain model types are intentionally not imported here — the simulation
// state operates on Langium AST types directly (see Ast* imports above).
// Result types (SimulationPlacement, FailedInduction, etc.) use plain strings.

// ============================================================
// Event types — the queue entries that drive the simulation
// ============================================================

/** Priority constants for deterministic ordering when events share a timestamp. */
export const EVENT_PRIORITY = {
    DEPARTURE:       0,
    DEPARTURE_RETRY: 1,
    RETRY_PLACEMENT: 2,
    ARRIVAL:         3,
} as const;

export type EventPriority = typeof EVENT_PRIORITY[keyof typeof EVENT_PRIORITY];

/** Base fields shared by every scheduled event. */
interface SimulationEventBase {
    /** Epoch milliseconds when this event fires. */
    time: number;
    /** Numeric priority for tie-breaking (lower = processed first). */
    priority: EventPriority;
}

/** An aircraft is ready to be placed at a specific time. */
export interface ArrivalEvent extends SimulationEventBase {
    kind: 'ARRIVAL';
    priority: typeof EVENT_PRIORITY.ARRIVAL;
    inductionId: string;
    autoInduction: AstAutoInduction;
    /** Pre-computed spatial candidates (hangar/door/baySet combos). Null = not yet computed. */
    spatialCandidates: SpatialCandidate[] | null;
}

/** An aircraft's maintenance duration has expired; try to exit. */
export interface DepartureEvent extends SimulationEventBase {
    kind: 'DEPARTURE';
    priority: typeof EVENT_PRIORITY.DEPARTURE;
    inductionId: string;
    hangarName: string;
    bayNames: string[];
    doorName: string;
    /** True for manual (fixed) inductions — they depart unconditionally. */
    fixed: boolean;
}

/** Bays were freed; re-evaluate the waiting queue. */
export interface RetryPlacementEvent extends SimulationEventBase {
    kind: 'RETRY_PLACEMENT';
    priority: typeof EVENT_PRIORITY.RETRY_PLACEMENT;
}

/** A previously-blocked departure re-checks its exit path. */
export interface DepartureRetryEvent extends SimulationEventBase {
    kind: 'DEPARTURE_RETRY';
    priority: typeof EVENT_PRIORITY.DEPARTURE_RETRY;
    inductionId: string;
}

/** Discriminated union of all events that can sit in the event queue. */
export type ScheduledEvent =
    | ArrivalEvent
    | DepartureEvent
    | RetryPlacementEvent
    | DepartureRetryEvent;

// ============================================================
// Spatial candidate — a (hangar, door, baySet) tuple
// ============================================================

/** A structurally valid placement option (ignoring time). Computed once per auto-induction. */
export interface SpatialCandidate {
    hangarName: string;
    doorName: string;
    bayNames: string[];
}

// ============================================================
// State model — mutable simulation state
// ============================================================

/**
 * Build the map key used for `SimulationState.occupiedBays`.
 * Format: `"<hangarName>::<bayName>"`.
 */
export function bayKey(hangarName: string, bayName: string): string {
    return `${hangarName}::${bayName}`;
}

/** Which bays are currently occupied and by whom. Key = "hangarName::bayName". */
export interface OccupiedBayInfo {
    inductionId: string;
    aircraftName: string;
    hangarName: string;
    bayNames: string[];
    doorName: string;
    /** Epoch ms when the induction started occupying this bay. */
    startTime: number;
    /** Epoch ms when maintenance is scheduled to end (bay may remain occupied longer if departure is blocked). */
    endTime: number;
    /** Name of the access-graph node linked to this bay, if any. */
    accessNode?: string;
    /** True for manual (fixed) inductions. */
    fixed: boolean;
}

/** An auto-induction waiting in the queue for placement. */
export interface WaitingAircraft {
    inductionId: string;
    autoInduction: AstAutoInduction;
    aircraft: AstAircraftType;
    clearance: AstClearanceEnvelope | undefined;
    /** Epoch ms — when this aircraft first requested induction. */
    requestedArrival: number;
    /** Epoch ms — notAfter deadline, or null if unconstrained. */
    deadline: number | null;
    /** Preferred hangar first, then all model hangars. */
    hangarCandidates: AstHangar[];
    /** True once all `precedingInductions` have departed. */
    dependenciesMet: boolean;
    /** Pre-computed spatial candidates. Null if structurally infeasible. */
    spatialCandidates: SpatialCandidate[] | null;
    /** Rejections accumulated across all placement attempts (for diagnostics). */
    rejections: PlacementRejection[];
    /** Number of placement attempts so far. */
    placementAttempts: number;
    /** Position in waiting queue when first queued (0-based). */
    queuePosition: number;
}

/** An induction that has been placed but whose departure is blocked. */
export interface PendingDeparture {
    inductionId: string;
    aircraftName: string;
    hangarName: string;
    bayNames: string[];
    doorName: string;
    /** Epoch ms when maintenance finished. */
    durationExpiredAt: number;
    /** How many times departure has been retried. */
    retryCount: number;
}

/** An induction currently occupying bays (placed but not yet departed). */
export interface ActiveInduction {
    id: string;
    kind: 'manual' | 'auto';
    aircraftName: string;
    hangarName: string;
    doorName: string;
    bayNames: string[];
    /** Epoch ms when the aircraft was placed. */
    actualStart: number;
    /** Epoch ms when maintenance is scheduled to end. */
    scheduledEnd: number;
    /** Epoch ms when departure was first blocked, or null if not blocked. */
    departureBlockedSince: number | null;
}

/** A fully completed induction — placed, maintained, and departed. */
export interface CompletedInduction {
    id: string;
    kind: 'manual' | 'auto';
    aircraftName: string;
    hangarName: string;
    doorName: string;
    bayNames: string[];
    /** Epoch ms when the aircraft was actually placed (may be after requestedArrival). */
    actualStart: number;
    /** Epoch ms when maintenance completed. */
    maintenanceEnd: number;
    /** Epoch ms when the aircraft actually departed the hangar. */
    actualEnd: number;
    /** Milliseconds spent waiting in queue before placement. */
    waitTime: number;
    /** Milliseconds the departure was delayed due to a blocked exit path. */
    departureDelay: number;
    /** Structured reason why placement was delayed (null if placed immediately). */
    waitReason: string | null;
    /** Structured reason why departure was delayed (null if no delay). */
    departureDelayReason: string | null;
    /** Number of placement attempts before success. */
    placementAttempts: number;
    /** Position in waiting queue when first queued (null if placed immediately). */
    queuePosition: number | null;
}

/** A manual induction loaded as immutable fixed occupancy before simulation. */
export interface FixedOccupancy {
    inductionId: string;
    hangarName: string;
    bayNames: string[];
    doorName: string;
    /** Epoch ms. */
    start: number;
    /** Epoch ms. */
    end: number;
}

/** The complete mutable state of the simulation at any point in time. */
export interface SimulationState {
    /** Epoch ms of the most recently processed event. */
    currentTime: number;

    /** Bays currently occupied. Key = "hangarName::bayName". */
    occupiedBays: Map<string, OccupiedBayInfo>;

    /** Aircraft waiting for placement, ordered by priority. */
    waitingQueue: WaitingAircraft[];

    /** Aircraft whose maintenance has ended but whose exit is blocked. */
    pendingDepartures: PendingDeparture[];

    /** Inductions currently occupying bays (placed, not yet departed). */
    activeInductions: ActiveInduction[];

    /** Fully completed inductions (placed + departed). */
    completedInductions: CompletedInduction[];

    /** Manual inductions loaded before simulation — immutable during the run. */
    fixedOccupancy: FixedOccupancy[];

    /** Full chronological trace of what happened. */
    eventLog: SimulationEventRecord[];
}

// ============================================================
// Event log — the trace of what happened (distinct from queue events)
// ============================================================

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

/** A single entry in the simulation event log. */
export interface SimulationEventRecord {
    kind: SimulationEventKind;
    /** Epoch ms when this event was logged. */
    time: number;
    inductionId: string;
    aircraft?: string;
    hangar?: string;
    bays?: string[];
    door?: string;
    /** Human-readable detail (e.g. why placement failed). */
    reason?: string;
    /** IDs of inductions blocking a departure. */
    blockedBy?: string[];
}

// ============================================================
// Placement & departure attempt results
// ============================================================

/** A single reason why a placement attempt was rejected. */
export interface PlacementRejection {
    /** Epoch ms when the attempt was made. */
    attemptTime: number;
    /** The SFR or simulation rule that caused the rejection. */
    ruleId: string;
    message: string;
    hangar?: string;
    evidence: Record<string, unknown>;
}

/** Result of attempting to place an aircraft. */
export type PlacementAttemptResult =
    | PlacementSuccess
    | PlacementFailure;

export interface PlacementSuccess {
    placed: true;
    inductionId: string;
    hangarName: string;
    doorName: string;
    bayNames: string[];
    /** Epoch ms. */
    startTime: number;
    /** Epoch ms — maintenance end (startTime + duration). */
    endTime: number;
}

export interface PlacementFailure {
    placed: false;
    rejections: PlacementRejection[];
}

/** Result of attempting to depart an aircraft. */
export type DepartureAttemptResult =
    | DepartureClear
    | DepartureBlocked;

export interface DepartureClear {
    clear: true;
    /** The door through which the aircraft can exit. */
    exitDoor: string;
}

export interface DepartureBlocked {
    clear: false;
    /** IDs of inductions whose bay occupancy blocks the exit path. */
    blockingInductionIds: string[];
}

// ============================================================
// Simulation result — the final output
// ============================================================

/** A successfully placed (and eventually departed) auto-induction in the final result. */
export interface SimulationPlacement {
    inductionId: string;
    aircraftName: string;
    hangarName: string;
    doorName: string;
    bayNames: string[];
    /** Epoch ms when the aircraft was placed. */
    actualStart: number;
    /** Epoch ms when maintenance completed. */
    maintenanceEnd: number;
    /** Epoch ms when the aircraft actually departed. */
    actualEnd: number;
    /** Epoch ms when the aircraft first requested induction. */
    requestedStart: number;
    /** Milliseconds spent waiting in queue. */
    waitTime: number;
    /** Milliseconds departure was delayed by a blocked exit path. */
    departureDelay: number;
    /** Structured reason why placement was delayed (null if placed immediately). */
    waitReason: string | null;
    /** Structured reason why departure was delayed (null if no delay). */
    departureDelayReason: string | null;
    /** Number of placement attempts before success. */
    placementAttempts: number;
    /** Position in waiting queue when first queued (null if placed immediately). */
    queuePosition: number | null;
}

/** An auto-induction that was never placed within the simulation. */
export interface FailedInduction {
    inductionId: string;
    aircraftName: string;
    preferredHangar?: string;
    reason: UnscheduledReason;
    /** Epoch ms of the last placement attempt, or null if never attempted. */
    lastAttemptTime: number | null;
    /** All placement rejections collected across all attempts. */
    rejections: PlacementRejection[];
    /** Epoch ms — when this aircraft first requested induction. */
    requestedArrival: number;
    /** Epoch ms — notAfter deadline, or null if unconstrained. */
    deadline: number | null;
}

/** Why an induction was never placed. */
export type UnscheduledReason =
    | 'STRUCTURALLY_INFEASIBLE'
    | 'SIM_DEADLINE_EXCEEDED'
    | 'SIM_NEVER_PLACED'
    | 'SIM_EVENT_LIMIT'
    | 'DEPENDENCY_NEVER_PLACED';

/** Aggregate statistics for the simulation run. */
export interface SimulationStats {
    /** Total simulated time span from first to last event (ms). */
    simulatedDuration: number;
    /** Total number of events processed by the engine. */
    totalEvents: number;
    /** Total auto-inductions in the model. */
    totalAutoInductions: number;
    /** How many were successfully placed. */
    placedCount: number;
    /** How many were never placed. */
    failedCount: number;
    /** Maximum number of aircraft in the waiting queue at any point. */
    maxQueueDepth: number;
    /** Epoch ms when queue depth peaked. */
    maxQueueDepthTime: number;
    /** Sum of all wait times across all placed inductions (ms). */
    totalWaitTime: number;
    /** Sum of all departure delays across all placed inductions (ms). */
    totalDepartureDelay: number;
    /** Maximum wait time for a single induction (ms). */
    maxWaitTime: number;
    /** ID of the induction with the longest wait. */
    maxWaitInduction: string;
    /** Number of deadlocks detected. */
    deadlockCount: number;
    /** Average bay utilisation across all hangars (0–1). */
    avgUtilisation: number;
    /** Maximum number of bays occupied at any single point in time. */
    peakOccupancy: number;
    /** Epoch ms when peak occupancy occurred. */
    peakOccupancyTime: number;
    /** Per-hangar utilisation: (occupied bay-time) / (total available bay-time). */
    utilisationByHangar: Record<string, number>;
    /** Epoch ms — first event time. */
    windowStart: number;
    /** Epoch ms — last event time. */
    windowEnd: number;
}

/** The complete output of a simulation run. */
export interface SimulationResult {
    /** Every auto-induction that was successfully placed and departed. */
    scheduledInductions: SimulationPlacement[];

    /** Auto-inductions that could never be placed. */
    failedInductions: FailedInduction[];

    /** Full chronological event trace. */
    eventLog: SimulationEventRecord[];

    /** Aggregate statistics. */
    statistics: SimulationStats;
}

// ============================================================
// Configuration
// ============================================================

/** Tuning knobs for the simulation engine. */
export interface SimulationConfig {
    /** Maximum events before the circuit breaker halts the simulation. Default: 10,000. */
    maxEvents: number;
    /** Maximum retries for a blocked departure before giving up. Default: 100. */
    maxDepartureRetries: number;
    /** Maximum bay-set candidates requested from findSuitableBaySets. Default: 10. */
    maxBaySetCandidates: number;
    /** Default span direction for auto-inductions. Default: 'lateral'. */
    defaultSpan: 'lateral' | 'longitudinal';
}

/** Sensible defaults — callers can override individual fields. */
export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
    maxEvents: 10_000,
    maxDepartureRetries: 100,
    maxBaySetCandidates: 10,
    defaultSpan: 'lateral',
};
