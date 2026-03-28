/**
 * Error-path tests for POST /api/parse.
 *
 * Mocks parseDocument to throw so the catch block (lines 29-35) is reached.
 * Kept separate because vi.mock hoisting would affect real-DSL tests in parse.test.ts.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

vi.mock('../../../backend/services/document-parser.js', () => ({
  parseDocument: vi.fn(),
}));

import parseRoute from '../../../backend/routes/parse.js';
import { parseDocument } from '../../../backend/services/document-parser.js';

const app = express();
app.use(express.json());
app.use('/api', parseRoute);
const agent = supertest(app);

const mockParse = parseDocument as ReturnType<typeof vi.fn>;

beforeEach(() => mockParse.mockReset());

describe('POST /api/parse — parseDocument throws', () => {
  test('returns 500 when parseDocument throws an unexpected error', async () => {
    mockParse.mockRejectedValueOnce(new Error('unexpected parse failure'));
    const res = await agent.post('/api/parse').send({ dslCode: 'airfield X {}' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/internal server error/i);
  });

  test('error details field contains the thrown error message', async () => {
    mockParse.mockRejectedValueOnce(new Error('db connection lost'));
    const res = await agent.post('/api/parse').send({ dslCode: 'airfield X {}' });
    expect(res.status).toBe(500);
    expect(res.body.details).toBe('db connection lost');
  });

  test('non-Error thrown value is stringified in details', async () => {
    mockParse.mockRejectedValueOnce('string error');
    const res = await agent.post('/api/parse').send({ dslCode: 'airfield X {}' });
    expect(res.status).toBe(500);
    expect(res.body.details).toBe('string error');
  });
});
