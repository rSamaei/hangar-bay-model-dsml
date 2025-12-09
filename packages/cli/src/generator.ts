import type { Model } from '../../language/out/generated/ast.js';
import { createAirfieldServices } from '../../language/out/airfield-module.js';
import { extractAstNode } from './util.js';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { URI } from 'langium';

export async function generateAction(fileName: string, opts: { destination?: string }): Promise<void> {
    const services = createAirfieldServices(NodeFileSystem).Airfield;
    
    const model = await extractAstNode<Model>(fileName, services);
    
    // Get document for validation errors
    const uri = URI.file(path.resolve(fileName));
    const document = services.shared.workspace.LangiumDocuments.getDocument(uri);
    
    if (!document) {
        console.error(chalk.red(`Could not load document: ${fileName}`));
        process.exit(1);
    }
    
    // Run validations
    const validationErrors = document.diagnostics ?? [];
    if (validationErrors.length > 0) {
        console.error(chalk.red('Validation errors:'));
        for (const error of validationErrors) {
            console.error(chalk.red(`  Line ${error.range.start.line + 1}: ${error.message}`));
        }
        process.exit(1);
    }

    const generatedFilePath = generateJson(model, fileName, opts.destination);
    console.log(chalk.green(`JSON generated successfully: ${generatedFilePath}`));
}

function generateJson(model: Model, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.json`;

    const output = {
        airfieldName: model.name,
        aircraftTypes: model.aircraftTypes.map(ac => ({
            name: ac.name,
            wingspan: ac.wingspan,
            length: ac.length,
            height: ac.height
        })),
        hangars: model.hangars.map(h => ({
            name: h.name,
            bays: h.bays,
            bayWidth: h.bayWidth,
            bayDepth: h.bayDepth,
            height: h.height
        })),
        inductions: model.inductions.map(ind => ({
            aircraftName: ind.aircraft?.ref?.name ?? 'unknown',
            hangarName: ind.hangar?.ref?.name ?? 'unknown',
            fromBay: ind.fromBay,
            toBay: ind.toBay,
            bayCount: ind.toBay - ind.fromBay + 1,
            totalWidth: (ind.toBay - ind.fromBay + 1) * (ind.hangar?.ref?.bayWidth ?? 0)
        }))
    };

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, JSON.stringify(output, null, 2));
    return generatedFilePath;
}

function extractDestinationAndName(filePath: string, destination: string | undefined): { destination: string, name: string } {
    const fileBaseName = path.basename(filePath, path.extname(filePath));
    const dirName = path.dirname(filePath);
    return {
        destination: destination ?? path.join(dirName, 'generated'),
        name: fileBaseName
    };
}
