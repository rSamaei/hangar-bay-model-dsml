import type { Model } from '../../language/out/generated/ast.js';
import type { ValidationReport } from './types/validation.js';
import type { ExportModel, HangarStatistic, GlobalSimulationStatistics } from './types/export.js';
import type { SimulationResult, SimulationEventRecord, SimulationStats, SimulationPlacement } from './simulation/types.js';
import { buildValidationReport } from './builders/validation-report.js';
import { buildExportModel } from './builders/export-model.js';
import { DiscreteEventSimulator } from './simulation/simulation-loop.js';
import { toScheduleResult } from './simulation/adapter.js';

export interface AnalysisResult {
    report: ValidationReport;
    exportModel: ExportModel;
    /** Optional simulation event log — present when auto-inductions were simulated. */
    simulationLog?: SimulationEventRecord[];
    /** Optional aggregate simulation statistics. */
    simulationStats?: SimulationStats;
}

/**
 * Single entry point for complete model analysis
 *
 * This function:
 * 1. Validates the model (SFR11-SFR16)
 * 2. Attempts to schedule auto-inductions via discrete-event simulation (if any)
 * 3. Returns comprehensive analysis with all derived properties
 *
 * The webapp should call ONLY this function.
 */
export function analyseAndSchedule(model: Model): AnalysisResult {
    // Step 1: Run simulation if there are auto-inductions
    let scheduleResult = undefined;
    let simResult: SimulationResult | undefined;
    if (model.autoInductions.length > 0) {
        const simulator = new DiscreteEventSimulator(model);
        simResult = simulator.run();

        // Convert SimulationResult → legacy ScheduleResult for existing builders
        scheduleResult = toScheduleResult(simResult, model.autoInductions);

        if (scheduleResult.unscheduled.length > 0) {
            for (const [id, reasons] of scheduleResult.rejectionReasons.entries()) {
                console.log(`  - ${id}: ${reasons.map(r => r.ruleId).join(', ')}`);
            }
        }
    }

    // Step 2: Build validation report (includes manual + scheduled autos + unscheduled failures)
    const report = buildValidationReport(model, scheduleResult);

    // Step 3: Build export model with all derived properties
    const exportModel = buildExportModel(model, scheduleResult);

    // Step 4: Enrich export model with simulation data (wait times, delays, summary)
    if (simResult) {
        enrichExportModelWithSimulation(exportModel, simResult, model);
    }

    const result: AnalysisResult = {
        report,
        exportModel,
    };

    // Attach simulation metadata when available
    if (simResult) {
        result.simulationLog = simResult.eventLog;
        result.simulationStats = simResult.statistics;
    }

    return result;
}

// American-spelling alias for public API consistency
export { analyseAndSchedule as analyzeAndSchedule };

// ---------------------------------------------------------------------------
// Simulation enrichment
// ---------------------------------------------------------------------------

/**
 * Post-process the ExportModel to annotate auto-scheduled inductions with
 * simulation-specific data and attach statistics.
 */
function enrichExportModelWithSimulation(
    exportModel: ExportModel,
    simResult: SimulationResult,
    model: Model,
): void {
    // Build lookup: inductionId → SimulationPlacement
    const placementById = new Map(
        simResult.scheduledInductions.map(p => [p.inductionId, p]),
    );

    const MS_PER_MIN = 60_000;

    // Helper to annotate a single exported induction with simulation data
    function annotate(exported: ExportModel['inductions'][0]): void {
        const p = placementById.get(exported.id);
        if (!p) return;
        exported.requestedStart = new Date(p.requestedStart).toISOString();
        exported.actualStart = new Date(p.actualStart).toISOString();
        exported.scheduledEnd = new Date(p.maintenanceEnd).toISOString();
        exported.actualEnd = new Date(p.actualEnd).toISOString();
        exported.waitTime = Math.round(p.waitTime / MS_PER_MIN * 100) / 100;
        exported.departureDelay = Math.round(p.departureDelay / MS_PER_MIN * 100) / 100;
        exported.waitReason = p.waitReason;
        exported.departureDelayReason = p.departureDelayReason;
        exported.placementAttempts = p.placementAttempts;
        exported.queuePosition = p.queuePosition;
    }

    // Annotate auto-scheduled inductions in the export model
    if (exportModel.autoSchedule) {
        for (const exported of exportModel.autoSchedule.scheduled) {
            annotate(exported);
        }
    }

    // Also annotate the merged `inductions` array (auto entries appear there too)
    for (const exported of exportModel.inductions) {
        if (exported.kind !== 'auto') continue;
        annotate(exported);
    }

    // Attach simulation summary
    const stats = simResult.statistics;
    exportModel.simulation = {
        simulatedDuration: stats.simulatedDuration,
        totalEvents: stats.totalEvents,
        placedCount: stats.placedCount,
        failedCount: stats.failedCount,
        maxQueueDepth: stats.maxQueueDepth,
        totalWaitTime: stats.totalWaitTime,
        totalDepartureDelay: stats.totalDepartureDelay,
        peakOccupancy: stats.peakOccupancy,
    };

    // Build per-hangar statistics
    exportModel.hangarStatistics = buildHangarStatistics(
        simResult, model, placementById,
    );

    // Build global simulation statistics
    exportModel.simulationStatistics = buildGlobalStatistics(stats, simResult);
}

// ---------------------------------------------------------------------------
// Per-hangar statistics
// ---------------------------------------------------------------------------

