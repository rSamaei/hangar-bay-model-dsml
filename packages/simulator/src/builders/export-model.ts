import type { Model, Induction, HangarBay, Hangar, AircraftType, ClearanceEnvelope, AutoInduction } from '../../../language/out/generated/ast.js';
import type {
    ExportModel,
    ExportedInduction,
    ExportedUnscheduledAuto,
    DerivedInductionProperties
} from '../types/export.js';
import type { ScheduleResult } from '../scheduler.js';
import type { InductionInfo } from '../types/conflict.js';
import type { ScheduledInduction } from '../types/simulation.js';
import { calculateEffectiveDimensions } from '../geometry/dimensions.js';
import { calculateBaysRequired } from '../geometry/bays-required.js';
import { buildAdjacencyGraph } from '../geometry/adjacency.js';
import { checkContiguity } from '../rules/contiguity.js';
import { detectConflicts } from '../rules/time-overlap.js';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function buildExportModel(model: Model, scheduleResult?: ScheduleResult): ExportModel {
    const adjacencyModeByHangar = buildAdjacencyModeMap(model);

    const inductionInfos: InductionInfo[] = [];
    const manualInductions = exportManualInductions(model, inductionInfos);
    const autoSchedule = scheduleResult
        ? exportAutoSchedule(scheduleResult, model, inductionInfos)
        : undefined;

    const allInductions = [...manualInductions, ...(autoSchedule?.scheduled ?? [])];
    annotateConflicts(allInductions, inductionInfos);
    sortExportModel(allInductions, autoSchedule);

    return {
        airfieldName: model.name,
        inductions: allInductions,
        autoSchedule,
        derived: { adjacencyModeByHangar }
    };
}

// ---------------------------------------------------------------------------
// Adjacency mode map
// ---------------------------------------------------------------------------

function buildAdjacencyModeMap(model: Model): Record<string, 'explicit' | 'derived'> {
    const map: Record<string, 'explicit' | 'derived'> = {};
    for (const hangar of model.hangars) {
        const { metadata } = buildAdjacencyGraph(hangar);
        map[hangar.name] = metadata.gridDerived ? 'derived' : 'explicit';
    }
    return map;
}

// ---------------------------------------------------------------------------
// Manual inductions
// ---------------------------------------------------------------------------

function exportManualInductions(model: Model, inductionInfos: InductionInfo[]): ExportedInduction[] {
    const exported: ExportedInduction[] = [];
    for (const induction of model.inductions) {
        const aircraft = induction.aircraft.ref;
        const hangar = induction.hangar.ref;
        if (!aircraft || !hangar) continue;

        const bays = induction.bays.map(b => b.ref).filter((b): b is HangarBay => b !== undefined);
        const result = exportInduction(induction, aircraft, hangar, bays, induction.clearance?.ref);
        exported.push(result.exported);
        inductionInfos.push(result.info);
    }
    return exported;
}

function exportInduction(
    induction: Induction,
    aircraft: AircraftType,
    hangar: Hangar,
    bays: HangarBay[],
    clearance: ClearanceEnvelope | undefined
): { exported: ExportedInduction; info: InductionInfo } {
    const id = induction.id ?? `${aircraft.name}_${induction.start}`;
    const exported: ExportedInduction = {
        id,
        kind: 'manual',
        aircraft: aircraft.name,
        hangar: hangar.name,
        door: induction.door?.ref?.name,
        bays: bays.map(b => b.name),
        start: induction.start,
        end: induction.end,
        derived: computeDerived(aircraft, hangar, clearance, bays.map(b => b.name)),
        conflicts: []
    };
    const info: InductionInfo = {
        id,
        aircraft: aircraft.name,
        hangar: hangar.name,
        bays: bays.map(b => b.name),
        start: new Date(induction.start),
        end: new Date(induction.end)
    };
    return { exported, info };
}

// ---------------------------------------------------------------------------
// Auto schedule
// ---------------------------------------------------------------------------

