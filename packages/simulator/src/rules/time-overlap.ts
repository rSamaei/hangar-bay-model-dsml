import type { InductionInfo, ConflictInfo } from '../types/conflict.js';

/**
 * SFR16: Check time window overlap
 */
export function checkTimeOverlap(
    startA: Date,
    endA: Date,
    startB: Date,
    endB: Date
): { overlaps: boolean; overlapInterval: { start: Date; end: Date } | null } {
    const overlaps = startA < endB && startB < endA;
    
    let overlapInterval = null;
    if (overlaps) {
        overlapInterval = {
            start: startA > startB ? startA : startB,
            end: endA < endB ? endA : endB
        };
    }
    
    return { overlaps, overlapInterval };
}

/**
 * Detect all conflicts in a set of inductions
 */
export function detectConflicts(inductions: InductionInfo[]): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];
    
    for (let i = 0; i < inductions.length; i++) {
        for (let j = i + 1; j < inductions.length; j++) {
            const ind1 = inductions[i];
            const ind2 = inductions[j];
            
            if (ind1.hangar !== ind2.hangar) continue;
            
            const intersectingBays = ind1.bays.filter(b => ind2.bays.includes(b));
            if (intersectingBays.length === 0) continue;
            
            const { overlaps, overlapInterval } = checkTimeOverlap(
                ind1.start, ind1.end,
                ind2.start, ind2.end
            );
            
            if (overlaps && overlapInterval) {
                conflicts.push({
                    ruleId: 'SFR16_TIME_OVERLAP',
                    induction1: { id: ind1.id, aircraft: ind1.aircraft },
                    induction2: { id: ind2.id, aircraft: ind2.aircraft },
                    hangar: ind1.hangar,
                    intersectingBays,
                    overlapInterval: {
                        start: overlapInterval.start.toISOString(),
                        end: overlapInterval.end.toISOString()
                    },
                    message: `Inductions ${ind1.id ?? ind1.aircraft} and ${ind2.id ?? ind2.aircraft} ` +
                            `conflict in hangar ${ind1.hangar} on bays [${intersectingBays.join(', ')}] ` +
                            `during ${overlapInterval.start.toISOString()} to ${overlapInterval.end.toISOString()}`
                });
            }
        }
    }
    
    return conflicts;
}