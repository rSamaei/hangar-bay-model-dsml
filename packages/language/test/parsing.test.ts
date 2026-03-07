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

describe('Parsing tests', () => {

    test('parse simple airfield model with aircraft only', async () => {
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
        expect(document.parseResult.value.name).toBe('MyAirfield');
        expect(document.parseResult.value.aircraftTypes).toHaveLength(1);
        expect(document.parseResult.value.aircraftTypes[0].name).toBe('Cessna172');
    });

    test('parse airfield model with hangar (doors + baygrid)', async () => {
        document = await parse(`
            airfield MyAirfield {
                aircraft Cessna172 {
                    wingspan 11.0 m
                    length 8.28 m
                    height 2.72 m
                }
                hangar MainHangar {
                    doors {
                        door MainDoor {
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
                        bay B2 {
                            width 15.0 m
                            depth 12.0 m
                            height 5.0 m
                        }
                    }
                }
            }
        `);

        expect(checkDocumentValid(document)).toBe(true);
        expect(document.parseResult.value.name).toBe('MyAirfield');
        expect(document.parseResult.value.aircraftTypes).toHaveLength(1);
        expect(document.parseResult.value.aircraftTypes[0].name).toBe('Cessna172');
        expect(document.parseResult.value.hangars).toHaveLength(1);
        expect(document.parseResult.value.hangars[0].name).toBe('MainHangar');
        expect(document.parseResult.value.hangars[0].doors).toHaveLength(1);
        expect(document.parseResult.value.hangars[0].doors[0].name).toBe('MainDoor');
        expect(document.parseResult.value.hangars[0].grid.bays).toHaveLength(2);
    });

    test('parse airfield model with clearance envelope', async () => {
        document = await parse(`
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
        expect(document.parseResult.value.clearanceEnvelopes).toHaveLength(1);
        expect(document.parseResult.value.clearanceEnvelopes[0].name).toBe('WideSafety');
        expect(document.parseResult.value.aircraftTypes[0].clearance?.$refText).toBe('WideSafety');
    });

    test('parse induction with full syntax', async () => {
        document = await parse(`
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
        const ind = document.parseResult.value.inductions[0];
        expect(ind.start).toBe('2024-01-01T08:00');
        expect(ind.end).toBe('2024-01-01T10:00');
    });
});

function checkDocumentValid(document: LangiumDocument): boolean {
    return document.parseResult.parserErrors.length === 0
        && document.parseResult.value !== undefined
        && isModel(document.parseResult.value);
}
