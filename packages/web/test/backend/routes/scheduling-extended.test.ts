/**
 * Extended HTTP integration tests for scheduling routes.
 *
 * Covers the route handlers in scheduling.ts that weren't covered by
 * the pure-function tests in scheduling.test.ts.
 *
 * All DB functions and the scheduling service are mocked.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

// ---------------------------------------------------------------------------
// Mocks — declared before route import
// ---------------------------------------------------------------------------

vi.mock('../../../backend/db/database.js', () => ({
  getSessionByToken:        vi.fn(),
  getScheduleEntriesByUser: vi.fn(),
  createScheduleEntry:      vi.fn(),
  createScheduleEntries:    vi.fn(),
  deleteScheduleEntry:      vi.fn(),
  updateScheduleEntry:      vi.fn(),
  clearAllScheduleEntries:  vi.fn(),
  getAircraftByUser:        vi.fn(),
  getAircraftById:          vi.fn(),
  getHangarsByUser:         vi.fn(),
}));

vi.mock('../../../backend/services/scheduling-service.js', () => ({
  generateDSLFromEntries: vi.fn().mockReturnValue('airfield Mock {}'),
  computeSchedule: vi.fn(),
  extractPlacements: vi.fn(),
}));

import schedulingRoute from '../../../backend/routes/scheduling.js';
import {
  getSessionByToken,
  getScheduleEntriesByUser,
  createScheduleEntry,
  createScheduleEntries,
  deleteScheduleEntry,
  updateScheduleEntry,
  clearAllScheduleEntries,
  getAircraftById,
  getHangarsByUser,
  getAircraftByUser,
} from '../../../backend/db/database.js';
import { computeSchedule } from '../../../backend/services/scheduling-service.js';

// ---------------------------------------------------------------------------
// App + mocked function handles
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use('/api', schedulingRoute);
const agent = supertest(app);

const mockGetSession           = getSessionByToken           as ReturnType<typeof vi.fn>;
const mockGetEntries           = getScheduleEntriesByUser    as ReturnType<typeof vi.fn>;
const mockCreateEntry          = createScheduleEntry         as ReturnType<typeof vi.fn>;
const mockCreateEntries        = createScheduleEntries       as ReturnType<typeof vi.fn>;
const mockDeleteEntry          = deleteScheduleEntry         as ReturnType<typeof vi.fn>;
const mockUpdateEntry          = updateScheduleEntry         as ReturnType<typeof vi.fn>;
const mockClearAll             = clearAllScheduleEntries     as ReturnType<typeof vi.fn>;
const mockGetAircraftById      = getAircraftById             as ReturnType<typeof vi.fn>;
const mockGetHangars           = getHangarsByUser            as ReturnType<typeof vi.fn>;
const mockGetAircraftByUser    = getAircraftByUser           as ReturnType<typeof vi.fn>;
const mockComputeSchedule      = computeSchedule             as ReturnType<typeof vi.fn>;

const AUTH    = { Authorization: 'Bearer test-token' };
const SESSION = { user_id: 42, username: 'tester' };

const ENTRY = {
  id: 1, user_id: 42, aircraft_id: 1, aircraft_name: 'Cessna',
  start_time: '2024-06-01T08:00', end_time: '2024-06-01T10:00',
};

const PLACEMENT = {
  entryId: 1, aircraftName: 'Cessna', hangar: 'Alpha', bays: ['Bay1'],
  start: '2024-06-01T08:00', end: '2024-06-01T10:00', status: 'scheduled',
};

const OK_SCHEDULE_RESULT = {
  entries: [ENTRY],
  placements: [PLACEMENT],
  validationErrors: [],
  dslCode: 'airfield Mock {}',
};

beforeEach(() => {
  vi.resetAllMocks();
  mockGetSession.mockReturnValue(SESSION);
  mockGetEntries.mockReturnValue([]);
  mockGetHangars.mockReturnValue([]);
  mockGetAircraftByUser.mockReturnValue([]);
});

// ---------------------------------------------------------------------------
// GET /api/schedule
// ---------------------------------------------------------------------------

describe('GET /api/schedule', () => {
  test('returns 200 with empty result when no entries', async () => {
    const res = await agent.get('/api/schedule').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
    expect(res.body.placements).toEqual([]);
  });

  test('returns 401 without auth', async () => {
    const res = await agent.get('/api/schedule');
    expect(res.status).toBe(401);
  });

  test('returns computed schedule when entries exist', async () => {
    mockGetEntries.mockReturnValue([ENTRY]);
    mockGetHangars.mockReturnValue([{ id: 1, name: 'Alpha', bays: [] }]);
    mockComputeSchedule.mockResolvedValue({
      placements: [PLACEMENT],
      validationErrors: [],
      dslCode: 'airfield Mock {}',
    });
    const res = await agent.get('/api/schedule').set(AUTH);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/schedule/entry
// ---------------------------------------------------------------------------

describe('POST /api/schedule/entry', () => {
  test('returns 400 when aircraftId is missing', async () => {
    const res = await agent.post('/api/schedule/entry').set(AUTH)
      .send({ startTime: '2024-06-01T08:00', endTime: '2024-06-01T10:00' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when endTime is before startTime', async () => {
    const res = await agent.post('/api/schedule/entry').set(AUTH)
      .send({ aircraftId: 1, startTime: '2024-06-01T10:00', endTime: '2024-06-01T08:00' });
    expect(res.status).toBe(400);
  });

  test('returns 404 when aircraft not found for user', async () => {
    mockGetAircraftById.mockReturnValue(null);
    const res = await agent.post('/api/schedule/entry').set(AUTH)
      .send({ aircraftId: 99, startTime: '2024-06-01T08:00', endTime: '2024-06-01T10:00' });
    expect(res.status).toBe(404);
  });

  test('returns 201 with schedule result on success', async () => {
    mockGetAircraftById.mockReturnValue({ id: 1, name: 'Cessna' });
    mockGetEntries.mockReturnValue([ENTRY]);
    mockGetHangars.mockReturnValue([]);
    const res = await agent.post('/api/schedule/entry').set(AUTH)
      .send({ aircraftId: 1, startTime: '2024-06-01T08:00', endTime: '2024-06-01T10:00' });
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// POST /api/schedule/entries
// ---------------------------------------------------------------------------

describe('POST /api/schedule/entries', () => {
  test('returns 400 when entries is not an array', async () => {
    const res = await agent.post('/api/schedule/entries').set(AUTH)
      .send({ entries: 'bad' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when entries array is empty', async () => {
    const res = await agent.post('/api/schedule/entries').set(AUTH)
      .send({ entries: [] });
    expect(res.status).toBe(400);
  });

  test('returns 400 when one entry has invalid data', async () => {
    const res = await agent.post('/api/schedule/entries').set(AUTH)
      .send({ entries: [{ startTime: '2024-06-01T08:00', endTime: '2024-06-01T10:00' }] }); // missing aircraftId
    expect(res.status).toBe(400);
  });

  test('returns 404 when an entry references unknown aircraft', async () => {
    mockGetAircraftById.mockReturnValue(null);
    const res = await agent.post('/api/schedule/entries').set(AUTH).send({
      entries: [{ aircraftId: 99, startTime: '2024-06-01T08:00', endTime: '2024-06-01T10:00' }],
    });
    expect(res.status).toBe(404);
  });

  test('returns 201 on success', async () => {
    mockGetAircraftById.mockReturnValue({ id: 1, name: 'Cessna' });
    mockGetEntries.mockReturnValue([ENTRY]);
    mockGetHangars.mockReturnValue([]);
    const res = await agent.post('/api/schedule/entries').set(AUTH).send({
      entries: [{ aircraftId: 1, startTime: '2024-06-01T08:00', endTime: '2024-06-01T10:00' }],
    });
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/schedule/entry/:id
// ---------------------------------------------------------------------------

describe('PUT /api/schedule/entry/:id', () => {
  test('returns 400 for non-numeric id', async () => {
    const res = await agent.put('/api/schedule/entry/abc').set(AUTH)
      .send({ startTime: '2024-06-01T08:00', endTime: '2024-06-01T10:00' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when time window is invalid', async () => {
    const res = await agent.put('/api/schedule/entry/1').set(AUTH)
      .send({ startTime: '2024-06-01T10:00', endTime: '2024-06-01T08:00' });
    expect(res.status).toBe(400);
  });

  test('returns 404 when entry not found', async () => {
    mockUpdateEntry.mockReturnValue(null);
    const res = await agent.put('/api/schedule/entry/99').set(AUTH)
      .send({ startTime: '2024-06-01T08:00', endTime: '2024-06-01T10:00' });
    expect(res.status).toBe(404);
  });

  test('returns 200 on success', async () => {
    mockUpdateEntry.mockReturnValue(ENTRY);
    mockGetEntries.mockReturnValue([ENTRY]);
    mockGetHangars.mockReturnValue([]);
    const res = await agent.put('/api/schedule/entry/1').set(AUTH)
      .send({ startTime: '2024-06-01T08:00', endTime: '2024-06-01T10:00' });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/schedule/entry/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/schedule/entry/:id', () => {
  test('returns 400 for non-numeric id', async () => {
    const res = await agent.delete('/api/schedule/entry/abc').set(AUTH);
    expect(res.status).toBe(400);
  });

  test('returns 404 when entry not found', async () => {
    mockDeleteEntry.mockReturnValue(false);
    const res = await agent.delete('/api/schedule/entry/99').set(AUTH);
    expect(res.status).toBe(404);
  });

  test('returns 200 on successful delete', async () => {
    mockDeleteEntry.mockReturnValue(true);
    mockGetEntries.mockReturnValue([]);
    const res = await agent.delete('/api/schedule/entry/1').set(AUTH);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/schedule/clear
// ---------------------------------------------------------------------------

describe('DELETE /api/schedule/clear', () => {
  test('returns 200 with empty result', async () => {
    const res = await agent.delete('/api/schedule/clear').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
    expect(res.body.placements).toEqual([]);
  });

  test('returns 401 without auth', async () => {
    const res = await agent.delete('/api/schedule/clear');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// computeSchedule internal — parseErrors return path (lines 260-267)
// ---------------------------------------------------------------------------

describe('GET /api/schedule — computeSchedule parseErrors branch', () => {
  test('returns result with parseErrors when service returns parseErrors flag', async () => {
    mockGetEntries.mockReturnValue([ENTRY]);
    mockGetHangars.mockReturnValue([{ id: 1, name: 'Alpha', bays: [] }]);
    mockGetAircraftByUser.mockReturnValue([]);
    mockComputeSchedule.mockResolvedValue({
      parseErrors: [{ message: 'syntax error' }],
      placements: [],
      validationErrors: ['failed to parse DSL'],
    });
    const res = await agent.get('/api/schedule').set(AUTH);
    expect(res.status).toBe(200);
    // The route returns the result from computeSchedule (internal), not a 500
    expect(res.body.validationErrors).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// computeSchedule internal — runSchedule throws (lines 296-313)
// ---------------------------------------------------------------------------

describe('GET /api/schedule — computeSchedule catch branch', () => {
  test('returns 200 with failed placements when runSchedule throws', async () => {
    mockGetEntries.mockReturnValue([ENTRY]);
    mockGetHangars.mockReturnValue([{ id: 1, name: 'Alpha', bays: [] }]);
    mockGetAircraftByUser.mockReturnValue([]);
    mockComputeSchedule.mockRejectedValue(new Error('scheduler crashed'));
    const res = await agent.get('/api/schedule').set(AUTH);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.placements)).toBe(true);
    expect(res.body.placements[0].status).toBe('failed');
    expect(res.body.validationErrors[0]).toContain('scheduler crashed');
  });
});
