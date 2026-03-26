/**
 * Extended HTTP integration tests for POST /api/validate
 *
 * Covers the 500 error path (lines 41–46 in validate.ts):
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

import validateRoute from '../../../backend/routes/validate.js';
import { parseDocument } from '../../../backend/services/document-parser.js';

const app = express();
app.use(express.json());
app.use('/api', validateRoute);

const agent = supertest(app);

const mockParseDocument = parseDocument as ReturnType<typeof vi.fn>;

describe('POST /api/validate — 500 error path', () => {
  beforeEach(() => {
    mockParseDocument.mockReset();
  });

  test('returns 500 when parseDocument throws', async () => {
    mockParseDocument.mockRejectedValue(new Error('simulated Langium failure'));
    const res = await agent.post('/api/validate').send({ dslCode: 'airfield X {}' });
    expect(res.status).toBe(500);
  });

  test('500 response body has an error field', async () => {
    mockParseDocument.mockRejectedValue(new Error('simulated Langium failure'));
    const res = await agent.post('/api/validate').send({ dslCode: 'airfield X {}' });
    expect(res.body).toHaveProperty('error');
  });

  test('500 response body has a details field containing the error message', async () => {
    mockParseDocument.mockRejectedValue(new Error('simulated Langium failure'));
    const res = await agent.post('/api/validate').send({ dslCode: 'airfield X {}' });
    expect(res.body).toHaveProperty('details');
    expect(res.body.details).toContain('simulated Langium failure');
  });
});
