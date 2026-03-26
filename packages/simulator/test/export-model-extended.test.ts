/**
 * Extended unit tests for buildExportModel() covering the conflict-annotation
 * branches not exercised elsewhere:
 *
 *   - Lines 249–253: annotateConflicts loop body — detectConflicts returns ≥1
 *                    result, ids extracted and added to conflictMap
 *   - Lines 260–264: addToMap helper — Set created on first call, value added
 *
 * To trigger these paths two manual inductions must share the same hangar/bay
 * and have overlapping time windows so detectConflicts() returns a result.
 */
import { describe, expect, test } from 'vitest';
import { buildExportModel } from '../src/builders/export-model.js';
import { mkAircraft, mkDoor, mkBay, mkHangar, mkManualInduction, mkModel } from './helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CESSNA = mkAircraft('Cessna172', 11, 8, 2.7, 2.7);
const MAIN_DOOR = mkDoor('MainDoor', 13, 3);
const BAY1 = mkBay('Bay1', 12, 10, 3, 0, 0);
const BAY2 = mkBay('Bay2', 12, 10, 3, 0, 1);
const ALPHA_HANGAR = mkHangar('Alpha', [MAIN_DOOR], [BAY1, BAY2], 1, 2);

// ---------------------------------------------------------------------------
// Task S3: conflicts map populated bidirectionally (lines 249–264)
//
// Two inductions in the same hangar AND same bay with overlapping windows →
// detectConflicts() returns one conflict → annotateConflicts fills conflictMap
// bidirectionally → both exported inductions list each other in .conflicts.
// ---------------------------------------------------------------------------

describe('buildExportModel — conflict annotation', () => {
    test('two overlapping manual inductions on the same bay populate conflicts bidirectionally', () => {
        // IND-A: 08:00–10:00  IND-B: 09:00–11:00 — one hour overlap on Bay1
        const indA = mkManualInduction(
            'IND-A', CESSNA, ALPHA_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00'
        );
        const indB = mkManualInduction(
            'IND-B', CESSNA, ALPHA_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T09:00', '2024-06-01T11:00'
        );

        const model = mkModel([ALPHA_HANGAR], [indA, indB], []);
        const exportModel = buildExportModel(model);

        const expA = exportModel.inductions.find(i => i.id === 'IND-A')!;
        const expB = exportModel.inductions.find(i => i.id === 'IND-B')!;

        expect(expA).toBeDefined();
        expect(expB).toBeDefined();

        // Bidirectional: A lists B, B lists A
        expect(expA.conflicts).toContain('IND-B');
        expect(expB.conflicts).toContain('IND-A');
    });

    test('non-overlapping inductions on the same bay have empty conflicts', () => {
        // IND-A: 08:00–10:00  IND-B: 10:00–12:00 — touching (not overlapping)
        const indA = mkManualInduction(
            'IND-A', CESSNA, ALPHA_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00'
        );
        const indB = mkManualInduction(
            'IND-B', CESSNA, ALPHA_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T10:00', '2024-06-01T12:00'
        );

        const model = mkModel([ALPHA_HANGAR], [indA, indB], []);
        const exportModel = buildExportModel(model);

        const expA = exportModel.inductions.find(i => i.id === 'IND-A')!;
        const expB = exportModel.inductions.find(i => i.id === 'IND-B')!;

        expect(expA.conflicts).toHaveLength(0);
        expect(expB.conflicts).toHaveLength(0);
    });

    test('overlapping inductions on different bays have empty conflicts', () => {
        // Same time window but different bays — no shared bay → no conflict
        const indA = mkManualInduction(
            'IND-A', CESSNA, ALPHA_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00'
        );
        const indB = mkManualInduction(
            'IND-B', CESSNA, ALPHA_HANGAR, [BAY2], MAIN_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00'
        );

        const model = mkModel([ALPHA_HANGAR], [indA, indB], []);
        const exportModel = buildExportModel(model);

        const expA = exportModel.inductions.find(i => i.id === 'IND-A')!;
        const expB = exportModel.inductions.find(i => i.id === 'IND-B')!;

        expect(expA.conflicts).toHaveLength(0);
        expect(expB.conflicts).toHaveLength(0);
    });
});
