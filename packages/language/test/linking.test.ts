import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem } from "langium";
import { parseHelper } from "langium/test";
import type { Model } from "airfield-language";
import { createAirfieldServices, isModel } from "airfield-language";

let services: ReturnType<typeof createAirfieldServices>;
let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    services = createAirfieldServices(EmptyFileSystem);
    const doParse = parseHelper<Model>(services.Airfield);
    parse = (input: string) => doParse(input);
});

function checkDocumentValid(document: any): boolean {
    return document.parseResult.parserErrors.length === 0
        && document.parseResult.value !== undefined
        && isModel(document.parseResult.value);
}

// ---------------------------------------------------------------------------
// Basic cross-reference linking
// ---------------------------------------------------------------------------

describe('Linking tests', () => {

    test('aircraft reference in induction links correctly', async () => {
        const document = await parse(`
            airfield MyAirfield {
                aircraft Cessna172 {
                    wingspan 11.0 m
                    length 8.28 m
                    height 2.72 m
                }
                hangar MainHangar {
                    doors {
                        door D1 {
                            width 20.0 m
                            height 5.0 m
                        }
                    }
                    grid baygrid {
                        bay B1 {
                            width 15.0 m
                            depth 12.0 m
                            height 5.0 m
                        }
                    }
                }
                induct Cessna172 into MainHangar bays B1
                from 2024-01-01T08:00
                to   2024-01-01T10:00;
            }
        `);

        expect(checkDocumentValid(document)).toBe(true);
        expect(document.parseResult.value.inductions).toHaveLength(1);
        expect(document.parseResult.value.inductions[0].aircraft.ref?.name).toBe('Cessna172');
        expect(document.parseResult.value.inductions[0].hangar.ref?.name).toBe('MainHangar');
        expect(document.parseResult.value.inductions[0].bays[0].ref?.name).toBe('B1');
    });

    test('clearance envelope reference in aircraft links correctly', async () => {
        const document = await parse(`
            airfield MyAirfield {
                clearance WideSafety {
                    lateralMargin 1.0 m
                    longitudinalMargin 2.0 m
                    verticalMargin 0.5 m
                }
                aircraft Cessna172 {
                    wingspan 11.0 m
                    length 8.28 m
                    height 2.72 m
                    clearance WideSafety
                }
            }
        `);

        expect(checkDocumentValid(document)).toBe(true);
        expect(document.parseResult.value.aircraftTypes[0].clearance?.ref?.name).toBe('WideSafety');
    });
});

// ---------------------------------------------------------------------------
// Scope provider: hangar-scoped bay completion
//
// AirfieldScopeProvider restricts Induction.bays to bays belonging to the
// induction's target hangar.  The tests below verify this at the linking layer:
// a bay that IS in the target hangar resolves; one that is NOT does not.
// ---------------------------------------------------------------------------