function exportAutoSchedule(
    scheduleResult: ScheduleResult,
    model: Model,
    inductionInfos: InductionInfo[]
): ExportModel['autoSchedule'] {
    const scheduled: ExportedInduction[] = [];

    for (const s of scheduleResult.scheduled) {
        const autoInd = model.autoInductions.find(a => a.id === s.id);
        const hangar = model.hangars.find(h => h.name === s.hangar);
        if (!autoInd || !hangar || !autoInd.aircraft.ref) continue;

        const result = exportScheduledAuto(s, autoInd, hangar);
        scheduled.push(result.exported);
        inductionInfos.push(result.info);
    }

    const unscheduled = scheduleResult.unscheduled.map(auto =>
        exportUnscheduledAuto(auto, scheduleResult)
    );

    return { scheduled, unscheduled };
}

function exportScheduledAuto(
    s: ScheduledInduction,
    autoInd: AutoInduction,
    hangar: Hangar
): { exported: ExportedInduction; info: InductionInfo } {
    const id = s.id ?? `${s.aircraft}_${s.start}`;
    const exported: ExportedInduction = {
        id,
        kind: 'auto',
        aircraft: s.aircraft,
        hangar: s.hangar,
        door: s.door,
        bays: s.bays,
        start: s.start,
        end: s.end,
        derived: computeDerived(autoInd.aircraft.ref!, hangar, autoInd.clearance?.ref, s.bays),
        conflicts: []
    };
    const info: InductionInfo = {
        id,
        aircraft: s.aircraft,
        hangar: s.hangar,
        bays: s.bays,
        start: new Date(s.start),
        end: new Date(s.end)
    };
    return { exported, info };
}

function exportUnscheduledAuto(auto: AutoInduction, scheduleResult: ScheduleResult): ExportedUnscheduledAuto {
    const autoId = auto.id ?? `auto_${auto.aircraft.ref?.name ?? 'unknown'}`;
    const rejections = scheduleResult.rejectionReasons.get(autoId) ?? [];
    const first = rejections[0];
    return {
        id: autoId,
        aircraft: auto.aircraft.ref?.name ?? 'unknown',
        preferredHangar: auto.preferredHangar?.ref?.name,
        reasonRuleId: first?.ruleId ?? 'SCHEDULING_FAILED',
        evidence: first?.evidence ?? { message: 'No suitable hangar/bay/time slot found' }
    };
}

// ---------------------------------------------------------------------------
// Derived properties (shared by manual & auto)
// ---------------------------------------------------------------------------

function computeDerived(
    aircraft: AircraftType,
    hangar: Hangar,
    clearance: ClearanceEnvelope | undefined,
    bayNames: string[]
): DerivedInductionProperties {
    const effectiveDims = calculateEffectiveDimensions(aircraft, clearance);
    const baysRequiredInfo = calculateBaysRequired(effectiveDims, hangar);
    const { adjacency } = buildAdjacencyGraph(hangar);
    const contiguityCheck = checkContiguity(bayNames, adjacency);
    return {
        wingspanEff: effectiveDims.wingspan,
        lengthEff: effectiveDims.length,
        tailEff: effectiveDims.tailHeight,
        baysRequired: baysRequiredInfo.baysRequired,
        connected: contiguityCheck.ok
    };
}

// ---------------------------------------------------------------------------
// Conflict annotation
// ---------------------------------------------------------------------------

function annotateConflicts(inductions: ExportedInduction[], infos: InductionInfo[]): void {
    const conflictMap = new Map<string, string[]>();

    for (const c of detectConflicts(infos)) {
        const id1 = c.induction1.id ?? c.induction1.aircraft;
        const id2 = c.induction2.id ?? c.induction2.aircraft;
        addToMap(conflictMap, id1, id2);
        addToMap(conflictMap, id2, id1);
    }

    for (const ind of inductions) {
        ind.conflicts = (conflictMap.get(ind.id) ?? []).sort();
    }
}

function addToMap(map: Map<string, string[]>, key: string, value: string): void {
    const list = map.get(key) ?? [];
    if (!list.includes(value)) list.push(value);
    map.set(key, list);
}

// ---------------------------------------------------------------------------
// Deterministic sorting
// ---------------------------------------------------------------------------

function sortExportModel(
    allInductions: ExportedInduction[],
    autoSchedule: ExportModel['autoSchedule'] | undefined
): void {
    const byTime = (a: { start: string; id: string }, b: { start: string; id: string }) =>
        a.start.localeCompare(b.start) || a.id.localeCompare(b.id);

    allInductions.sort(byTime);

    if (autoSchedule) {
        autoSchedule.scheduled.sort(byTime);
        autoSchedule.unscheduled.sort((a, b) => a.id.localeCompare(b.id));
    }
}