import type { Model } from '../../language/out/generated/ast.js';
import { createAirfieldServices } from '../../language/out/airfield-module.js';
import { analyzeAndSchedule } from '../../simulator/out/engine.js';
import { extractAstNode } from './util.js';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';

export async function generateAction(fileName: string, opts: { destination?: string }): Promise<void> {
    const services = createAirfieldServices(NodeFileSystem).Airfield;

    const model = await extractAstNode<Model>(fileName, services);

    const document = model.$document;

    if (!document) {
        console.error(chalk.red(`Could not load document: ${fileName}`));
        process.exit(1);
    }

    // Run validations — only exit on errors (severity 1); warnings and hints are non-blocking
    const validationErrors = (document.diagnostics ?? []).filter(e => e.severity === 1);
    if (validationErrors.length > 0) {
        console.error(chalk.red('Validation errors:'));
        for (const error of validationErrors) {
            console.error(chalk.red(`  Line ${error.range.start.line + 1}: ${error.message}`));
        }
        process.exit(1);
    }

    // Single source of truth: analyzeAndSchedule runs the scheduler internally when needed
    console.log(chalk.blue('\nRunning analysis...'));
    const analysisResult = analyzeAndSchedule(model);

    // Report auto-scheduling results from the export model
    const autoSchedule = analysisResult.exportModel.autoSchedule;
    if (autoSchedule) {
        if (autoSchedule.scheduled.length > 0) {
            console.log(chalk.green(`\n✓ Successfully scheduled ${autoSchedule.scheduled.length} aircraft:`));
            for (const sched of autoSchedule.scheduled) {
                const bayNames = sched.bays.join(', ') || 'N/A';
                console.log(chalk.cyan(
                    `  ${sched.aircraft} → ${sched.hangar} bays [${bayNames}] from ${sched.start} to ${sched.end}`
                ));
            }
        }
        if (autoSchedule.unscheduled.length > 0) {
            console.log(chalk.yellow(`\n⚠ Could not schedule ${autoSchedule.unscheduled.length} aircraft:`));
            for (const unsched of autoSchedule.unscheduled) {
                console.log(chalk.yellow(
                    `  ${unsched.aircraft} - ${unsched.reasonRuleId}`
                ));
            }
        }
    }

    if (analysisResult.report.summary.totalViolations > 0) {
        console.error(chalk.red(`\nFound ${analysisResult.report.summary.totalViolations} violation(s):`));
        for (const violation of analysisResult.report.violations) {
            console.error(chalk.red(
                `  [${violation.ruleId}] ${violation.message}`
            ));
        }
    } else {
        console.log(chalk.green('\n✓ No violations detected'));
    }

    const conflicts = analysisResult.exportModel.inductions.filter(i => i.conflicts.length > 0);
    if (conflicts.length > 0) {
        console.log(chalk.yellow(`\n⚠ ${conflicts.length} induction(s) have conflicts`));
    }

    const generatedFilePath = generateJson(model, analysisResult, fileName, opts.destination);
    console.log(chalk.green(`\nJSON generated successfully: ${generatedFilePath}`));
}

function generateJson(model: Model, analysisResult: ReturnType<typeof analyzeAndSchedule>, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.json`;

    const autoSchedule = analysisResult.exportModel.autoSchedule;

    const output = {
        schemaVersion: analysisResult.exportModel.schemaVersion,
        airfieldName: model.name,
        clearanceEnvelopes: model.clearanceEnvelopes.map(c => ({
            name: c.name,
            lateralMargin: c.lateralMargin,
            longitudinalMargin: c.longitudinalMargin,
            verticalMargin: c.verticalMargin
        })),
        aircraftTypes: model.aircraftTypes.map(ac => ({
            name: ac.name,
            wingspan: ac.wingspan,
            length: ac.length,
            height: ac.height,
            tailHeight: ac.tailHeight,
            clearance: ac.clearance?.ref?.name
        })),
        hangars: model.hangars.map(h => ({
            name: h.name,
            doors: h.doors.map(d => ({
                name: d.name,
                width: d.width,
                height: d.height
            })),
            grid: {
                rows: h.grid.rows,
                cols: h.grid.cols,
                adjacencyMode: h.grid.adjacency ?? 4
            },
            bays: h.grid.bays.map(bay => ({
                name: bay.name,
                width: bay.width,
                depth: bay.depth,
                height: bay.height,
                traversable: bay.traversable ?? false,
                adjacent: bay.adjacent.map(a => a.ref?.name ?? 'unknown')
            }))
        })),
        manualInductions: model.inductions.map(ind => ({
            id: ind.id,
            aircraftName: ind.aircraft?.ref?.name ?? 'unknown',
            hangar: ind.hangar?.ref?.name ?? 'unknown',
            door: ind.door?.ref?.name,
            clearance: ind.clearance?.ref?.name,
            bays: ind.bays.map(b => b.ref?.name ?? 'unknown'),
            start: ind.start,
            end: ind.end
        })),
        autoScheduling: autoSchedule ? {
            requested: model.autoInductions.length,
            scheduled: autoSchedule.scheduled.map(s => ({
                id: s.id,
                aircraftName: s.aircraft,
                hangarName: s.hangar,
                door: s.door,
                bays: s.bays,
                start: s.start,
                end: s.end
            })),
            unscheduled: autoSchedule.unscheduled.map(u => ({
                id: u.id,
                aircraftName: u.aircraft,
                reasonRuleId: u.reasonRuleId
            }))
        } : null,
        analysis: {
            valid: analysisResult.report.summary.totalViolations === 0,
            violationCount: analysisResult.report.summary.totalViolations,
            violations: analysisResult.report.violations,
            exportModel: analysisResult.exportModel
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
