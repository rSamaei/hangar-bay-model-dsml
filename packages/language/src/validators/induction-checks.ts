import type { ValidationAcceptor } from 'langium';
import type { Induction, AutoInduction, HangarBay, Model } from '../generated/ast.js';
import { AstUtils } from 'langium';
import { isModel } from '../generated/ast.js';
import { validateInduction, checkBaySetFit, generateValidationReport as buildValidationReport } from '../feasibility-engine.js';

/**
 * Greedy estimate of the minimum number of bays needed to cover a target
 * dimension. Sorts the supplied dimensions descending and sums until the
 * threshold is met. Returns the count and the dimensions that were summed.
 */
export function greedyBaysRequired(
    dimensions: number[],
    threshold: number
): { count: number; used: number[] } {
    const sorted = dimensions.slice().sort((a, b) => b - a);
    let sum = 0;
    let count = 0;
    for (const d of sorted) {
        sum += d;
        count++;
        if (sum >= threshold) break;
    }
    return { count, used: sorted.slice(0, count) };
}

function getPropertyForRule(ruleId: string): 'aircraft' | 'bays' | 'door' {
    if (ruleId.includes('DOOR')) return 'door';
    if (ruleId.includes('BAY')) return 'bays';
    return 'aircraft';
}

export function checkInductionFeasibility(induction: Induction, accept: ValidationAcceptor): void {
    const aircraft = induction.aircraft?.ref;
    const hangar = induction.hangar?.ref;
    const door = induction.door?.ref;
    const bays = induction.bays.map(b => b.ref).filter(b => b !== undefined);

    if (!aircraft || !hangar || bays.length === 0) return;

    const clearance = induction.clearance?.ref ?? aircraft.clearance?.ref;
    const results = validateInduction({ aircraft, hangar, bays, door, clearance });

    // For multi-bay inductions, also run the combined bay-set fit check (SFR12_COMBINED).
    // If combined passes, per-bay SFR12_BAY_FIT failures are downgraded from ERROR to INFO
    // because the aircraft is expected to span across multiple bays.
    const span = induction.span ?? 'lateral';
    const isMultiBay = bays.length > 1;
    const combinedResult = isMultiBay
        ? checkBaySetFit(aircraft, bays, clearance, span)
        : null;

    for (const result of results) {
        if (!result.ok) {
            if (result.ruleId === 'SFR12_BAY_FIT' && combinedResult?.ok) {
                // Per-bay fails but combined passes → downgrade to INFO
                const isLong = span === 'longitudinal';
                const bayDim = isLong ? result.evidence.bayDepth : result.evidence.bayWidth;
                const effectiveDim = isLong ? result.evidence.effectiveLength : result.evidence.effectiveWingspan;
                const dimLabel = isLong ? 'depth' : 'width';
                const combinedTotal = isLong
                    ? combinedResult.evidence.sumDepth
                    : combinedResult.evidence.sumWidth;
                accept('info',
                    `[SFR12_BAY_FIT] Aircraft '${aircraft.name}' exceeds individual bay '${result.evidence.bayName}' ${dimLabel} (${effectiveDim.toFixed(2)}m > ${bayDim.toFixed(2)}m) but fits the combined bay set (${combinedTotal.toFixed(2)}m \u2265 ${effectiveDim.toFixed(2)}m). This is expected for multi-bay inductions.`,
                    { node: induction, property: 'bays' }
                );
            } else {
                accept('error',
                    `[${result.ruleId}] ${result.message}`,
                    { node: induction, property: getPropertyForRule(result.ruleId) }
                );
            }
        }
    }

    if (combinedResult && !combinedResult.ok) {
        accept('error',
            `[SFR12_COMBINED] ${combinedResult.message}`,
            { node: induction, property: 'bays' }
        );
    }
}

/** SFR21: Enforce that a manual induction's time window is well-formed: start < end. */
export function checkInductionTimeWindow(induction: Induction, accept: ValidationAcceptor): void {
    const start = new Date(induction.start);
    const end = new Date(induction.end);
    if (start >= end) {
        accept('error',
            `[SFR21_TIME_WINDOW] Induction time window is invalid: start time (${induction.start}) is not before end time (${induction.end})`,
            { node: induction, property: 'end' }
        );
    }
}

/**
 * SFR14: Explicit bay-hangar membership check.
 *
 * The scope provider restricts bay completions to the target hangar, so a bay from
 * the wrong hangar will usually fail to link (producing Langium's generic "Could not
 * resolve reference" error).  This check intercepts that gap and emits a clear,
 * domain-appropriate message:
 *   - If the reference resolved but points to the wrong hangar (fallback scope path).
 *   - If the reference is unresolved AND the bay name exists in a different hangar
 *     (i.e., the root cause is "wrong hangar", not a typo).
 */