function buildHangarStatistics(
    simResult: SimulationResult,
    model: Model,
    placementById: Map<string, SimulationPlacement>,
): Record<string, HangarStatistic> {
    const MS_PER_MIN = 60_000;
    const result: Record<string, HangarStatistic> = {};

    // Initialize all hangars
    for (const hangar of model.hangars) {
        result[hangar.name] = {
            totalBays: hangar.grid.bays.length,
            peakOccupancy: 0,
            peakOccupancyTime: '',
            avgUtilisation: 0,
            totalWaitTime: 0,
            totalDepartureDelay: 0,
            inductionsServed: 0,
            queuedAtPeak: 0,
        };
    }

    // Aggregate from placements
    for (const p of simResult.scheduledInductions) {
        const hs = result[p.hangarName];
        if (!hs) continue;
        hs.inductionsServed++;
        hs.totalWaitTime += Math.round(p.waitTime / MS_PER_MIN * 100) / 100;
        hs.totalDepartureDelay += Math.round(p.departureDelay / MS_PER_MIN * 100) / 100;
    }

    // Also count manual inductions
    for (const ind of model.inductions) {
        const hangarName = ind.hangar?.ref?.name;
        if (hangarName && result[hangarName]) {
            result[hangarName].inductionsServed++;
        }
    }

    // Compute peak occupancy per hangar from the event log timeline
    // We build a timeline of bay occupancy events per hangar
    type OccEvent = { time: number; delta: number };
    const hangarOccEvents = new Map<string, OccEvent[]>();

    // Manual inductions
    for (const ind of model.inductions) {
        const hangarName = ind.hangar?.ref?.name;
        if (!hangarName) continue;
        const bayCount = ind.bays.filter(b => b.ref).length;
        const start = new Date(ind.start).getTime();
        const end = new Date(ind.end).getTime();
        const events = hangarOccEvents.get(hangarName) ?? [];
        events.push({ time: start, delta: bayCount });
        events.push({ time: end, delta: -bayCount });
        hangarOccEvents.set(hangarName, events);
    }

    // Auto placements
    for (const p of simResult.scheduledInductions) {
        const events = hangarOccEvents.get(p.hangarName) ?? [];
        events.push({ time: p.actualStart, delta: p.bayNames.length });
        events.push({ time: p.actualEnd, delta: -p.bayNames.length });
        hangarOccEvents.set(p.hangarName, events);
    }

    // Sweep-line for each hangar
    for (const [hangarName, events] of hangarOccEvents) {
        const hs = result[hangarName];
        if (!hs) continue;
        events.sort((a, b) => a.time - b.time || a.delta - b.delta);
        let current = 0;
        let peak = 0;
        let peakTime = 0;
        for (const ev of events) {
            current += ev.delta;
            if (current > peak) {
                peak = current;
                peakTime = ev.time;
            }
        }
        hs.peakOccupancy = peak;
        hs.peakOccupancyTime = peakTime > 0 ? new Date(peakTime).toISOString() : '';

        // Compute avg utilisation if we have a simulation window
        if (hs.totalBays > 0 && events.length > 1) {
            const windowStart = events[0].time;
            const windowEnd = events[events.length - 1].time;
            const windowLen = windowEnd - windowStart;
            if (windowLen > 0) {
                let bayTimeMs = 0;
                let prevTime = windowStart;
                let occ = 0;
                for (const ev of events) {
                    bayTimeMs += occ * (ev.time - prevTime);
                    prevTime = ev.time;
                    occ += ev.delta;
                }
                hs.avgUtilisation = Math.round((bayTimeMs / (hs.totalBays * windowLen)) * 1000) / 1000;
            }
        }
    }

    // Queue depth per hangar — approximate from event log
    const hangarQueuePeak = new Map<string, number>();
    const hangarQueueCounts = new Map<string, number>();
    for (const evt of simResult.eventLog) {
        if (evt.kind === 'ARRIVAL_QUEUED' && evt.hangar) {
            const cur = (hangarQueueCounts.get(evt.hangar) ?? 0) + 1;
            hangarQueueCounts.set(evt.hangar, cur);
            const prev = hangarQueuePeak.get(evt.hangar) ?? 0;
            if (cur > prev) hangarQueuePeak.set(evt.hangar, cur);
        } else if ((evt.kind === 'ARRIVAL_PLACED' || evt.kind === 'RETRY_PLACED') && evt.hangar) {
            const cur = hangarQueueCounts.get(evt.hangar) ?? 0;
            if (cur > 0) hangarQueueCounts.set(evt.hangar, cur - 1);
        }
    }
    for (const [hangarName, peak] of hangarQueuePeak) {
        if (result[hangarName]) {
            result[hangarName].queuedAtPeak = peak;
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Global simulation statistics
// ---------------------------------------------------------------------------

function buildGlobalStatistics(
    stats: SimulationStats,
    simResult: SimulationResult,
): GlobalSimulationStatistics {
    const MS_PER_MIN = 60_000;
    const placedCount = stats.placedCount;

    return {
        simulationWindow: {
            start: stats.windowStart > 0 ? new Date(stats.windowStart).toISOString() : '',
            end: stats.windowEnd > 0 ? new Date(stats.windowEnd).toISOString() : '',
        },
        totalAircraftProcessed: placedCount + stats.failedCount,
        totalWaitTime: Math.round(stats.totalWaitTime / MS_PER_MIN * 100) / 100,
        totalDepartureDelay: Math.round(stats.totalDepartureDelay / MS_PER_MIN * 100) / 100,
        avgWaitTime: placedCount > 0
            ? Math.round((stats.totalWaitTime / placedCount) / MS_PER_MIN * 100) / 100
            : 0,
        maxWaitTime: Math.round(stats.maxWaitTime / MS_PER_MIN * 100) / 100,
        maxWaitInduction: stats.maxWaitInduction,
        failedInductions: stats.failedCount,
        maxQueueDepth: stats.maxQueueDepth,
        maxQueueTime: stats.maxQueueDepthTime > 0
            ? new Date(stats.maxQueueDepthTime).toISOString()
            : '',
    };
}
