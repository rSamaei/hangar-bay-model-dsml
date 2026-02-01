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

describe('Linking tests', () => {

    test('linking of aircraft reference in induction', async () => {
        const document = await parse(`
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
                induct Cessna172 into MainHangar bays 1 .. 2;
            }
        `);

        expect(
            document.parseResult.parserErrors.length === 0
                && document.parseResult.value !== undefined
                && isModel(document.parseResult.value)
                || document.parseResult.parserErrors.map(e => e.message).join('\n')
        ).toBe(true);

        expect(document.parseResult.value.inductions).toHaveLength(1);
        expect(document.parseResult.value.inductions[0].aircraft.ref?.name).toBe('Cessna172');
        expect(document.parseResult.value.inductions[0].bays[0].ref?.name).toBe('B1');
    });
});
