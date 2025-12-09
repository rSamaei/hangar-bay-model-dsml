import { Command } from 'commander';
import { AirfieldLanguageMetaData } from '../../language/out/generated/module.js';
import { generateAction } from './generator.js';
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const packagePath = path.resolve(__dirname, '..', 'package.json');
const packageContent = await fs.readFile(packagePath, 'utf-8');

export default function(): void {
    const program = new Command();

    program.version(JSON.parse(packageContent).version);

    const fileExtensions = AirfieldLanguageMetaData.fileExtensions.join(', ');
    program
        .command('generate')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('generates JSON output from an Airfield model')
        .action(generateAction);

    program.parse(process.argv);
}
