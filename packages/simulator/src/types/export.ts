/**
 * Analysis Contract - Export Model
 * 
 * Complete analysis-ready export of the model with all derived properties
 * and conflict information computed.
 */

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