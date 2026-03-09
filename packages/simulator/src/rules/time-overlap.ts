import type { InductionInfo, ConflictInfo } from '../types/conflict.js';

/**
 * Tests whether two half-open time intervals [startA, endA) and [startB, endB) overlap.
 *
 * Two intervals overlap iff each starts before the other ends (strict inequality).
 * Touching boundaries (endA === startB) are NOT considered overlapping, which matches
 * the scheduling model where one induction can start exactly as another ends.
 *
 * @returns `overlaps` — true when the intervals share at least one instant.
 *          `overlapInterval` — the intersection [max(startA,startB), min(endA,endB)],
 *          or null when there is no overlap.
 */
export function checkTimeOverlap(
    startA: Date, endA: Date,
    startB: Date, endB: Date
): { overlaps: boolean; overlapInterval: { start: Date; end: Date } | null } {
    const overlaps = startA < endB && startB < endA;
    if (!overlaps) return { overlaps: false, overlapInterval: null };
    return {
        overlaps: true,
        overlapInterval: {
            start: startA > startB ? startA : startB,
            end:   endA   < endB   ? endA   : endB
        }
    };
}

/**
 * Scans a list of inductions for scheduling conflicts (SFR16).
 *
 * A conflict exists when two inductions in the same hangar share at least one bay
 * AND their time windows overlap. All O(n²) pairs are checked; the result contains
 * one `ConflictInfo` entry per conflicting pair.
 */
export function detectConflicts(inductions: InductionInfo[]): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];

    for (let i = 0; i < inductions.length; i++) {
        for (let j = i + 1; j < inductions.length; j++) {
            const ind1 = inductions[i];
            const ind2 = inductions[j];

            if (ind1.hangar !== ind2.hangar) continue;

            const bay2Set = new Set(ind2.bays);
            const intersectingBays = ind1.bays.filter(b => bay2Set.has(b));
            if (intersectingBays.length === 0) continue;

            const { overlaps, overlapInterval } = checkTimeOverlap(
                ind1.start, ind1.end,
                ind2.start, ind2.end
            );
            if (!overlaps) continue;

            conflicts.push({
                ruleId: 'SFR16_TIME_OVERLAP',
                induction1: { id: ind1.id, aircraft: ind1.aircraft },
                induction2: { id: ind2.id, aircraft: ind2.aircraft },
                hangar: ind1.hangar,
                intersectingBays,
                overlapInterval: {
                    start: overlapInterval!.start.toISOString(),
                    end:   overlapInterval!.end.toISOString()
                },
                message: `Inductions ${ind1.id ?? ind1.aircraft} and ${ind2.id ?? ind2.aircraft} ` +
                         `conflict in hangar ${ind1.hangar} on bays [${intersectingBays.join(', ')}] ` +
                         `during ${overlapInterval!.start.toISOString()} to ${overlapInterval!.end.toISOString()}`
            });
        }
    }

    return conflicts;
}
