import type { Model, AutoInduction, HangarBay } from '../../language/out/generated/ast.js';
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

/**
 * Scheduler uses effective dimensions and engine rules for ALL decision-making.
 * It does NOT duplicate feasibility logic.
 */
export class AutoScheduler {
    schedule(model: Model): ScheduleResult {
        const scheduled: ScheduledInduction[] = [];
        const unscheduled: AutoInduction[] = [];
        const rejectionReasons = new Map<string, RejectionReason[]>();
        
        // Build dependency graph
        const dependencyMap = this.buildDependencyGraph(model.autoInductions);
        
        // Topological sort
        const sorted = this.topologicalSort(model.autoInductions, dependencyMap);
        
        // Calculate search window
        const searchWindow = calculateSearchWindow(model);
        
        // Try to schedule each auto-induction
        for (const autoInd of sorted) {
            const result = this.tryScheduleAuto(
                autoInd,
                model,
                scheduled,
                searchWindow,
                dependencyMap
            );
            
            if (result.success && result.scheduled) {
                scheduled.push(result.scheduled);
            } else {
                unscheduled.push(autoInd);
                const autoId = autoInd.id ?? `auto_${autoInd.aircraft.ref?.name ?? 'unknown'}`;
                rejectionReasons.set(autoId, result.rejections);
            }
        }
        
        return { scheduled, unscheduled, rejectionReasons };
    }
    
    private tryScheduleAuto(
        autoInd: AutoInduction,
        model: Model,
        existingSchedule: ScheduledInduction[],
        searchWindow: { start: Date; end: Date },
        dependencyMap: Map<string, string[]>
    ): { success: boolean; scheduled?: ScheduledInduction; rejections: RejectionReason[] } {
        const aircraft = autoInd.aircraft.ref;
        if (!aircraft) {
            return {
                success: false,
                rejections: [{
                    ruleId: 'INVALID_AIRCRAFT_REF',
                    message: 'Aircraft reference not resolved',
                    evidence: { autoInductionId: autoInd.id }
                }]
            };
        }
        
        const clearance = autoInd.clearance?.ref;
        const rejections: RejectionReason[] = [];
        
        // Determine target hangars (preferred or all)
        const targetHangars = autoInd.preferredHangar?.ref 
            ? [autoInd.preferredHangar.ref] 
            : model.hangars;
        
        // Try each hangar
        for (const hangar of targetHangars) {
            // Find suitable doors (engine does the checking)
            const doorResult = findSuitableDoors(aircraft, hangar, clearance);
            
            if (doorResult.doors.length === 0) {
                rejections.push({
                    ruleId: 'SFR11_DOOR_FIT',
                    message: `No suitable doors in hangar ${hangar.name}`,
                    evidence: {
                        hangar: hangar.name,
                        rejectedDoors: doorResult.rejections.map(r => ({
                            doorName: r.evidence.doorName,
                            violations: r.evidence.violations
                        }))
                    }
                });
                continue;
            }
            
            // Find suitable bay sets (engine does the checking)
            const bayResult = findSuitableBaySets(aircraft, hangar, clearance);
            
            if (bayResult.baySets.length === 0) {
                rejections.push({
                    ruleId: 'NO_SUITABLE_BAY_SET',
                    message: `No suitable bay sets in hangar ${hangar.name}`,
                    evidence: {
                        hangar: hangar.name,
                        baysRequired: bayResult.derivedProps.baysRequired,
                        rejectedSets: bayResult.rejections.slice(0, 5).map(r => ({
                            ruleId: r.ruleId,
                            message: r.message,
                            evidence: r.evidence
                        }))
                    }
                });
                continue;
            }
            
            // Use first suitable door and bay set
            const door = doorResult.doors[0];
            const baySet = bayResult.baySets[0];
            
            // Calculate start time based on dependencies and constraints
            const startTime = this.calculateStartTime(
                autoInd,
                existingSchedule,
                dependencyMap,
                searchWindow
            );
            
            const endTime = new Date(startTime.getTime() + autoInd.duration * 60000);
            
            // Check for time conflicts (SFR16)
            const hasConflict = this.checkForConflicts(
                hangar.name,
                baySet.map((b: HangarBay) => b.name),
                startTime,
                endTime,
                existingSchedule
            );
            
            if (hasConflict) {
                rejections.push({
                    ruleId: 'SFR16_TIME_OVERLAP',
                    message: `Time slot conflict in hangar ${hangar.name}`,
                    evidence: {
                        hangar: hangar.name,
                        bays: baySet.map((b: HangarBay) => b.name),
                        requestedWindow: {
                            start: startTime.toISOString(),
                            end: endTime.toISOString()
                        },
                        conflictingInductions: this.findConflictingInductions(
                            hangar.name,
                            baySet.map((b: HangarBay) => b.name),
                            startTime,
                            endTime,
                            existingSchedule
                        )
                    }
                });
                continue;
            }
            
            // Successfully scheduled!
            const scheduledInduction: ScheduledInduction = {
                id: autoInd.id ?? `auto_${aircraft.name}`,
                aircraft: aircraft.name,
                hangar: hangar.name,
                bays: baySet.map((b: HangarBay) => b.name),
                door: door.name,
                start: startTime.toISOString(),
                end: endTime.toISOString()
            };
            
            return {
                success: true,
                scheduled: scheduledInduction,
                rejections: []
            };
        }
        
        // Failed to schedule in any hangar
        return { success: false, rejections };
    }
    
