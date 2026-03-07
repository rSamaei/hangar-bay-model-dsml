/**
 * Comprehensive validator checks — covers all SFR rules implemented in
 * airfield-validator.ts.
 *
 * Each rule has at least one positive test (rule fires) and one negative test
 * (rule does NOT fire for a valid model).
 *
 * Rules covered:
 *   SFR11_DOOR_FIT          — aircraft vs explicitly-named door (via clause)
 *   SFR12_BAY_FIT           — aircraft vs individual bay dimensions
 *   SFR13_CONTIGUITY        — multi-bay contiguity (adjacency graph)
 *   SFR14_BAY_OWNERSHIP     — bay referenced belongs to the target hangar
 *   SFR20_DIMENSIONS        — positive dimensions on aircraft / bay / door
 *   SFR21_TIME_WINDOW       — start < end (induction) / notBefore < notAfter (auto)
 *   SFR22_DUPLICATE_ID      — no duplicate induction IDs within an airfield
 *   SFR24_DOOR_FIT_PRECHECK — aircraft fits at least one hangar door (warning)
 *   SFR25_BAY_COUNT         — enough bays assigned for aircraft wingspan (warning)
 *   SFR26_UNREFERENCED_CLEARANCE — clearance envelope is referenced (warning)
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

/** Run Langium validation and return all diagnostics for the document. */
async function validate(doc: LangiumDocument): Promise<Array<{ message: unknown }>> {
    return services.Airfield.validation.DocumentValidator.validateDocument(doc);
}

/** True if any diagnostic message contains the given rule-code string. */
function hasDiag(diags: Array<{ message: unknown }>, code: string): boolean {
    return diags.some(d => typeof d.message === 'string' && d.message.includes(code));
}

// ---------------------------------------------------------------------------
// Shared model fragments (reused across multiple tests)
// ---------------------------------------------------------------------------

/** Minimal valid Cessna aircraft block (fits comfortably in 12 m bays). */
const CESSNA = `
    aircraft Cessna {
        wingspan 11.0 m
        length   8.3 m
        height   2.7 m
    }`;

/** Hangar with a 15 m-wide door and one generous bay — Cessna fits fine. */
const ALPHA_HANGAR = `
    hangar Alpha {
        doors { door D1 { width 15.0 m  height 5.0 m } }
        grid baygrid {
            bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m }
        }
    }`;

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
// SFR21_TIME_WINDOW — Induction time windows
// ===========================================================================

describe('SFR21_TIME_WINDOW — induction time windows must be well-formed', () => {

    test('induction start after end triggers SFR21 error', async () => {
        const doc = await parse(`
            airfield T {
                ${CESSNA}
                ${ALPHA_HANGAR}
                induct Cessna into Alpha bays B1
                from 2024-01-01T16:00
                to   2024-01-01T08:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR21_TIME_WINDOW')).toBe(true);
    });

    test('induction start equal to end triggers SFR21 error', async () => {
        const doc = await parse(`
            airfield T {
                ${CESSNA}
                ${ALPHA_HANGAR}
                induct Cessna into Alpha bays B1
                from 2024-01-01T08:00
                to   2024-01-01T08:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR21_TIME_WINDOW')).toBe(true);
    });

    test('valid induction time window produces no SFR21 error', async () => {
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
        expect(hasDiag(diags, 'SFR21_TIME_WINDOW')).toBe(false);
    });

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
        expect(hasDiag(diags, 'SFR21_TIME_WINDOW')).toBe(true);
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
        expect(hasDiag(diags, 'SFR21_TIME_WINDOW')).toBe(false);
    });
});

// ===========================================================================
// SFR22_DUPLICATE_ID — unique induction IDs
// ===========================================================================

