/**
 * Unit tests for calculateSearchWindow().
 *
 * The function derives a search window from the model's manual inductions:
 *   - baseline = earliest manual induction start (or DEFAULT_START_TIME if none)
 *   - end = baseline + SEARCH_WINDOW_DAYS (7) days
 *
 * No Langium runtime required — model only needs { inductions: [{ start }] }.
 */
import { describe, expect, test } from 'vitest';
import { calculateSearchWindow } from '../src/search/time-window.js';
import { SCHEDULER_CONFIG } from '../src/config.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function mkModel(inductionStarts: string[]): any {
    return {
        inductions: inductionStarts.map(start => ({ start })),
        autoInductions: [],
        hangars: [],
        accessPaths: [],
        $type: 'Model'
    };
}

const WINDOW_MS = SCHEDULER_CONFIG.SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('calculateSearchWindow', () => {
    test('no manual inductions — window starts approximately now', () => {
        const before = Date.now();
        const model = mkModel([]);
        const { start } = calculateSearchWindow(model);
        const after = Date.now();
        expect(start.getTime()).toBeGreaterThanOrEqual(before);
        expect(start.getTime()).toBeLessThanOrEqual(after);
    });

    test('no manual inductions — window is exactly SEARCH_WINDOW_DAYS wide', () => {
        const model = mkModel([]);
        const { start, end } = calculateSearchWindow(model);
        expect(end.getTime() - start.getTime()).toBe(WINDOW_MS);
    });

    test('single manual induction — window starts at that induction start', () => {
        const inductionStart = '2026-01-15T08:00:00Z';
        const model = mkModel([inductionStart]);
        const { start } = calculateSearchWindow(model);
        expect(start.getTime()).toBe(new Date(inductionStart).getTime());
    });

    test('multiple manual inductions — window starts at the earliest start time', () => {
        const model = mkModel([
            '2026-02-10T12:00:00Z',
            '2026-01-20T08:00:00Z',   // earliest
            '2026-03-01T06:00:00Z',
        ]);
        const { start } = calculateSearchWindow(model);
        expect(start.getTime()).toBe(new Date('2026-01-20T08:00:00Z').getTime());
    });

    test('window end is always exactly SEARCH_WINDOW_DAYS after the baseline', () => {
        const inductionStart = '2026-06-01T10:00:00Z';
        const model = mkModel([inductionStart]);
        const { start, end } = calculateSearchWindow(model);
        expect(end.getTime() - start.getTime()).toBe(WINDOW_MS);
    });
});
