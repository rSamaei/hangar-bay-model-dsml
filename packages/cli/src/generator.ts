import type { Model } from '../../language/out/generated/ast.js';
import { createAirfieldServices } from '../../language/out/airfield-module.js';
import { simulate } from '../../simulator/out/engine.js';
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

    // Run simulation
    console.log(chalk.blue('\nRunning simulation...'));
    const simResult = simulate(model);
    
    if (simResult.conflicts.length > 0) {
        console.error(chalk.red(`\nFound ${simResult.conflicts.length} conflict(s):`));
        for (const conflict of simResult.conflicts) {
            const aircraft = conflict.induction.aircraft?.ref?.name ?? 'unknown';
            console.error(chalk.red(
                `  Time ${conflict.time}: ${aircraft} in ${conflict.hangarName} ` +
                `bays ${conflict.fromBay}..${conflict.toBay} - Bay already occupied`
            ));
        }
    } else {
        console.log(chalk.green('\n✓ No conflicts detected'));
    }

    // Print occupancy stats
    console.log(chalk.blue('\nMax bay occupancy per hangar:'));
    for (const [hangarName, maxOccupancy] of simResult.maxOccupancyPerHangar.entries()) {
        console.log(chalk.cyan(`  ${hangarName}: ${maxOccupancy} bays`));
    }

    const generatedFilePath = generateJson(model, simResult, fileName, opts.destination);
    console.log(chalk.green(`\nJSON generated successfully: ${generatedFilePath}`));
}

function generateJson(model: Model, simResult: any, filePath: string, destination: string | undefined): string {
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
            start: ind.start,
            duration: ind.duration,
            bayCount: ind.toBay - ind.fromBay + 1,
            totalWidth: (ind.toBay - ind.fromBay + 1) * (ind.hangar?.ref?.bayWidth ?? 0)
        })),
        simulation: {
            valid: simResult.conflicts.length === 0,
            conflictCount: simResult.conflicts.length,
            conflicts: simResult.conflicts.map((c: any) => ({
                time: c.time,
                hangarName: c.hangarName,
                fromBay: c.fromBay,
                toBay: c.toBay,
                aircraft: c.induction.aircraft?.ref?.name ?? 'unknown'
            })),
            maxOccupancy: Object.fromEntries(simResult.maxOccupancyPerHangar),
            timeline: simResult.timeline
        }
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
