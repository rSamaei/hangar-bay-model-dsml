/**
 * Extended HTTP integration tests for aircraft routes.
 *
 * Covers branches not reached by aircraft.test.ts:
 *   - PUT with duplicate name (SQLITE_CONSTRAINT_UNIQUE → 409)
 *   - PUT with invalid validation (wingspan=0)
 *   - DELETE with 401 when no auth
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
  getSessionByToken: vi.fn(),
}));

import aircraftRoute from '../../../backend/routes/aircraft.js';
import {
  updateAircraft,
  getSessionByToken,
} from '../../../backend/db/database.js';

const app = express();
app.use(express.json());
app.use('/api', aircraftRoute);
const agent = supertest(app);

const mockUpdate     = updateAircraft     as ReturnType<typeof vi.fn>;
const mockGetSession = getSessionByToken  as ReturnType<typeof vi.fn>;

const AUTH    = { Authorization: 'Bearer test-token' };
const SESSION = { user_id: 42, username: 'tester' };

beforeEach(() => {
  vi.resetAllMocks();
  mockGetSession.mockReturnValue(SESSION);
});

// ---------------------------------------------------------------------------
// PUT /api/aircraft/:id — duplicate name
// ---------------------------------------------------------------------------

describe('PUT /api/aircraft/:id', () => {
  test('returns 409 when update raises SQLITE_CONSTRAINT_UNIQUE', async () => {
    const err: any = new Error('UNIQUE constraint failed');
    err.code = 'SQLITE_CONSTRAINT_UNIQUE';
    mockUpdate.mockImplementation(() => { throw err; });

    const res = await agent.put('/api/aircraft/1').set(AUTH).send({ name: 'Cessna' });
    expect(res.status).toBe(409);
  });

  test('returns 400 when wingspan is zero in update', async () => {
    const res = await agent.put('/api/aircraft/1').set(AUTH).send({ wingspan: 0 });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/aircraft/:id — auth guard
// ---------------------------------------------------------------------------

describe('DELETE /api/aircraft/:id — auth', () => {
  test('returns 401 when no auth token provided', async () => {
    const res = await agent.delete('/api/aircraft/1');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/aircraft — more validation branches
// ---------------------------------------------------------------------------

describe('POST /api/aircraft — additional validation', () => {
  test('returns 400 when height is zero', async () => {
    const res = await agent.post('/api/aircraft').set(AUTH)
      .send({ name: 'X', wingspan: 11, length: 8, height: 0, tailHeight: 3 });
    expect(res.status).toBe(400);
  });

  test('returns 400 when tailHeight is negative', async () => {
    const res = await agent.post('/api/aircraft').set(AUTH)
      .send({ name: 'X', wingspan: 11, length: 8, height: 3, tailHeight: -1 });
    expect(res.status).toBe(400);
  });
});
