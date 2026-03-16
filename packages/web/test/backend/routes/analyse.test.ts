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

/**
 * Two auto-inductions compete for one bay. The second must wait for
 * the first to depart before it can be placed.
 */
const WAITING_DSL = `
airfield WaitField {
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
    auto-induct id "AUTO_A" Cessna
        duration 60 minutes
        prefer AlphaHangar
        notBefore 2030-06-01T08:00
        notAfter  2030-06-10T18:00;
    auto-induct id "AUTO_B" Cessna
        duration 60 minutes
        prefer AlphaHangar
        notBefore 2030-06-01T08:00
        notAfter  2030-06-10T18:00;
}
`;

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

describe('POST /api/analyse — simulation enrichment fields', () => {
    test('auto-inductions have per-induction simulation fields', async () => {
        const res = await agent.post('/api/analyse').send({ dslCode: WAITING_DSL });
        expect(res.status).toBe(200);

        const scheduled = res.body.exportModel?.autoSchedule?.scheduled;
        expect(scheduled).toBeDefined();
        expect(scheduled.length).toBe(2);

        // First induction placed immediately
        const first = scheduled.find((s: any) => s.id === 'AUTO_A');
        expect(first).toBeDefined();
        expect(first).toHaveProperty('requestedStart');
        expect(first).toHaveProperty('actualStart');
        expect(first).toHaveProperty('scheduledEnd');
        expect(first).toHaveProperty('actualEnd');
        expect(typeof first.waitTime).toBe('number');
        expect(typeof first.departureDelay).toBe('number');
        expect(typeof first.placementAttempts).toBe('number');
        expect(first.placementAttempts).toBeGreaterThanOrEqual(1);
        // waitReason and queuePosition may be null if placed immediately
        expect(first).toHaveProperty('waitReason');
        expect(first).toHaveProperty('queuePosition');
    });

    test('waiting induction has non-zero waitTime and waitReason', async () => {
        const res = await agent.post('/api/analyse').send({ dslCode: WAITING_DSL });
        const scheduled = res.body.exportModel?.autoSchedule?.scheduled;

        // Second induction should have waited (only 1 bay for 2 autos)
        const second = scheduled.find((s: any) => s.id === 'AUTO_B');
        expect(second).toBeDefined();
        expect(second.waitTime).toBeGreaterThan(0);
        expect(second.waitReason).toBeTruthy();
        expect(typeof second.waitReason).toBe('string');
        expect(second.placementAttempts).toBeGreaterThan(1);
        expect(second.queuePosition).toBeGreaterThanOrEqual(0);
    });

    test('response includes hangarStatistics', async () => {
        const res = await agent.post('/api/analyse').send({ dslCode: WAITING_DSL });
        const hangarStats = res.body.exportModel?.hangarStatistics;
        expect(hangarStats).toBeDefined();
        expect(hangarStats).toHaveProperty('AlphaHangar');

        const alpha = hangarStats.AlphaHangar;
        expect(alpha.totalBays).toBe(1);
        expect(alpha.inductionsServed).toBeGreaterThanOrEqual(2);
        expect(alpha.peakOccupancy).toBeGreaterThanOrEqual(1);
        expect(alpha.peakOccupancyTime).toBeTruthy();
    });

    test('response includes simulationStatistics', async () => {
        const res = await agent.post('/api/analyse').send({ dslCode: WAITING_DSL });
        const simStats = res.body.exportModel?.simulationStatistics;
        expect(simStats).toBeDefined();

        expect(simStats).toHaveProperty('simulationWindow');
        expect(simStats.simulationWindow).toHaveProperty('start');
        expect(simStats.simulationWindow).toHaveProperty('end');
        expect(typeof simStats.totalAircraftProcessed).toBe('number');
        expect(simStats.totalAircraftProcessed).toBe(2);
        expect(typeof simStats.totalWaitTime).toBe('number');
        expect(simStats.totalWaitTime).toBeGreaterThan(0);
        expect(typeof simStats.avgWaitTime).toBe('number');
        expect(typeof simStats.maxWaitTime).toBe('number');
        expect(simStats.maxWaitInduction).toBe('AUTO_B');
        expect(simStats.failedInductions).toBe(0);
        expect(typeof simStats.maxQueueDepth).toBe('number');
    });

    test('merged inductions array also has simulation fields', async () => {
        const res = await agent.post('/api/analyse').send({ dslCode: WAITING_DSL });
        const inductions = res.body.exportModel?.inductions;
        const autoInds = inductions.filter((i: any) => i.kind === 'auto');

        expect(autoInds.length).toBe(2);
        for (const ind of autoInds) {
            expect(ind).toHaveProperty('requestedStart');
            expect(ind).toHaveProperty('actualStart');
            expect(ind).toHaveProperty('scheduledEnd');
            expect(ind).toHaveProperty('actualEnd');
            expect(typeof ind.placementAttempts).toBe('number');
        }
    });
});
