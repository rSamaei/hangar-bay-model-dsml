/**
 * HTTP integration tests for POST /api/validate
 *
 * The validate route parses a DSL string and runs buildValidationReport().
 * A minimal Express app (no DB, no auth) is mounted for each test.
 *
 * Covers:
 *   - Missing dslCode → 400
 *   - DSL with syntax error → 400 with parseErrors array
 *   - Valid, clean DSL → 200 with totalViolations = 0
 *   - Valid DSL with an SFR violation → 200 with violations in the report
 */
import { describe, expect, test } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import validateRoute from '../../backend/routes/validate.js';

// Minimal app with no DB initialisation
const app = express();
app.use(express.json());
app.use('/api', validateRoute);

const agent = supertest(app);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLEAN_DSL = `
airfield CleanField {
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

/**
 * Induction with non-contiguous bays → SFR13_CONTIGUITY violation.
 * Bay1 and Bay3 are only adjacent to Bay2 (not each other), so assigning
 * Bay1+Bay3 without Bay2 is non-contiguous.
 */
const DSL_WITH_VIOLATION = `
airfield ViolationField {
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
            bay Bay1 {
                width  12.0 m
                depth  10.0 m
                height  5.0 m
                adjacent { Bay2 }
            }
            bay Bay2 {
                width  12.0 m
                depth  10.0 m
                height  5.0 m
                adjacent { Bay1 Bay3 }
            }
            bay Bay3 {
                width  12.0 m
                depth  10.0 m
                height  5.0 m
                adjacent { Bay2 }
            }
        }
    }
    induct Cessna into AlphaHangar bays Bay1 Bay3
        from 2024-06-01T08:00
        to   2024-06-01T10:00;
}
`;

const SYNTAX_ERROR_DSL = `airfield { aircraft Cessna { wingspan 11.0 m } }`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/validate — request validation', () => {
    test('returns 400 when dslCode is missing', async () => {
        const res = await agent.post('/api/validate').send({});
        expect(res.status).toBe(400);
    });
});

describe('POST /api/validate — syntax error', () => {
    test('returns 400 for DSL with a syntax error', async () => {
        const res = await agent.post('/api/validate').send({ dslCode: SYNTAX_ERROR_DSL });
        expect(res.status).toBe(400);
    });

    test('response body contains a parseErrors array on syntax error', async () => {
        const res = await agent.post('/api/validate').send({ dslCode: SYNTAX_ERROR_DSL });
        expect(res.body).toHaveProperty('parseErrors');
        expect(Array.isArray(res.body.parseErrors)).toBe(true);
    });
});

describe('POST /api/validate — valid clean DSL', () => {
    test('returns 200 for a valid model', async () => {
        const res = await agent.post('/api/validate').send({ dslCode: CLEAN_DSL });
        expect(res.status).toBe(200);
    });

    test('report has totalViolations = 0 for a clean model', async () => {
        const res = await agent.post('/api/validate').send({ dslCode: CLEAN_DSL });
        expect(res.body.summary?.totalViolations).toBe(0);
    });
});

describe('POST /api/validate — DSL with SFR violations', () => {
    test('returns 200 even when there are violations', async () => {
        const res = await agent.post('/api/validate').send({ dslCode: DSL_WITH_VIOLATION });
        expect(res.status).toBe(200);
    });

    test('violations array is non-empty for a model with SFR13 contiguity error', async () => {
        const res = await agent.post('/api/validate').send({ dslCode: DSL_WITH_VIOLATION });
        expect(Array.isArray(res.body.violations)).toBe(true);
        expect(res.body.violations.length).toBeGreaterThan(0);
    });
});
