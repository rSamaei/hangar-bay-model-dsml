import type { HangarBay } from '../../../language/out/generated/ast.js';
import type { EffectiveDimensions } from '../types/dimensions.js';

/**
 * SFR12: Check bay set fit using effective dimensions
 */
export function checkBaySetFitEffective(
    effectiveDims: EffectiveDimensions,
    bays: HangarBay[],
    aircraftName: string
): { ok: boolean; ruleId: string; message: string; evidence: any } {
    if (bays.length === 0) {
        return {
            ok: false,
            ruleId: 'SFR12_BAY_FIT',
            message: 'No bays provided',
            evidence: { bayCount: 0 }
        };
    }

    const sumWidth = bays.reduce((sum, bay) => sum + bay.width, 0);
    
    let minDepth = bays[0].depth;
    let minHeight = bays[0].height;
    let limitingDepthBay = bays[0].name;
    let limitingHeightBay = bays[0].name;

    for (const bay of bays) {
        if (bay.depth < minDepth) {
            minDepth = bay.depth;
            limitingDepthBay = bay.name;
        }
        if (bay.height < minHeight) {
            minHeight = bay.height;
            limitingHeightBay = bay.name;
        }
    }

    const widthFits = sumWidth >= effectiveDims.wingspan;
    const depthFits = minDepth >= effectiveDims.length;
    const heightFits = minHeight >= effectiveDims.tailHeight;
    const ok = widthFits && depthFits && heightFits;

    const violations: string[] = [];
    if (!widthFits) {
        violations.push(`sum width ${sumWidth.toFixed(2)}m < wingspan ${effectiveDims.wingspan.toFixed(2)}m`);
    }
    if (!depthFits) {
        violations.push(`min depth ${minDepth.toFixed(2)}m (${limitingDepthBay}) < length ${effectiveDims.length.toFixed(2)}m`);
    }
    if (!heightFits) {
        violations.push(`min height ${minHeight.toFixed(2)}m (${limitingHeightBay}) < tail height ${effectiveDims.tailHeight.toFixed(2)}m`);
    }

    return {
        ok,
        ruleId: 'SFR12_BAY_FIT',
        message: ok
            ? `Aircraft ${aircraftName} fits in bay set [${bays.map(b => b.name).join(', ')}]`
            : `Aircraft ${aircraftName} does NOT fit: ${violations.join('; ')}`,
        evidence: {
            aircraftName,
            bayNames: bays.map(b => b.name),
            bayCount: bays.length,
            sumWidth,
            minDepth,
            minHeight,
            limitingDepthBay,
            limitingHeightBay,
            effectiveWingspan: effectiveDims.wingspan,
            effectiveLength: effectiveDims.length,
            effectiveTailHeight: effectiveDims.tailHeight,
            clearanceName: effectiveDims.clearanceName,
            widthFits,
            depthFits,
            heightFits,
            violations
        }
    };
}