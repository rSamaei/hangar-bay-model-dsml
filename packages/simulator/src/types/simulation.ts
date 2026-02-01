export interface SimulationResult {
    schedule: ScheduledInduction[];
    conflicts: Conflict[];
    utilizationStats: UtilizationStats;
}

export interface ScheduledInduction {
    id?: string;
    aircraft: string;
    hangar: string;
    bays: string[];
    door?: string;
    start: string;
    end: string;
}

export interface Conflict {
    type: 'overlap' | 'clearance' | 'reachability';
    inductions: string[];
    message: string;
}

export interface UtilizationStats {
    byHangar: Record<string, number>;
    byBay: Record<string, number>;
}