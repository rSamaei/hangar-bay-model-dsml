import { describe, expect, test } from 'vitest';
import { setupServices, parse, validate, hasDiag, hasDiagWithSeverity } from '../helpers/setup.js';
import { CESSNA, ALPHA_HANGAR } from '../helpers/fixtures.js';

setupServices();

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
// SFR11_DOOR_FIT — aircraft vs an explicitly-named door (via clause)
// ===========================================================================

describe('SFR11_DOOR_FIT — aircraft must fit through the explicitly specified door', () => {

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

describe('SFR12_COMBINED — combined bay-set fit for multi-bay inductions', () => {

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
        expect(hasDiagWithSeverity(diags, 'SFR12_BAY_FIT', 3)).toBe(true);
        expect(hasDiagWithSeverity(diags, 'SFR12_BAY_FIT', 1)).toBe(false);
        expect(hasDiag(diags, 'SFR12_COMBINED')).toBe(false);
    });

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
        expect(hasDiagWithSeverity(diags, 'SFR12_BAY_FIT', 1)).toBe(true);
        expect(hasDiagWithSeverity(diags, 'SFR12_COMBINED', 1)).toBe(true);
    });

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
        expect(hasDiagWithSeverity(diags, 'SFR12_BAY_FIT', 3)).toBe(true);
        expect(hasDiagWithSeverity(diags, 'SFR12_BAY_FIT', 1)).toBe(false);
        expect(hasDiag(diags, 'SFR12_COMBINED')).toBe(false);
    });
});

// ===========================================================================
// SFR13_CONTIGUITY — all assigned bays must form a connected set
// ===========================================================================

describe('SFR13_CONTIGUITY — assigned bays must be adjacently connected', () => {

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
// SFR14_BAY_OWNERSHIP — referenced bay must belong to the target hangar
// ===========================================================================

describe('SFR14_BAY_OWNERSHIP — bay must belong to the target hangar', () => {

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
// Span direction — affects bay-count axis (SFR25)
// ===========================================================================

describe('Span direction — SFR25 uses the correct axis for each span', () => {

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
// Required bay count override (SFR_BAY_COUNT_OVERRIDE / SFR25)
// ===========================================================================

describe('Requires clause — SFR_BAY_COUNT_OVERRIDE and effective minimum', () => {

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
