import type { Model } from 'airfield-language';
import { CompositeGeneratorNode, NL, toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './util.js';

export function generateJavaScript(model: Model, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.js`;

    const fileNode = new CompositeGeneratorNode();
    fileNode.append(
        `"use strict";`,
        NL,
        NL,
        `// Generated from: ${filePath}`,
        NL,
        `console.log('Airfield: ${model.name}');`,
        NL,
        `console.log('Aircraft Types: ${model.aircraftTypes.length}');`,
        NL,
        `console.log('Hangars: ${model.hangars.length}');`,
        NL,
        `console.log('Inductions: ${model.inductions.length}');`,
        NL
    );

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}
