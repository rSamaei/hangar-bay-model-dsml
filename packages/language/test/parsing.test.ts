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

    test('parse simple airfield model', async () => {
        document = await parse(`
            airfield MyAirfield {
                aircraft Cessna172 {
                    wingspan 11.0 m
                    length 8.28 m
                    height 2.72 m
                }
                hangar MainHangar {
                    bays 10
                    bayWidth 15.0 m
                    bayDepth 12.0 m
                    height 5.0 m
                }
            }
        `);

        expect(checkDocumentValid(document)).toBe(true);
        
        expect(document.parseResult.value.name).toBe('MyAirfield');
        expect(document.parseResult.value.aircraftTypes).toHaveLength(1);
        expect(document.parseResult.value.aircraftTypes[0].name).toBe('Cessna172');
        expect(document.parseResult.value.hangars).toHaveLength(1);
        expect(document.parseResult.value.hangars[0].name).toBe('MainHangar');
    });
});

function checkDocumentValid(document: LangiumDocument): boolean {
    return document.parseResult.parserErrors.length === 0
        && document.parseResult.value !== undefined
        && isModel(document.parseResult.value);
}
