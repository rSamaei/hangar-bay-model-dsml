import type { AircraftType, ClearanceEnvelope } from '../../../language/out/generated/ast.js';
import type { EffectiveDimensions } from '../types/dimensions.js';

/**
 * Computes clearance-padded dimensions of an aircraft for use in fitting checks.
 *
 * Raw aircraft measurements are enlarged by the margins from the optional clearance
 * envelope:
 *   - wingspan  += lateralMargin
 *   - length    += longitudinalMargin
 *   - height    += verticalMargin
 *   - tailHeight = (aircraft.tailHeight ?? aircraft.height) + verticalMargin
 *
 * When no `tailHeight` is set on the aircraft, the fuselage `height` is used as a
 * fallback before applying the vertical margin. This matches the DSL semantics where
 * `tailHeight` is an optional override for aircraft with a raised tail fin.
 *
 * The returned `rawAircraft` snapshot preserves the pre-clearance values so that
 * diagnostic reports can show both the bare aircraft size and the padded check size.
 *
 * @param aircraft  - Aircraft type node from the parsed DSL model.
 * @param clearance - Optional clearance envelope to apply. All margins default to 0
 *                    when omitted (i.e. raw dimensions are used unchanged).
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