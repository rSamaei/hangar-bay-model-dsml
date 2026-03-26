/**
 * HTTP integration tests for POST /api/export
 *
 * Covers export.ts (lines 1–57, currently 0%).
 * A minimal Express app (no DB) is mounted for each test.
 *
 * Covers:
 *   - Missing dslCode → 400
 *   - DSL with syntax error → 400 with parseErrors
 *   - Valid, clean DSL → 200 with ExportModel
 *   - Valid DSL with `includeSchedule: true` + auto-inductions → scheduled entries
 */
import { describe, expect, test } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import exportRoute from '../../../backend/routes/export.js';

const app = express();
app.use(express.json());
app.use('/api', exportRoute);

const agent = supertest(app);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLEAN_DSL = `
airfield ExportField {
    aircraft Cessna {
        wingspan 11.0 m
        length    8.3 m
        height    2.7 m
    }
    hangar AlphaHangar {
        doors {
            door MainDoor { width 15.0 m height 5.0 m }
        }
        grid baygrid {
            bay Bay1 { width 12.0 m depth 10.0 m height 5.0 m }
        }
    }
    induct Cessna into AlphaHangar bays Bay1
        from 2024-06-01T08:00
        to   2024-06-01T10:00;
}
`;

const SYNTAX_ERROR_DSL = `airfield { }`;

/** Auto-induction DSL used to exercise the `includeSchedule: true` path. */
const AUTO_DSL = `
airfield AutoExportField {
    aircraft Cessna {
        wingspan 11.0 m
        length    8.3 m
        height    2.7 m
    }
    hangar AlphaHangar {
        doors {
            door MainDoor { width 15.0 m height 5.0 m }
        }
        grid baygrid {
            bay Bay1 { width 12.0 m depth 10.0 m height 5.0 m }
        }
    }
    auto-induct id "AUTO_1" Cessna
        duration 60 minutes
        prefer AlphaHangar
        notBefore 2030-06-01T08:00
        notAfter  2030-06-10T18:00;
}
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/export — request validation', () => {
  test('returns 400 when dslCode is missing', async () => {
    const res = await agent.post('/api/export').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/export — syntax error', () => {
  test('returns 400 for DSL with a syntax error', async () => {
    const res = await agent.post('/api/export').send({ dslCode: SYNTAX_ERROR_DSL });
    expect(res.status).toBe(400);
  });

  test('response body contains parseErrors on syntax error', async () => {
    const res = await agent.post('/api/export').send({ dslCode: SYNTAX_ERROR_DSL });
    expect(res.body).toHaveProperty('parseErrors');
    expect(Array.isArray(res.body.parseErrors)).toBe(true);
  });
});

describe('POST /api/export — valid DSL (no schedule)', () => {
  test('returns 200 for a valid model', async () => {
    const res = await agent.post('/api/export').send({ dslCode: CLEAN_DSL });
    expect(res.status).toBe(200);
  });

  test('response has airfieldName', async () => {
    const res = await agent.post('/api/export').send({ dslCode: CLEAN_DSL });
    expect(res.body.airfieldName).toBe('ExportField');
  });

  test('response has inductions array', async () => {
    const res = await agent.post('/api/export').send({ dslCode: CLEAN_DSL });
    expect(Array.isArray(res.body.inductions)).toBe(true);
  });
});

describe('POST /api/export — includeSchedule with auto-inductions', () => {
  test('returns 200 when includeSchedule is true', async () => {
    const res = await agent.post('/api/export').send({ dslCode: AUTO_DSL, includeSchedule: true });
    expect(res.status).toBe(200);
  });

  test('autoSchedule block is present when includeSchedule is true', async () => {
    const res = await agent.post('/api/export').send({ dslCode: AUTO_DSL, includeSchedule: true });
    expect(res.body).toHaveProperty('autoSchedule');
  });

  test('autoSchedule has scheduled array when includeSchedule is true', async () => {
    const res = await agent.post('/api/export').send({ dslCode: AUTO_DSL, includeSchedule: true });
    expect(Array.isArray(res.body.autoSchedule?.scheduled)).toBe(true);
    expect(res.body.autoSchedule.scheduled.length).toBeGreaterThan(0);
  });

  test('autoSchedule is absent when includeSchedule is false (default)', async () => {
    const res = await agent.post('/api/export').send({ dslCode: AUTO_DSL });
    expect(res.status).toBe(200);
    // Without schedule, autoSchedule block should be absent or have no scheduled entries
    const scheduled = res.body.autoSchedule?.scheduled ?? [];
    expect(scheduled.length).toBe(0);
  });
});
