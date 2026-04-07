/**
 * Error-path tests for POST /api/code-actions.
 *
 * Mocks parseDocument to throw so the catch block (lines 80-82) is reached.
 * Kept separate from the other code-actions tests because vi.mock hoisting
 * would affect the real-DSL tests in the other files.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

vi.mock('../../../backend/services/document-parser.js', () => ({
  parseDocument: vi.fn(),
}));

import codeActionsRoute from '../../../backend/routes/code-actions.js';
import { parseDocument } from '../../../backend/services/document-parser.js';

const app = express();
app.use(express.json());
app.use('/api', codeActionsRoute);
const agent = supertest(app);

const mockParse = parseDocument as ReturnType<typeof vi.fn>;

beforeEach(() => mockParse.mockReset());

describe('POST /api/code-actions — parseDocument throws', () => {
  test('returns { actions: [] } when parseDocument throws an error', async () => {
    mockParse.mockRejectedValueOnce(new Error('unexpected parse failure'));
    const res = await agent.post('/api/code-actions').send({
      dslCode: 'airfield X {}',
      diagnostics: [{ message: 'SFR16_CONTIGUITY: test', startLine: 1, startColumn: 0 }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ actions: [] });
  });
});
