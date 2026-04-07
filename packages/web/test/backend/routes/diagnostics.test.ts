/**
 * HTTP integration tests for POST /api/diagnostics
 *
 * Covers diagnostics.ts (lines 1–65, currently 0%).
 * Always returns HTTP 200 — the diagnostics array IS the payload.
 *
 * Covers:
 *   - Missing/falsy dslCode → { diagnostics: [] }
 *   - Valid DSL → 200 with diagnostics array
 *   - DSL with parse errors → diagnostics includes parse items
 *   - DSL with validation errors → diagnostics includes validator items
 *   - Force throw inside handler → { diagnostics: [] } (catch branch)
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

vi.mock('../../../backend/services/document-parser.js', () => ({
  parseDocument: vi.fn()
}));

import diagnosticsRoute from '../../../backend/routes/diagnostics.js';
import { parseDocument } from '../../../backend/services/document-parser.js';

const app = express();
app.use(express.json());
app.use('/api', diagnosticsRoute);

const agent = supertest(app);
const mockParse = parseDocument as ReturnType<typeof vi.fn>;

/** Minimal ParsedDocument with no errors. */
function cleanResult() {
  return {
    model: {},
    document: {},
    parseErrors: [],
    validationDiagnostics: [],
    hasParseErrors: false
  };
}

/** ParsedDocument simulating a parser/lexer error. */
function parseErrorResult() {
  return {
    model: null,
    document: {},
    parseErrors: [{ message: 'Unexpected token', severity: 1, line: 1, column: 10 }],
    validationDiagnostics: [],
    hasParseErrors: true
  };
}

/** ParsedDocument simulating a validation diagnostic. */
function validationDiagResult() {
  return {
    model: {},
    document: {},
    parseErrors: [],
    validationDiagnostics: [{
      message: 'SFR25_DIMENSIONS: wingspan must be positive',
      severity: 1,
      line: 3,
      column: 2,
      endLine: 3,
      endColumn: 20
    }],
    hasParseErrors: false
  };
}

beforeEach(() => mockParse.mockReset());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/diagnostics — missing dslCode', () => {
  test('returns 200 with empty diagnostics when dslCode is missing', async () => {
    const res = await agent.post('/api/diagnostics').send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ diagnostics: [] });
  });

  test('returns empty diagnostics when dslCode is empty string', async () => {
    const res = await agent.post('/api/diagnostics').send({ dslCode: '' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ diagnostics: [] });
  });
});

describe('POST /api/diagnostics — valid DSL', () => {
  test('returns 200 with diagnostics array for a clean model', async () => {
    mockParse.mockResolvedValueOnce(cleanResult());
    const res = await agent.post('/api/diagnostics').send({ dslCode: 'airfield X {}' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.diagnostics)).toBe(true);
  });

  test('diagnostics array is empty for a clean model', async () => {
    mockParse.mockResolvedValueOnce(cleanResult());
    const res = await agent.post('/api/diagnostics').send({ dslCode: 'airfield X {}' });
    expect(res.body.diagnostics).toHaveLength(0);
  });
});

describe('POST /api/diagnostics — parse errors', () => {
  test('parse errors appear in diagnostics with source=parser', async () => {
    mockParse.mockResolvedValueOnce(parseErrorResult());
    const res = await agent.post('/api/diagnostics').send({ dslCode: '@@@' });
    const items = res.body.diagnostics;
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].source).toBe('parser');
    expect(items[0].message).toBe('Unexpected token');
  });

  test('parse error item has startLine and startColumn', async () => {
    mockParse.mockResolvedValueOnce(parseErrorResult());
    const res = await agent.post('/api/diagnostics').send({ dslCode: '@@@' });
    const item = res.body.diagnostics[0];
    expect(typeof item.startLine).toBe('number');
    expect(typeof item.startColumn).toBe('number');
  });
});

describe('POST /api/diagnostics — validation diagnostics', () => {
  test('validation items appear with source=validator', async () => {
    mockParse.mockResolvedValueOnce(validationDiagResult());
    const res = await agent.post('/api/diagnostics').send({ dslCode: 'airfield X {}' });
    const items = res.body.diagnostics;
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].source).toBe('validator');
    expect(items[0].message).toContain('SFR25_DIMENSIONS');
  });
});

describe('POST /api/diagnostics — error handling', () => {
  test('returns empty diagnostics when parseDocument throws', async () => {
    mockParse.mockRejectedValueOnce(new Error('unexpected failure'));
    const res = await agent.post('/api/diagnostics').send({ dslCode: 'airfield X {}' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ diagnostics: [] });
  });
});
