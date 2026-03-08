import type { AircraftType, Hangar, HangarDoor, ClearanceEnvelope } from '../../../language/out/generated/ast.js';
import { calculateEffectiveDimensions } from '../geometry/dimensions.js';
import { checkDoorFitEffective, type DoorFitResult } from '../rules/door-fit.js';

/**
 * Filters a hangar's doors to those an aircraft can pass through (SFR11).
 *
 * Applies the optional clearance envelope before checking each door. Doors that
 * fail the wingspan or height check are recorded in `rejections` for diagnostics.
 *
 * @param aircraft  - Aircraft to check.
 * @param hangar    - Hangar whose doors are inspected.
 * @param clearance - Optional clearance envelope to apply to the aircraft dimensions.
 * @returns `doors`      — doors through which the aircraft fits.
 *          `rejections` — per-door fit results for doors that were rejected.
 */
export function findSuitableDoors(
    aircraft: AircraftType,
    hangar: Hangar,
    clearance?: ClearanceEnvelope
): { doors: HangarDoor[]; rejections: DoorFitResult[] } {
    const effectiveDims = calculateEffectiveDimensions(aircraft, clearance);
    const doors: HangarDoor[] = [];
    const rejections: DoorFitResult[] = [];

    for (const door of hangar.doors) {
        const result = checkDoorFitEffective(effectiveDims, door, aircraft.name);
        if (result.ok) {
            doors.push(door);
        } else {
            rejections.push(result);
        }
    }

    return { doors, rejections };
}
