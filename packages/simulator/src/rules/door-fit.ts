import type { HangarDoor } from '../../../language/out/generated/ast.js';
import type { EffectiveDimensions } from '../types/dimensions.js';

/**
 * SFR11: Check door fit using effective dimensions
 */
export function checkDoorFitEffective(
    effectiveDims: EffectiveDimensions,
    door: HangarDoor,
    aircraftName: string
): { ok: boolean; ruleId: string; message: string; evidence: any } {
    const wingspanFits = effectiveDims.wingspan <= door.width;
    const heightFits = effectiveDims.tailHeight <= door.height;
    const ok = wingspanFits && heightFits;

    const violations: string[] = [];
    if (!wingspanFits) {
        violations.push(`effective wingspan ${effectiveDims.wingspan.toFixed(2)}m > door width ${door.width}m`);
    }
    if (!heightFits) {
        violations.push(`effective tail height ${effectiveDims.tailHeight.toFixed(2)}m > door height ${door.height}m`);
    }

    return {
        ok,
        ruleId: 'SFR11_DOOR_FIT',
        message: ok
            ? `Aircraft ${aircraftName} fits through door ${door.name}`
            : `Aircraft ${aircraftName} does NOT fit through door ${door.name}: ${violations.join(', ')}`,
        evidence: {
            aircraftName,
            doorName: door.name,
            doorWidth: door.width,
            doorHeight: door.height,
            effectiveWingspan: effectiveDims.wingspan,
            effectiveTailHeight: effectiveDims.tailHeight,
            rawWingspan: effectiveDims.rawAircraft.wingspan,
            rawTailHeight: effectiveDims.rawAircraft.tailHeight,
            clearanceName: effectiveDims.clearanceName,
            wingspanFits,
            heightFits,
            violations
        }
    };
}