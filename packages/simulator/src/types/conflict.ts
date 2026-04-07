/** A single induction as seen by the conflict detector. */
export interface InductionInfo {
    /** Optional explicit ID from the DSL (`induct id "..."`) */
    id?: string;
    /** Aircraft type name. */
    aircraft: string;
    /** Hangar name. */
    hangar: string;
    /** Names of assigned bays. */
    bays: string[];
    start: Date;
    end: Date;
}

/** A detected scheduling conflict between two inductions sharing a bay at the same time. */
export interface ConflictInfo {
    ruleId: 'SFR23_TIME_OVERLAP';
    induction1: { id?: string; aircraft: string };
    induction2: { id?: string; aircraft: string };
    hangar: string;
    /** Bays occupied by both inductions during the overlap interval. */
    intersectingBays: string[];
    /** ISO-8601 start and end of the overlapping period. */
    overlapInterval: { start: string; end: string };
    message: string;
}
