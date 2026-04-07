/**
 * Tests for well-formedness checks (WF_* and SFR7_* rules).
 *
 * Rules covered:
 *   SFR27_DUPLICATE_AIRCRAFT  — no two aircraft types share a name
 *   SFR27_DUPLICATE_BAY       — no two bays within a hangar share a name
 *   SFR27_DUPLICATE_HANGAR    — no two hangars share a name
 *   WF_DUPLICATE_CLEARANCE — no two clearance envelopes share a name
 *   SFR28_SELF_ADJACENCY    — bay must not declare itself adjacent
 *   SFR28_SELF_LOOP         — access link must not connect a node to itself
 *   WF_NO_HANGARS          — model must declare at least one hangar
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import type { Model } from 'airfield-language';
import { createAirfieldServices } from 'airfield-language';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let services: ReturnType<typeof createAirfieldServices>;
let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    services = createAirfieldServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Airfield);
});

async function validate(doc: LangiumDocument): Promise<Array<{ message: unknown }>> {
    return services.Airfield.validation.DocumentValidator.validateDocument(doc);
}

function hasDiag(diags: Array<{ message: unknown }>, code: string): boolean {
    return diags.some(d => typeof d.message === 'string' && d.message.includes(code));
}

// ===========================================================================
// SFR27_DUPLICATE_AIRCRAFT
// ===========================================================================

describe('SFR27_DUPLICATE_AIRCRAFT — no duplicate aircraft type names', () => {

    test('two aircraft with the same name triggers SFR27_DUPLICATE_AIRCRAFT', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Hawk { wingspan 9.4 m  length 11.2 m  height 3.9 m }
                aircraft Hawk { wingspan 9.4 m  length 11.2 m  height 3.9 m }
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid { bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m } }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR27_DUPLICATE_AIRCRAFT')).toBe(true);
    });

    test('two aircraft with distinct names produce no SFR27_DUPLICATE_AIRCRAFT', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Hawk  { wingspan 9.4 m  length 11.2 m  height 3.9 m }
                aircraft Eagle { wingspan 12.0 m length 14.0 m  height 4.5 m }
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid { bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m } }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR27_DUPLICATE_AIRCRAFT')).toBe(false);
    });
});

// ===========================================================================
// SFR27_DUPLICATE_BAY
// ===========================================================================

describe('SFR27_DUPLICATE_BAY — no duplicate bay names within a hangar', () => {

    test('two bays with the same name in one hangar triggers SFR27_DUPLICATE_BAY', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m }
                        bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR27_DUPLICATE_BAY')).toBe(true);
    });

    test('bays with distinct names produce no SFR27_DUPLICATE_BAY', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m }
                        bay B2 { width 12.0 m  depth 15.0 m  height 5.0 m }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR27_DUPLICATE_BAY')).toBe(false);
    });
});

// ===========================================================================
// SFR27_DUPLICATE_HANGAR
// ===========================================================================

describe('SFR27_DUPLICATE_HANGAR — no duplicate hangar names', () => {

    test('two hangars with the same name triggers SFR27_DUPLICATE_HANGAR', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid { bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m } }
                }
                hangar Alpha {
                    doors { door D2 { width 15.0 m  height 5.0 m } }
                    grid baygrid { bay B2 { width 12.0 m  depth 15.0 m  height 5.0 m } }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR27_DUPLICATE_HANGAR')).toBe(true);
    });

    test('two hangars with distinct names produce no SFR27_DUPLICATE_HANGAR', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid { bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m } }
                }
                hangar Beta {
                    doors { door D2 { width 15.0 m  height 5.0 m } }
                    grid baygrid { bay B2 { width 12.0 m  depth 15.0 m  height 5.0 m } }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR27_DUPLICATE_HANGAR')).toBe(false);
    });
});

// ===========================================================================
// WF_DUPLICATE_CLEARANCE
// ===========================================================================

describe('WF_DUPLICATE_CLEARANCE — no duplicate clearance envelope names', () => {

    test('two clearances with the same name triggers WF_DUPLICATE_CLEARANCE', async () => {
        const doc = await parse(`
            airfield T {
                clearance WingTip { lateralMargin 0.5 m  longitudinalMargin 0.5 m  verticalMargin 0.3 m }
                clearance WingTip { lateralMargin 0.8 m  longitudinalMargin 0.8 m  verticalMargin 0.4 m }
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid { bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m } }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'WF_DUPLICATE_CLEARANCE')).toBe(true);
    });

    test('two clearances with distinct names produce no WF_DUPLICATE_CLEARANCE', async () => {
        const doc = await parse(`
            airfield T {
                clearance WingTip  { lateralMargin 0.5 m  longitudinalMargin 0.5 m  verticalMargin 0.3 m }
                clearance TailCone { lateralMargin 0.3 m  longitudinalMargin 0.6 m  verticalMargin 0.2 m }
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid { bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m } }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'WF_DUPLICATE_CLEARANCE')).toBe(false);
    });
});

// ===========================================================================
// SFR28_SELF_ADJACENCY
// ===========================================================================

describe('SFR28_SELF_ADJACENCY — bay must not declare itself adjacent', () => {

    test('bay listing itself in adjacent triggers SFR28_SELF_ADJACENCY', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m  adjacent { B1 } }
                        bay B2 { width 12.0 m  depth 15.0 m  height 5.0 m }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR28_SELF_ADJACENCY')).toBe(true);
    });

    test('bay listing only other bays as adjacent produces no SFR28_SELF_ADJACENCY', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m  adjacent { B2 } }
                        bay B2 { width 12.0 m  depth 15.0 m  height 5.0 m  adjacent { B1 } }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR28_SELF_ADJACENCY')).toBe(false);
    });
});

// ===========================================================================
// SFR28_SELF_LOOP
// ===========================================================================

describe('SFR28_SELF_LOOP — access link must not connect a node to itself', () => {

    test('access link from a node to itself triggers SFR28_SELF_LOOP', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid { bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m } }
                }
                accessPath MainPath {
                    nodes { node Entry  node Bay1Proxy }
                    links { link Entry to Entry }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR28_SELF_LOOP')).toBe(true);
    });

    test('access link between distinct nodes produces no SFR28_SELF_LOOP', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid { bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m } }
                }
                accessPath MainPath {
                    nodes { node Entry  node Bay1Proxy }
                    links { link Entry to Bay1Proxy }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR28_SELF_LOOP')).toBe(false);
    });
});

// ===========================================================================
// WF_NO_HANGARS
// ===========================================================================

describe('WF_NO_HANGARS — model must declare at least one hangar', () => {

    test('model with no hangars triggers WF_NO_HANGARS warning', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Hawk { wingspan 9.4 m  length 11.2 m  height 3.9 m }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'WF_NO_HANGARS')).toBe(true);
    });

    test('model with at least one hangar produces no WF_NO_HANGARS', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid { bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m } }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'WF_NO_HANGARS')).toBe(false);
    });
});
