import type { Model } from '../../language/out/generated/ast.js';
import { createAirfieldServices } from '../../language/out/airfield-module.js';
import { analyzeAndSchedule } from '../../simulator/out/engine.js';
import { AutoScheduler } from '../../simulator/out/scheduler.js';
import { extractAstNode } from './util.js';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';

export async function generateAction(fileName: string, opts: { destination?: string }): Promise<void> {
    const services = createAirfieldServices(NodeFileSystem).Airfield;
    
    const model = await extractAstNode<Model>(fileName, services);
    
    // Get document from the model's $document property
    const document = model.$document;
    
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

    let scheduleResult = null;
    
    // Run auto-scheduler
    if (model.autoInductions.length > 0) {
        console.log(chalk.blue('\nRunning auto-scheduler...'));
        const scheduler = new AutoScheduler();
        scheduleResult = scheduler.schedule(model);
        
        if (scheduleResult.scheduled.length > 0) {
            console.log(chalk.green(`\n✓ Successfully scheduled ${scheduleResult.scheduled.length} aircraft:`));
            for (const sched of scheduleResult.scheduled) {
                const schedAny = sched as any;
                const bayNames = schedAny.bays?.map((b: any) => b.name).join(', ') || 'N/A';
                console.log(chalk.cyan(
                    `  ${schedAny.aircraft.name} → ${schedAny.hangar.name} ` +
                    `bays [${bayNames}] from ${schedAny.start} to ${schedAny.end || schedAny.endTime}`
                ));
            }
        }
        
        if (scheduleResult.unscheduled.length > 0) {
            console.log(chalk.yellow(`\n⚠ Could not schedule ${scheduleResult.unscheduled.length} aircraft:`));
            for (const unsched of scheduleResult.unscheduled) {
                const aircraft = unsched.aircraft?.ref;
                const aircraftName = aircraft?.name ?? 'unknown';
                const wingspan = aircraft?.wingspan ?? 0;
                console.log(chalk.yellow(
                    `  ${aircraftName} (wingspan: ${wingspan}m, duration: ${unsched.duration}) - ` +
                    `No suitable hangar/time slot found`
                ));
            }
        }
    }

    // Run analysis (validation + export model generation)
    console.log(chalk.blue('\nRunning analysis...'));
    const analysisResult = analyzeAndSchedule(model);

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

    // Print conflict summary
    const conflicts = analysisResult.exportModel.inductions.filter(i => i.conflicts.length > 0);
    if (conflicts.length > 0) {
        console.log(chalk.yellow(`\n⚠ ${conflicts.length} induction(s) have conflicts`));
    }

    const generatedFilePath = generateJson(model, analysisResult, scheduleResult, fileName, opts.destination);
    console.log(chalk.green(`\nJSON generated successfully: ${generatedFilePath}`));
}

function generateJson(model: Model, analysisResult: any, scheduleResult: any, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.json`;

    const output = {
        airfieldName: model.name,
        aircraftTypes: model.aircraftTypes.map(ac => ({
            name: ac.name,
            wingspan: ac.wingspan,
            length: ac.length,
            height: ac.height,
            tailHeight: ac.tailHeight
        })),
        hangars: model.hangars.map(h => ({
            name: h.name,
            doors: h.doors.map(d => ({
                name: d.name,
                width: d.width,
                height: d.height
            })),
            bays: h.grid.bays.map(bay => ({
                name: bay.name,
                width: bay.width,
                depth: bay.depth,
                height: bay.height,
                adjacent: bay.adjacent.map(a => a.ref?.name ?? 'unknown')
            }))
        })),
        manualInductions: model.inductions.map(ind => ({
            aircraftName: ind.aircraft?.ref?.name ?? 'unknown',
            bays: ind.bays.map(b => b.ref?.name ?? 'unknown'),
            start: ind.start,
            end: ind.end
        })),
        autoScheduling: scheduleResult ? {
            requested: model.autoInductions.length,
            scheduled: scheduleResult.scheduled.map((s: any) => ({
                aircraftName: s.aircraft,
                hangarName: s.hangar,
                bays: s.bays || [],
                start: s.start,
                end: s.end
            })),
            unscheduled: scheduleResult.unscheduled.map((u: any) => ({
                aircraftName: u.aircraft?.ref?.name ?? 'unknown',
                duration: u.duration,
                wingspan: u.aircraft?.ref?.wingspan
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
