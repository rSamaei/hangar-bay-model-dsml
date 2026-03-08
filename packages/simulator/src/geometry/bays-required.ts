import type { Hangar } from '../../../language/out/generated/ast.js';
import type { EffectiveDimensions } from '../types/dimensions.js';

/**
 * Estimates the minimum number of bays needed to accommodate an aircraft's effective span.
 *
 * Uses a greedy descending-sort strategy: take the widest (or deepest, for longitudinal
 * span) bays first and accumulate their dimensions until the running total is >= the
 * aircraft's effective span. This produces a tighter lower-bound than the naive
 * `ceil(span / singleBayDimension)` formula when the hangar contains bays of mixed sizes.
 *
 * When the sum of all bays still falls short of the aircraft span, `baysRequired` is
 * clamped to the total bay count. The induction will fail bay-fit checks regardless, but
 * this avoids returning an impossible number.
 *
 * @param effectiveDims - Clearance-padded aircraft dimensions (from `calculateEffectiveDimensions`).
 * @param hangar        - The target hangar whose bay dimensions are inspected.
 * @param span          - Span direction: `'lateral'` (default) measures against bay widths;
 *                        `'longitudinal'` measures against bay depths.
 * @returns An object containing:
 *   - `baysRequired`  — minimum bay count to cover the span.
 *   - `bayWidthsUsed` — the individual bay dimensions consumed by the estimate (descending).
 *   - `ruleId`        — always `'DERIVED_BAYS_REQUIRED'` for downstream traceability.
 *   - `evidence`      — diagnostic detail bag for validator and report output.
 */
export function calculateBaysRequired(
    effectiveDims: EffectiveDimensions,
    hangar: Hangar,
    span: string = 'lateral'
): { baysRequired: number; bayWidthsUsed: number[]; ruleId: string; evidence: Record<string, unknown> } {
    const isLongitudinal = span === 'longitudinal';
    const effectiveSize = isLongitudinal ? effectiveDims.length : effectiveDims.wingspan;
    const axisLabel = isLongitudinal ? 'length' : 'wingspan';
    const dimLabel = isLongitudinal ? 'depths' : 'widths';

    if (effectiveSize <= 0) {
        return {
            baysRequired: 0,
            bayWidthsUsed: [],
            ruleId: 'DERIVED_BAYS_REQUIRED',
            evidence: {
                effectiveSpan: effectiveSize,
                bayWidthsUsed: [],
                baysRequired: 0,
                calculation: `${axisLabel} <= 0 → 0 bays required`,
                clearanceName: effectiveDims.clearanceName,
                span
            }
        };
    }

    const sortedValues = hangar.grid.bays
        .map(b => isLongitudinal ? b.depth : b.width)
        .sort((a, b) => b - a);

    if (sortedValues.length === 0) {
        return {
            baysRequired: 0,
            bayWidthsUsed: [],
            ruleId: 'DERIVED_BAYS_REQUIRED',
            evidence: {
                effectiveSpan: effectiveSize,
                bayWidthsUsed: [],
                baysRequired: 0,
                calculation: `no bays in hangar`,
                clearanceName: effectiveDims.clearanceName,
                span
            }
        };
    }

    let sum = 0;
    let count = 0;
    for (const v of sortedValues) {
        sum += v;
        count++;
        if (sum >= effectiveSize) break;
    }

    const baysRequired = count;
    const bayWidthsUsed = sortedValues.slice(0, baysRequired);

    return {
        baysRequired,
        bayWidthsUsed,
        ruleId: 'DERIVED_BAYS_REQUIRED',
        evidence: {
            effectiveSpan: effectiveSize,
            bayWidthsUsed,
            baysRequired,
            calculation: `greedy(${effectiveSize.toFixed(2)}, ${dimLabel}=[${bayWidthsUsed.map(w => w.toFixed(2)).join(', ')}]) = ${baysRequired}`,
            clearanceName: effectiveDims.clearanceName,
            span
        }
    };
}
