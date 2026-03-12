import { describe, expect, test } from 'vitest';
import { setupServices, parse, validate, hasDiag } from '../helpers/setup.js';

setupServices();

// ===========================================================================
// SFR20_DIMENSIONS — Aircraft
// ===========================================================================

describe('SFR20_DIMENSIONS — aircraft dimensions must be positive', () => {

    test('zero wingspan triggers SFR20 error', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Bad { wingspan 0.0 m  length 8.3 m  height 2.7 m }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero length triggers SFR20 error', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Bad { wingspan 11.0 m  length 0.0 m  height 2.7 m }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero height triggers SFR20 error', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Bad { wingspan 11.0 m  length 8.3 m  height 0.0 m }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('positive dimensions produce no SFR20 error', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Good { wingspan 11.0 m  length 8.3 m  height 2.7 m }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR20_DIMENSIONS')).toBe(false);
    });
});

// ===========================================================================
// SFR20_DIMENSIONS — Bay
// ===========================================================================

describe('SFR20_DIMENSIONS — bay dimensions must be positive', () => {

    test('zero bay width triggers SFR20 error', async () => {
        const doc = await parse(`
            airfield T {
                hangar H {
                    doors { door D { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        bay Bad { width 0.0 m  depth 15.0 m  height 5.0 m }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero bay depth triggers SFR20 error', async () => {
        const doc = await parse(`
            airfield T {
                hangar H {
                    doors { door D { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        bay Bad { width 12.0 m  depth 0.0 m  height 5.0 m }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero bay height triggers SFR20 error', async () => {
        const doc = await parse(`
            airfield T {
                hangar H {
                    doors { door D { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        bay Bad { width 12.0 m  depth 15.0 m  height 0.0 m }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR20_DIMENSIONS')).toBe(true);
    });
});

// ===========================================================================
// SFR20_DIMENSIONS — Door
// ===========================================================================

describe('SFR20_DIMENSIONS — door dimensions must be positive', () => {

    test('zero door width triggers SFR20 error', async () => {
        const doc = await parse(`
            airfield T {
                hangar H {
                    doors { door D { width 0.0 m  height 5.0 m } }
                    grid baygrid {
                        bay B { width 12.0 m  depth 15.0 m  height 5.0 m }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero door height triggers SFR20 error', async () => {
        const doc = await parse(`
            airfield T {
                hangar H {
                    doors { door D { width 15.0 m  height 0.0 m } }
                    grid baygrid {
                        bay B { width 12.0 m  depth 15.0 m  height 5.0 m }
                    }
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR20_DIMENSIONS')).toBe(true);
    });
});

// ===========================================================================
// SFR26_UNREFERENCED_CLEARANCE — clearance envelopes should be used
// ===========================================================================

describe('SFR26_UNREFERENCED_CLEARANCE — clearance envelopes must be referenced', () => {

    test('defined-but-unused clearance envelope triggers SFR26 warning', async () => {
        const doc = await parse(`
            airfield T {
                clearance Unused {
                    lateralMargin      1.0 m
                    longitudinalMargin 2.0 m
                    verticalMargin     0.5 m
                }
                aircraft Cessna {
                    wingspan 11.0 m
                    length   8.3 m
                    height   2.7 m
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR26_UNREFERENCED_CLEARANCE')).toBe(true);
    });

    test('clearance envelope referenced by an aircraft produces no SFR26 warning', async () => {
        const doc = await parse(`
            airfield T {
                clearance Safe {
                    lateralMargin      1.0 m
                    longitudinalMargin 2.0 m
                    verticalMargin     0.5 m
                }
                aircraft Cessna {
                    wingspan 11.0 m
                    length   8.3 m
                    height   2.7 m
                    clearance Safe
                }
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR26_UNREFERENCED_CLEARANCE')).toBe(false);
    });
});
