/** Aircraft dimensions after applying a clearance envelope. See `calculateEffectiveDimensions`. */
export interface EffectiveDimensions {
    /** Wingspan + lateralMargin. */
    wingspan: number;
    /** Fuselage length + longitudinalMargin. */
    length: number;
    /** Fuselage height + verticalMargin. */
    height: number;
    /** Tail height (or fuselage height if not set) + verticalMargin. Used for door/bay height checks. */
    tailHeight: number;
    /** Name of the applied clearance envelope, if any. */
    clearanceName?: string;
    /** Snapshot of the raw (pre-clearance) aircraft dimensions for diagnostic reporting. */
    rawAircraft: {
        wingspan: number;
        length: number;
        height: number;
        tailHeight: number;
    };
}