describe('SFR22_DUPLICATE_ID — induction IDs must be unique within an airfield', () => {

    test('two inductions sharing the same ID trigger SFR22 error', async () => {
        const doc = await parse(`
            airfield T {
                ${CESSNA}
                ${ALPHA_HANGAR}
                induct id "IND001" Cessna into Alpha bays B1
                    from 2024-01-01T08:00 to 2024-01-01T10:00;
                induct id "IND001" Cessna into Alpha bays B1
                    from 2024-01-01T12:00 to 2024-01-01T14:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR22_DUPLICATE_ID')).toBe(true);
    });

    test('inductions with distinct IDs produce no SFR22 error', async () => {
        const doc = await parse(`
            airfield T {
                ${CESSNA}
                ${ALPHA_HANGAR}
                induct id "IND001" Cessna into Alpha bays B1
                    from 2024-01-01T08:00 to 2024-01-01T10:00;
                induct id "IND002" Cessna into Alpha bays B1
                    from 2024-01-01T12:00 to 2024-01-01T14:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR22_DUPLICATE_ID')).toBe(false);
    });
});

// ===========================================================================
// SFR24_DOOR_FIT_PRECHECK — aircraft fits at least one hangar door
// ===========================================================================

describe('SFR24_DOOR_FIT_PRECHECK — aircraft must fit through at least one hangar door', () => {

    /**
     * Wide aircraft (50 m wingspan) vs a 30 m-wide door.
     * No explicit `via` clause → SFR24 pre-check fires.
     * The bay (52 m wide) is large enough to avoid SFR12 interference.
     */
    test('aircraft wider than all doors triggers SFR24 warning', async () => {
        const doc = await parse(`
            airfield T {
                aircraft WideBody {
                    wingspan 50.0 m
                    length   40.0 m
                    height   10.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 30.0 m  height 12.0 m } }
                    grid baygrid {
                        bay B1 { width 52.0 m  depth 42.0 m  height 12.0 m }
                    }
                }
                induct WideBody into Alpha bays B1
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR24_DOOR_FIT_PRECHECK')).toBe(true);
    });

    test('aircraft fitting through at least one door produces no SFR24 warning', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Narrow {
                    wingspan 20.0 m
                    length   15.0 m
                    height    5.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 25.0 m  height 8.0 m } }
                    grid baygrid {
                        bay B1 { width 22.0 m  depth 17.0 m  height 8.0 m }
                    }
                }
                induct Narrow into Alpha bays B1
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR24_DOOR_FIT_PRECHECK')).toBe(false);
    });
});

// ===========================================================================
// SFR25_BAY_COUNT — enough bays for the aircraft's wingspan
// ===========================================================================

describe('SFR25_BAY_COUNT — assigned bay count must satisfy aircraft wingspan', () => {

    /**
     * WideBody: wingspan 70 m.  Two hangar bays of 36 m each.
     * Greedy: 36 < 70, 36+36 = 72 >= 70 → baysRequired = 2.
     * Only B1 is assigned (1 bay) → SFR25 warning fires.
     * Door is wide enough (75 m) to avoid SFR24.
     * SFR12 also fires on B1 (aircraft wider than a single bay — orthogonal).
     */
    test('one assigned bay when two are needed triggers SFR25 warning', async () => {
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
                induct WideBody into Alpha bays B1
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR25_BAY_COUNT')).toBe(true);
    });

    test('one bay sufficient for narrow aircraft produces no SFR25 warning', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Narrow {
                    wingspan 20.0 m
                    length   15.0 m
                    height    5.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 25.0 m  height 8.0 m } }
                    grid baygrid {
                        bay B1 { width 22.0 m  depth 17.0 m  height 8.0 m }
                    }
                }
                induct Narrow into Alpha bays B1
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR25_BAY_COUNT')).toBe(false);
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

// ===========================================================================
// SFR11_DOOR_FIT — aircraft vs an explicitly-named door (via clause)
// ===========================================================================

describe('SFR11_DOOR_FIT — aircraft must fit through the explicitly specified door', () => {

    /**
     * Aircraft wingspan 50 m, door width 30 m — aircraft is too wide.
     * The bay (52 m wide) is large enough so SFR12 does not interfere.
     * The `via D1` clause activates the SFR11 check in checkInductionFeasibility.
     */
    test('aircraft too wide for explicitly-named door triggers SFR11 error', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Wide {
                    wingspan 50.0 m
                    length   40.0 m
                    height   10.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 30.0 m  height 12.0 m } }
                    grid baygrid {
                        bay B1 { width 52.0 m  depth 42.0 m  height 12.0 m }
                    }
                }
                induct Wide into Alpha bays B1 via D1
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR11_DOOR_FIT')).toBe(true);
    });

    test('aircraft fitting through named door produces no SFR11 error', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Narrow {
                    wingspan 20.0 m
                    length   15.0 m
                    height    5.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 25.0 m  height 8.0 m } }
                    grid baygrid {
                        bay B1 { width 22.0 m  depth 17.0 m  height 8.0 m }
                    }
                }
                induct Narrow into Alpha bays B1 via D1
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR11_DOOR_FIT')).toBe(false);
    });
});

// ===========================================================================
// SFR12_BAY_FIT — aircraft must fit inside each assigned bay
// ===========================================================================

describe('SFR12_BAY_FIT — aircraft dimensions must fit within the assigned bay', () => {

    /**
     * Wide aircraft (40 m wingspan) vs a 30 m-wide bay — aircraft exceeds bay width.
     * Door (45 m wide) is large enough to avoid SFR11/SFR24 interference.
     */
    test('aircraft too wide for the bay triggers SFR12 error', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Wide {
                    wingspan 40.0 m
                    length   30.0 m
                    height    8.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 45.0 m  height 10.0 m } }
                    grid baygrid {
                        bay B1 { width 30.0 m  depth 32.0 m  height 10.0 m }
                    }
                }
                induct Wide into Alpha bays B1
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR12_BAY_FIT')).toBe(true);
    });

    test('aircraft fitting inside the bay produces no SFR12 error', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Narrow {
                    wingspan 20.0 m
                    length   15.0 m
                    height    5.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 25.0 m  height 8.0 m } }
                    grid baygrid {
                        bay B1 { width 22.0 m  depth 17.0 m  height 8.0 m }
                    }
                }
                induct Narrow into Alpha bays B1
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR12_BAY_FIT')).toBe(false);
    });
});

// ===========================================================================
// SFR12_COMBINED — aggregate bay-set fit check for multi-bay inductions
// ===========================================================================

/** Returns true if any diagnostic matches the code AND has the given numeric severity. */
function hasDiagWithSeverity(diags: any[], code: string, severity: number): boolean {
    return diags.some(
        (d: any) => typeof d.message === 'string' && d.message.includes(code) && d.severity === severity
    );
}

describe('SFR12_COMBINED — combined bay-set fit for multi-bay inductions', () => {

    /**
     * Single bay, aircraft fits — no SFR12 fires at all.
     * Baseline to confirm single-bay behaviour is unchanged.
     */
    test('single bay induction: aircraft fits — no SFR12 diagnostics', async () => {
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
        expect(hasDiag(diags, 'SFR12_BAY_FIT')).toBe(false);
        expect(hasDiag(diags, 'SFR12_COMBINED')).toBe(false);
    });

    /**
     * Multi-bay lateral: combined width fits, individual bays too narrow.
     * Aircraft wingspan=45m, two 23m bays (each 23m < 45m, combined=46m >= 45m).
     * Per-bay SFR12_BAY_FIT failures → downgraded to INFO (severity=3).
     * SFR12_COMBINED must NOT appear (combined passes).
     */
    test('multi-bay lateral: combined fits, individual bays too narrow → INFO not ERROR', async () => {
        const doc = await parse(`
            airfield T {
                aircraft WideJet {
                    wingspan 45.0 m
                    length   20.0 m
                    height    8.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 50.0 m  height 10.0 m } }
                    grid baygrid {
                        bay B1 {
                            width 23.0 m  depth 22.0 m  height 10.0 m
                            adjacent { B2 }
                        }
                        bay B2 {
                            width 23.0 m  depth 22.0 m  height 10.0 m
                            adjacent { B1 }
                        }
                    }
                }
                induct WideJet into Alpha bays B1 B2
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        // SFR12_BAY_FIT present as INFO (severity=3), not ERROR (severity=1)
        expect(hasDiagWithSeverity(diags, 'SFR12_BAY_FIT', 3)).toBe(true);
        expect(hasDiagWithSeverity(diags, 'SFR12_BAY_FIT', 1)).toBe(false);
        // SFR12_COMBINED must NOT fire (combined passes)
        expect(hasDiag(diags, 'SFR12_COMBINED')).toBe(false);
    });

    /**
     * Multi-bay lateral: combined width also fails.
     * Aircraft wingspan=50m, two 15m bays (combined=30m < 50m).
     * Per-bay SFR12_BAY_FIT → ERROR (severity=1).
     * SFR12_COMBINED → ERROR (severity=1).
     */
    test('multi-bay lateral: combined also fails → per-bay remains ERROR + SFR12_COMBINED fires', async () => {
        const doc = await parse(`
            airfield T {
                aircraft HugeJet {
                    wingspan 50.0 m
                    length   40.0 m
                    height   12.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 55.0 m  height 15.0 m } }
                    grid baygrid {
                        bay B1 {
                            width 15.0 m  depth 42.0 m  height 14.0 m
                            adjacent { B2 }
                        }
                        bay B2 {
                            width 15.0 m  depth 42.0 m  height 14.0 m
                            adjacent { B1 }
                        }
                    }
                }
                induct HugeJet into Alpha bays B1 B2
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        // Per-bay errors remain as ERROR (severity=1)
        expect(hasDiagWithSeverity(diags, 'SFR12_BAY_FIT', 1)).toBe(true);
        // SFR12_COMBINED error fires
        expect(hasDiagWithSeverity(diags, 'SFR12_COMBINED', 1)).toBe(true);
    });

    /**
     * Multi-bay longitudinal: combined depth fits, individual bays too shallow.
     * Aircraft wingspan=10m, length=30m.  Two bays each depth=16m (combined=32m >= 30m).
     * span longitudinal → depth axis is combined.
     * Per-bay SFR12_BAY_FIT → INFO (severity=3), SFR12_COMBINED absent.
     */
    test('multi-bay longitudinal: combined depth fits, individual bays too shallow → INFO not ERROR', async () => {
        const doc = await parse(`
            airfield T {
                aircraft LongJet {
                    wingspan 10.0 m
                    length   30.0 m
                    height    4.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 6.0 m } }
                    grid baygrid {
                        bay B1 {
                            width 12.0 m  depth 16.0 m  height 5.0 m
                            adjacent { B2 }
                        }
                        bay B2 {
                            width 12.0 m  depth 16.0 m  height 5.0 m
                            adjacent { B1 }
                        }
                    }
                }
                induct LongJet into Alpha bays B1 B2
                    span longitudinal
                    from 2024-01-01T08:00
                    to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        // Per-bay SFR12_BAY_FIT downgraded to INFO
        expect(hasDiagWithSeverity(diags, 'SFR12_BAY_FIT', 3)).toBe(true);
        expect(hasDiagWithSeverity(diags, 'SFR12_BAY_FIT', 1)).toBe(false);
        // SFR12_COMBINED must NOT fire (combined depth 32m >= 30m)
        expect(hasDiag(diags, 'SFR12_COMBINED')).toBe(false);
    });
});

// ===========================================================================
// SFR13_CONTIGUITY — all assigned bays must form a connected set
// ===========================================================================

describe('SFR13_CONTIGUITY — assigned bays must be adjacently connected', () => {

    /**
     * Layout: BayA ↔ BayB ↔ BayC  (linear explicit adjacency)
     * Induction assigns BayA and BayC, skipping BayB — not contiguous.
     * SFR13 must fire because visited size (1 from BayA) < selected size (2).
     *
     * Note: aircraft wingspan 25 m exceeds each 14 m-wide bay, so SFR12 also
     * fires — that is orthogonal and we only assert on SFR13 here.
     */
    test('skipping the middle bay in a chain triggers SFR13 error', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Wide {
                    wingspan 25.0 m
                    length   20.0 m
                    height    5.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 30.0 m  height 8.0 m } }
                    grid baygrid {
                        bay BayA {
                            width 14.0 m  depth 22.0 m  height 6.0 m
                            adjacent { BayB }
                        }
                        bay BayB {
                            width 14.0 m  depth 22.0 m  height 6.0 m
                            adjacent { BayA BayC }
                        }
                        bay BayC {
                            width 14.0 m  depth 22.0 m  height 6.0 m
                            adjacent { BayB }
                        }
                    }
                }
                induct Wide into Alpha bays BayA BayC
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR13_CONTIGUITY')).toBe(true);
    });

    /**
     * Same layout: BayA ↔ BayB.  Induction assigns BayA and BayB — adjacent.
     * SFR13 must NOT fire even though SFR12 fires (aircraft too wide for each
     * individual 14 m bay — orthogonal concern).
     */
    test('directly adjacent bays produce no SFR13 error', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Wide {
                    wingspan 25.0 m
                    length   20.0 m
                    height    5.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 30.0 m  height 8.0 m } }
                    grid baygrid {
                        bay BayA {
                            width 14.0 m  depth 22.0 m  height 6.0 m
                            adjacent { BayB }
                        }
                        bay BayB {
                            width 14.0 m  depth 22.0 m  height 6.0 m
                            adjacent { BayA }
                        }
                    }
                }
                induct Wide into Alpha bays BayA BayB
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR13_CONTIGUITY')).toBe(false);
    });
});

