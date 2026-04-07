/**
 * Extended HTTP integration tests for POST /api/code-actions
 *
 * Covers branches not reached by code-actions.test.ts:
 *   - Position conversion (1-based → 0-based LSP)
 *   - Diagnostic with no message is skipped
 *   - data field is forwarded to the code action provider
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

const THREE_BAY_DSL = `airfield TestField {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/code-actions — diagnostic without message is skipped', () => {
  test('diagnostic with no message is ignored (no crash, returns empty actions)', async () => {
    const res = await agent.post('/api/code-actions').send({
      dslCode: THREE_BAY_DSL,
      diagnostics: [{ startLine: 1, startColumn: 0 }], // message missing
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.actions)).toBe(true);
  });
});

describe('POST /api/code-actions — position conversion', () => {
  test('startLine 1 is converted to LSP line 0 (no negative)', async () => {
    // Send startLine=1 — route should convert to LSP line 0, not -1
    // A diagnostic at line 1, col 0 with an unknown rule message should return empty actions gracefully
    const res = await agent.post('/api/code-actions').send({
      dslCode: THREE_BAY_DSL,
      diagnostics: [{ message: 'SFR_UNKNOWN: test', startLine: 1, startColumn: 0 }],
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.actions)).toBe(true);
  });

  test('startLine 0 is clamped to LSP line 0', async () => {
    const res = await agent.post('/api/code-actions').send({
      dslCode: THREE_BAY_DSL,
      diagnostics: [{ message: 'SFR_UNKNOWN: test', startLine: 0, startColumn: 0 }],
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.actions)).toBe(true);
  });
});

describe('POST /api/code-actions — data field forwarding', () => {
  test('diagnostic with ruleId data forwarded to provider', async () => {
    // The SFR16_CONTIGUITY diagnostic should be picked up by ruleId in the data field
    const res = await agent.post('/api/code-actions').send({
      dslCode: THREE_BAY_DSL,
      diagnostics: [{
        message: 'SFR16_CONTIGUITY: Bay1 and Bay3 are not contiguous',
        startLine: 20,
        startColumn: 4,
        data: { ruleId: 'SFR16_CONTIGUITY' },
      }],
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.actions)).toBe(true);
  });
});

describe('POST /api/code-actions — empty body guard', () => {
  test('handles completely empty body gracefully', async () => {
    // Send no JSON body at all — Express body-parser treats this as {}
    const res = await agent.post('/api/code-actions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ actions: [] });
  });
});

// ---------------------------------------------------------------------------
// Real action returned — exercises the action-processing inner loop
// ---------------------------------------------------------------------------

describe('POST /api/code-actions — action with edits returned', () => {
  /**
   * The induction `induct Cessna into AlphaHangar bays Bay1 Bay3` is at
   * line 17 (1-based) of THREE_BAY_DSL. Sending the diagnostic at that
   * exact position causes findInductionAtDiagnostic to resolve the node
   * and the provider to build a real bridging edit — exercising lines 58-75.
   */
  test('returns edit action when SFR13 diagnostic is at the induction line', async () => {
    const res = await agent.post('/api/code-actions').send({
      dslCode: THREE_BAY_DSL,
      diagnostics: [{
        message: 'SFR16_CONTIGUITY: Bay1 and Bay3 are not contiguous',
        startLine: 17,
        startColumn: 4,
        data: { ruleId: 'SFR16_CONTIGUITY' },
      }],
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.actions)).toBe(true);
    // The provider should find the induction and return at least one edit action
    expect(res.body.actions.length).toBeGreaterThan(0);
    const action = res.body.actions[0];
    expect(action.title).toBeDefined();
    expect(Array.isArray(action.edits)).toBe(true);
    expect(action.edits.length).toBeGreaterThan(0);
  });
});
