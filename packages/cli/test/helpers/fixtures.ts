/**
 * Shared mock helpers for CLI package tests.
 *
 * These helpers produce minimal structural mocks of Langium objects so that
 * tests can exercise `generator.ts` and `util.ts` without a real Langium
 * runtime or file-system I/O.
 *
 * Intended for use in files that mock out Langium via:
 *
 *   vi.mock('../../language/out/airfield-module.js', () => ({
 *     createAirfieldServices: vi.fn(() => ({ Airfield: mockServices() })),
 *   }));
 */

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// LangiumDocument mock
// ---------------------------------------------------------------------------

/**
 * Returns a minimal `LangiumDocument`-like object.
 *
 * @param dslCode  The source text the document should report (default: empty string).
 * @param diagnostics  Array of diagnostic objects attached to the document.
 *   Each diagnostic should have at least `{ severity: number, message: string }`.
 *   Severity 1 = error (triggers process.exit in util.ts).
 *   Severity 2 = warning (ignored by util.ts).
 */
export function mockLangiumDocument(
  dslCode = '',
  diagnostics: Array<{ severity: number; message: string; range?: unknown }> = [],
) {
  return {
    diagnostics,
    textDocument: {
      getText: vi.fn(() => dslCode),
    },
    parseResult: {
      value: null,
      parserErrors: [],
    },
    uri: { toString: () => 'mock://document.air' },
  };
}

// ---------------------------------------------------------------------------
// Langium services mock
// ---------------------------------------------------------------------------

/**
 * Returns a minimal mock of the `AirfieldServices` object returned by
 * `createAirfieldServices().Airfield`.
 *
 * All async methods return resolved promises; callers can override individual
 * methods with `vi.mocked(services.X).mockResolvedValue(...)`.
 */
export function mockServices() {
  return {
    parser: {
      LangiumParser: {
        parse: vi.fn().mockReturnValue({ value: null, parserErrors: [] }),
      },
    },
    validation: {
      DocumentValidator: {
        validateDocument: vi.fn().mockResolvedValue([]),
      },
    },
    shared: {
      workspace: {
        LangiumDocumentFactory: {
          fromString: vi.fn().mockReturnValue(mockLangiumDocument()),
        },
        DocumentBuilder: {
          build: vi.fn().mockResolvedValue(undefined),
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// AST model mock
// ---------------------------------------------------------------------------

/**
 * Returns a minimal airfield AST node (the top-level `Model` from the Langium
 * grammar). All arrays are empty by default; pass `overrides` to customise.
 *
 * @param document  The mock LangiumDocument to attach as `$document`.
 *   Defaults to a document with no diagnostics.
 */
export function mockAirfieldModel(
  document?: ReturnType<typeof mockLangiumDocument>,
  overrides: Record<string, unknown> = {},
) {
  return {
    $type: 'AirfieldModel',
    name: 'MockAirfield',
    $document: document ?? mockLangiumDocument(),
    aircraftTypes: [],
    hangars: [],
    inductions: [],
    autoInductions: [],
    clearanceEnvelopes: [],
    accessPaths: [],
    ...overrides,
  } as any;
}
