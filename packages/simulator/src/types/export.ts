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
    /** ISO-8601 start datetime. */
    start: string;
    /** ISO-8601 end datetime. */
    end: string;
    derived: DerivedInductionProperties;
    /** IDs of any inductions that conflict with this one (SFR16). */
    conflicts: string[];
}

export interface ExportedUnscheduledAuto {
    id: string;
    aircraft: string;
    preferredHangar?: string;
    reasonRuleId: string;
    evidence: Record<string, unknown>;
}

export interface ExportModel {
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
}
