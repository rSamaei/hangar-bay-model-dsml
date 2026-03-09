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
import type { EffectiveDimensions } from '../types/dimensions.js';
import { calculateEffectiveDimensions } from '../geometry/dimensions.js';
import { calculateBaysRequired } from '../geometry/bays-required.js';
import { buildAdjacencyGraph } from '../geometry/adjacency.js';
import { checkContiguity } from '../rules/contiguity.js';
import { detectConflicts } from '../rules/time-overlap.js';

type AdjacencyResult = ReturnType<typeof buildAdjacencyGraph>;

// ---------------------------------------------------------------------------
// Per-call cache helpers (scoped via parameter, no module-level state)
// ---------------------------------------------------------------------------

interface ExportCaches {
    adjacency: Map<string, AdjacencyResult>;
    effectiveDims: Map<string, EffectiveDimensions>;
}

function getCachedAdjacency(caches: ExportCaches, hangar: Hangar): AdjacencyResult {
    const cached = caches.adjacency.get(hangar.name);
    if (cached) return cached;
    const result = buildAdjacencyGraph(hangar);
    caches.adjacency.set(hangar.name, result);
    return result;
}

function getCachedEffectiveDims(caches: ExportCaches, aircraft: AircraftType, clearance: ClearanceEnvelope | undefined): EffectiveDimensions {
    const key = `${aircraft.name}::${clearance?.name ?? ''}`;
    const cached = caches.effectiveDims.get(key);
    if (cached) return cached;
    const result = calculateEffectiveDimensions(aircraft, clearance);
    caches.effectiveDims.set(key, result);
    return result;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function buildExportModel(model: Model, scheduleResult?: ScheduleResult): ExportModel {
    const caches: ExportCaches = {
        adjacency: new Map(),
        effectiveDims: new Map()
    };

    const adjacencyModeByHangar = buildAdjacencyModeMap(model, caches);

    const inductionInfos: InductionInfo[] = [];
    const manualInductions = exportManualInductions(model, inductionInfos, caches);
    const autoSchedule = scheduleResult
        ? exportAutoSchedule(scheduleResult, model, inductionInfos, caches)
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

function buildAdjacencyModeMap(model: Model, caches: ExportCaches): Record<string, 'explicit' | 'derived'> {
    const map: Record<string, 'explicit' | 'derived'> = {};
    for (const hangar of model.hangars) {
        const { metadata } = getCachedAdjacency(caches, hangar);
        map[hangar.name] = metadata.gridDerived ? 'derived' : 'explicit';
    }
    return map;
}

// ---------------------------------------------------------------------------
// Manual inductions
// ---------------------------------------------------------------------------

function exportManualInductions(model: Model, inductionInfos: InductionInfo[], caches: ExportCaches): ExportedInduction[] {
    const exported: ExportedInduction[] = [];
    for (const induction of model.inductions) {
        const aircraft = induction.aircraft.ref;
        const hangar = induction.hangar.ref;
        if (!aircraft || !hangar) continue;

        const bays = induction.bays.map(b => b.ref).filter((b): b is HangarBay => b !== undefined);
        const result = exportInduction(induction, aircraft, hangar, bays, induction.clearance?.ref, caches);
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
    clearance: ClearanceEnvelope | undefined,
    caches: ExportCaches
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
        derived: computeDerived(aircraft, hangar, clearance, bays.map(b => b.name), caches),
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
    inductionInfos: InductionInfo[],
    caches: ExportCaches
): ExportModel['autoSchedule'] {
    const scheduled: ExportedInduction[] = [];

    const autoById = new Map(model.autoInductions.filter(a => a.id).map(a => [a.id, a]));
    const hangarByName = new Map(model.hangars.map(h => [h.name, h]));

    for (const s of scheduleResult.scheduled) {
        const autoInd = autoById.get(s.id);
        const hangar = hangarByName.get(s.hangar);
        if (!autoInd || !hangar || !autoInd.aircraft.ref) continue;

        const result = exportScheduledAuto(s, autoInd, hangar, caches);
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
    hangar: Hangar,
    caches: ExportCaches
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
        derived: computeDerived(autoInd.aircraft.ref!, hangar, autoInd.clearance?.ref, s.bays, caches),
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
    bayNames: string[],
    caches: ExportCaches
): DerivedInductionProperties {
    const effectiveDims = getCachedEffectiveDims(caches, aircraft, clearance);
    const baysRequiredInfo = calculateBaysRequired(effectiveDims, hangar);
    const { adjacency } = getCachedAdjacency(caches, hangar);
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
    const conflictMap = new Map<string, Set<string>>();

    for (const c of detectConflicts(infos)) {
        const id1 = c.induction1.id ?? c.induction1.aircraft;
        const id2 = c.induction2.id ?? c.induction2.aircraft;
        addToMap(conflictMap, id1, id2);
        addToMap(conflictMap, id2, id1);
    }

    for (const ind of inductions) {
        ind.conflicts = [...(conflictMap.get(ind.id) ?? [])].sort();
    }
}

function addToMap(map: Map<string, Set<string>>, key: string, value: string): void {
    let set = map.get(key);
    if (!set) { set = new Set(); map.set(key, set); }
    set.add(value);
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
