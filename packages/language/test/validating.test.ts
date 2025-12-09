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
});

function checkDocumentValid(document: LangiumDocument): boolean {
    return document.parseResult.parserErrors.length === 0
        && document.parseResult.value !== undefined
        && isModel(document.parseResult.value);
}
