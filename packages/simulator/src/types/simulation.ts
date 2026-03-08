/** A fully placed induction — either a manual induction or a successfully scheduled auto-induction. */
export interface ScheduledInduction {
    /** Optional explicit ID from the DSL (`induct id "..."`) */
    id?: string;
    aircraft: string;
    hangar: string;
    bays: string[];
    door?: string;
    /** ISO-8601 start datetime. */
    start: string;
    /** ISO-8601 end datetime. */
    end: string;
}
