export interface InductionInfo {
    id?: string;
    aircraft: string;
    hangar: string;
    bays: string[];
    start: Date;
    end: Date;
}

export interface ConflictInfo {
    ruleId: 'SFR16_TIME_OVERLAP';
    induction1: { id?: string; aircraft: string };
    induction2: { id?: string; aircraft: string };
    hangar: string;
    intersectingBays: string[];
    overlapInterval: { start: string; end: string };
    message: string;
}