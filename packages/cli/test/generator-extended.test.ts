/**
 * Extended unit tests for packages/cli/src/generator.ts
 *
 * Covers uncovered branches by mocking all external dependencies so no
 * Langium runtime or file-system I/O is needed:
 *   - Lines 17–20:  model.$document is undefined  → process.exit(1)
 *   - Lines 23–30:  severity-1 diagnostics present → process.exit(1) + error log
 *   - Lines 39–46:  autoSchedule.scheduled entries  → console output
 *   - Lines 48–55:  autoSchedule.unscheduled entries → console output
 *   - Lines 58–64:  violations present              → console output
 *   - Lines 69–72:  conflicts present               → console output
 *   - Lines 132–147: JSON output has autoScheduling block
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';

// ---------------------------------------------------------------------------
// Module mocks — hoisted by vitest before any import
// ---------------------------------------------------------------------------

vi.mock('../src/util.js', () => ({
    extractAstNode: vi.fn(),
    extractDocument: vi.fn(),
}));

vi.mock('../../language/out/airfield-module.js', () => ({
    createAirfieldServices: vi.fn(() => ({ Airfield: {} })),
}));

vi.mock('../../simulator/out/engine.js', () => ({
    analyzeAndSchedule: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs')>();
    return {
        ...actual,
        existsSync: vi.fn().mockReturnValue(true),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
    };
});

// ---------------------------------------------------------------------------
// Imports that resolve AFTER mocks are registered
// ---------------------------------------------------------------------------

import { generateAction } from '../src/generator.js';
import { extractAstNode } from '../src/util.js';
import { analyzeAndSchedule } from '../../simulator/out/engine.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Minimal ExportModel with no auto-schedule, no induction conflicts. */
function makeExportModel(overrides: Record<string, unknown> = {}) {
    return {
        schemaVersion: '1.0.0',
        autoSchedule: null,
        inductions: [],
        ...overrides,
    };
}

/** Minimal ValidationReport with zero violations. */
function makeReport(overrides: Record<string, unknown> = {}) {
    return {
        summary: { totalViolations: 0 },
        violations: [],
        ...overrides,
    };
}

/** Minimal LangiumDocument-like object with no diagnostics. */
function makeDocument(diagnostics: unknown[] = []) {
    return {
        diagnostics,
        textDocument: { getText: vi.fn(() => '') },
    };
}

/** Minimal Model AST node. */
function makeModel(docOverride?: unknown) {
    return {
        $type: 'AirfieldModel',
        name: 'MockAirfield',
        $document: docOverride ?? makeDocument(),
        aircraftTypes: [],
        hangars: [],
        inductions: [],
        autoInductions: [],
        clearanceEnvelopes: [],
        accessPaths: [],
    } as any;
}

beforeEach(() => {
    // Suppress console output in all tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Reset mocked fs functions to safe defaults
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined as any);
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Line 17–20: model.$document is undefined
// ---------------------------------------------------------------------------

describe('generateAction — no $document on model', () => {
    it('calls process.exit(1) when model.$document is undefined', async () => {
        const model = makeModel(undefined);
        model.$document = undefined;
        vi.mocked(extractAstNode).mockResolvedValue(model);

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
            throw new Error('process.exit called');
        }) as any);

        await expect(
            generateAction('mock.air', { destination: '/tmp/out' })
        ).rejects.toThrow('process.exit called');

        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});

// ---------------------------------------------------------------------------
// Lines 23–30: severity-1 diagnostics in $document
// ---------------------------------------------------------------------------

