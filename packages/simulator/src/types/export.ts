/** Output types for the analysis export model (used by the web UI and CLI). */

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
    /** ISO-8601 start datetime (= actualStart for auto-inductions). */
    start: string;
    /** ISO-8601 end datetime (= scheduledEnd / maintenanceEnd for auto-inductions). */
    end: string;
    derived: DerivedInductionProperties;
    /** IDs of any inductions that conflict with this one (SFR16). */
    conflicts: string[];

    // ── Simulation-enriched fields (auto-inductions only) ──────────
    /** ISO-8601 — the time the aircraft wanted to be inducted (notBefore or dependency-resolved time). */
    requestedStart?: string;
    /** ISO-8601 — the time it was actually placed (may be later if it waited). Same as `start`. */
    actualStart?: string;
    /** ISO-8601 — the scheduled departure time (actualStart + duration). Same as `end`. */
    scheduledEnd?: string;
    /** ISO-8601 — the time the aircraft actually departed (may be later if departure was delayed). */
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
    evidence: Record<string, unknown>;
}

export interface ExportedSimulationSummary {
    /** Total simulated time span (ms). */
    simulatedDuration: number;
    /** Total events processed. */
    totalEvents: number;
    /** How many auto-inductions were placed. */
    placedCount: number;
    /** How many auto-inductions failed. */
    failedCount: number;
    /** Maximum waiting-queue depth during simulation. */
    maxQueueDepth: number;
    /** Sum of all wait times (ms). */
    totalWaitTime: number;
    /** Sum of all departure delays (ms). */
    totalDepartureDelay: number;
    /** Maximum bays occupied at any single point in time. */
    peakOccupancy: number;
}

/** Per-hangar statistics from the simulation. */
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

/** Global simulation statistics for the API response. */
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
    schemaVersion: string;
    airfieldName: string;
    inductions: ExportedInduction[];
    autoSchedule?: {
        scheduled: ExportedInduction[];
        unscheduled: ExportedUnscheduledAuto[];
    };
    derived: {
        /** Whether each hangar's adjacency came from grid coords (`'derived'`) or explicit refs (`'explicit'`). */
        adjacencyModeByHangar: Record<string, 'explicit' | 'derived'>;
    };
    /** Simulation summary — present when auto-inductions were simulated. */
    simulation?: ExportedSimulationSummary;
    /** Per-hangar statistics — present when auto-inductions were simulated. */
    hangarStatistics?: Record<string, HangarStatistic>;
    /** Global simulation statistics — present when auto-inductions were simulated. */
    simulationStatistics?: GlobalSimulationStatistics;
}
