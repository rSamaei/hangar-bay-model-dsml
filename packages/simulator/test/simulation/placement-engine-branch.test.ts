/**
 * Branch-coverage tests for PlacementEngine targeting previously uncovered lines:
 *
 *   placement-engine.ts line 181-182:
 *     checkDeparturePath: access graph present but doorNodeIds is empty
 *     → returns { clear: true } without attempting BFS
 *
 *   placement-engine.ts line 181-182 (variant):
 *     bayNodeIds is empty because bay names don't map to graph nodes
 *     → returns { clear: true }
 *
 * Note: lines 352-359 (SFR22_CORRIDOR_FIT in tryBaySet) are defensive code that is
 * logically unreachable in the current flow: the wingspan-aware reachability check
 * at lines 333-344 fires first for any narrow-corridor scenario, producing
 * SFR21_DYNAMIC_REACHABILITY before we reach the corridor fit check.
 */
import { describe, expect, test } from 'vitest';
import { PlacementEngine } from '../../src/simulation/placement-engine.js';
import {
    mkAircraft, mkDoor, mkBay, mkHangar, mkModel,
    mkAccessNode, mkAccessLink, mkAccessPath, ref,
    mkPlacementEngineState,
} from '../helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Lines 181-182: checkDeparturePath — graph present but doorNodeIds is empty
// ---------------------------------------------------------------------------

describe('PlacementEngine.checkDeparturePath — graph present but doorNodeIds empty', () => {
    test('doors have no accessNode hooks → getDoorNodeIds returns [] → { clear: true }', () => {
        // Access path: NodeA ↔ NodeB. Bay has accessNode=NodeB, but door has no accessNode.
        // buildAccessGraph returns a non-null graph (bay hooks NodeB), but no door hooks.
        const nodeA = mkAccessNode('NodeA');
        const nodeB = mkAccessNode('NodeB');
        const link = mkAccessLink(nodeA, nodeB, true);
        const path = mkAccessPath('TestPath', [nodeA, nodeB], [link]);

        const door = mkDoor('Door1', 15, 5); // no accessNode
        const bay = { ...mkBay('Bay1', 12, 10, 5, 0, 0), accessNode: ref(nodeB) };
        const hangar = mkHangar('Alpha', [door], [bay], 1, 1);
        const model = mkModel([hangar], [], [], [path]) as any;

        const engine = new PlacementEngine(model);
        const state = mkPlacementEngineState();

        const result = engine.checkDeparturePath('IND1', 'Alpha', ['Bay1'], state);

        // getDoorNodeIds returns [] → lines 180-182 fire → clear: true
        expect(result.clear).toBe(true);
    });

    test('bay names not in graph → getBayNodeIds returns [] → { clear: true }', () => {
        // Door has accessNode hook, but the bay being queried has none.
        const doorNode = mkAccessNode('DoorNode');
        const path = mkAccessPath('TestPath', [doorNode], []);

        const door = { ...mkDoor('Door1', 15, 5), accessNode: ref(doorNode) };
        const bay = mkBay('Bay1', 12, 10, 5, 0, 0); // no accessNode → not in graph
        const hangar = mkHangar('Alpha', [door], [bay], 1, 1);
        const model = mkModel([hangar], [], [], [path]) as any;

        const engine = new PlacementEngine(model);
        const state = mkPlacementEngineState();

        // Query with Bay1 whose access-graph node doesn't exist
        const result = engine.checkDeparturePath('IND1', 'Alpha', ['Bay1'], state);

        // getBayNodeIds returns [] → lines 180-182 fire → clear: true
        expect(result.clear).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Documenting actual narrow-corridor behavior: SFR21_DYNAMIC_REACHABILITY
// (not SFR22_CORRIDOR_FIT — see module comment above)
// ---------------------------------------------------------------------------

describe('PlacementEngine.attemptPlacement — narrow corridor blocks placement', () => {
    test('aircraft too wide for access corridor → SFR21_DYNAMIC_REACHABILITY rejection', () => {
        const doorNode = mkAccessNode('DoorNode');
        const corridorNode = mkAccessNode('Corridor', 8); // 8 m width
        const bayNode = mkAccessNode('BayNode');

        const path = mkAccessPath('Path',
            [doorNode, corridorNode, bayNode],
            [mkAccessLink(doorNode, corridorNode, true), mkAccessLink(corridorNode, bayNode, true)],
        );

        const door = { ...mkDoor('Door1', 25, 5), accessNode: ref(doorNode) };
        const bay  = { ...mkBay('Bay1', 25, 20, 8, 0, 0), accessNode: ref(bayNode) };
        const hangar = mkHangar('Alpha', [door], [bay], 1, 1);
        const model = mkModel([hangar], [], [], [path]) as any;

        // Wingspan 20 m > corridor 8 m → corridor is impassable
        const aircraft = mkAircraft('WideJet', 20, 15, 5, 5);
        const engine = new PlacementEngine(model);
        const state = mkPlacementEngineState();

        const result = engine.attemptPlacement(
            'IND1', aircraft as any, undefined, 60 * 60_000,
            hangar as any, undefined, state,
            { maxEvents: 100_000, maxDepartureRetries: 100, maxPlacementAttempts: 50 },
        );

        expect(result.placed).toBe(false);
        if (!result.placed) {
            // Reachability check fires before corridor-fit check
            const dynRej = result.rejections.find(r => r.ruleId === 'SFR21_DYNAMIC_REACHABILITY');
            expect(dynRej).toBeDefined();
        }
    });

    test('aircraft narrower than corridor → placed successfully', () => {
        const doorNode = mkAccessNode('DoorNode');
        const corridorNode = mkAccessNode('Corridor', 25); // 25 m — wider than 20 m wingspan
        const bayNode = mkAccessNode('BayNode');

        const path = mkAccessPath('Path',
            [doorNode, corridorNode, bayNode],
            [mkAccessLink(doorNode, corridorNode, true), mkAccessLink(corridorNode, bayNode, true)],
        );

        const door = { ...mkDoor('Door1', 25, 5), accessNode: ref(doorNode) };
        const bay  = { ...mkBay('Bay1', 25, 20, 8, 0, 0), accessNode: ref(bayNode) };
        const hangar = mkHangar('Alpha', [door], [bay], 1, 1);
        const model = mkModel([hangar], [], [], [path]) as any;

        const aircraft = mkAircraft('WideJet', 20, 15, 5, 5);
        const engine = new PlacementEngine(model);
        const state = mkPlacementEngineState();

        const result = engine.attemptPlacement(
            'IND1', aircraft as any, undefined, 60 * 60_000,
            hangar as any, undefined, state,
            { maxEvents: 100_000, maxDepartureRetries: 100, maxPlacementAttempts: 50 },
        );

        expect(result.placed).toBe(true);
    });
});
