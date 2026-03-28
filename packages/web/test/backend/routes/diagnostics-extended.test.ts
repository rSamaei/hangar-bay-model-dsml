/**
 * Extended branch tests for POST /api/diagnostics.
 *
 * Covers the optional-field fallback branches in diagnostics.ts that are
 * not hit by diagnostics.test.ts, where all error fixtures supply full fields.
 *
 * Branches targeted (all using `??` or ternary fallbacks):
 *   Parse error map  (lines 33-41):
 *     - e.severity undefined  → severity ?? 1
 *     - e.line undefined      → line ?? 1
 *     - e.column undefined    → column !== undefined ? ... : 0 / 1
 *   Validation diag map (lines 46-55):
 *     - e.severity undefined
 *     - e.line undefined
 *     - e.column undefined
 *     - e.endLine undefined   → endLine ?? e.line ?? 1
 *     - e.endColumn undefined → endColumn !== undefined ? ... : (column ?? 0) + 1
 *
 * Also covers the `req.body` null guard (line 21): `req.body ?? {}`.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

vi.mock('../../../backend/services/document-parser.js', () => ({
  parseDocument: vi.fn(),
}));

import diagnosticsRoute from '../../../backend/routes/diagnostics.js';
import { parseDocument } from '../../../backend/services/document-parser.js';

const app = express();
app.use(express.json());
app.use('/api', diagnosticsRoute);
const agent = supertest(app);

const mockParse = parseDocument as ReturnType<typeof vi.fn>;

beforeEach(() => mockParse.mockReset());

// ---------------------------------------------------------------------------
// Null body guard — req.body ?? {}
// ---------------------------------------------------------------------------

describe('POST /api/diagnostics — null body', () => {
  test('returns empty diagnostics when request body is absent', async () => {
    // Sending no body at all; Express body-parser leaves req.body as {}
    const res = await agent.post('/api/diagnostics');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ diagnostics: [] });
  });
});

// ---------------------------------------------------------------------------
// Parse error map — optional field fallback branches
// ---------------------------------------------------------------------------

describe('POST /api/diagnostics — parse error with missing optional fields', () => {
  test('handles parse error with no severity, no line, no column', async () => {
    // All optional fields undefined → hits all fallback branches
    mockParse.mockResolvedValueOnce({
      parseErrors: [{ message: 'Unexpected token' }],
      validationDiagnostics: [],
      hasParseErrors: true,
    });
    const res = await agent.post('/api/diagnostics').send({ dslCode: '@@@' });
    expect(res.status).toBe(200);
    const item = res.body.diagnostics[0];
    expect(item.severity).toBe(1);        // ?? 1 fallback
    expect(item.startLine).toBe(1);       // ?? 1 fallback
    expect(item.startColumn).toBe(0);     // ternary else: 0
    expect(item.endLine).toBe(1);         // ?? 1 fallback
    expect(item.endColumn).toBe(1);       // ternary else: 1
    expect(item.source).toBe('parser');
  });

  test('handles parse error with column=0 (edge: Math.max(0, 0-1)=0)', async () => {
    mockParse.mockResolvedValueOnce({
      parseErrors: [{ message: 'err', severity: 2, line: 3, column: 0 }],
      validationDiagnostics: [],
      hasParseErrors: true,
    });
    const res = await agent.post('/api/diagnostics').send({ dslCode: '@@@' });
    const item = res.body.diagnostics[0];
    expect(item.startColumn).toBe(0);    // Math.max(0, 0-1) = 0
    expect(item.endColumn).toBe(0);      // Math.max(0, 0) = 0
  });
});

// ---------------------------------------------------------------------------
// Validation diag map — optional field fallback branches
// ---------------------------------------------------------------------------

describe('POST /api/diagnostics — validation diag with missing optional fields', () => {
  test('handles validation diag with no severity, no line, no column, no endLine, no endColumn', async () => {
    mockParse.mockResolvedValueOnce({
      parseErrors: [],
      validationDiagnostics: [{ message: 'SFR20: bad dimensions' }],
      hasParseErrors: false,
    });
    const res = await agent.post('/api/diagnostics').send({ dslCode: 'airfield X {}' });
    expect(res.status).toBe(200);
    const item = res.body.diagnostics[0];
    expect(item.severity).toBe(1);       // ?? 1 fallback
    expect(item.startLine).toBe(1);      // ?? 1 fallback
    expect(item.startColumn).toBe(0);    // ?? 0 fallback
    expect(item.endLine).toBe(1);        // endLine ?? line ?? 1 → 1
    expect(item.endColumn).toBe(1);      // endColumn undefined → (column ?? 0) + 1 = 1
    expect(item.source).toBe('validator');
  });

  test('handles validation diag with endLine missing but line present', async () => {
    mockParse.mockResolvedValueOnce({
      parseErrors: [],
      validationDiagnostics: [{ message: 'SFR: test', severity: 1, line: 5, column: 3 }],
      hasParseErrors: false,
    });
    const res = await agent.post('/api/diagnostics').send({ dslCode: 'airfield X {}' });
    const item = res.body.diagnostics[0];
    expect(item.endLine).toBe(5);        // endLine ?? line ?? 1 → falls back to line=5
    expect(item.endColumn).toBe(4);      // endColumn undefined → (column ?? 0) + 1 = 4
  });

  test('handles validation diag with endLine and endColumn both present', async () => {
    mockParse.mockResolvedValueOnce({
      parseErrors: [],
      validationDiagnostics: [{
        message: 'SFR: test', severity: 1, line: 2, column: 1, endLine: 2, endColumn: 10,
      }],
      hasParseErrors: false,
    });
    const res = await agent.post('/api/diagnostics').send({ dslCode: 'airfield X {}' });
    const item = res.body.diagnostics[0];
    expect(item.endLine).toBe(2);        // uses endLine directly
    expect(item.endColumn).toBe(10);     // uses endColumn directly
  });
});
