import { describe, expect, test } from 'vitest';
import { setupServices, parse, validate, hasDiag } from '../helpers/setup.js';
import { CESSNA, ALPHA_HANGAR } from '../helpers/fixtures.js';

setupServices();

// ===========================================================================
// SFR26_TIME_WINDOW — Auto-induction time bounds
// ===========================================================================

describe('SFR26_TIME_WINDOW — auto-induction time bounds must be well-formed', () => {

    test('auto-induction notBefore after notAfter triggers SFR21 error', async () => {
        const doc = await parse(`
            airfield T {
                ${CESSNA}
                ${ALPHA_HANGAR}
                auto-induct Cessna duration 60 minutes
                    prefer Alpha
                    notBefore 2024-01-01T18:00
                    notAfter  2024-01-01T08:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR26_TIME_WINDOW')).toBe(true);
    });

    test('valid auto-induction time bounds produce no SFR21 error', async () => {
        const doc = await parse(`
            airfield T {
                ${CESSNA}
                ${ALPHA_HANGAR}
                auto-induct Cessna duration 60 minutes
                    prefer Alpha
                    notBefore 2024-01-01T08:00
                    notAfter  2024-01-01T18:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR26_TIME_WINDOW')).toBe(false);
    });
});

// ===========================================================================
// AutoInduction requires clause (SFR15_BAY_COUNT_OVERRIDE)
// ===========================================================================

describe('AutoInduction requires clause — SFR15_BAY_COUNT_OVERRIDE', () => {

    test('auto-induction requires below geometric minimum triggers SFR15_BAY_COUNT_OVERRIDE', async () => {
        const doc = await parse(`
            airfield T {
                aircraft WideBody {
                    wingspan 70.0 m
                    length   50.0 m
                    height   15.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 75.0 m  height 18.0 m } }
                    grid baygrid {
                        bay B1 { width 36.0 m  depth 52.0 m  height 16.0 m }
                        bay B2 { width 36.0 m  depth 52.0 m  height 16.0 m }
                    }
                }
                auto-induct id "AUTO1" WideBody duration 480 minutes
                    prefer Alpha
                    requires 1 bays;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR15_BAY_COUNT_OVERRIDE')).toBe(true);
    });

    test('auto-induction requires matching geometric minimum produces no SFR15_BAY_COUNT_OVERRIDE', async () => {
        const doc = await parse(`
            airfield T {
                ${CESSNA}
                ${ALPHA_HANGAR}
                auto-induct id "AUTO2" Cessna duration 240 minutes
                    prefer Alpha
                    requires 1 bays;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR15_BAY_COUNT_OVERRIDE')).toBe(false);
    });
});
