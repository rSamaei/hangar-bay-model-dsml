import type { HangarDoor } from '../../../language/out/generated/ast.js';
import type { EffectiveDimensions } from '../types/dimensions.js';

export interface DoorFitEvidence {
    aircraftName: string;
    doorName: string;
    doorWidth: number;
    doorHeight: number;
    effectiveWingspan: number;
    effectiveTailHeight: number;
    rawWingspan: number;
    rawTailHeight: number;
    clearanceName?: string;
    wingspanFits: boolean;
    heightFits: boolean;
    violations: string[];
}

export interface DoorFitResult {
    ok: boolean;
    ruleId: string;
    message: string;
    evidence: DoorFitEvidence;
}

/**
 * SFR11: Checks whether an aircraft can pass through a hangar door.
 *
 * Two dimensions are checked against the door opening:
 *   - Effective wingspan must not exceed the door width.
 *   - Effective tail height must not exceed the door height.
 *
 * Both must pass for the result to be `ok`. Individual fit flags and violation
 * strings are included in the evidence for diagnostic reporting.
 */
export function checkDoorFitEffective(
    effectiveDims: EffectiveDimensions,
    door: HangarDoor,
    aircraftName: string
): DoorFitResult {
    const wingspanFits = effectiveDims.wingspan <= door.width;
    const heightFits   = effectiveDims.tailHeight <= door.height;
    const ok = wingspanFits && heightFits;

    const violations: string[] = [];
    if (!wingspanFits) violations.push(`effective wingspan ${effectiveDims.wingspan.toFixed(2)}m > door width ${door.width}m`);
    if (!heightFits)   violations.push(`effective tail height ${effectiveDims.tailHeight.toFixed(2)}m > door height ${door.height}m`);

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