// ===========================================================================
// SFR_REACHABILITY_SKIPPED — hint when hangar has inductions but no access graph
// ===========================================================================

describe('SFR_REACHABILITY_SKIPPED — info hint when no access path is modelled', () => {

    /**
     * Hangar WITH accessNode hooks on its door and bay, plus a global accessPath.
     * buildAccessGraph returns a non-null graph → no hint should fire.
     */
    test('hangar with a modelled access path produces no SFR_REACHABILITY_SKIPPED hint', async () => {
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
        expect(hasDiag(diags, 'SFR_REACHABILITY_SKIPPED')).toBe(false);
    });

    /**
     * Hangar with no accessNode hooks on any door or bay, but it has an induction
     * targeting it. buildAccessGraph returns null → hint must fire.
     */
    test('hangar with induction but no access path triggers SFR_REACHABILITY_SKIPPED hint', async () => {
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
        expect(hasDiag(diags, 'SFR_REACHABILITY_SKIPPED')).toBe(true);

        const hint = diags.find(
            d => typeof d.message === 'string' && d.message.includes('SFR_REACHABILITY_SKIPPED')
        );
        expect(hint?.message).toContain("Hangar 'Alpha'");
    });

    /**
     * Hangar with no accessNode hooks and NO inductions targeting it.
     * Even though the access graph is absent, there is nothing to report because
     * no reachability analysis would have been attempted anyway.
     */
    test('hangar with no inductions produces no SFR_REACHABILITY_SKIPPED hint', async () => {
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
        expect(hasDiag(diags, 'SFR_REACHABILITY_SKIPPED')).toBe(false);
    });
});