describe('generateAction — severity-1 diagnostics', () => {
    it('calls process.exit(1) and logs each error when document has severity-1 diagnostics', async () => {
        const diag = { severity: 1, range: { start: { line: 2 } }, message: 'Bad wingspan' };
        const model = makeModel(makeDocument([diag]));
        vi.mocked(extractAstNode).mockResolvedValue(model);

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
            throw new Error('process.exit called');
        }) as any);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(
            generateAction('mock.air', { destination: '/tmp/out' })
        ).rejects.toThrow('process.exit called');

        expect(exitSpy).toHaveBeenCalledWith(1);
        // At least one call should mention the error message
        const calls = errorSpy.mock.calls.map(c => String(c[0]));
        expect(calls.some(s => s.includes('Bad wingspan'))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Lines 39–46: autoSchedule.scheduled entries
// ---------------------------------------------------------------------------

describe('generateAction — auto-schedule scheduled entries', () => {
    it('logs scheduled aircraft when autoSchedule.scheduled is non-empty', async () => {
        vi.mocked(extractAstNode).mockResolvedValue(makeModel());
        vi.mocked(analyzeAndSchedule).mockReturnValue({
            report: makeReport() as any,
            exportModel: makeExportModel({
                autoSchedule: {
                    scheduled: [
                        { aircraft: 'Cessna', hangar: 'AlphaHangar', bays: ['Bay1'], start: '2024-01-01T08:00', end: '2024-01-01T10:00', id: 'S1', door: undefined },
                    ],
                    unscheduled: [],
                },
            }) as any,
        });

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await generateAction('mock.air', { destination: '/tmp/out' });

        const calls = logSpy.mock.calls.map(c => String(c[0]));
        expect(calls.some(s => s.includes('Cessna'))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Lines 48–55: autoSchedule.unscheduled entries
// ---------------------------------------------------------------------------

describe('generateAction — auto-schedule unscheduled entries', () => {
    it('logs unscheduled aircraft when autoSchedule.unscheduled is non-empty', async () => {
        vi.mocked(extractAstNode).mockResolvedValue(makeModel());
        vi.mocked(analyzeAndSchedule).mockReturnValue({
            report: makeReport() as any,
            exportModel: makeExportModel({
                autoSchedule: {
                    scheduled: [],
                    unscheduled: [
                        { aircraft: 'Jumbo', reasonRuleId: 'NO_SUITABLE_BAY_SET', id: 'U1' },
                    ],
                },
            }) as any,
        });

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await generateAction('mock.air', { destination: '/tmp/out' });

        const calls = logSpy.mock.calls.map(c => String(c[0]));
        expect(calls.some(s => s.includes('Jumbo'))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Lines 58–64: violations present
// ---------------------------------------------------------------------------

describe('generateAction — violations in report', () => {
    it('logs each violation when report has totalViolations > 0', async () => {
        vi.mocked(extractAstNode).mockResolvedValue(makeModel());
        vi.mocked(analyzeAndSchedule).mockReturnValue({
            report: makeReport({
                summary: { totalViolations: 1 },
                violations: [{ ruleId: 'SFR11_DOOR_FIT', message: 'Aircraft too wide for door' }],
            }) as any,
            exportModel: makeExportModel() as any,
        });

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await generateAction('mock.air', { destination: '/tmp/out' });

        const calls = errorSpy.mock.calls.map(c => String(c[0]));
        expect(calls.some(s => s.includes('SFR11_DOOR_FIT') || s.includes('Aircraft too wide'))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Lines 69–72: conflicts present
// ---------------------------------------------------------------------------

describe('generateAction — induction conflicts', () => {
    it('logs conflict count when inductions have conflicts', async () => {
        vi.mocked(extractAstNode).mockResolvedValue(makeModel());
        vi.mocked(analyzeAndSchedule).mockReturnValue({
            report: makeReport() as any,
            exportModel: makeExportModel({
                inductions: [
                    { conflicts: ['IND002'], id: 'IND001' },
                ],
            }) as any,
        });

        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await generateAction('mock.air', { destination: '/tmp/out' });

        const calls = logSpy.mock.calls.map(c => String(c[0]));
        expect(calls.some(s => s.includes('conflict'))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Lines 132–147: JSON output has autoScheduling block
// ---------------------------------------------------------------------------

describe('generateAction — JSON autoScheduling block', () => {
    it('writes autoScheduling section in JSON when autoSchedule is present', async () => {
        const model = makeModel();
        vi.mocked(extractAstNode).mockResolvedValue(model);
        vi.mocked(analyzeAndSchedule).mockReturnValue({
            report: makeReport() as any,
            exportModel: makeExportModel({
                autoSchedule: {
                    scheduled: [
                        { id: 'S1', aircraft: 'Cessna', hangar: 'Alpha', bays: ['Bay1'], start: '2024-01-01T08:00', end: '2024-01-01T10:00', door: 'D1' },
                    ],
                    unscheduled: [
                        { id: 'U1', aircraft: 'Jumbo', reasonRuleId: 'NO_SUITABLE_BAY_SET' },
                    ],
                },
            }) as any,
        });

        let capturedJson = '';
        vi.mocked(fs.writeFileSync).mockImplementation((_p, data) => {
            capturedJson = data as string;
        });

        await generateAction('mock.air', { destination: '/tmp/out' });

        const parsed = JSON.parse(capturedJson);
        expect(parsed.autoScheduling).not.toBeNull();
        expect(parsed.autoScheduling.scheduled).toHaveLength(1);
        expect(parsed.autoScheduling.scheduled[0].aircraftName).toBe('Cessna');
        expect(parsed.autoScheduling.unscheduled).toHaveLength(1);
        expect(parsed.autoScheduling.unscheduled[0].reasonRuleId).toBe('NO_SUITABLE_BAY_SET');
    });

    it('writes autoScheduling as null in JSON when autoSchedule is absent', async () => {
        vi.mocked(extractAstNode).mockResolvedValue(makeModel());
        vi.mocked(analyzeAndSchedule).mockReturnValue({
            report: makeReport() as any,
            exportModel: makeExportModel() as any, // autoSchedule: null
        });

        let capturedJson = '';
        vi.mocked(fs.writeFileSync).mockImplementation((_p, data) => {
            capturedJson = data as string;
        });

        await generateAction('mock.air', { destination: '/tmp/out' });

        const parsed = JSON.parse(capturedJson);
        expect(parsed.autoScheduling).toBeNull();
    });
});
