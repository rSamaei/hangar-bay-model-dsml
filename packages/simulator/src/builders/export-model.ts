import type { Model, HangarBay } from '../../../language/out/generated/ast.js';
import type {
    ExportModel,
    ExportedInduction,
    ExportedUnscheduledAuto,
    DerivedInductionProperties
} from '../types/export.js';
import type { ScheduleResult } from '../scheduler.js';
import type { InductionInfo } from '../types/conflict.js';
import { calculateEffectiveDimensions } from '../geometry/dimensions.js';
import { calculateBaysRequired } from '../geometry/bays-required.js';
import { buildAdjacencyGraph } from '../geometry/adjacency.js';
import { checkContiguity } from '../rules/contiguity.js';
import { detectConflicts } from '../rules/time-overlap.js';

/**
 * Build deterministic export model from parsed model and optional schedule result
 */
export function buildExportModel(
    model: Model,
    scheduleResult?: ScheduleResult
): ExportModel {
    // Determine adjacency mode for each hangar
    const adjacencyModeByHangar: Record<string, 'explicit' | 'derived'> = {};
    for (const hangar of model.hangars) {
        const { metadata } = buildAdjacencyGraph(hangar);
        adjacencyModeByHangar[hangar.name] = metadata.gridDerived ? 'derived' : 'explicit';
    }
    
    // Convert manual inductions
    const manualInductions: ExportedInduction[] = [];
    const inductionInfos: InductionInfo[] = [];
    
    for (const induction of model.inductions) {
        const aircraft = induction.aircraft.ref;
        const hangar = induction.hangar.ref;
        const bays = induction.bays.map(b => b.ref).filter((b): b is HangarBay => b !== undefined);
        const clearance = induction.clearance?.ref;
        
        if (!aircraft || !hangar) continue;
        
        const effectiveDims = calculateEffectiveDimensions(aircraft, clearance);
        const baysRequiredInfo = calculateBaysRequired(effectiveDims, hangar);
        const { adjacency } = buildAdjacencyGraph(hangar);
        const contiguityCheck = checkContiguity(bays.map(b => b.name), adjacency);
        
        const derived: DerivedInductionProperties = {
            wingspanEff: effectiveDims.wingspan,
            lengthEff: effectiveDims.length,
            tailEff: effectiveDims.tailHeight,
            baysRequired: baysRequiredInfo.baysRequired,
            connected: contiguityCheck.ok
        };
        
        const exported: ExportedInduction = {
            id: induction.id ?? `${aircraft.name}_${induction.start}`,
            kind: 'manual',
            aircraft: aircraft.name,
            hangar: hangar.name,
            door: induction.door?.ref?.name,
            bays: bays.map(b => b.name),
            start: induction.start,
            end: induction.end,
            derived,
            conflicts: []
        };
        
        manualInductions.push(exported);
        inductionInfos.push({
            id: exported.id,
            aircraft: aircraft.name,
            hangar: hangar.name,
            bays: bays.map(b => b.name),
            start: new Date(induction.start),
            end: new Date(induction.end)
        });
    }
    
    // Process auto-schedule if provided
    let autoSchedule: ExportModel['autoSchedule'] | undefined;
    
    if (scheduleResult) {
        const scheduledAutos: ExportedInduction[] = [];
        
        for (const scheduled of scheduleResult.scheduled) {
            const autoInd = model.autoInductions.find(a => a.id === scheduled.id);
            if (!autoInd) continue;
            
            const aircraft = autoInd.aircraft.ref;
            const hangar = model.hangars.find(h => h.name === scheduled.hangar);
            const clearance = autoInd.clearance?.ref;
            
            if (!aircraft || !hangar) continue;
            
            const effectiveDims = calculateEffectiveDimensions(aircraft, clearance);
            const baysRequiredInfo = calculateBaysRequired(effectiveDims, hangar);
            const { adjacency } = buildAdjacencyGraph(hangar);
            const contiguityCheck = checkContiguity(scheduled.bays, adjacency);
            
            const derived: DerivedInductionProperties = {
                wingspanEff: effectiveDims.wingspan,
                lengthEff: effectiveDims.length,
                tailEff: effectiveDims.tailHeight,
                baysRequired: baysRequiredInfo.baysRequired,
                connected: contiguityCheck.ok
            };
            
            const exported: ExportedInduction = {
                id: scheduled.id ?? `${scheduled.aircraft}_${scheduled.start}`,
                kind: 'auto',
                aircraft: scheduled.aircraft,
                hangar: scheduled.hangar,
                door: scheduled.door,
                bays: scheduled.bays,
                start: scheduled.start,
                end: scheduled.end,
                derived,
                conflicts: []
            };
            
            scheduledAutos.push(exported);
            inductionInfos.push({
                id: exported.id,
                aircraft: scheduled.aircraft,
                hangar: scheduled.hangar,
                bays: scheduled.bays,
                start: new Date(scheduled.start),
                end: new Date(scheduled.end)
            });
        }
        
        // Process unscheduled autos
        const unscheduledAutos: ExportedUnscheduledAuto[] = scheduleResult.unscheduled.map(autoInd => {
            const rejections = scheduleResult.rejectionReasons.get(autoInd.id ?? 'unknown') ?? [];
            
            // Find the most specific rejection reason
            let reasonRuleId = 'SCHEDULING_FAILED';
            let evidence: Record<string, any> = { message: 'No suitable hangar/bay/time slot found' };
            
            // Look for specific rule violations
            for (const rejection of rejections) {
                if (rejection.ruleId) {
                    reasonRuleId = rejection.ruleId;
                    evidence = rejection.evidence ?? rejection;
                    break;
                }
            }
            
            return {
                id: autoInd.id ?? `auto_${autoInd.aircraft.ref?.name ?? 'unknown'}`,
                aircraft: autoInd.aircraft.ref?.name ?? 'unknown',
                preferredHangar: autoInd.preferredHangar?.ref?.name,
                reasonRuleId,
                evidence
            };
        });
        
        autoSchedule = {
            scheduled: scheduledAutos,
            unscheduled: unscheduledAutos
        };
    }
    
    // Combine all inductions for conflict detection
    const allExportedInductions = [
        ...manualInductions,
        ...(autoSchedule?.scheduled ?? [])
    ];
    
    // Detect conflicts and populate conflict lists (SFR16)
    const conflicts = detectConflicts(inductionInfos);
    const conflictMap = new Map<string, string[]>();
    
    for (const conflict of conflicts) {
        const id1 = conflict.induction1.id ?? conflict.induction1.aircraft;
        const id2 = conflict.induction2.id ?? conflict.induction2.aircraft;
        
        if (!conflictMap.has(id1)) conflictMap.set(id1, []);
        if (!conflictMap.has(id2)) conflictMap.set(id2, []);
        
        if (!conflictMap.get(id1)!.includes(id2)) {
            conflictMap.get(id1)!.push(id2);
        }
        if (!conflictMap.get(id2)!.includes(id1)) {
            conflictMap.get(id2)!.push(id1);
        }
    }
    
    // Assign conflicts to exported inductions
    for (const induction of allExportedInductions) {
        induction.conflicts = conflictMap.get(induction.id) ?? [];
        // Sort conflicts deterministically
        induction.conflicts.sort();
    }
    
    // Sort all inductions deterministically (by start time, then id)
    allExportedInductions.sort((a, b) => {
        if (a.start !== b.start) return a.start.localeCompare(b.start);
        return a.id.localeCompare(b.id);
    });
    
    if (autoSchedule) {
        autoSchedule.scheduled.sort((a, b) => {
            if (a.start !== b.start) return a.start.localeCompare(b.start);
            return a.id.localeCompare(b.id);
        });
        autoSchedule.unscheduled.sort((a, b) => a.id.localeCompare(b.id));
    }
    
    return {
        airfieldName: model.name,
        inductions: allExportedInductions,
        autoSchedule,
        derived: {
            adjacencyModeByHangar
        }
    };
}