// ===========================================================================
// SFR14_BAY_OWNERSHIP — referenced bay must belong to the target hangar
// ===========================================================================

describe('SFR14_BAY_OWNERSHIP — bay must belong to the target hangar', () => {

    /**
     * BayB1 is defined in HangarB but referenced inside HangarA's induction.
     * The scope provider restricts resolution to HangarA's bays, so BayB1
     * cannot resolve.  checkBayHangarMembership detects that BayB1 exists in
     * a sibling hangar and emits the SFR14 diagnostic.
     *
     * Langium also emits a generic "Could not resolve reference" error — that
     * is expected and orthogonal; we only assert on SFR14 here.
     */
    test('bay from a different hangar triggers SFR14 error', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Cessna {
                    wingspan 11.0 m
                    length   8.3 m
                    height   2.7 m
                }
                hangar HangarA {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        bay BayA1 { width 12.0 m  depth 15.0 m  height 5.0 m }
                    }
                }
                hangar HangarB {
                    doors { door D2 { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        bay BayB1 { width 12.0 m  depth 15.0 m  height 5.0 m }
                    }
                }
                induct Cessna into HangarA bays BayB1
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR14_BAY_OWNERSHIP')).toBe(true);
    });

    test('bay from the correct hangar produces no SFR14 error', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Cessna {
                    wingspan 11.0 m
                    length   8.3 m
                    height   2.7 m
                }
                hangar HangarA {
                    doors { door D1 { width 15.0 m  height 5.0 m } }
                    grid baygrid {
                        bay BayA1 { width 12.0 m  depth 15.0 m  height 5.0 m }
                    }
                }
                induct Cessna into HangarA bays BayA1
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR14_BAY_OWNERSHIP')).toBe(false);
    });
});

