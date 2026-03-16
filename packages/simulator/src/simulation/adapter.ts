/**
 * Backwards-compatibility adapter.
 *
 * Converts the new SimulationResult into the existing ScheduleResult shape
 * so that buildValidationReport, buildExportModel, the route handler, and
 * the frontend all continue to work without changes.
 *
 * Design reference: SIMULATION_DESIGN.md §12
 */

import type { AutoInduction as AstAutoInduction } from '../../../language/out/generated/ast.js';
import type { ScheduledInduction } from '../types/simulation.js';
import type { ScheduleResult, RejectionReason } from '../scheduler.js';
import type { SimulationResult } from './types.js';

/**
 * Convert a SimulationResult into the legacy ScheduleResult shape.
 *
 * - `scheduled` entries use `maintenanceEnd` (not `actualEnd`) as `end`,
 *   consistent with the existing convention where `ExportedInduction.end`
 *   represents "when maintenance finishes" (the DSL duration), not the
 *   physical departure time.
 *
 * - `rejectionReasons` are derived from the accumulated PlacementRejections
 *   on each failed induction.
 *
 * @param simResult - The output of SimulationEngine.simulate()
 * @param astAutoInductions - The original Langium AST AutoInduction nodes,
 *   needed to populate `unscheduled` with the original objects (ScheduleResult
 *   stores the AST references, not just IDs).
 */
export function toScheduleResult(
    simResult: SimulationResult,
    astAutoInductions: AstAutoInduction[],
): ScheduleResult {
    const autoById = new Map<string, AstAutoInduction>();
    for (const auto of astAutoInductions) {
        if (auto.id) autoById.set(auto.id, auto);
    }

    const scheduled: ScheduledInduction[] = simResult.scheduledInductions.map(p => ({
        id:       p.inductionId,
        aircraft: p.aircraftName,
        hangar:   p.hangarName,
        bays:     p.bayNames,
        door:     p.doorName,
        start:    new Date(p.actualStart).toISOString(),
        end:      new Date(p.maintenanceEnd).toISOString(),
    }));

    const unscheduled: AstAutoInduction[] = simResult.failedInductions
        .map(f => autoById.get(f.inductionId))
        .filter((a): a is AstAutoInduction => a !== undefined);

    const rejectionReasons = new Map<string, RejectionReason[]>();
    for (const f of simResult.failedInductions) {
        // Build time window evidence from the simulation's requestedArrival / deadline
        const timeEvidence: Record<string, unknown> = {};
        if (f.requestedArrival) {
            timeEvidence.notBefore = new Date(f.requestedArrival).toISOString();
            timeEvidence.requestedStart = new Date(f.requestedArrival).toISOString();
        }
        if (f.deadline !== null && f.deadline !== undefined) {
            timeEvidence.notAfter = new Date(f.deadline).toISOString();
        } else {
            // Use simulation window end so the bar spans to the end of the timeline
            timeEvidence.notAfter = new Date(simResult.statistics.windowEnd).toISOString();
        }

        const reasons: RejectionReason[] = f.rejections.map(r => ({
            ruleId:   r.ruleId,
            message:  r.message,
            evidence: { ...r.evidence, ...timeEvidence },
        }));
        // If no specific rejections were recorded, emit a generic one from the reason code
        if (reasons.length === 0) {
            reasons.push({
                ruleId:   f.reason,
                message:  `Simulation: ${f.reason}`,
                evidence: { lastAttemptTime: f.lastAttemptTime, ...timeEvidence },
            });
        }
        rejectionReasons.set(f.inductionId, reasons);
    }

    return { scheduled, unscheduled, rejectionReasons };
}
