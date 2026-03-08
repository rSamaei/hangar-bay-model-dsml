import type { Model } from '../../language/out/generated/ast.js';
import type { ValidationReport } from './types/validation.js';
import type { ExportModel } from './types/export.js';
import { buildValidationReport } from './builders/validation-report.js';
import { buildExportModel } from './builders/export-model.js';
import { AutoScheduler } from './scheduler.js';

export interface AnalysisResult {
    report: ValidationReport;
    exportModel: ExportModel;
}

/**
 * Single entry point for complete model analysis
 * 
 * This function:
 * 1. Validates the model (SFR11-SFR16)
 * 2. Attempts to schedule auto-inductions (if any)
 * 3. Returns comprehensive analysis with all derived properties
 * 
 * The webapp should call ONLY this function.
 */
export function analyseAndSchedule(model: Model): AnalysisResult {
    console.log(`[analyseAndSchedule] Starting analysis for airfield: ${model.name}`);
    console.log(`[analyseAndSchedule] Manual inductions: ${model.inductions.length}`);
    console.log(`[analyseAndSchedule] Auto inductions: ${model.autoInductions.length}`);
    
    // Step 1: Run scheduler if there are auto-inductions
    let scheduleResult = undefined;
    if (model.autoInductions.length > 0) {
        console.log('[analyseAndSchedule] Running auto-scheduler...');
        const scheduler = new AutoScheduler();
        scheduleResult = scheduler.schedule(model);
        
        console.log(`[analyseAndSchedule] Scheduled: ${scheduleResult.scheduled.length}`);
        console.log(`[analyseAndSchedule] Unscheduled: ${scheduleResult.unscheduled.length}`);
        
        if (scheduleResult.unscheduled.length > 0) {
            console.log('[analyseAndSchedule] Unscheduled reasons:');
            for (const [id, reasons] of scheduleResult.rejectionReasons.entries()) {
                console.log(`  - ${id}: ${reasons.map(r => r.ruleId).join(', ')}`);
            }
        }
    }
    
    // Step 2: Build validation report (includes manual + scheduled autos + unscheduled failures)
    console.log('[analyseAndSchedule] Building validation report...');
    const report = buildValidationReport(model, scheduleResult);
    console.log(`[analyseAndSchedule] Total violations: ${report.summary.totalViolations}`);
    console.log(`[analyseAndSchedule] Errors: ${report.summary.bySeverity.errors}, Warnings: ${report.summary.bySeverity.warnings}`);
    
    // Step 3: Build export model with all derived properties
    console.log('[analyseAndSchedule] Building export model...');
    const exportModel = buildExportModel(model, scheduleResult);
    console.log(`[analyseAndSchedule] Total inductions in export: ${exportModel.inductions.length}`);
    
    if (exportModel.autoSchedule) {
        console.log(`[analyseAndSchedule] Auto-schedule: ${exportModel.autoSchedule.scheduled.length} scheduled, ${exportModel.autoSchedule.unscheduled.length} unscheduled`);
    }
    
    console.log('[analyseAndSchedule] Analysis complete');
    
    return {
        report,
        exportModel
    };
}

// American-spelling alias for public API consistency
export { analyseAndSchedule as analyzeAndSchedule };
