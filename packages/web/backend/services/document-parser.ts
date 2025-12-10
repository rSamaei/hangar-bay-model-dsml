import { URI } from 'langium';
import { getServices } from './langium-services.js';
import type { Model } from '../../../language/out/generated/ast.js';
import type { LangiumDocument } from 'langium';

export interface ParsedDocument {
  model: Model;
  document: LangiumDocument;
}

export async function parseCode(code: string): Promise<ParsedDocument> {
  const services = getServices();
  
  // Create document with .air extension for service registry
  const document = services.shared.workspace.LangiumDocumentFactory.fromString(
    code,
    URI.parse('file:///temp.air')
  );
  
  // Build document to resolve references
  await services.shared.workspace.DocumentBuilder.build([document]);
  
  const model = document.parseResult?.value as Model;
  
  if (!model) {
    throw new Error('Failed to parse document');
  }
  
  return { model, document };
}