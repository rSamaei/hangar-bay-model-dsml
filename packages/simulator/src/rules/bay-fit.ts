import type { HangarBay } from '../../../language/out/generated/ast.js';
import type { EffectiveDimensions } from '../types/dimensions.js';

export interface BayFitEvidence {
    bayCount: number;
    aircraftName: string;
    bayNames: string[];
    sumWidth: number;
    sumDepth: number;
    minWidth: number;
    minDepth: number;
    minHeight: number;
    limitingWidthBay: string;
    limitingDepthBay: string;
    limitingHeightBay: string;
    effectiveWingspan: number;
    effectiveLength: number;
    effectiveTailHeight: number;
    clearanceName?: string;
    span: string;
    widthFits: boolean;
    depthFits: boolean;
    heightFits: boolean;
    violations: string[];
}

export interface BayFitResult {
    ok: boolean;
    ruleId: string;
    message: string;
    evidence: BayFitEvidence;
}

/**
 * SFR12: Checks whether a set of bays can physically accommodate an aircraft.
 *
 * Bay sets are treated as a single combined space. How the bays are combined
 * depends on the span direction:
 *
 *   Lateral (default) — bays arranged wing-to-wing:
 *     - Combined width  = sum of bay widths  (must cover effective wingspan).
 *     - Limiting depth  = min of bay depths  (all bays must fit the aircraft length).
 *
 *   Longitudinal — bays arranged nose-to-tail:
 *     - Combined depth  = sum of bay depths  (must cover effective length).
 *     - Limiting width  = min of bay widths  (all bays must fit the effective wingspan).
 *
 *   Height is always constrained by the shallowest bay regardless of span direction.
 *
 * Evidence includes full measurements for both axes so diagnostics can identify the
 * limiting bay for any dimension.
 */
export function checkBaySetFitEffective(
    effectiveDims: EffectiveDimensions,
    bays: HangarBay[],
    aircraftName: string,
    span: string = 'lateral'
): BayFitResult {
    if (bays.length === 0) {
        return {
            ok: false,
            ruleId: 'SFR12_BAY_FIT',
            message: 'No bays provided',
            evidence: {
                bayCount: 0, aircraftName, bayNames: [],
                sumWidth: 0, sumDepth: 0,
                minWidth: 0, minDepth: 0, minHeight: 0,
                limitingWidthBay: '', limitingDepthBay: '', limitingHeightBay: '',
                effectiveWingspan: effectiveDims.wingspan,
                effectiveLength: effectiveDims.length,
                effectiveTailHeight: effectiveDims.tailHeight,
                clearanceName: effectiveDims.clearanceName,
                span, widthFits: false, depthFits: false, heightFits: false,
                violations: ['No bays provided']
            }
        };
    }

    const isLongitudinal = span === 'longitudinal';

    // Compute all aggregate bay measurements in a single pass.
    let sumWidth = 0, sumDepth = 0;
    let minWidth = bays[0].width,   limitingWidthBay  = bays[0].name;
    let minDepth = bays[0].depth,   limitingDepthBay  = bays[0].name;
    let minHeight = bays[0].height, limitingHeightBay = bays[0].name;

    for (const bay of bays) {
        sumWidth += bay.width;
        sumDepth += bay.depth;
        if (bay.width  < minWidth)  { minWidth  = bay.width;  limitingWidthBay  = bay.name; }
        if (bay.depth  < minDepth)  { minDepth  = bay.depth;  limitingDepthBay  = bay.name; }
        if (bay.height < minHeight) { minHeight = bay.height; limitingHeightBay = bay.name; }
    }

    // Lateral:      sumWidth covers wingspan; minDepth constrains length.
    // Longitudinal: sumDepth covers length;   minWidth constrains wingspan.
    const widthFits  = isLongitudinal ? minWidth  >= effectiveDims.wingspan : sumWidth >= effectiveDims.wingspan;
    const depthFits  = isLongitudinal ? sumDepth  >= effectiveDims.length   : minDepth >= effectiveDims.length;
    const heightFits = minHeight >= effectiveDims.tailHeight;

    const violations: string[] = [];
    if (!widthFits) {
        violations.push(isLongitudinal
            ? `min width ${minWidth.toFixed(2)}m (${limitingWidthBay}) < wingspan ${effectiveDims.wingspan.toFixed(2)}m`
            : `sum width ${sumWidth.toFixed(2)}m < wingspan ${effectiveDims.wingspan.toFixed(2)}m`);
    }
    if (!depthFits) {
        violations.push(isLongitudinal
            ? `sum depth ${sumDepth.toFixed(2)}m < length ${effectiveDims.length.toFixed(2)}m`
            : `min depth ${minDepth.toFixed(2)}m (${limitingDepthBay}) < length ${effectiveDims.length.toFixed(2)}m`);
    }
    if (!heightFits) {
        violations.push(`min height ${minHeight.toFixed(2)}m (${limitingHeightBay}) < tail height ${effectiveDims.tailHeight.toFixed(2)}m`);
    }

    const ok = widthFits && depthFits && heightFits;

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
            sumWidth, sumDepth, minWidth, minDepth, minHeight,
            limitingWidthBay, limitingDepthBay, limitingHeightBay,
            effectiveWingspan: effectiveDims.wingspan,
            effectiveLength: effectiveDims.length,
            effectiveTailHeight: effectiveDims.tailHeight,
            clearanceName: effectiveDims.clearanceName,
            span,
            widthFits, depthFits, heightFits,
            violations
        }
    };
}