    private checkForConflicts(
        hangar: string,
        bays: string[],
        start: Date,
        end: Date,
        existing: ScheduledInduction[]
    ): boolean {
        for (const scheduled of existing) {
            if (scheduled.hangar !== hangar) continue;
            
            const intersectingBays = bays.filter(b => scheduled.bays.includes(b));
            if (intersectingBays.length === 0) continue;
            
            const { overlaps } = checkTimeOverlap(
                start,
                end,
                new Date(scheduled.start),
                new Date(scheduled.end)
            );
            
            if (overlaps) return true;
        }
        return false;
    }
    
    private findConflictingInductions(
        hangar: string,
        bays: string[],
        start: Date,
        end: Date,
        existing: ScheduledInduction[]
    ): string[] {
        const conflicts: string[] = [];
        
        for (const scheduled of existing) {
            if (scheduled.hangar !== hangar) continue;
            
            const intersectingBays = bays.filter(b => scheduled.bays.includes(b));
            if (intersectingBays.length === 0) continue;
            
            const { overlaps } = checkTimeOverlap(
                start,
                end,
                new Date(scheduled.start),
                new Date(scheduled.end)
            );
            
            if (overlaps) {
                conflicts.push(scheduled.id ?? scheduled.aircraft);
            }
        }
        
        return conflicts;
    }
    
    private calculateStartTime(
        autoInd: AutoInduction,
        scheduled: ScheduledInduction[],
        dependencyMap: Map<string, string[]>,
        searchWindow: { start: Date; end: Date }
    ): Date {
        let startTime = new Date(searchWindow.start);
        
        // Apply notBefore constraint
        if (autoInd.notBefore) {
            const notBefore = new Date(autoInd.notBefore);
            if (notBefore > startTime) startTime = notBefore;
        }
        
        // Apply dependency constraints
        if (autoInd.id && dependencyMap.has(autoInd.id)) {
            const deps = dependencyMap.get(autoInd.id)!;
            for (const depId of deps) {
                const depInduction = scheduled.find(s => s.id === depId);
                if (depInduction) {
                    const depEnd = new Date(depInduction.end);
                    if (depEnd > startTime) startTime = depEnd;
                }
            }
        }
        
        // Apply notAfter constraint
        if (autoInd.notAfter) {
            const notAfter = new Date(autoInd.notAfter);
            const endTime = new Date(startTime.getTime() + autoInd.duration * 60000);
            if (endTime > notAfter) {
                startTime = new Date(notAfter.getTime() - autoInd.duration * 60000);
            }
        }
        
        return startTime;
    }
    
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
        const sorted: AutoInduction[] = [];
        const visited = new Set<string>();
        
        const visit = (auto: AutoInduction) => {
            if (!auto.id || visited.has(auto.id)) return;
            visited.add(auto.id);
            
            const deps = dependencyMap.get(auto.id) ?? [];
            for (const depId of deps) {
                const depAuto = autos.find(a => a.id === depId);
                if (depAuto) visit(depAuto);
            }
            
            sorted.push(auto);
        };
        
        for (const auto of autos) {
            visit(auto);
        }
        
        return sorted;
    }
}