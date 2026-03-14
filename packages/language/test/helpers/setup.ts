import { beforeAll } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import type { Model } from 'airfield-language';
import { createAirfieldServices } from 'airfield-language';

export let services: ReturnType<typeof createAirfieldServices>;
export let parse: ReturnType<typeof parseHelper<Model>>;

export function setupServices(): void {
    beforeAll(async () => {
        services = createAirfieldServices(EmptyFileSystem);
        parse = parseHelper<Model>(services.Airfield);
    });
}

/** Run Langium validation and return all diagnostics for the document. */
export async function validate(doc: LangiumDocument): Promise<Array<{ message: unknown; severity?: number }>> {
    return services.Airfield.validation.DocumentValidator.validateDocument(doc);
}

/** True if any diagnostic message contains the given rule-code string. */
export function hasDiag(diags: Array<{ message: unknown }>, code: string): boolean {
    return diags.some(d => typeof d.message === 'string' && d.message.includes(code));
}

/** Returns true if any diagnostic matches the code AND has the given numeric severity. */
export function hasDiagWithSeverity(diags: any[], code: string, severity: number): boolean {
    return diags.some(
        (d: any) => typeof d.message === 'string' && d.message.includes(code) && d.severity === severity
    );
}
