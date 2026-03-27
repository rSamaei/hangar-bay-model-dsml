/**
 * Shared test infrastructure for web package route tests.
 *
 * Usage patterns:
 *
 *   // 1. App setup — mount a single route for focused tests:
 *   const app = createTestApp(aircraftRoute);
 *   const agent = supertest(app);
 *
 *   // 2. DB mock factory — use inside vi.mock():
 *   vi.mock('../../../backend/db/database.js', () => mockDb());
 *
 *   // 3. Langium services mock factory — use inside vi.mock():
 *   vi.mock('../../../backend/services/langium-services.js', () => mockLangiumServices());
 */

import { vi } from 'vitest';
import express, { type Router } from 'express';

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal Express app with JSON body parsing and the given route
 * mounted at `/api`. No `app.listen()` side effect.
 *
 * Pass the default export of any route module (e.g. `aircraftRoute`) to get
 * a supertest-ready app for that route.
 */
export function createTestApp(route: Router): ReturnType<typeof express> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', route);
  return app;
}

// ---------------------------------------------------------------------------
// Database mock factory
// ---------------------------------------------------------------------------

/**
 * Returns a mock module shape for `backend/db/database.js`.
 *
 * Use inside `vi.mock()`:
 *
 *   vi.mock('../../../backend/db/database.js', () => mockDb());
 *
 * After the import block, cast the imported functions to `MockedFunction` or
 * use `vi.mocked()` to access mock methods.
 */
export function mockDb() {
  return {
    // Session / auth
    getSessionByToken: vi.fn(),
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    cleanExpiredSessions: vi.fn(),
    // User
    findOrCreateUser: vi.fn(),
    getUserById: vi.fn(),
    // Aircraft
    getAircraftByUser: vi.fn(),
    getAircraftById: vi.fn(),
    createAircraft: vi.fn(),
    updateAircraft: vi.fn(),
    deleteAircraft: vi.fn(),
    // Hangars
    getHangarsByUser: vi.fn(),
    getHangarById: vi.fn(),
    createHangar: vi.fn(),
    updateHangar: vi.fn(),
    deleteHangar: vi.fn(),
    // Scheduling
    getScheduleEntriesByUser: vi.fn(),
    createScheduleEntry: vi.fn(),
    createScheduleEntries: vi.fn(),
    deleteScheduleEntry: vi.fn(),
    updateScheduleEntry: vi.fn(),
    clearAllScheduleEntries: vi.fn(),
    // DB lifecycle
    getDatabase: vi.fn(),
    closeDatabase: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Langium services mock factory
// ---------------------------------------------------------------------------

/**
 * Returns a mock module shape for `backend/services/langium-services.js`.
 *
 * Use inside `vi.mock()`:
 *
 *   vi.mock('../../../backend/services/langium-services.js', () => mockLangiumServices());
 *
 * The returned `getLangiumServices` mock returns a minimal stub that satisfies
 * the `AirfieldServices` interface well enough for route-level tests.
 */
export function mockLangiumServices() {
  const serviceStub = {
    parser: { LangiumParser: { parse: vi.fn() } },
    validation: { DocumentValidator: { validateDocument: vi.fn() } },
    shared: {
      workspace: {
        LangiumDocumentFactory: { fromString: vi.fn() },
        DocumentBuilder: { build: vi.fn() },
      },
    },
  };

  return {
    getLangiumServices: vi.fn().mockReturnValue(serviceStub),
  };
}
