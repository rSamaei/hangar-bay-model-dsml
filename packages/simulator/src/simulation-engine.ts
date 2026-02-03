import type { Model, AutoInduction, HangarBay } from '../../language/out/generated/ast.js';
import type { SimulationResult, ScheduledInduction, Conflict, UtilizationStats } from './types/simulation.js';
import type { InductionInfo } from './types/conflict.js';
import { FeasibilityEngine } from '../../language/out/feasibility-engine.js';
import { findSuitableDoors } from './search/doors.js';
import { findSuitableBaySets } from './search/bay-sets.js';
import { detectConflicts } from './rules/time-overlap.js';

export class SimulationEngine {
    private feasibility = new FeasibilityEngine();

    simulate(model: Model): SimulationResult {
        const schedule: ScheduledInduction[] = [];
        const conflicts: Conflict[] = [];

        for (const induction of model.inductions) {
            schedule.push(this.convertInduction(induction));
        }

        const autoSchedule = this.scheduleAutoInductions(model, model.autoInductions);
        schedule.push(...autoSchedule);

        const inductionInfos: InductionInfo[] = schedule.map(s => ({
            id: s.id,
            aircraft: s.aircraft,
            hangar: s.hangar,
            bays: s.bays,
            start: new Date(s.start),
            end: new Date(s.end)
        }));
        
        const detectedConflicts = detectConflicts(inductionInfos);
        conflicts.push(...detectedConflicts.map(c => ({
            type: 'overlap' as const,
            inductions: [c.induction1.id ?? c.induction1.aircraft, c.induction2.id ?? c.induction2.aircraft],
            message: c.message
        })));

        const utilization = this.calculateUtilization(model, schedule);

        return {
            schedule,
            conflicts,
            utilizationStats: utilization
        };
    }

    private convertInduction(induction: import('../../language/out/generated/ast.js').Induction): ScheduledInduction {
        return {
            id: induction.id,
            aircraft: induction.aircraft.ref?.name!,
            hangar: induction.hangar.ref?.name!,
            bays: induction.bays.map(b => b.ref?.name!),
            door: induction.door?.ref?.name,
            start: induction.start,
            end: induction.end
        };
    }

    private scheduleAutoInductions(model: Model, autoInductions: AutoInduction[]): ScheduledInduction[] {
        const scheduled: ScheduledInduction[] = [];
        
        const dependencyMap = new Map<string, string[]>();
        for (const auto of autoInductions) {
            if (auto.id && auto.precedingInductions) {
                dependencyMap.set(
                    auto.id,
                    auto.precedingInductions.map(p => p.ref?.id!).filter(id => id !== undefined)
                );
            }
        }

        const sorted = this.topologicalSort(autoInductions, dependencyMap);

        for (const auto of sorted) {
            const aircraft = auto.aircraft.ref;
            if (!aircraft) continue;

            const hangar = auto.preferredHangar?.ref ?? model.hangars[0];
            if (!hangar) continue;

            const doorResult = findSuitableDoors(aircraft, hangar, auto.clearance?.ref);
            if (doorResult.doors.length === 0) continue;

            const bayResult = findSuitableBaySets(aircraft, hangar, auto.clearance?.ref);
            if (bayResult.baySets.length === 0) continue;

            const door = doorResult.doors[0];
            const bays = bayResult.baySets[0];

            const startTime = this.calculateStartTime(auto, scheduled, dependencyMap);
            const endTime = new Date(new Date(startTime).getTime() + auto.duration * 60000);

            scheduled.push({
                id: auto.id,
                aircraft: aircraft.name,
                hangar: hangar.name,
                bays: bays.map((b: HangarBay) => b.name),
                door: door.name,
                start: startTime.toISOString(),
                end: endTime.toISOString()
            });
        }

        return scheduled;
    }

    private topologicalSort(
        autoInductions: AutoInduction[], 
        dependencyMap: Map<string, string[]>
    ): AutoInduction[] {
        const sorted: AutoInduction[] = [];
        const visited = new Set<string>();

        const visit = (auto: AutoInduction) => {
            if (!auto.id || visited.has(auto.id)) return;
            visited.add(auto.id);
            
            const deps = dependencyMap.get(auto.id) ?? [];
            for (const depId of deps) {
                const depAuto = autoInductions.find(a => a.id === depId);
                if (depAuto) visit(depAuto);
            }
            
            sorted.push(auto);
        };

        for (const auto of autoInductions) {
            visit(auto);
        }

        return sorted;
    }

    private calculateStartTime(
        auto: AutoInduction,
        scheduled: ScheduledInduction[],
        dependencyMap: Map<string, string[]>
    ): Date {
        let startTime = new Date();

        if (auto.notBefore) {
            const notBefore = new Date(auto.notBefore);
            if (notBefore > startTime) startTime = notBefore;
        }

        if (auto.id && dependencyMap.has(auto.id)) {
            const deps = dependencyMap.get(auto.id)!;
            for (const depId of deps) {
                const depInduction = scheduled.find(s => s.id === depId);
                if (depInduction) {
                    const depEnd = new Date(depInduction.end);
                    if (depEnd > startTime) startTime = depEnd;
                }
            }
        }

        if (auto.notAfter) {
            const notAfter = new Date(auto.notAfter);
            const endTime = new Date(startTime.getTime() + auto.duration * 60000);
            if (endTime > notAfter) {
                startTime = new Date(notAfter.getTime() - auto.duration * 60000);
            }
        }

        return startTime;
    }

    private calculateUtilization(model: Model, schedule: ScheduledInduction[]): UtilizationStats {
        const byHangar: Record<string, number> = {};
        const byBay: Record<string, number> = {};

        for (const hangar of model.hangars) {
            byHangar[hangar.name] = 0;
            for (const bay of hangar.grid.bays) {
                byBay[bay.name] = 0;
            }
        }

        if (schedule.length === 0) return { byHangar, byBay };

        const allTimes = schedule.flatMap(s => [new Date(s.start), new Date(s.end)]);
        const minTime = new Date(Math.min(...allTimes.map(t => t.getTime())));
        const maxTime = new Date(Math.max(...allTimes.map(t => t.getTime())));
        const totalTimeMs = maxTime.getTime() - minTime.getTime();

        if (totalTimeMs === 0) return { byHangar, byBay };

        for (const ind of schedule) {
            const duration = new Date(ind.end).getTime() - new Date(ind.start).getTime();
            const utilizationPercent = (duration / totalTimeMs) * 100;

            byHangar[ind.hangar] = (byHangar[ind.hangar] || 0) + utilizationPercent;

            for (const bay of ind.bays) {
                byBay[bay] = (byBay[bay] || 0) + utilizationPercent;
            }
        }

        return { byHangar, byBay };
    }

    getFeasibilityEngine(): FeasibilityEngine {
        return this.feasibility;
    }
}