/**
 * HTTP integration tests for auth routes + auth middleware.
 *
 * Covers:
 *   auth.ts    — POST /auth/login, POST /auth/logout, GET /auth/me
 *   middleware/auth.ts — requireAuth, optionalAuth
 *
 * The SQLite DB is fully mocked so no real DB file is needed.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import express, { Request, Response } from 'express';
import supertest from 'supertest';

vi.mock('../../../backend/db/database.js', () => ({
  findOrCreateUser: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  cleanExpiredSessions: vi.fn(),
  getSessionByToken: vi.fn()
}));

import authRoute from '../../../backend/routes/auth.js';
import { requireAuth, optionalAuth } from '../../../backend/middleware/auth.js';
import {
  findOrCreateUser,
  createSession,
  deleteSession,
  cleanExpiredSessions,
  getSessionByToken
} from '../../../backend/db/database.js';

// ── App setup ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api', authRoute);

// Extra route for testing optionalAuth
app.get('/optional', optionalAuth as any, (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json({ user: user ?? null });
});

// Extra route for testing requireAuth with invalid token
app.get('/protected', requireAuth as any, (req: Request, res: Response) => {
  res.json({ ok: true });
});

const agent = supertest(app);

// ── Typed mock helpers ─────────────────────────────────────────────────────
const mockFindOrCreateUser = findOrCreateUser as ReturnType<typeof vi.fn>;
const mockCreateSession    = createSession    as ReturnType<typeof vi.fn>;
const mockDeleteSession    = deleteSession    as ReturnType<typeof vi.fn>;
const mockCleanExpired     = cleanExpiredSessions as ReturnType<typeof vi.fn>;
const mockGetSession       = getSessionByToken   as ReturnType<typeof vi.fn>;

const VALID_SESSION = { user_id: 1, username: 'alice' };
const VALID_TOKEN   = 'valid-token-abc';

beforeEach(() => {
  vi.resetAllMocks();
  mockGetSession.mockReturnValue(null);
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe('POST /api/auth/login — validation', () => {
  test('returns 400 when username is missing', async () => {
    const res = await agent.post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  test('returns 400 when username is too short (< 2 chars)', async () => {
    const res = await agent.post('/api/auth/login').send({ username: 'a' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when username is too long (> 50 chars)', async () => {
    const res = await agent.post('/api/auth/login').send({ username: 'a'.repeat(51) });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login — success', () => {
  beforeEach(() => {
    mockFindOrCreateUser.mockReturnValue({ id: 1, username: 'alice' });
    mockCreateSession.mockReturnValue(undefined);
    mockCleanExpired.mockReturnValue(undefined);
  });

  test('returns 200 with token for a valid username', async () => {
    const res = await agent.post('/api/auth/login').send({ username: 'alice' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.token).toBe('string');
  });

  test('response includes user id and username', async () => {
    const res = await agent.post('/api/auth/login').send({ username: 'alice' });
    expect(res.body.user.id).toBe(1);
    expect(res.body.user.username).toBe('alice');
  });

  test('trims and lowercases the username', async () => {
    await agent.post('/api/auth/login').send({ username: '  Alice  ' });
    expect(mockFindOrCreateUser).toHaveBeenCalledWith('alice');
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe('POST /api/auth/logout', () => {
  test('returns 200 when a valid token is provided', async () => {
    mockGetSession.mockReturnValue(VALID_SESSION);
    mockDeleteSession.mockReturnValue(undefined);
    const res = await agent
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('calls deleteSession with the token', async () => {
    mockGetSession.mockReturnValue(VALID_SESSION);
    mockDeleteSession.mockReturnValue(undefined);
    await agent.post('/api/auth/logout').set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(mockDeleteSession).toHaveBeenCalledWith(VALID_TOKEN);
  });

  test('returns 401 when no token is provided', async () => {
    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

describe('GET /api/auth/me', () => {
  test('returns 200 with user when a valid session exists', async () => {
    mockGetSession.mockReturnValue(VALID_SESSION);
    const res = await agent
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('alice');
  });

  test('returns 401 when no token is provided', async () => {
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// requireAuth middleware — invalid token
// ---------------------------------------------------------------------------

describe('requireAuth middleware', () => {
  test('returns 401 when token is invalid', async () => {
    mockGetSession.mockReturnValue(null); // token not found
    const res = await agent
      .get('/protected')
      .set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// optionalAuth middleware
// ---------------------------------------------------------------------------

describe('optionalAuth middleware', () => {
  test('calls next() and sets user when valid token provided', async () => {
    mockGetSession.mockReturnValue(VALID_SESSION);
    const res = await agent
      .get('/optional')
      .set('Authorization', `Bearer ${VALID_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.user?.username).toBe('alice');
  });

  test('calls next() with no user when no token provided', async () => {
    const res = await agent.get('/optional');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });
});
