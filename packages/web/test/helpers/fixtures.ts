/**
 * Shared fixture constants for web package tests.
 *
 * Import these instead of redefining the same strings/objects in each test file.
 */

// ---------------------------------------------------------------------------
// DSL strings
// ---------------------------------------------------------------------------

/**
 * A syntactically and semantically correct `.air` string.
 *
 * - Cessna (11 m wingspan) fits MainDoor (15 m)  → SFR24 OK
 * - Cessna fits Bay1 (12 m wide)                 → SFR12 OK
 * - 1 bay assigned; baysRequired = ceil(11/12)=1 → SFR25 OK
 * - Time window start < end                      → SFR21 OK
 * - All dimensions > 0                           → SFR20 OK
 */
export const VALID_DSL = `
airfield TestAirfield {
    aircraft Cessna {
        wingspan 11.0 m
        length    8.3 m
        height    2.7 m
    }
    hangar AlphaHangar {
        doors {
            door MainDoor {
                width  15.0 m
                height  5.0 m
            }
        }
        grid baygrid {
            bay Bay1 {
                width  12.0 m
                depth  10.0 m
                height  5.0 m
            }
        }
    }
    induct Cessna into AlphaHangar bays Bay1
        from 2024-06-01T08:00
        to   2024-06-01T10:00;
}
`;

/**
 * A string with a parse error — the airfield body is missing required content.
 */
export const INVALID_DSL = `airfield { }`;

// ---------------------------------------------------------------------------
// Domain object fixtures
// ---------------------------------------------------------------------------

/**
 * Minimal aircraft matching the DB `Aircraft` schema.
 * Wingspan/length/height are the Cessna 172 approximate values used throughout
 * the existing test suite.
 */
export const SAMPLE_AIRCRAFT = {
  name: 'Cessna',
  wingspan: 11,
  length: 8,
  height: 3,
  tailHeight: 3,
} as const;

/**
 * Minimal hangar object matching the DB `HangarWithBays` shape.
 */
export const SAMPLE_HANGAR = {
  id: 1,
  user_id: 42,
  name: 'AlphaHangar',
  bays: [
    { id: 1, hangar_id: 1, name: 'Bay1', width: 12, depth: 10, height: 5 },
  ],
} as const;

/**
 * Minimal schedule entry matching the DB `ScheduleEntryWithDetails` shape.
 */
export const SAMPLE_SCHEDULE_ENTRY = {
  id: 1,
  user_id: 42,
  aircraft_id: 1,
  hangar_id: 1,
  start_date: '2024-06-01T08:00:00.000Z',
  end_date: '2024-06-01T10:00:00.000Z',
  aircraft_name: 'Cessna',
  hangar_name: 'AlphaHangar',
} as const;

// ---------------------------------------------------------------------------
// Auth / session fixtures
// ---------------------------------------------------------------------------

/** Standard auth header value used in tests requiring authentication. */
export const AUTH_HEADER = { Authorization: 'Bearer test-token' } as const;

/** Standard session returned by the mocked `getSessionByToken`. */
export const TEST_SESSION = { user_id: 42, username: 'tester' } as const;
