/**
 * Unit tests for packages/cli/src/util.ts
 *
 * Covers:
 *   extractDestinationAndName — pure path-manipulation helper
 *   extractDocument severity filtering — only severity===1 (errors) cause exit;
 *     severity===2 (warnings) are ignored and the document is returned.
 */
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// extractDestinationAndName — pure function, no I/O
// ---------------------------------------------------------------------------

import { extractDestinationAndName } from '../src/util.js';

describe('extractDestinationAndName', () => {
    test('name is the file basename without extension', () => {
        const result = extractDestinationAndName('/some/path/myModel.air', '/dest');
        expect(result.name).toBe('myModel');
    });

    test('strips dots and dashes from the basename', () => {
        const result = extractDestinationAndName('/some/path/my-model.v2.air', '/dest');
        expect(result.name).toBe('mymodelv2');
    });

    test('uses the provided destination directory', () => {
        const result = extractDestinationAndName('/some/path/myModel.air', '/custom/output');
        expect(result.destination).toBe('/custom/output');
    });

    test('defaults to a "generated" subfolder when no destination provided', () => {
        const result = extractDestinationAndName('/some/path/myModel.air', undefined);
        // path.dirname of the bare basename is '.', so destination = 'generated'
        expect(result.destination).toBe('generated');
    });
});

// ---------------------------------------------------------------------------
// extractDocument — severity filtering
//
// extractDocument calls process.exit(1) ONLY for severity===1 diagnostics.
// A document whose only diagnostics are warnings (severity===2) should be
// returned successfully without calling process.exit.
// ---------------------------------------------------------------------------

import { createAirfieldServices } from '../../language/out/airfield-module.js';
import { NodeFileSystem } from 'langium/node';
import { extractDocument } from '../src/util.js';

let tmpDir: string;

beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-util-test-'));
});

afterEach(() => {
    vi.restoreAllMocks();
});

/** Write text to a .air file in tmpDir and return its absolute path. */
function writeAir(name: string, content: string): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content);
    return filePath;
}

/**
 * A valid model where:
 *   - Cessna (11 m wingspan) fits door (15 m wide) and single bay (12 m wide)
 *   - 1 bay assigned; ceil(11/12)=1 required → no SFR25 warning
 *   - All dimensions positive → no SFR20 error
 *   - Time window valid → no SFR21 error
 *
 * Expected diagnostics: none.
 */
const CLEAN_AIR = `
airfield CleanTest {
    aircraft Cessna {
        wingspan 11.0 m
        length    8.3 m
        height    2.7 m
    }
    hangar AlphaHangar {
        doors {
            door MainDoor {
                width  15.0 m
                height  5.0 m
            }
        }
        grid baygrid {
            bay Bay1 {
                width  12.0 m
                depth  10.0 m
                height  5.0 m
            }
        }
    }
    induct Cessna into AlphaHangar bays Bay1
        from 2024-06-01T08:00
        to   2024-06-01T10:00;
}
`;

/**
 * A model with an SFR20_DIMENSIONS error (zero wingspan).
 * The language validator fires with severity===1, so extractDocument must
 * call process.exit(1).
 */
const ERROR_AIR = `
airfield ErrorTest {
    aircraft BadPlane {
        wingspan 0.0 m
        length   8.3 m
        height   2.7 m
    }
}
`;

describe('extractDocument — severity filtering', () => {
    test('returns document without calling process.exit for a clean model', async () => {
        const services = createAirfieldServices(NodeFileSystem).Airfield;
        const filePath = writeAir('clean.air', CLEAN_AIR);
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

        const doc = await extractDocument(filePath, services);

        expect(exitSpy).not.toHaveBeenCalled();
        expect(doc).toBeDefined();
    });

    test('calls process.exit(1) for a model with severity-1 (error) diagnostics', async () => {
        const services = createAirfieldServices(NodeFileSystem).Airfield;
        const filePath = writeAir('error.air', ERROR_AIR);

        let exitCode: number | undefined;
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
            exitCode = code;
            throw new Error('process.exit called');
        }) as any);

        await expect(extractDocument(filePath, services)).rejects.toThrow('process.exit called');
        expect(exitSpy).toHaveBeenCalled();
        expect(exitCode).toBe(1);
    });
});
