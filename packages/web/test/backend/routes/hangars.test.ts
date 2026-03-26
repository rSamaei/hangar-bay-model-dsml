/**
 * HTTP integration tests for hangars CRUD routes.
 *
 * Covers hangars.ts (lines 1–160, currently 0%), including parseBays validation.
 * The SQLite DB is mocked — getSessionByToken always returns a valid session.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

vi.mock('../../../backend/db/database.js', () => ({
  getHangarsByUser: vi.fn(),
  getHangarById:    vi.fn(),
  createHangar:     vi.fn(),
  updateHangar:     vi.fn(),
  deleteHangar:     vi.fn(),
  getSessionByToken: vi.fn()
}));

import hangarsRoute from '../../../backend/routes/hangars.js';
import {
  getHangarsByUser,
  getHangarById,
  createHangar,
  updateHangar,
  deleteHangar,
  getSessionByToken
} from '../../../backend/db/database.js';

const app = express();
app.use(express.json());
app.use('/api', hangarsRoute);

const agent = supertest(app);

const mockGetByUser  = getHangarsByUser  as ReturnType<typeof vi.fn>;
const mockGetById    = getHangarById     as ReturnType<typeof vi.fn>;
const mockCreate     = createHangar      as ReturnType<typeof vi.fn>;
const mockUpdate     = updateHangar      as ReturnType<typeof vi.fn>;
const mockDelete     = deleteHangar      as ReturnType<typeof vi.fn>;
const mockGetSession = getSessionByToken as ReturnType<typeof vi.fn>;

const AUTH = { Authorization: 'Bearer test-token' };
const SESSION = { user_id: 42, username: 'tester' };

const VALID_BAYS = [{ name: 'Bay1', width: 12, depth: 10, height: 5 }];
const ALPHA_HANGAR = { id: 1, user_id: 42, name: 'Alpha', bays: VALID_BAYS };

beforeEach(() => {
  vi.resetAllMocks();
  mockGetSession.mockReturnValue(SESSION);
});

// ---------------------------------------------------------------------------
// GET /api/hangars
// ---------------------------------------------------------------------------

describe('GET /api/hangars', () => {
  test('returns 200 with hangars array', async () => {
    mockGetByUser.mockReturnValue([ALPHA_HANGAR]);
    const res = await agent.get('/api/hangars').set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.hangars)).toBe(true);
  });

  test('returns 401 without auth', async () => {
    const res = await agent.get('/api/hangars');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/hangars/:id
// ---------------------------------------------------------------------------

describe('GET /api/hangars/:id', () => {
  test('returns 200 with hangar when found', async () => {
    mockGetById.mockReturnValue(ALPHA_HANGAR);
    const res = await agent.get('/api/hangars/1').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.hangar.name).toBe('Alpha');
  });

  test('returns 404 when not found', async () => {
    mockGetById.mockReturnValue(null);
    const res = await agent.get('/api/hangars/99').set(AUTH);
    expect(res.status).toBe(404);
  });

  test('returns 400 for non-numeric id', async () => {
    const res = await agent.get('/api/hangars/abc').set(AUTH);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/hangars — parseBays validation
// ---------------------------------------------------------------------------

describe('POST /api/hangars — parseBays validation', () => {
  test('returns 400 when bays array is empty', async () => {
    const res = await agent.post('/api/hangars').set(AUTH)
      .send({ name: 'Alpha', bays: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/bay/i);
  });

  test('returns 400 when a bay is missing a name', async () => {
    const res = await agent.post('/api/hangars').set(AUTH)
      .send({ name: 'Alpha', bays: [{ width: 12, depth: 10, height: 5 }] });
    expect(res.status).toBe(400);
  });

  test('returns 400 when two bays share the same name', async () => {
    const res = await agent.post('/api/hangars').set(AUTH)
      .send({ name: 'Alpha', bays: [
        { name: 'Bay1', width: 12, depth: 10, height: 5 },
        { name: 'Bay1', width: 12, depth: 10, height: 5 }
      ]});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/duplicate/i);
  });

  test('returns 400 when a bay has zero width', async () => {
    const res = await agent.post('/api/hangars').set(AUTH)
      .send({ name: 'Alpha', bays: [{ name: 'Bay1', width: 0, depth: 10, height: 5 }] });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/hangars — validation: missing name', () => {
  test('returns 400 when hangar name is missing', async () => {
    const res = await agent.post('/api/hangars').set(AUTH)
      .send({ bays: VALID_BAYS });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/hangars — success', () => {
  test('returns 201 with created hangar', async () => {
    mockCreate.mockReturnValue(ALPHA_HANGAR);
    const res = await agent.post('/api/hangars').set(AUTH)
      .send({ name: 'Alpha', bays: VALID_BAYS });
    expect(res.status).toBe(201);
    expect(res.body.hangar.name).toBe('Alpha');
  });
});

describe('POST /api/hangars — duplicate name', () => {
  test('returns 409 on SQLITE_CONSTRAINT_UNIQUE', async () => {
    const err: any = new Error('UNIQUE constraint failed');
    err.code = 'SQLITE_CONSTRAINT_UNIQUE';
    mockCreate.mockImplementation(() => { throw err; });
    const res = await agent.post('/api/hangars').set(AUTH)
      .send({ name: 'Alpha', bays: VALID_BAYS });
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/hangars/:id
// ---------------------------------------------------------------------------

describe('PUT /api/hangars/:id', () => {
  test('returns 200 with updated hangar', async () => {
    mockUpdate.mockReturnValue(ALPHA_HANGAR);
    const res = await agent.put('/api/hangars/1').set(AUTH)
      .send({ name: 'AlphaUpdated', bays: VALID_BAYS });
    expect(res.status).toBe(200);
  });

  test('returns 404 when not found', async () => {
    mockUpdate.mockReturnValue(null);
    const res = await agent.put('/api/hangars/99').set(AUTH)
      .send({ name: 'X', bays: VALID_BAYS });
    expect(res.status).toBe(404);
  });

  test('returns 400 for non-numeric id', async () => {
    const res = await agent.put('/api/hangars/abc').set(AUTH)
      .send({ name: 'X', bays: VALID_BAYS });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/hangars/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/hangars/:id', () => {
  test('returns 200 on successful delete', async () => {
    mockDelete.mockReturnValue(true);
    const res = await agent.delete('/api/hangars/1').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('returns 404 when not found', async () => {
    mockDelete.mockReturnValue(false);
    const res = await agent.delete('/api/hangars/99').set(AUTH);
    expect(res.status).toBe(404);
  });

  test('returns 400 for non-numeric id', async () => {
    const res = await agent.delete('/api/hangars/abc').set(AUTH);
    expect(res.status).toBe(400);
  });
});
