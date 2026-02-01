import type { AircraftType, Hangar, ClearanceEnvelope } from '../../../language/out/generated/ast.js';
import { calculateEffectiveDimensions } from '../geometry/dimensions.js';
import { checkDoorFitEffective } from '../rules/door-fit.js';

export function findSuitableDoors(
    aircraft: AircraftType,
    hangar: Hangar,
    clearance?: ClearanceEnvelope
): { doors: typeof hangar.doors; rejections: any[] } {
    const effectiveDims = calculateEffectiveDimensions(aircraft, clearance);
    const suitable: typeof hangar.doors = [];
    const rejections: any[] = [];

    for (const door of hangar.doors) {
        const result = checkDoorFitEffective(effectiveDims, door, aircraft.name);
        if (result.ok) {
            suitable.push(door);
        } else {
            rejections.push(result);
        }
    }

    return { doors: suitable, rejections };
}