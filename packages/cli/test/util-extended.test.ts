/**
 * Extended unit tests for packages/cli/src/util.ts
 *
 * Covers lines 10–12 and 15–17 — the two early-exit guards in extractDocument:
 *   - Wrong file extension  → logs a warning, calls process.exit(1)
 *   - File does not exist   → logs an error,   calls process.exit(1)
 *
 * Uses a minimal mock for LangiumCoreServices so we never spin up the
 * Langium runtime; these paths bail out before any Langium call is made.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LangiumCoreServices } from 'langium';
import { extractDocument } from '../src/util.js';

// ---------------------------------------------------------------------------
// Minimal services mock — only LanguageMetaData is needed; everything else
// is unreachable because process.exit is called first.
// ---------------------------------------------------------------------------

const mockServices = {
    LanguageMetaData: { fileExtensions: ['.air'] },
} as unknown as LangiumCoreServices;

afterEach(() => {
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Wrong file extension
// ---------------------------------------------------------------------------

describe('extractDocument — wrong file extension', () => {
    it('calls process.exit(1) and logs a warning when the extension is not .air', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
            throw new Error('process.exit called');
        }) as any);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(
            extractDocument('/some/path/file.txt', mockServices)
        ).rejects.toThrow('process.exit called');

        expect(exitSpy).toHaveBeenCalledWith(1);
        // The logged message should mention the allowed extensions
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('.air')
        );
    });
});

// ---------------------------------------------------------------------------
// File does not exist
// ---------------------------------------------------------------------------

describe('extractDocument — file does not exist', () => {
    it('calls process.exit(1) and logs an error when the file is missing', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
            throw new Error('process.exit called');
        }) as any);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Extension is correct (.air), but the file definitely does not exist
        await expect(
            extractDocument('/nonexistent/path/missing.air', mockServices)
        ).rejects.toThrow('process.exit called');

        expect(exitSpy).toHaveBeenCalledWith(1);
        // The logged message should mention the file name
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('missing.air')
        );
    });
});
