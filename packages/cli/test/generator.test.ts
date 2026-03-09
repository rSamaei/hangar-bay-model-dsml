/**
 * Integration tests for packages/cli/src/generator.ts
 *
 * generateAction() is the CLI's primary export: it parses a .air file,
 * validates it, runs analysis, and writes a JSON file to disk.
 *
 * Tests use real Langium parsing (NodeFileSystem) with small .air fixtures
 * written to a temporary directory.  process.exit is spied on so that error
 * paths can be verified without killing the test process.
 *
 * Covers:
 *   - Valid model → JSON file is written to the destination directory
 *   - JSON output has the expected top-level sections
 *   - JSON output carries the correct airfield metadata
 *   - Model with a validation error → process.exit(1) called, no JSON written
 */
import { afterEach, beforeAll, afterAll, describe, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateAction } from '../src/generator.js';

// ---------------------------------------------------------------------------
// Temp directory lifecycle
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-gen-test-'));
});

afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Write a .air file to tmpDir and return its absolute path. */
function writeAir(name: string, content: string): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content);
    return filePath;
}

/**
 * A minimal, diagnostics-free model:
 *   - Cessna (wingspan 11 m) ≤ MainDoor width 15 m       → SFR24 OK
 *   - Cessna fits Bay1 (width 12 m, depth 10 m, h 5 m)   → SFR12 OK
 *   - 1 bay assigned; baysRequired = ceil(11/12) = 1      → SFR25 OK
 *   - Time window start < end                             → SFR21 OK
 *   - All dimensions > 0                                  → SFR20 OK
 */
const VALID_AIR = `
airfield TestAirfield {
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
 * This triggers a severity-1 diagnostic, so extractDocument (in util.ts)
 * calls process.exit(1) before generateAction can produce output.
 */
const INVALID_AIR = `
airfield ErrorAirfield {
    aircraft BadPlane {
        wingspan 0.0 m
        length   8.3 m
        height   2.7 m
    }
}
`;

// ---------------------------------------------------------------------------
// Tests — valid model generates JSON
// ---------------------------------------------------------------------------

describe('generateAction — valid .air file', () => {
    test('writes a JSON file to the destination directory', async () => {
        const airFile = writeAir('gen-valid1.air', VALID_AIR);
        const destDir = path.join(tmpDir, 'out1');

        await generateAction(airFile, { destination: destDir });

        const jsonPath = path.join(destDir, 'gen-valid1.json');
        expect(fs.existsSync(jsonPath)).toBe(true);
    });

    test('generated JSON contains aircraftTypes, hangars, and manualInductions sections', async () => {
        const airFile = writeAir('gen-valid2.air', VALID_AIR);
        const destDir = path.join(tmpDir, 'out2');

        await generateAction(airFile, { destination: destDir });

        const data = JSON.parse(fs.readFileSync(path.join(destDir, 'gen-valid2.json'), 'utf-8'));
        expect(data).toHaveProperty('aircraftTypes');
        expect(data).toHaveProperty('hangars');
        expect(data).toHaveProperty('manualInductions');
        expect(Array.isArray(data.aircraftTypes)).toBe(true);
        expect(Array.isArray(data.hangars)).toBe(true);
        expect(Array.isArray(data.manualInductions)).toBe(true);
    });

    test('generated JSON carries the correct airfield name and aircraft data', async () => {
        const airFile = writeAir('gen-valid3.air', VALID_AIR);
        const destDir = path.join(tmpDir, 'out3');

        await generateAction(airFile, { destination: destDir });

        const data = JSON.parse(fs.readFileSync(path.join(destDir, 'gen-valid3.json'), 'utf-8'));
        expect(data.airfieldName).toBe('TestAirfield');
        expect(data.aircraftTypes).toHaveLength(1);
        expect(data.aircraftTypes[0].name).toBe('Cessna');
        expect(data.aircraftTypes[0].wingspan).toBe(11);
    });
});

// ---------------------------------------------------------------------------
// Tests — model with validation errors
// ---------------------------------------------------------------------------

describe('generateAction — invalid .air file', () => {
    test('calls process.exit(1) when the model has severity-1 diagnostics', async () => {
        const airFile = writeAir('gen-error.air', INVALID_AIR);
        const destDir = path.join(tmpDir, 'out-err');

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
            throw new Error(`process.exit(${code})`);
        }) as any);

        await expect(generateAction(airFile, { destination: destDir })).rejects.toThrow('process.exit(1)');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    test('does not create a JSON file when the model has errors', async () => {
        const airFile = writeAir('gen-error2.air', INVALID_AIR);
        const destDir = path.join(tmpDir, 'out-err2');

        vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
            throw new Error(`process.exit(${code})`);
        }) as any);

        await expect(generateAction(airFile, { destination: destDir })).rejects.toThrow();

        const jsonPath = path.join(destDir, 'gen-error2.json');
        expect(fs.existsSync(jsonPath)).toBe(false);
    });
});
