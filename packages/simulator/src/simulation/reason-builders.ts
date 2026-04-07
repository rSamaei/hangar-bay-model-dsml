/**
 * Structured reason string builders for simulation diagnostics.
 *
 * Extracted from DiscreteEventSimulator to keep the loop focused on events.
 */

import type {
    PlacementRejection,
    DepartureEvent,
    SimulationState,
} from './types.js';

// ---------------------------------------------------------------------------
// Typed evidence interfaces per rule
// ---------------------------------------------------------------------------

interface TimeOverlapEvidence { bayNames?: string[] }
interface DynamicReachabilityEvidence { unreachableNodeIds?: string[] }
interface CorridorFitEvidence { corridorViolations?: string[] }

// ---------------------------------------------------------------------------
// Per-rule formatter registry
// ---------------------------------------------------------------------------

type RuleFormatter = (r: PlacementRejection, aircraftName: string) => string;

const WAIT_REASON_FORMATTERS = new Map<string, RuleFormatter>([
    ['SFR23_TIME_OVERLAP', (r) => {
        const ev = r.evidence as TimeOverlapEvidence;
        return `Bay set {${ev.bayNames?.join(', ') ?? '?'}} has time conflict in ${r.hangar ?? '?'}`;
    }],
    ['SFR11_DOOR_FIT', (r, aircraftName) =>
        `No door in ${r.hangar ?? '?'} fits aircraft ${aircraftName}`
    ],
    ['NO_SUITABLE_BAY_SET', (r) =>
        `No connected bay set large enough in ${r.hangar ?? '?'}`
    ],
    ['SFR21_DYNAMIC_REACHABILITY', (r) => {
        const ev = r.evidence as DynamicReachabilityEvidence;
        return `Bays unreachable via access path in ${r.hangar ?? '?'} — blocked nodes: ${ev.unreachableNodeIds?.join(', ') ?? '?'}`;
    }],
    ['SFR22_CORRIDOR_FIT', (r) => {
        const ev = r.evidence as CorridorFitEvidence;
        return `Aircraft too wide for corridor in ${r.hangar ?? '?'} — blocked at: ${ev.corridorViolations?.join(', ') ?? '?'}`;
    }],
]);

/**
 * Build a structured wait reason from placement rejections.
 * Returns a human-readable, DSML-grounded explanation.
 */
export function buildWaitReason(
    rejections: PlacementRejection[],
    aircraftName: string,
): string {
    if (rejections.length === 0) return `No placement found for ${aircraftName}`;

    const byRule = new Map<string, PlacementRejection[]>();
    for (const r of rejections) {
        const arr = byRule.get(r.ruleId) ?? [];
        arr.push(r);
        byRule.set(r.ruleId, arr);
    }

    const parts: string[] = [];
    for (const [ruleId, rejs] of byRule) {
        const r = rejs[0];
        const formatter = WAIT_REASON_FORMATTERS.get(ruleId);
        parts.push(formatter ? formatter(r, aircraftName) : r.message);
    }

    return parts.join('; ');
}

/**
 * Build a structured departure delay reason.
 */
export function buildDepartureDelayReason(
    event: DepartureEvent,
    blockingIds: string[],
    state: SimulationState,
): string {
    const blockerDetails = blockingIds.map(id => {
        const active = state.activeInductions.find(a => a.id === id);
        if (active) {
            const endIso = new Date(active.scheduledEnd).toISOString().replace(/:\d{2}\.\d{3}Z$/, '');
            return `${id} (departs ${endIso})`;
        }
        return id;
    });

    return `Exit path from {${event.bayNames.join(', ')}} to ${event.doorName || 'door'} blocked — occupied by ${blockerDetails.join(', ')}`;
}