export function checkBayHangarMembership(induction: Induction, accept: ValidationAcceptor): void {
    const hangar = induction.hangar?.ref;
    if (!hangar) return;

    const model = AstUtils.getContainerOfType(induction, isModel);

    const hangarBaySet = new Set(hangar.grid.bays);

    // Pre-build a set of bay names from other hangars for unresolved-ref lookups
    const otherHangarBayNames = model
        ? new Set(model.hangars.filter(h => h !== hangar).flatMap(h => h.grid.bays.map(b => b.name)))
        : undefined;

    for (const bayRef of induction.bays) {
        if (bayRef.ref) {
            if (!hangarBaySet.has(bayRef.ref)) {
                accept('error',
                    `[SFR14_BAY_OWNERSHIP] Bay '${bayRef.ref.name}' does not belong to hangar '${hangar.name}'`,
                    { node: induction, property: 'bays' }
                );
            }
        } else if (otherHangarBayNames) {
            const bayName = bayRef.$refText;
            if (otherHangarBayNames.has(bayName)) {
                accept('error',
                    `[SFR14_BAY_OWNERSHIP] Bay '${bayName}' does not belong to hangar '${hangar.name}'`,
                    { node: induction, property: 'bays' }
                );
            }
        }
    }
}

/**
 * SFR24: Hangar-level door fit pre-check (warning).
 *
 * When an induction names a hangar but no specific door, warn if the aircraft (with
 * clearance) cannot pass through ANY door of that hangar.  This surfaces the issue
 * at authoring time without waiting for the simulator.  Only fires when no door is
 * explicitly specified — SFR11 (via checkInductionFeasibility) covers the named-door case.
 */
export function checkDoorFitPrecheck(induction: Induction, accept: ValidationAcceptor): void {
    if (induction.door) return;
    const aircraft = induction.aircraft?.ref;
    const hangar = induction.hangar?.ref;
    if (!aircraft || !hangar || hangar.doors.length === 0) return;

    const clearance = induction.clearance?.ref ?? aircraft.clearance?.ref;
    const effectiveWingspan = aircraft.wingspan + (clearance?.lateralMargin ?? 0);
    const effectiveHeight = (aircraft.tailHeight ?? aircraft.height) + (clearance?.verticalMargin ?? 0);

    const anyFits = hangar.doors.some(
        d => effectiveWingspan <= d.width && effectiveHeight <= d.height
    );
    if (anyFits) return;

    const widestDoor = hangar.doors.reduce((best, d) => d.width > best.width ? d : best, hangar.doors[0]);
    accept('warning',
        `[SFR24_DOOR_FIT_PRECHECK] Aircraft '${aircraft.name}' (effective wingspan ${effectiveWingspan.toFixed(2)}m, effective height ${effectiveHeight.toFixed(2)}m) cannot fit through any door of hangar '${hangar.name}' (widest door: ${widestDoor.width}m wide × ${widestDoor.height}m tall)`,
        { node: induction, property: 'hangar' }
    );
}

/**
 * SFR25: Bay count sufficiency warning.
 *
 * Estimates the minimum number of bays required using a greedy approach:
 * lateral (default): sum-of-widths >= effectiveWingspan;
 * longitudinal: sum-of-depths >= effectiveLength.
 *
 * Also emits SFR_BAY_COUNT_OVERRIDE when an explicit `requires N bays` clause
 * declares fewer bays than the geometry-derived minimum.
 */