// ===========================================================================
// SFR_NONGRID_ADJACENCY / SFR_GRID_OVERRIDE — explicit vs grid adjacency
// ===========================================================================

describe('SFR_NONGRID_ADJACENCY / SFR_GRID_OVERRIDE — adjacency consistency checks', () => {

    /**
     * 1×2 grid: B1(0,0) ↔ B2(0,1).  Both declare each other in adjacent {}.
     * col distance = 1 → genuine 4-connected grid neighbours.
     * Neither warning should fire.
     */
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
        expect(hasDiag(diags, 'SFR_NONGRID_ADJACENCY')).toBe(false);
        expect(hasDiag(diags, 'SFR_GRID_OVERRIDE')).toBe(false);
    });

    /**
     * 1×3 grid: B1(0,0), B2(0,1), B3(0,2).
     * B1 declares adjacent { B3 } — col distance = 2, not a grid neighbour.
     * SFR_NONGRID_ADJACENCY must fire on B1.
     */
    test('explicit adjacency spanning non-adjacent grid cells triggers SFR_NONGRID_ADJACENCY', async () => {
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
        expect(hasDiag(diags, 'SFR_NONGRID_ADJACENCY')).toBe(true);
    });

    /**
     * 1×3 grid: B1(0,0), B2(0,1), B3(0,2).
     * B2 has explicit adjacent { B1 } only — B3 is a grid neighbour of B2 but
     * is absent from B2's explicit list, so the grid edge is overridden.
     * SFR_GRID_OVERRIDE must fire on B2 (for B3).
     */
    test('explicit adjacency that excludes a grid neighbour triggers SFR_GRID_OVERRIDE', async () => {
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
        expect(hasDiag(diags, 'SFR_GRID_OVERRIDE')).toBe(true);
    });

    /**
     * 1×2 grid: B1(0,0), B2(0,1).  No explicit adjacent {} blocks on either bay.
     * The check skips bays without explicit adjacency → no warnings.
     */
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
        expect(hasDiag(diags, 'SFR_NONGRID_ADJACENCY')).toBe(false);
        expect(hasDiag(diags, 'SFR_GRID_OVERRIDE')).toBe(false);
    });
});

