import { describe, expect, test } from 'vitest';
import { setupServices, parse, validate, hasDiag } from '../helpers/setup.js';
import { CESSNA, ALPHA_HANGAR } from '../helpers/fixtures.js';

setupServices();

// ===========================================================================
// SFR31_REACHABILITY_SKIPPED — hint when hangar has inductions but no access graph
// ===========================================================================

describe('SFR31_REACHABILITY_SKIPPED — info hint when no access path is modelled', () => {

    test('hangar with a modelled access path produces no SFR31_REACHABILITY_SKIPPED hint', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Cessna {
                    wingspan 11.0 m  length 8.3 m  height 2.7 m
                }
                hangar Alpha {
                    doors {
                        door D1 { width 15.0 m  height 5.0 m  accessNode NodeD }
                    }
                    grid baygrid {
                        bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m  accessNode NodeB }
                    }
                }
                accessPath AlphaPath {
                    nodes { node NodeD  node NodeB }
                    links { link NodeD to NodeB }
                }
                induct Cessna into Alpha bays B1
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR31_REACHABILITY_SKIPPED')).toBe(false);
    });

    test('hangar with induction but no access path triggers SFR31_REACHABILITY_SKIPPED hint', async () => {
        const doc = await parse(`
            airfield T {
                ${CESSNA}
                ${ALPHA_HANGAR}
                induct Cessna into Alpha bays B1
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR31_REACHABILITY_SKIPPED')).toBe(true);

        const hint = diags.find(
            d => typeof d.message === 'string' && d.message.includes('SFR31_REACHABILITY_SKIPPED')
        );
        expect(hint?.message).toContain("Hangar 'Alpha'");
    });

    test('hangar with no inductions produces no SFR31_REACHABILITY_SKIPPED hint', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR31_REACHABILITY_SKIPPED')).toBe(false);
    });
});

// ===========================================================================
// SFR29_NONGRID_ADJACENCY / SFR29_GRID_OVERRIDE — explicit vs grid adjacency
// ===========================================================================

describe('SFR29_NONGRID_ADJACENCY / SFR29_GRID_OVERRIDE — adjacency consistency checks', () => {

    test('explicit adjacency matching grid neighbours produces no warnings', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        rows 1 cols 2
                        bay B1 {
                            at row 0 col 0
                            width 12.0 m  depth 15.0 m  height 5.0 m
                            adjacent { B2 }
                        }
                        bay B2 {
                            at row 0 col 1
                            width 12.0 m  depth 15.0 m  height 5.0 m
                            adjacent { B1 }
                        }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR29_NONGRID_ADJACENCY')).toBe(false);
        expect(hasDiag(diags, 'SFR29_GRID_OVERRIDE')).toBe(false);
    });

    test('explicit adjacency spanning non-adjacent grid cells triggers SFR29_NONGRID_ADJACENCY', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        rows 1 cols 3
                        bay B1 {
                            at row 0 col 0
                            width 12.0 m  depth 15.0 m  height 5.0 m
                            adjacent { B3 }
                        }
                        bay B2 {
                            at row 0 col 1
                            width 12.0 m  depth 15.0 m  height 5.0 m
                        }
                        bay B3 {
                            at row 0 col 2
                            width 12.0 m  depth 15.0 m  height 5.0 m
                        }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR29_NONGRID_ADJACENCY')).toBe(true);
    });

    test('explicit adjacency that excludes a grid neighbour triggers SFR29_GRID_OVERRIDE', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        rows 1 cols 3
                        bay B1 {
                            at row 0 col 0
                            width 12.0 m  depth 15.0 m  height 5.0 m
                        }
                        bay B2 {
                            at row 0 col 1
                            width 12.0 m  depth 15.0 m  height 5.0 m
                            adjacent { B1 }
                        }
                        bay B3 {
                            at row 0 col 2
                            width 12.0 m  depth 15.0 m  height 5.0 m
                        }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR29_GRID_OVERRIDE')).toBe(true);
    });

    test('bays with no explicit adjacency block produce no warnings', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        rows 1 cols 2
                        bay B1 {
                            at row 0 col 0
                            width 12.0 m  depth 15.0 m  height 5.0 m
                        }
                        bay B2 {
                            at row 0 col 1
                            width 12.0 m  depth 15.0 m  height 5.0 m
                        }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR29_NONGRID_ADJACENCY')).toBe(false);
        expect(hasDiag(diags, 'SFR29_GRID_OVERRIDE')).toBe(false);
    });
});

// ===========================================================================
// Adjacency mode — 8-connected grid and conflict detection
// ===========================================================================

describe('Adjacency mode — 8-connected allows diagonal explicit adjacency', () => {

    test('adjacency 8: diagonal declared adjacent produces no SFR29_NONGRID_ADJACENCY', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        rows 2 cols 2
                        adjacency 8
                        bay B1 {
                            at row 0 col 0
                            width 12.0 m  depth 15.0 m  height 5.0 m
                            adjacent { B2 B4 }
                        }
                        bay B2 { at row 0 col 1  width 12.0 m  depth 15.0 m  height 5.0 m }
                        bay B3 { at row 1 col 0  width 12.0 m  depth 15.0 m  height 5.0 m }
                        bay B4 { at row 1 col 1  width 12.0 m  depth 15.0 m  height 5.0 m }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR29_NONGRID_ADJACENCY')).toBe(false);
        expect(hasDiag(diags, 'SFR29_GRID_OVERRIDE')).toBe(true);
    });

    test('default adjacency (4): diagonal declared adjacent triggers SFR29_NONGRID_ADJACENCY', async () => {
        const doc = await parse(`
            airfield T {
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        rows 2 cols 2
                        bay B1 {
                            at row 0 col 0
                            width 12.0 m  depth 15.0 m  height 5.0 m
                            adjacent { B4 }
                        }
                        bay B2 { at row 0 col 1  width 12.0 m  depth 15.0 m  height 5.0 m }
                        bay B3 { at row 1 col 0  width 12.0 m  depth 15.0 m  height 5.0 m }
                        bay B4 { at row 1 col 1  width 12.0 m  depth 15.0 m  height 5.0 m }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR29_NONGRID_ADJACENCY')).toBe(true);
    });
});
