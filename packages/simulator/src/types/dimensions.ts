export interface EffectiveDimensions {
    wingspan: number;
    length: number;
    height: number;
    tailHeight: number;
    clearanceName?: string;
    rawAircraft: {
        wingspan: number;
        length: number;
        height: number;
        tailHeight: number;
    };
}