// ===========================================================================
// Adjacency mode — 8-connected grid and conflict detection
// ===========================================================================

describe('Adjacency mode — 8-connected allows diagonal explicit adjacency', () => {

    /**
     * 2×2 grid with `adjacency 8`.  B1(0,0) declares B2 and B4(1,1) adjacent.
     * B4 is a diagonal neighbour, legitimate under 8-connected.
     * SFR_NONGRID_ADJACENCY must NOT fire for B4.
     * B3(1,0) is a grid-neighbour of B1 but absent from the explicit list
     * → SFR_GRID_OVERRIDE fires (confirming the check still runs).
     */
    test('adjacency 8: diagonal declared adjacent produces no SFR_NONGRID_ADJACENCY', async () => {
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
        // B4 is a diagonal grid-neighbour under adjacency 8 → no NONGRID warning
        expect(hasDiag(diags, 'SFR_NONGRID_ADJACENCY')).toBe(false);
        // B3 (orthogonal) is absent from B1's explicit list → GRID_OVERRIDE fires
        expect(hasDiag(diags, 'SFR_GRID_OVERRIDE')).toBe(true);
    });

    /**
     * Same layout but WITHOUT `adjacency 8` (default = 4-connected).
     * B1 declares B4 (diagonal) — not a legitimate 4-connected neighbour
     * → SFR_NONGRID_ADJACENCY must fire.
     */
    test('default adjacency (4): diagonal declared adjacent triggers SFR_NONGRID_ADJACENCY', async () => {
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
        // Without adjacency 8, B4 is not a valid grid-neighbour of B1 (diagonal)
        expect(hasDiag(diags, 'SFR_NONGRID_ADJACENCY')).toBe(true);
    });
});

// ===========================================================================
// 2.1 Span direction — affects bay-count axis (SFR25)
// ===========================================================================

