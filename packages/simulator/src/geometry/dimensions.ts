import type { AircraftType, ClearanceEnvelope } from '../../../language/out/generated/ast.js';
import type { EffectiveDimensions } from '../types/dimensions.js';

/**
 * Calculate effective dimensions with clearance envelope applied
 */
export function calculateEffectiveDimensions(
    aircraft: AircraftType,
    clearance?: ClearanceEnvelope
): EffectiveDimensions {
    const lateralMargin = clearance?.lateralMargin ?? 0;
    const longitudinalMargin = clearance?.longitudinalMargin ?? 0;
    const verticalMargin = clearance?.verticalMargin ?? 0;

    const rawTailHeight = aircraft.tailHeight ?? aircraft.height;

    return {
        wingspan: aircraft.wingspan + lateralMargin,
        length: aircraft.length + longitudinalMargin,
        height: aircraft.height + verticalMargin,
        tailHeight: rawTailHeight + verticalMargin,
        clearanceName: clearance?.name,
        rawAircraft: {
            wingspan: aircraft.wingspan,
            length: aircraft.length,
            height: aircraft.height,
            tailHeight: rawTailHeight
        }
    };
}