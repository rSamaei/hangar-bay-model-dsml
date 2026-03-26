/**
 * HTTP integration tests for aircraft CRUD routes.
 *
 * Covers aircraft.ts (lines 1–172, currently 0%).
 * The SQLite DB and requireAuth are mocked — getSessionByToken returns
 * a valid session for any bearer token.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

vi.mock('../../../backend/db/database.js', () => ({
  getAircraftByUser: vi.fn(),
  getAircraftById:   vi.fn(),
  createAircraft:    vi.fn(),
  updateAircraft:    vi.fn(),
  deleteAircraft:    vi.fn(),
  getSessionByToken: vi.fn()
}));

import aircraftRoute from '../../../backend/routes/aircraft.js';
import {
  getAircraftByUser,
  getAircraftById,
  createAircraft,
  updateAircraft,
  deleteAircraft,
  getSessionByToken
} from '../../../backend/db/database.js';

const app = express();
app.use(express.json());
app.use('/api', aircraftRoute);

const agent = supertest(app);

const mockGetByUser  = getAircraftByUser  as ReturnType<typeof vi.fn>;
const mockGetById    = getAircraftById    as ReturnType<typeof vi.fn>;
const mockCreate     = createAircraft     as ReturnType<typeof vi.fn>;
const mockUpdate     = updateAircraft     as ReturnType<typeof vi.fn>;
const mockDelete     = deleteAircraft     as ReturnType<typeof vi.fn>;
const mockGetSession = getSessionByToken  as ReturnType<typeof vi.fn>;

const AUTH = { Authorization: 'Bearer test-token' };
const SESSION = { user_id: 42, username: 'tester' };

const CESSNA = { id: 1, user_id: 42, name: 'Cessna', wingspan: 11, length: 8.3, height: 2.7, tail_height: 2.7 };
const VALID_BODY = { name: 'Cessna', wingspan: 11, length: 8.3, height: 2.7, tailHeight: 2.7 };

beforeEach(() => {
  vi.resetAllMocks();
  mockGetSession.mockReturnValue(SESSION);
});

// ---------------------------------------------------------------------------
// GET /api/aircraft
// ---------------------------------------------------------------------------

describe('GET /api/aircraft', () => {
  test('returns 200 with aircraft array', async () => {
    mockGetByUser.mockReturnValue([CESSNA]);
    const res = await agent.get('/api/aircraft').set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.aircraft)).toBe(true);
    expect(res.body.aircraft[0].name).toBe('Cessna');
  });

  test('returns 401 without auth', async () => {
    const res = await agent.get('/api/aircraft');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/aircraft/:id
// ---------------------------------------------------------------------------

describe('GET /api/aircraft/:id', () => {
  test('returns 200 with aircraft when found', async () => {
    mockGetById.mockReturnValue(CESSNA);
    const res = await agent.get('/api/aircraft/1').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.aircraft.name).toBe('Cessna');
  });

  test('returns 404 when not found', async () => {
    mockGetById.mockReturnValue(null);
    const res = await agent.get('/api/aircraft/99').set(AUTH);
    expect(res.status).toBe(404);
  });

  test('returns 400 for non-numeric id', async () => {
    const res = await agent.get('/api/aircraft/abc').set(AUTH);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/aircraft
// ---------------------------------------------------------------------------

describe('POST /api/aircraft — validation', () => {
  test('returns 400 when name is missing', async () => {
    const res = await agent.post('/api/aircraft').set(AUTH)
      .send({ wingspan: 11, length: 8.3, height: 2.7, tailHeight: 2.7 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when wingspan is zero', async () => {
    const res = await agent.post('/api/aircraft').set(AUTH)
      .send({ name: 'X', wingspan: 0, length: 8.3, height: 2.7, tailHeight: 2.7 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when length is negative', async () => {
    const res = await agent.post('/api/aircraft').set(AUTH)
      .send({ name: 'X', wingspan: 11, length: -1, height: 2.7, tailHeight: 2.7 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when height is missing', async () => {
    const res = await agent.post('/api/aircraft').set(AUTH)
      .send({ name: 'X', wingspan: 11, length: 8.3, tailHeight: 2.7 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when tailHeight is missing', async () => {
    const res = await agent.post('/api/aircraft').set(AUTH)
      .send({ name: 'X', wingspan: 11, length: 8.3, height: 2.7 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/aircraft — success', () => {
  test('returns 201 with created aircraft', async () => {
    mockCreate.mockReturnValue(CESSNA);
    const res = await agent.post('/api/aircraft').set(AUTH).send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body.aircraft.name).toBe('Cessna');
  });
});

describe('POST /api/aircraft — duplicate name', () => {
  test('returns 409 on SQLITE_CONSTRAINT_UNIQUE', async () => {
    const err: any = new Error('UNIQUE constraint failed');
    err.code = 'SQLITE_CONSTRAINT_UNIQUE';
    mockCreate.mockImplementation(() => { throw err; });
    const res = await agent.post('/api/aircraft').set(AUTH).send(VALID_BODY);
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/aircraft/:id
// ---------------------------------------------------------------------------

describe('PUT /api/aircraft/:id', () => {
  test('returns 200 with updated aircraft', async () => {
    mockUpdate.mockReturnValue({ ...CESSNA, wingspan: 12 });
    const res = await agent.put('/api/aircraft/1').set(AUTH).send({ wingspan: 12 });
    expect(res.status).toBe(200);
  });

  test('returns 404 when not found', async () => {
    mockUpdate.mockReturnValue(null);
    const res = await agent.put('/api/aircraft/99').set(AUTH).send({ wingspan: 12 });
    expect(res.status).toBe(404);
  });

  test('returns 400 for non-numeric id', async () => {
    const res = await agent.put('/api/aircraft/abc').set(AUTH).send({ wingspan: 12 });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/aircraft/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/aircraft/:id', () => {
  test('returns 200 on successful delete', async () => {
    mockDelete.mockReturnValue(true);
    const res = await agent.delete('/api/aircraft/1').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('returns 404 when not found', async () => {
    mockDelete.mockReturnValue(false);
    const res = await agent.delete('/api/aircraft/99').set(AUTH);
    expect(res.status).toBe(404);
  });

  test('returns 400 for non-numeric id', async () => {
    const res = await agent.delete('/api/aircraft/abc').set(AUTH);
    expect(res.status).toBe(400);
  });
});
