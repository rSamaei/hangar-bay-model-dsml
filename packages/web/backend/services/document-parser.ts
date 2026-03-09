import { URI } from 'langium';
import { getLangiumServices } from './langium-services.js';
import type { Model } from '../../../language/out/generated/ast.js';
import type { LangiumDocument } from 'langium';

export interface SerializedError {
  message: string;
  severity?: number;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface ParsedDocument {
  model: Model | null;
  document: LangiumDocument;
  parseErrors: SerializedError[];       // Lexer/parser errors - fatal
  validationDiagnostics: SerializedError[];  // Langium validation - non-fatal
  hasParseErrors: boolean;              // Only true for lexer/parser errors
}

export async function parseDocument(code: string): Promise<ParsedDocument> {
  const services = getLangiumServices();
  const document = services.shared.workspace.LangiumDocumentFactory.fromString(
    code,
    URI.file('/temp.air')
  );

  await services.shared.workspace.DocumentBuilder.build([document], {
    validation: true
  });

  const model = document.parseResult.value as Model;

  // Separate parse errors (fatal) from validation diagnostics (non-fatal)
  const parseErrors: SerializedError[] = [];
  const validationDiagnostics: SerializedError[] = [];

  // Lexer errors - fatal
  for (const err of document.parseResult.lexerErrors || []) {
    parseErrors.push({
      message: err.message,
      severity: 1, // error
      line: err.line,
      column: err.column
    });
  }

  // Parser errors - fatal
  for (const err of document.parseResult.parserErrors || []) {
    parseErrors.push({
      message: err.message,
      severity: 1, // error
      line: err.token?.startLine,
      column: err.token?.startColumn
    });
  }

  // Validation diagnostics - non-fatal (shown in validation report)
  for (const diag of document.diagnostics || []) {
    validationDiagnostics.push({
      message: diag.message,
      severity: diag.severity,
      line: diag.range?.start?.line !== undefined ? diag.range.start.line + 1 : undefined,
      column: diag.range?.start?.character,
      endLine: diag.range?.end?.line !== undefined ? diag.range.end.line + 1 : undefined,
      endColumn: diag.range?.end?.character
    });
  }

  // Only fail on parse errors, not validation diagnostics
  const hasParseErrors = parseErrors.length > 0 || !model;

  return {
    model: model || null,
    document,
    parseErrors,
    validationDiagnostics,
    hasParseErrors
  };
}