describe('Scope provider: hangar-scoped bay completion', () => {

    test('bays in the correct hangar resolve', async () => {
        const document = await parse(`
            airfield MyAirfield {
                aircraft Cessna172 {
                    wingspan 11.0 m
                    length 8.28 m
                    height 2.72 m
                }
                hangar MainHangar {
                    doors {
                        door D1 {
                            width 20.0 m
                            height 5.0 m
                        }
                    }
                    grid baygrid {
                        bay Bay1 {
                            width 15.0 m
                            depth 12.0 m
                            height 5.0 m
                        }
                        bay Bay2 {
                            width 15.0 m
                            depth 12.0 m
                            height 5.0 m
                        }
                    }
                }
                induct Cessna172 into MainHangar bays Bay1 Bay2
                from 2024-01-01T08:00
                to   2024-01-01T10:00;
            }
        `);

        expect(checkDocumentValid(document)).toBe(true);
        const ind = document.parseResult.value.inductions[0];
        expect(ind.hangar.ref?.name).toBe('MainHangar');
        expect(ind.bays).toHaveLength(2);
        expect(ind.bays[0].ref?.name).toBe('Bay1');
        expect(ind.bays[1].ref?.name).toBe('Bay2');
    });

    test('bay from a different hangar is not in scope and does not resolve', async () => {
        // BayB1 lives in HangarB; the induction targets HangarA.
        // The scope provider exposes only HangarA's bays for the `bays` property,
        // so BayB1 is invisible to the linker and the reference stays unresolved.
        const document = await parse(`
            airfield MyAirfield {
                aircraft Cessna172 {
                    wingspan 11.0 m
                    length 8.28 m
                    height 2.72 m
                }
                hangar HangarA {
                    doors {
                        door DA {
                            width 20.0 m
                            height 5.0 m
                        }
                    }
                    grid baygrid {
                        bay BayA1 {
                            width 15.0 m
                            depth 12.0 m
                            height 5.0 m
                        }
                    }
                }
                hangar HangarB {
                    doors {
                        door DB {
                            width 20.0 m
                            height 5.0 m
                        }
                    }
                    grid baygrid {
                        bay BayB1 {
                            width 15.0 m
                            depth 12.0 m
                            height 5.0 m
                        }
                    }
                }
                induct Cessna172 into HangarA bays BayB1
                from 2024-01-01T08:00
                to   2024-01-01T10:00;
            }
        `);

        // No syntax errors — only a link error
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const ind = document.parseResult.value.inductions[0];
        // Hangar itself still resolves
        expect(ind.hangar.ref?.name).toBe('HangarA');
        // BayB1 is out of scope for HangarA inductions — ref stays undefined
        expect(ind.bays[0].ref).toBeUndefined();
    });

    test('bay names that exist in both hangars resolve to the correct one', async () => {
        // Both hangars have a bay named "Bay1". The scope provider must return
        // only the instance belonging to the target hangar.
        const document = await parse(`
            airfield MyAirfield {
                aircraft Cessna172 {
                    wingspan 11.0 m
                    length 8.28 m
                    height 2.72 m
                }
                hangar HangarA {
                    doors {
                        door DA {
                            width 20.0 m
                            height 5.0 m
                        }
                    }
                    grid baygrid {
                        bay Bay1 {
                            width 15.0 m
                            depth 12.0 m
                            height 5.0 m
                        }
                    }
                }
                hangar HangarB {
                    doors {
                        door DB {
                            width 20.0 m
                            height 5.0 m
                        }
                    }
                    grid baygrid {
                        bay Bay1 {
                            width 16.0 m
                            depth 13.0 m
                            height 5.0 m
                        }
                    }
                }
                induct Cessna172 into HangarA bays Bay1
                from 2024-01-01T08:00
                to   2024-01-01T10:00;
            }
        `);

        expect(checkDocumentValid(document)).toBe(true);
        const ind = document.parseResult.value.inductions[0];
        expect(ind.hangar.ref?.name).toBe('HangarA');
        // The resolved Bay1 must be the HangarA instance (width 15.0), not HangarB's (width 16.0)
        const resolvedBay = ind.bays[0].ref;
        expect(resolvedBay).toBeDefined();
        expect(resolvedBay?.width).toBe(15.0);
    });

    test('door reference is scoped to the target hangar', async () => {
        const document = await parse(`
            airfield MyAirfield {
                aircraft Cessna172 {
                    wingspan 11.0 m
                    length 8.28 m
                    height 2.72 m
                }
                hangar HangarA {
                    doors {
                        door DoorA {
                            width 20.0 m
                            height 5.0 m
                        }
                    }
                    grid baygrid {
                        bay BayA1 {
                            width 15.0 m
                            depth 12.0 m
                            height 5.0 m
                        }
                    }
                }
                hangar HangarB {
                    doors {
                        door DoorB {
                            width 20.0 m
                            height 5.0 m
                        }
                    }
                    grid baygrid {
                        bay BayB1 {
                            width 15.0 m
                            depth 12.0 m
                            height 5.0 m
                        }
                    }
                }
                induct Cessna172 into HangarA bays BayA1 via DoorA
                from 2024-01-01T08:00
                to   2024-01-01T10:00;
            }
        `);

        expect(checkDocumentValid(document)).toBe(true);
        const ind = document.parseResult.value.inductions[0];
        expect(ind.door?.ref?.name).toBe('DoorA');
    });
});