describe('Span direction — SFR25 uses the correct axis for each span', () => {

    /**
     * Aircraft: wingspan 11 m, length 30 m.
     * Hangar: 2 bays, each width 12 m (fits wingspan), depth 16 m.
     * Induction assigns 1 bay.
     *
     * lateral (default): greedy sum-widths: 12 >= 11 → baysRequired = 1.
     *   1 bay assigned → no SFR25 warning.
     *
     * longitudinal: greedy sum-depths: 16 < 30; 16+16=32 >= 30 → baysRequired = 2.
     *   1 bay assigned → SFR25 fires.
     */
    test('span longitudinal triggers SFR25 when depth sum insufficient', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Long {
                    wingspan 11.0 m
                    length   30.0 m
                    height    4.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 6.0 m } }
                    grid baygrid {
                        bay B1 {
                            width 12.0 m  depth 16.0 m  height 5.0 m
                            adjacent { B2 }
                        }
                        bay B2 {
                            width 12.0 m  depth 16.0 m  height 5.0 m
                            adjacent { B1 }
                        }
                    }
                }
                induct Long into Alpha bays B1
                    span longitudinal
                    from 2024-01-01T08:00
                    to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR25_BAY_COUNT')).toBe(true);
    });

    test('span lateral (default) does not trigger SFR25 when wingspan fits one bay', async () => {
        const doc = await parse(`
            airfield T {
                aircraft Long {
                    wingspan 11.0 m
                    length   30.0 m
                    height    4.0 m
                }
                hangar Alpha {
                    doors { door D1 { width 15.0 m  height 6.0 m } }
                    grid baygrid {
                        bay B1 {
                            width 12.0 m  depth 32.0 m  height 5.0 m
                            adjacent { B2 }
                        }
                        bay B2 {
                            width 12.0 m  depth 32.0 m  height 5.0 m
                            adjacent { B1 }
                        }
                    }
                }
                induct Long into Alpha bays B1
                    span lateral
                    from 2024-01-01T08:00
                    to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR25_BAY_COUNT')).toBe(false);
    });
});

// ===========================================================================
// 2.2 Required bay count override (SFR_BAY_COUNT_OVERRIDE / SFR25)
// ===========================================================================

describe('Requires clause — SFR_BAY_COUNT_OVERRIDE and effective minimum', () => {

    /**
     * requires 1 bays when geometry demands 2.
     * Aircraft wingspan=70m, two 36m bays → baysRequired = 2.
     * Declaring requires=1 is too optimistic → SFR_BAY_COUNT_OVERRIDE fires.
     */
    test('requires below geometric minimum triggers SFR_BAY_COUNT_OVERRIDE', async () => {
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
                        bay B1 {
                            width 36.0 m  depth 52.0 m  height 16.0 m
                            adjacent { B2 }
                        }
                        bay B2 {
                            width 36.0 m  depth 52.0 m  height 16.0 m
                            adjacent { B1 }
                        }
                    }
                }
                induct WideBody into Alpha bays B1 B2
                    requires 1 bays
                    from 2024-01-01T08:00
                    to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR_BAY_COUNT_OVERRIDE')).toBe(true);
    });

    /**
     * requires 3 bays when geometry demands 1 (Cessna, 1 bay wide enough).
     * Effective minimum = max(1, 3) = 3.  Only 1 bay assigned → SFR25 fires.
     * No SFR_BAY_COUNT_OVERRIDE because requires > geometric minimum.
     */
    test('requires above geometric minimum raises effective minimum for SFR25', async () => {
        const doc = await parse(`
            airfield T {
                ${CESSNA}
                ${ALPHA_HANGAR}
                induct Cessna into Alpha bays B1
                    requires 3 bays
                    from 2024-01-01T08:00
                    to   2024-01-01T16:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const diags = await validate(doc);
        expect(hasDiag(diags, 'SFR_BAY_COUNT_OVERRIDE')).toBe(false);
        expect(hasDiag(diags, 'SFR25_BAY_COUNT')).toBe(true);
    });
});

// ===========================================================================
// 2.2 Requires clause on AutoInduction (SFR_BAY_COUNT_OVERRIDE)
// ===========================================================================

describe('AutoInduction requires clause — SFR_BAY_COUNT_OVERRIDE', () => {

    /**
     * auto-induct with requires=1 when geometry demands 2 bays.
     * Aircraft wingspan=70m, two 36m bays → baysRequired = 2.
     * Declaring requires=1 is too optimistic → SFR_BAY_COUNT_OVERRIDE fires.
     */
    test('auto-induction requires below geometric minimum triggers SFR_BAY_COUNT_OVERRIDE', async () => {
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
        expect(hasDiag(diags, 'SFR_BAY_COUNT_OVERRIDE')).toBe(true);
    });

    /**
     * auto-induct with requires=1 when geometry also demands 1 (Cessna).
     * requires matches the geometric minimum — no SFR_BAY_COUNT_OVERRIDE.
     */
    test('auto-induction requires matching geometric minimum produces no SFR_BAY_COUNT_OVERRIDE', async () => {
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
        expect(hasDiag(diags, 'SFR_BAY_COUNT_OVERRIDE')).toBe(false);
    });
});
