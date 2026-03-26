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
        const evidence = r.evidence as Record<string, any>;
        switch (ruleId) {
            case 'SFR16_TIME_OVERLAP': {
                const bays = evidence.bayNames as string[] | undefined;
                parts.push(`Bay set {${bays?.join(', ') ?? '?'}} has time conflict in ${r.hangar ?? '?'}`);
                break;
            }
            case 'SFR11_DOOR_FIT':
                parts.push(`No door in ${r.hangar ?? '?'} fits aircraft ${aircraftName}`);
                break;
            case 'NO_SUITABLE_BAY_SET':
                parts.push(`No connected bay set large enough in ${r.hangar ?? '?'}`);
                break;
            case 'SFR_DYNAMIC_REACHABILITY': {
                const unreachable = evidence.unreachableNodeIds as string[] | undefined;
                parts.push(`Bays unreachable via access path in ${r.hangar ?? '?'} — blocked nodes: ${unreachable?.join(', ') ?? '?'}`);
                break;
            }
            case 'SFR_CORRIDOR_FIT': {
                const violations = evidence.corridorViolations as string[] | undefined;
                parts.push(`Aircraft too wide for corridor in ${r.hangar ?? '?'} — blocked at: ${violations?.join(', ') ?? '?'}`);
                break;
            }
            default:
                parts.push(r.message);
        }
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
