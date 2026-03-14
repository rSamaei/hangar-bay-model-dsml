import type { Model, AutoInduction, HangarBay, Hangar, AircraftType, ClearanceEnvelope } from '../../language/out/generated/ast.js';
import type { ScheduledInduction } from './types/simulation.js';
import { findSuitableDoors } from './search/doors.js';
import { findSuitableBaySets } from './search/bay-sets.js';
import { calculateSearchWindow } from './search/time-window.js';
import { checkTimeOverlap } from './rules/time-overlap.js';

export interface ScheduleResult {
    scheduled: ScheduledInduction[];
    unscheduled: AutoInduction[];
    rejectionReasons: Map<string, RejectionReason[]>;
}

export interface RejectionReason {
    ruleId: string;
    message: string;
    evidence: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Rejection factories
// ---------------------------------------------------------------------------

function makeDoorRejection(hangarName: string, doorResult: ReturnType<typeof findSuitableDoors>): RejectionReason {
    return {
        ruleId: 'SFR11_DOOR_FIT',
        message: `No suitable doors in hangar ${hangarName}`,
        evidence: {
            hangar: hangarName,
            rejectedDoors: doorResult.rejections.map(r => ({
                doorName: r.evidence.doorName,
                violations: r.evidence.violations
            }))
        }
    };
}

function makeBayRejection(hangarName: string, bayResult: ReturnType<typeof findSuitableBaySets>): RejectionReason {
    return {
        ruleId: 'NO_SUITABLE_BAY_SET',
        message: `No suitable bay sets in hangar ${hangarName}`,
        evidence: {
            hangar: hangarName,
            baysRequired: bayResult.derivedProps.baysRequired,
            rejectedSets: bayResult.rejections.slice(0, 5).map(r => ({
                ruleId: r.ruleId,
                message: r.message,
                evidence: r.evidence
            }))
        }
    };
}

function makeConflictRejection(
    hangarName: string,
    bays: string[],
    start: Date,
    end: Date,
    conflicting: string[]
): RejectionReason {
    return {
        ruleId: 'SFR16_TIME_OVERLAP',
        message: `Time slot conflict in hangar ${hangarName}`,
        evidence: {
            hangar: hangarName,
            bays,
            requestedWindow: { start: start.toISOString(), end: end.toISOString() },
            conflictingInductions: conflicting
        }
    };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * Schedules auto-inductions using the engine's rule set for all decisions.
 * Does NOT duplicate feasibility logic.
 */
export class AutoScheduler {
    schedule(model: Model): ScheduleResult {
        const scheduled: ScheduledInduction[] = [];
        const scheduledById = new Map<string, ScheduledInduction>();
        const unscheduled: AutoInduction[] = [];
        const rejectionReasons = new Map<string, RejectionReason[]>();

        const dependencyMap = this.buildDependencyGraph(model.autoInductions);
        const sorted = this.topologicalSort(model.autoInductions, dependencyMap);
        const searchWindow = calculateSearchWindow(model);

        for (const autoInd of sorted) {
            const result = this.tryScheduleAuto(autoInd, model, scheduled, scheduledById, searchWindow, dependencyMap);

            if (result.success && result.scheduled) {
                scheduled.push(result.scheduled);
                if (result.scheduled.id) scheduledById.set(result.scheduled.id, result.scheduled);
            } else {
                unscheduled.push(autoInd);
                const autoId = autoInd.id ?? `auto_${autoInd.aircraft.ref?.name ?? 'unknown'}`;
                rejectionReasons.set(autoId, result.rejections);
            }
        }

        return { scheduled, unscheduled, rejectionReasons };
    }

    // --- Orchestration ---

    private tryScheduleAuto(
        autoInd: AutoInduction,
        model: Model,
        existing: ScheduledInduction[],
        scheduledById: Map<string, ScheduledInduction>,
        searchWindow: { start: Date; end: Date },
        dependencyMap: Map<string, string[]>
    ): { success: boolean; scheduled?: ScheduledInduction; rejections: RejectionReason[] } {
        const aircraft = autoInd.aircraft.ref;
        if (!aircraft) {
            return {
                success: false,
                rejections: [{ ruleId: 'INVALID_AIRCRAFT_REF', message: 'Aircraft reference not resolved', evidence: { autoInductionId: autoInd.id } }]
            };
        }

        const clearance = autoInd.clearance?.ref ?? aircraft.clearance?.ref;
        const rejections: RejectionReason[] = [];
        const targetHangars = autoInd.preferredHangar?.ref ? [autoInd.preferredHangar.ref] : model.hangars;

        for (const hangar of targetHangars) {
            const placement = this.findSpatialPlacement(aircraft, hangar, clearance, autoInd.requires, rejections);
            if (!placement) continue;

            for (const bayNames of placement.baySetCandidates) {
                const timing = this.findTiming(autoInd, hangar.name, bayNames, existing, scheduledById, searchWindow, dependencyMap, rejections);
                if (!timing) continue;

                return {
                    success: true,
                    scheduled: {
                        id: autoInd.id ?? `auto_${aircraft.name}`,
                        aircraft: aircraft.name,
                        hangar: hangar.name,
                        bays: bayNames,
                        door: placement.doorName,
                        start: timing.start.toISOString(),
                        end: timing.end.toISOString()
                    },
                    rejections: []
                };
            }
        }

        return { success: false, rejections };
    }

    // --- Spatial placement (SFR11, SFR12, SFR13) ---

    private findSpatialPlacement(
        aircraft: AircraftType,
        hangar: Hangar,
        clearance: ClearanceEnvelope | undefined,
        minBays: number | undefined,
        rejections: RejectionReason[]
    ): { doorName: string; baySetCandidates: string[][] } | null {
        const doorResult = findSuitableDoors(aircraft, hangar, clearance);
        if (doorResult.doors.length === 0) {
            rejections.push(makeDoorRejection(hangar.name, doorResult));
            return null;
        }

        const bayResult = findSuitableBaySets(aircraft, hangar, clearance, 5, 'lateral', minBays);
        if (bayResult.baySets.length === 0) {
            rejections.push(makeBayRejection(hangar.name, bayResult));
            return null;
        }

        return {
            doorName: doorResult.doors[0].name,
            baySetCandidates: bayResult.baySets.map((bs: HangarBay[]) => bs.map((b: HangarBay) => b.name))
        };
    }

    // --- Temporal placement (SFR16) ---

    private findTiming(
        autoInd: AutoInduction,
        hangarName: string,
        bayNames: string[],
        existing: ScheduledInduction[],
        scheduledById: Map<string, ScheduledInduction>,
        searchWindow: { start: Date; end: Date },
        dependencyMap: Map<string, string[]>,
        rejections: RejectionReason[]
    ): { start: Date; end: Date } | null {
        const start = this.calculateStartTime(autoInd, scheduledById, dependencyMap, searchWindow);
        const end = new Date(start.getTime() + autoInd.duration * 60000);

        const conflicting = this.conflictingIds(hangarName, bayNames, start, end, existing);
        if (conflicting.length > 0) {
            rejections.push(makeConflictRejection(hangarName, bayNames, start, end, conflicting));
            return null;
        }

        return { start, end };
    }

    // --- Conflict helpers ---

    private conflictingIds(
        hangar: string,
        bays: string[],
        start: Date,
        end: Date,
        existing: ScheduledInduction[]
    ): string[] {
        const baySet = new Set(bays);
        return existing
            .filter(s => s.hangar === hangar && s.bays.some(b => baySet.has(b)))
            .filter(s => checkTimeOverlap(start, end, new Date(s.start), new Date(s.end)).overlaps)
            .map(s => s.id ?? s.aircraft);
    }

    // --- Start time calculation ---

    private calculateStartTime(
        autoInd: AutoInduction,
        scheduledById: Map<string, ScheduledInduction>,
        dependencyMap: Map<string, string[]>,
        searchWindow: { start: Date; end: Date }
    ): Date {
        let startTime = new Date(searchWindow.start);

        if (autoInd.notBefore) {
            const notBefore = new Date(autoInd.notBefore);
            if (notBefore > startTime) startTime = notBefore;
        }

        if (autoInd.id && dependencyMap.has(autoInd.id)) {
            for (const depId of dependencyMap.get(autoInd.id)!) {
                const dep = scheduledById.get(depId);
                if (dep) {
                    const depEnd = new Date(dep.end);
                    if (depEnd > startTime) startTime = depEnd;
                }
            }
        }

        if (autoInd.notAfter) {
            const notAfter = new Date(autoInd.notAfter);
            const endTime = new Date(startTime.getTime() + autoInd.duration * 60000);
            if (endTime > notAfter) {
                startTime = new Date(notAfter.getTime() - autoInd.duration * 60000);
            }
        }

        return startTime;
    }

    // --- Graph helpers ---

    private buildDependencyGraph(autos: AutoInduction[]): Map<string, string[]> {
        const map = new Map<string, string[]>();
        for (const auto of autos) {
            if (auto.id && auto.precedingInductions) {
                map.set(
                    auto.id,
                    auto.precedingInductions
                        .map(p => p.ref?.id)
                        .filter((id): id is string => id !== undefined)
                );
            }
        }
        return map;
    }

    private topologicalSort(
        autos: AutoInduction[],
        dependencyMap: Map<string, string[]>
    ): AutoInduction[] {
        const autoById = new Map(autos.filter(a => a.id).map(a => [a.id, a]));
        const sorted: AutoInduction[] = [];
        const visited = new Set<string>();

        const visit = (auto: AutoInduction) => {
            if (!auto.id || visited.has(auto.id)) return;
            visited.add(auto.id);
            for (const depId of dependencyMap.get(auto.id) ?? []) {
                const dep = autoById.get(depId);
                if (dep) visit(dep);
            }
            sorted.push(auto);
        };

        for (const auto of autos) visit(auto);

        return sorted;
    }
}