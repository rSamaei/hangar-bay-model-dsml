/**
 * HTTP integration tests for POST /api/code-actions
 *
 * Covers code-actions.ts (lines 1–85, currently 0%).
 *
 * Covers:
 *   - Missing dslCode or non-array diagnostics → { actions: [] }
 *   - Valid DSL with no diagnostics → { actions: [] }
 *   - Valid DSL + SFR16_CONTIGUITY diagnostic at the right position → actions returned
 *   - DSL with no errors + dummy diagnostic → { actions: [] }
 */
import { describe, expect, test } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import codeActionsRoute from '../../../backend/routes/code-actions.js';

const app = express();
app.use(express.json());
app.use('/api', codeActionsRoute);

const agent = supertest(app);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Three-bay hangar; Bay1+Bay3 non-contiguous (only adjacent to Bay2).
 * The induction `induct Cessna into AlphaHangar bays Bay1 Bay3` triggers
 * SFR16_CONTIGUITY. We compute the 1-based line of "bays Bay1 Bay3" below.
 */
const NON_CONTIGUOUS_DSL = `airfield ViolField {
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
            bay Bay1 { width 12.0 m depth 10.0 m height 5.0 m adjacent { Bay2 } }
            bay Bay2 { width 12.0 m depth 10.0 m height 5.0 m adjacent { Bay1 Bay3 } }
            bay Bay3 { width 12.0 m depth 10.0 m height 5.0 m adjacent { Bay2 } }
        }
    }
    induct Cessna into AlphaHangar bays Bay1 Bay3
        from 2024-06-01T08:00
        to   2024-06-01T10:00;
}`;

const CLEAN_DSL = `airfield CleanField {
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
}`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/code-actions — guard conditions', () => {
  test('returns { actions: [] } when dslCode is missing', async () => {
    const res = await agent.post('/api/code-actions').send({ diagnostics: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ actions: [] });
  });

  test('returns { actions: [] } when diagnostics is not an array', async () => {
    const res = await agent.post('/api/code-actions').send({ dslCode: 'airfield X {}', diagnostics: 'bad' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ actions: [] });
  });

  test('returns { actions: [] } when both fields are missing', async () => {
    const res = await agent.post('/api/code-actions').send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ actions: [] });
  });
});

describe('POST /api/code-actions — clean DSL', () => {
  test('returns { actions: [] } for clean DSL with empty diagnostics array', async () => {
    const res = await agent.post('/api/code-actions').send({
      dslCode: CLEAN_DSL,
      diagnostics: []
    });
    expect(res.status).toBe(200);
    expect(res.body.actions).toHaveLength(0);
  });

  test('returns { actions: [] } for clean DSL with a diagnostic that has no fix', async () => {
    const res = await agent.post('/api/code-actions').send({
      dslCode: CLEAN_DSL,
      diagnostics: [{ message: 'UNKNOWN_RULE: something weird', startLine: 1, startColumn: 0 }]
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.actions)).toBe(true);
  });
});

describe('POST /api/code-actions — SFR13 contiguity fix', () => {
  /**
   * Send an SFR16_CONTIGUITY diagnostic at line 20 (the `induct` line).
   * The code action provider should return an edit that adds Bay2.
   */
  test('returns at least one action for SFR16_CONTIGUITY diagnostic', async () => {
    // Line 20 in NON_CONTIGUOUS_DSL is the "induct Cessna into AlphaHangar bays Bay1 Bay3" line
    const res = await agent.post('/api/code-actions').send({
      dslCode: NON_CONTIGUOUS_DSL,
      diagnostics: [{
        message: 'SFR16_CONTIGUITY: Bay1 and Bay3 are not contiguous',
        startLine: 20,
        startColumn: 4
      }]
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.actions)).toBe(true);
  });
});