export function checkBayCountSufficiency(induction: Induction, accept: ValidationAcceptor): void {
    const aircraft = induction.aircraft?.ref;
    if (!aircraft) return;

    const bays = induction.bays.map(b => b.ref).filter((b): b is HangarBay => b !== undefined);
    if (bays.length === 0) return;

    const hangar = induction.hangar?.ref;
    if (!hangar || hangar.grid.bays.length === 0) return;

    const clearance = induction.clearance?.ref ?? aircraft.clearance?.ref;
    const isLongitudinal = induction.span === 'longitudinal';

    if (isLongitudinal) {
        const effectiveLength = aircraft.length + (clearance?.longitudinalMargin ?? 0);
        if (effectiveLength <= 0) return;

        const { count: baysRequired, used: bayDepthsUsed } = greedyBaysRequired(
            hangar.grid.bays.map(b => b.depth), effectiveLength
        );

        if (induction.requires !== undefined && induction.requires < baysRequired) {
            accept('warning',
                `[SFR_BAY_COUNT_OVERRIDE] Aircraft '${aircraft.name}' requires at least ${baysRequired} bays` +
                ` by geometry (depths [${bayDepthsUsed.map(d => d.toFixed(2)).join(', ')}]m cover effective length ${effectiveLength.toFixed(2)}m)` +
                ` but 'requires ${induction.requires} bays' declares less. The geometric minimum will take precedence.`,
                { node: induction, property: 'requires' }
            );
        }

        const effectiveMin = Math.max(baysRequired, induction.requires ?? 0);
        if (bays.length < effectiveMin) {
            accept('warning',
                `[SFR25_BAY_COUNT] Aircraft '${aircraft.name}' requires at least ${effectiveMin} bays (longitudinal span)` +
                ` (depths [${bayDepthsUsed.map(d => d.toFixed(2)).join(', ')}]m cover effective length ${effectiveLength.toFixed(2)}m)` +
                ` but only ${bays.length} ${bays.length === 1 ? 'is' : 'are'} assigned`,
                { node: induction, property: 'bays' }
            );
        }
    } else {
        const effectiveWingspan = aircraft.wingspan + (clearance?.lateralMargin ?? 0);
        if (effectiveWingspan <= 0) return;

        const { count: baysRequired, used: bayWidthsUsed } = greedyBaysRequired(
            hangar.grid.bays.map(b => b.width), effectiveWingspan
        );

        if (induction.requires !== undefined && induction.requires < baysRequired) {
            accept('warning',
                `[SFR_BAY_COUNT_OVERRIDE] Aircraft '${aircraft.name}' requires at least ${baysRequired} bays` +
                ` by geometry (widths [${bayWidthsUsed.map(w => w.toFixed(2)).join(', ')}]m cover effective wingspan ${effectiveWingspan.toFixed(2)}m)` +
                ` but 'requires ${induction.requires} bays' declares less. The geometric minimum will take precedence.`,
                { node: induction, property: 'requires' }
            );
        }

        const effectiveMin = Math.max(baysRequired, induction.requires ?? 0);
        if (bays.length < effectiveMin) {
            accept('warning',
                `[SFR25_BAY_COUNT] Aircraft '${aircraft.name}' requires at least ${effectiveMin} bays` +
                ` (widths [${bayWidthsUsed.map(w => w.toFixed(2)).join(', ')}]m cover effective wingspan ${effectiveWingspan.toFixed(2)}m)` +
                ` but only ${bays.length} ${bays.length === 1 ? 'is' : 'are'} assigned`,
                { node: induction, property: 'bays' }
            );
        }
    }
}

/**
 * SFR22: Reject duplicate `id` strings across all induct and auto-induct declarations.
 * Only the second (and later) occurrence is flagged, pointing back to the first.
 */
export function checkDuplicateInductionId(induction: Induction, accept: ValidationAcceptor): void {
    if (!induction.id) return;
    const model = AstUtils.getContainerOfType(induction, isModel);
    if (!model) return;
    reportIfDuplicateId(induction.id, induction, model, accept);
}

export function checkDuplicateAutoInductionId(autoInduction: AutoInduction, accept: ValidationAcceptor): void {
    if (!autoInduction.id) return;
    const model = AstUtils.getContainerOfType(autoInduction, isModel);
    if (!model) return;
    reportIfDuplicateId(autoInduction.id, autoInduction, model, accept);
}

function reportIfDuplicateId(
    id: string,
    thisNode: Induction | AutoInduction,
    model: Model,
    accept: ValidationAcceptor
): void {
    const allWithSameId = [
        ...model.inductions.filter(i => i.id === id),
        ...model.autoInductions.filter(i => i.id === id)
    ];
    if (allWithSameId.length <= 1) return;

    allWithSameId.sort(
        (a, b) => (a.$cstNode?.range.start.line ?? 0) - (b.$cstNode?.range.start.line ?? 0)
    );

    if (allWithSameId[0] !== thisNode) {
        const firstLine = (allWithSameId[0].$cstNode?.range.start.line ?? 0) + 1;
        accept('error',
            `[SFR22_DUPLICATE_ID] Duplicate induction ID '${id}' — first defined at line ${firstLine}`,
            { node: thisNode, property: 'id' }
        );
    }
}

export function generateValidationReport(model: any): any {
    const allResults: any[] = [];

    for (const induction of model.inductions ?? []) {
        const aircraft = induction.aircraft?.ref;
        const hangar = induction.hangar?.ref;
        const bays = induction.bays?.map((b: any) => b.ref).filter((b: any) => b !== undefined) ?? [];

        if (aircraft && hangar && bays.length > 0) {
            const results = validateInduction({
                aircraft,
                hangar,
                bays,
                door: induction.door?.ref,
                clearance: induction.clearance?.ref ?? aircraft.clearance?.ref
            });

            allResults.push(...results);
        }
    }

    return buildValidationReport(allResults);
}
