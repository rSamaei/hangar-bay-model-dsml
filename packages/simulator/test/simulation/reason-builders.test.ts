/**
 * Unit tests for reason-builders.ts
 *
 * Covers buildWaitReason (all formatter registry entries + fallback)
 * and buildDepartureDelayReason.
 */
import { describe, expect, test } from 'vitest';
import { buildWaitReason, buildDepartureDelayReason } from '../../src/simulation/reason-builders.js';
import type { PlacementRejection, DepartureEvent, SimulationState } from '../../src/simulation/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkRejection(ruleId: string, hangar = 'H1', evidence: object = {}): PlacementRejection {
    return { ruleId, hangar, message: `[${ruleId}] failure`, evidence } as PlacementRejection;
}

function emptyState(): SimulationState {
    return {
        currentTime: 1000,
        occupiedBays: new Map(),
        waitingQueue: [],
        pendingDepartures: [],
        activeInductions: [],
        completedInductions: [],
        fixedOccupancy: [],
        eventLog: [],
    };
}

// ---------------------------------------------------------------------------
// buildWaitReason
// ---------------------------------------------------------------------------

describe('buildWaitReason', () => {
    test('returns generic message when rejections list is empty', () => {
        const reason = buildWaitReason([], 'Cessna');
        expect(reason).toContain('Cessna');
        expect(reason).toContain('No placement found');
    });

    test('SFR23_TIME_OVERLAP formatter includes bay names and hangar', () => {
        const r = mkRejection('SFR23_TIME_OVERLAP', 'H1', { bayNames: ['Bay1', 'Bay2'] });
        const reason = buildWaitReason([r], 'Cessna');
        expect(reason).toContain('Bay1');
        expect(reason).toContain('Bay2');
        expect(reason).toContain('H1');
    });

    test('SFR23_TIME_OVERLAP formatter falls back when bayNames is undefined', () => {
        const r = mkRejection('SFR23_TIME_OVERLAP', 'H1', {});
        const reason = buildWaitReason([r], 'Cessna');
        expect(reason).toContain('H1');
        expect(reason).toContain('conflict');
    });

    test('SFR11_DOOR_FIT formatter includes aircraft name and hangar', () => {
        const r = mkRejection('SFR11_DOOR_FIT', 'H1');
        const reason = buildWaitReason([r], 'Cessna');
        expect(reason).toContain('Cessna');
        expect(reason).toContain('H1');
        expect(reason.toLowerCase()).toContain('door');
    });

    test('NO_SUITABLE_BAY_SET formatter mentions hangar', () => {
        const r = mkRejection('NO_SUITABLE_BAY_SET', 'AlphaHangar');
        const reason = buildWaitReason([r], 'Hawk');
        expect(reason).toContain('AlphaHangar');
    });

    test('SFR21_DYNAMIC_REACHABILITY formatter includes unreachable node IDs', () => {
        const r = mkRejection('SFR21_DYNAMIC_REACHABILITY', 'H1', { unreachableNodeIds: ['Node1', 'Node2'] });
        const reason = buildWaitReason([r], 'Cessna');
        expect(reason).toContain('Node1');
        expect(reason).toContain('Node2');
    });

    test('SFR22_CORRIDOR_FIT formatter includes corridor violations', () => {
        const r = mkRejection('SFR22_CORRIDOR_FIT', 'H1', { corridorViolations: ['Corridor_A'] });
        const reason = buildWaitReason([r], 'Cessna');
        expect(reason).toContain('Corridor_A');
    });

    test('unknown ruleId falls back to r.message', () => {
        const r = mkRejection('CUSTOM_RULE_XYZ', 'H1');
        const reason = buildWaitReason([r], 'Cessna');
        expect(reason).toContain('CUSTOM_RULE_XYZ');
    });

    test('multiple distinct rules are joined with semicolons', () => {
        const rejections = [
            mkRejection('SFR11_DOOR_FIT', 'H1'),
            mkRejection('NO_SUITABLE_BAY_SET', 'H1'),
        ];
        const reason = buildWaitReason(rejections, 'Cessna');
        expect(reason).toContain(';');
    });

    test('multiple rejections with the same ruleId produce one entry', () => {
        const rejections = [
            mkRejection('SFR11_DOOR_FIT', 'H1'),
            mkRejection('SFR11_DOOR_FIT', 'H2'),
        ];
        const reason = buildWaitReason(rejections, 'Cessna');
        // Only the first rejection of this ruleId should be formatted
        expect(reason.split(';').length).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// buildDepartureDelayReason
// ---------------------------------------------------------------------------

describe('buildDepartureDelayReason', () => {
    function mkDepartureEvent(bayNames: string[], doorName = 'MainDoor'): DepartureEvent {
        return {
            kind: 'DEPARTURE',
            time: 2000,
            priority: 1,
            inductionId: 'ind_1',
            hangarName: 'H1',
            bayNames,
            doorName,
            fixed: false,
        };
    }

    test('includes bay names and door in reason string', () => {
        const event = mkDepartureEvent(['Bay1', 'Bay2'], 'MainDoor');
        const state = emptyState();
        const reason = buildDepartureDelayReason(event, [], state);
        expect(reason).toContain('Bay1');
        expect(reason).toContain('Bay2');
        expect(reason).toContain('MainDoor');
    });

    test('includes blocker IDs', () => {
        const event = mkDepartureEvent(['Bay1']);
        const state = emptyState();
        state.activeInductions.push({
            id: 'blocker_1',
            kind: 'auto',
            aircraftName: 'Hawk',
            hangarName: 'H1',
            doorName: 'D1',
            bayNames: ['Bay3'],
            actualStart: 1000,
            scheduledEnd: 3000,
            departureBlockedSince: null,
        });
        const reason = buildDepartureDelayReason(event, ['blocker_1'], state);
        expect(reason).toContain('blocker_1');
    });

    test('formats active induction end time in reason', () => {
        const event = mkDepartureEvent(['Bay1']);
        const state = emptyState();
        state.activeInductions.push({
            id: 'ind_2',
            kind: 'auto',
            aircraftName: 'Hawk',
            hangarName: 'H1',
            doorName: 'D1',
            bayNames: ['Bay3'],
            actualStart: 1000,
            scheduledEnd: new Date('2024-06-01T10:00:00Z').getTime(),
            departureBlockedSince: null,
        });
        const reason = buildDepartureDelayReason(event, ['ind_2'], state);
        expect(reason).toContain('ind_2');
        expect(reason).toContain('departs');
    });

    test('unknown blocker ID is included as-is', () => {
        const event = mkDepartureEvent(['Bay1']);
        const state = emptyState();
        const reason = buildDepartureDelayReason(event, ['unknown_blocker'], state);
        expect(reason).toContain('unknown_blocker');
    });

    test('empty doorName falls back to "door"', () => {
        const event = mkDepartureEvent(['Bay1'], '');
        const state = emptyState();
        const reason = buildDepartureDelayReason(event, [], state);
        expect(reason).toContain('door');
    });
});

// ---------------------------------------------------------------------------
// buildWaitReason — r.hangar undefined (??  '?' fallback on lines 30,33,36,40,44)
// ---------------------------------------------------------------------------

describe('buildWaitReason — hangar undefined fallback', () => {
    function mkRejectionNoHangar(ruleId: string, evidence: object = {}): PlacementRejection {
        return { ruleId, hangar: undefined, message: `[${ruleId}] failure`, evidence } as PlacementRejection;
    }

    test('SFR23_TIME_OVERLAP with hangar=undefined yields "?" in output', () => {
        const r = mkRejectionNoHangar('SFR23_TIME_OVERLAP', { bayNames: ['Bay1'] });
        const reason = buildWaitReason([r], 'Cessna');
        expect(reason).toContain('?');
    });

    test('SFR11_DOOR_FIT with hangar=undefined yields "?" in output', () => {
        const r = mkRejectionNoHangar('SFR11_DOOR_FIT');
        const reason = buildWaitReason([r], 'Cessna');
        expect(reason).toContain('?');
    });

    test('NO_SUITABLE_BAY_SET with hangar=undefined yields "?" in output', () => {
        const r = mkRejectionNoHangar('NO_SUITABLE_BAY_SET');
        const reason = buildWaitReason([r], 'Cessna');
        expect(reason).toContain('?');
    });

    test('SFR21_DYNAMIC_REACHABILITY with hangar=undefined and no nodeIds yields "?" twice', () => {
        // Both r.hangar ?? '?' and ev.unreachableNodeIds?.join() ?? '?' hit fallback
        const r = mkRejectionNoHangar('SFR21_DYNAMIC_REACHABILITY', {});
        const reason = buildWaitReason([r], 'Cessna');
        expect(reason).toContain('?');
        expect(reason).toContain('blocked nodes: ?');
    });

    test('SFR22_CORRIDOR_FIT with hangar=undefined and no corridorViolations yields "?" twice', () => {
        // Both r.hangar ?? '?' and ev.corridorViolations?.join() ?? '?' hit fallback
        const r = mkRejectionNoHangar('SFR22_CORRIDOR_FIT', {});
        const reason = buildWaitReason([r], 'Cessna');
        expect(reason).toContain('?');
        expect(reason).toContain('blocked at: ?');
    });
});
