import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { parseHelper } from "langium/test";
import type { Model } from "airfield-language";
import { createAirfieldServices, isModel } from "airfield-language";

let services: ReturnType<typeof createAirfieldServices>;
let parse:    ReturnType<typeof parseHelper<Model>>;
let document: LangiumDocument<Model> | undefined;

beforeAll(async () => {
    services = createAirfieldServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Airfield);
});

describe('Validating', () => {

    test('check no validation errors for valid airfield', async () => {
        document = await parse(`
            airfield MyAirfield {
                aircraft Cessna172 {
                    wingspan 11.0 m
                    length 8.28 m
                    height 2.72 m
                }
            }
        `);

        expect(checkDocumentValid(document)).toBe(true);

        const validationResult = await services.Airfield.validation.DocumentValidator.validateDocument(document);
        expect(validationResult).toHaveLength(0);
    });

    // ---------------------------------------------------------------------------
    // SFR_DYNAMIC_REACHABILITY: bay blocking by concurrent inductions
    // ---------------------------------------------------------------------------

    test('SFR_DYNAMIC_REACHABILITY: error when blocker induction occupies the access path', async () => {
        // Layout:
        //   Door D1 → accessNode NodeD
        //   Bay1     → accessNode Node1  (IND001 occupies this bay during the overlap)
        //   Bay2     → accessNode Node2  (IND002 targets this bay)
        //
        // AccessPath: NodeD → Node1 → Node2  (unidirectional chain)
        //
        // IND001 occupies Bay1 08:00–16:00.
        // IND002 wants Bay2 10:00–14:00 (overlaps with IND001).
        // Node1 is therefore blocked → Bay2 is unreachable from NodeD.
        // Expect: SFR_DYNAMIC_REACHABILITY error on IND002.
        document = await parse(`
            airfield BlockingTest {
                aircraft A320 {
                    wingspan 34.1 m
                    length   37.6 m
                    height   11.8 m
                }
                aircraft B737 {
                    wingspan 35.8 m
                    length   39.5 m
                    height   12.5 m
                }
                hangar Alpha {
                    doors {
                        door D1 {
                            width  40.0 m
                            height 15.0 m
                            accessNode NodeD
                        }
                    }
                    grid baygrid {
                        bay Bay1 {
                            width  36.0 m
                            depth  40.0 m
                            height 15.0 m
                            accessNode Node1
                        }
                        bay Bay2 {
                            width  36.0 m
                            depth  40.0 m
                            height 15.0 m
                            accessNode Node2
                        }
                    }
                }
                accessPath AlphaPath {
                    nodes {
                        node NodeD
                        node Node1
                        node Node2
                    }
                    links {
                        link NodeD to Node1
                        link Node1 to Node2
                    }
                }
                induct id "IND001" A320 into Alpha bays Bay1
                from 2024-06-01T08:00
                to   2024-06-01T16:00;
                induct id "IND002" B737 into Alpha bays Bay2
                from 2024-06-01T10:00
                to   2024-06-01T14:00;
            }
        `);

        expect(document.parseResult.parserErrors).toHaveLength(0);

        const diagnostics = await services.Airfield.validation.DocumentValidator.validateDocument(document);
        const reachabilityErrors = diagnostics.filter(
            d => typeof d.message === 'string' && d.message.includes('SFR_DYNAMIC_REACHABILITY')
        );
        expect(reachabilityErrors.length).toBeGreaterThanOrEqual(1);

        const msg = reachabilityErrors[0].message as string;
        expect(msg).toContain('Bay2');
        expect(msg).toContain('IND001');
    });

    test('SFR_DYNAMIC_REACHABILITY: no error when inductions do not overlap in time', async () => {
        // Same topology as the blocking test but IND001 ends exactly when IND002
        // starts — no overlap interval → no blocking → no reachability error.
        document = await parse(`
            airfield NoOverlapTest {
                aircraft A320 {
                    wingspan 34.1 m
                    length   37.6 m
                    height   11.8 m
                }
                aircraft B737 {
                    wingspan 35.8 m
                    length   39.5 m
                    height   12.5 m
                }
                hangar Alpha {
                    doors {
                        door D1 {
                            width  40.0 m
                            height 15.0 m
                            accessNode NodeD
                        }
                    }
                    grid baygrid {
                        bay Bay1 {
                            width  36.0 m
                            depth  40.0 m
                            height 15.0 m
                            accessNode Node1
                        }
                        bay Bay2 {
                            width  36.0 m
                            depth  40.0 m
                            height 15.0 m
                            accessNode Node2
                        }
                    }
                }
                accessPath AlphaPath {
                    nodes {
                        node NodeD
                        node Node1
                        node Node2
                    }
                    links {
                        link NodeD to Node1
                        link Node1 to Node2
                    }
                }
                induct id "IND001" A320 into Alpha bays Bay1
                from 2024-06-01T06:00
                to   2024-06-01T09:00;
                induct id "IND002" B737 into Alpha bays Bay2
                from 2024-06-01T09:00
                to   2024-06-01T12:00;
            }
        `);

        expect(document.parseResult.parserErrors).toHaveLength(0);

        const diagnostics = await services.Airfield.validation.DocumentValidator.validateDocument(document);
        const reachabilityErrors = diagnostics.filter(
            d => typeof d.message === 'string' && d.message.includes('SFR_DYNAMIC_REACHABILITY')
        );
        expect(reachabilityErrors).toHaveLength(0);
    });

    test('SFR_DYNAMIC_REACHABILITY: skipped silently when no access graph is modelled', async () => {
        // Hangar with no accessNode hooks on doors or bays.
        // The check must be skipped (ok=true, skipped=true) — no false positive.
        document = await parse(`
            airfield NoGraphTest {
                aircraft A320 {
                    wingspan 34.1 m
                    length   37.6 m
                    height   11.8 m
                }
                hangar Alpha {
                    doors {
                        door D1 {
                            width  40.0 m
                            height 15.0 m
                        }
                    }
                    grid baygrid {
                        bay Bay1 {
                            width  36.0 m
                            depth  40.0 m
                            height 15.0 m
                        }
                    }
                }
                induct A320 into Alpha bays Bay1
                from 2024-06-01T08:00
                to   2024-06-01T16:00;
            }
        `);

        expect(document.parseResult.parserErrors).toHaveLength(0);

        const diagnostics = await services.Airfield.validation.DocumentValidator.validateDocument(document);
        const reachabilityErrors = diagnostics.filter(
            d => typeof d.message === 'string' && d.message.includes('SFR_DYNAMIC_REACHABILITY')
        );
        expect(reachabilityErrors).toHaveLength(0);
    });
});

function checkDocumentValid(document: LangiumDocument): boolean {
    return document.parseResult.parserErrors.length === 0
        && document.parseResult.value !== undefined
        && isModel(document.parseResult.value);
}
