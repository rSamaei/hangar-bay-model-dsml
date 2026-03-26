/**
 * HTTP integration tests for POST /api/parse
 *
 * The parse route validates and transforms a DSL string to a DomainModel.
 * A minimal Express app (no DB, no auth) is mounted for each test.
 *
 * Covers:
 *   - Missing dslCode → 400
 *   - DSL with syntax error → 400 with parseErrors array
 *   - Valid, clean DSL → 200 with model, errors, and validationDiagnostics
 */
import { describe, expect, test } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import parseRoute from '../../../backend/routes/parse.js';

const app = express();
app.use(express.json());
app.use('/api', parseRoute);

const agent = supertest(app);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLEAN_DSL = `
airfield ParseField {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/parse — request validation', () => {
  test('returns 400 when dslCode is missing', async () => {
    const res = await agent.post('/api/parse').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/parse — syntax error', () => {
  test('returns 400 for DSL with a syntax error', async () => {
    const res = await agent.post('/api/parse').send({ dslCode: SYNTAX_ERROR_DSL });
    expect(res.status).toBe(400);
  });

  test('response body contains parseErrors array on syntax error', async () => {
    const res = await agent.post('/api/parse').send({ dslCode: SYNTAX_ERROR_DSL });
    expect(res.body).toHaveProperty('parseErrors');
    expect(Array.isArray(res.body.parseErrors)).toBe(true);
  });
});

describe('POST /api/parse — valid DSL', () => {
  test('returns 200 for a valid model', async () => {
    const res = await agent.post('/api/parse').send({ dslCode: CLEAN_DSL });
    expect(res.status).toBe(200);
  });

  test('response body has a model field', async () => {
    const res = await agent.post('/api/parse').send({ dslCode: CLEAN_DSL });
    expect(res.body).toHaveProperty('model');
    expect(res.body.model).not.toBeNull();
  });

  test('response body has an errors array', async () => {
    const res = await agent.post('/api/parse').send({ dslCode: CLEAN_DSL });
    expect(res.body).toHaveProperty('errors');
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  test('response body has a validationDiagnostics array', async () => {
    const res = await agent.post('/api/parse').send({ dslCode: CLEAN_DSL });
    expect(res.body).toHaveProperty('validationDiagnostics');
    expect(Array.isArray(res.body.validationDiagnostics)).toBe(true);
  });

  test('transformed model carries the correct airfield name', async () => {
    const res = await agent.post('/api/parse').send({ dslCode: CLEAN_DSL });
    expect(res.body.model?.airfield?.name).toBe('ParseField');
  });
});
