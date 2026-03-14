/**
 * HTTP integration tests for POST /api/analyse
 *
 * The analyse route parses a DSL string, runs analyseAndSchedule(), and
 * returns { report, exportModel, langiumDiagnostics }.
 * A minimal Express app (no DB, no auth) is mounted for each test.
 *
 * Covers:
 *   - Missing dslCode → 400
 *   - DSL with syntax error → 400
 *   - Valid, clean DSL → 200 with report and exportModel
 *   - Response includes langiumDiagnostics array
 *   - exportModel carries the correct airfield name
 */
import { describe, expect, test } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import analyseRoute from '../../../backend/routes/analyse.js';

const app = express();
app.use(express.json());
app.use('/api', analyseRoute);

const agent = supertest(app);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLEAN_DSL = `
airfield AnalyzeField {
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

describe('POST /api/analyse — request validation', () => {
    test('returns 400 when dslCode is missing', async () => {
        const res = await agent.post('/api/analyse').send({});
        expect(res.status).toBe(400);
    });
});

describe('POST /api/analyse — syntax error', () => {
    test('returns 400 for DSL with a syntax error', async () => {
        const res = await agent.post('/api/analyse').send({ dslCode: SYNTAX_ERROR_DSL });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/analyse — valid clean DSL', () => {
    test('returns 200 for a valid model', async () => {
        const res = await agent.post('/api/analyse').send({ dslCode: CLEAN_DSL });
        expect(res.status).toBe(200);
    });

    test('response body contains both report and exportModel', async () => {
        const res = await agent.post('/api/analyse').send({ dslCode: CLEAN_DSL });
        expect(res.body).toHaveProperty('report');
        expect(res.body).toHaveProperty('exportModel');
    });

    test('response body includes langiumDiagnostics array', async () => {
        const res = await agent.post('/api/analyse').send({ dslCode: CLEAN_DSL });
        expect(res.body).toHaveProperty('langiumDiagnostics');
        expect(Array.isArray(res.body.langiumDiagnostics)).toBe(true);
    });

    test('exportModel carries the correct airfield name', async () => {
        const res = await agent.post('/api/analyse').send({ dslCode: CLEAN_DSL });
        expect(res.body.exportModel?.airfieldName).toBe('AnalyzeField');
    });
});
