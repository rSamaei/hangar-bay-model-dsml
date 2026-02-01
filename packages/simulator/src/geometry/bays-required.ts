import type { Hangar } from '../../../language/out/generated/ast.js';
import type { EffectiveDimensions } from '../types/dimensions.js';

/**
 * DERIVED PROPERTY: Calculate baysRequired using representative bay width
 */
export function calculateBaysRequired(
    effectiveDims: EffectiveDimensions,
    hangar: Hangar
): { baysRequired: number; repBayWidth: number; ruleId: string; evidence: any } {
    const repBayWidth = Math.min(...hangar.grid.bays.map(b => b.width));
    const baysRequired = Math.ceil(effectiveDims.wingspan / repBayWidth);

    return {
        baysRequired,
        repBayWidth,
        ruleId: 'DERIVED_BAYS_REQUIRED',
        evidence: {
            effectiveWingspan: effectiveDims.wingspan,
            repBayWidth,
            baysRequired,
            calculation: `ceil(${effectiveDims.wingspan.toFixed(2)} / ${repBayWidth.toFixed(2)}) = ${baysRequired}`,
            clearanceName: effectiveDims.clearanceName
        }
    };
}