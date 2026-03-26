/**
 * Extended HTTP integration tests for POST /api/analyse
 *
 * Covers the 500 error path (lines 53–58 in analyse.ts):
 * when parseDocument throws an unexpected error the route must
 * respond with status 500 and a JSON body containing `error` and `details`.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

// Mock must be declared before importing the route so Vitest hoists it.
vi.mock('../../../backend/services/document-parser.js', () => ({
  parseDocument: vi.fn()
}));

import analyseRoute from '../../../backend/routes/analyse.js';
import { parseDocument } from '../../../backend/services/document-parser.js';

const app = express();
app.use(express.json());
app.use('/api', analyseRoute);

const agent = supertest(app);

const mockParseDocument = parseDocument as ReturnType<typeof vi.fn>;

describe('POST /api/analyse — 500 error path', () => {
  beforeEach(() => {
    mockParseDocument.mockReset();
  });

  test('returns 500 when parseDocument throws', async () => {
    mockParseDocument.mockRejectedValue(new Error('simulated Langium failure'));
    const res = await agent.post('/api/analyse').send({ dslCode: 'airfield X {}' });
    expect(res.status).toBe(500);
  });

  test('500 response body has an error field', async () => {
    mockParseDocument.mockRejectedValue(new Error('simulated Langium failure'));
    const res = await agent.post('/api/analyse').send({ dslCode: 'airfield X {}' });
    expect(res.body).toHaveProperty('error');
  });

  test('500 response body has a details field containing the error message', async () => {
    mockParseDocument.mockRejectedValue(new Error('simulated Langium failure'));
    const res = await agent.post('/api/analyse').send({ dslCode: 'airfield X {}' });
    expect(res.body).toHaveProperty('details');
    expect(res.body.details).toContain('simulated Langium failure');
  });
});
