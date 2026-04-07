import type { Model, Induction, HangarBay, Hangar, AircraftType, ClearanceEnvelope } from '../../../language/out/generated/ast.js';
import type {
    ValidationReport,
    TypedViolation,
    DoorFitViolation,
    BaySetFitViolation,
    ContiguityViolation,
    TimeOverlapViolation,
    SchedulingFailedViolation,
    DynamicReachabilityViolation,
    CorridorFitViolation
} from '../types/validation.js';
import type { InductionInfo } from '../types/conflict.js';
import type { ScheduleResult, RejectionReason } from '../scheduler.js';
import { calculateEffectiveDimensions } from '../geometry/dimensions.js';
import { buildAdjacencyGraph } from '../geometry/adjacency.js';
import { checkDoorFitEffective } from '../rules/door-fit.js';
import { checkBaySetFitEffective } from '../rules/bay-fit.js';
import { checkContiguity } from '../rules/contiguity.js';
import { detectConflicts } from '../rules/time-overlap.js';
import { checkDynamicBayReachability, checkCorridorFit } from '../geometry/access.js';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function buildValidationReport(model: Model, scheduleResult?: ScheduleResult): ValidationReport {
    const violations: TypedViolation[] = [
        ...checkManualInductions(model),
        ...checkTimeOverlaps(model),
        ...checkUnscheduledAutos(scheduleResult)
    ];

    const sorted = sortViolations(violations);
    return { violations: sorted, timestamp: new Date().toISOString(), summary: buildSummary(sorted) };
}

// ---------------------------------------------------------------------------
// Per-induction checks (SFR11, SFR12, SFR13, dynamic reachability)
// ---------------------------------------------------------------------------

function checkManualInductions(model: Model): TypedViolation[] {
    const violations: TypedViolation[] = [];
    for (const induction of model.inductions) {
        const aircraft = induction.aircraft.ref;
        const hangar = induction.hangar.ref;
        if (!aircraft || !hangar) continue;
        violations.push(...checkInduction(induction, aircraft, hangar, model));
    }
    return violations;
}

function checkInduction(
    induction: Induction,
    aircraft: AircraftType,
    hangar: Hangar,
    model: Model
): TypedViolation[] {
    const violations: TypedViolation[] = [];
    const door = induction.door?.ref;
    const bays = induction.bays.map(b => b.ref).filter((b): b is HangarBay => b !== undefined);
    const clearance = induction.clearance?.ref ?? aircraft.clearance?.ref;
    const effectiveDims = calculateEffectiveDimensions(aircraft, clearance);
    const subject = { type: 'Induction' as const, name: aircraft.name, id: induction.id };

    if (door) {
        const v = checkDoorFit(effectiveDims, door, aircraft, clearance, subject);
        if (v) violations.push(v);
    }

    if (bays.length > 0) {
        const vBay = checkBayFit(effectiveDims, bays, aircraft, clearance, subject);
        if (vBay) violations.push(vBay);

        if (bays.length > 1) {
            const vCon = checkBayContiguity(bays, hangar, aircraft, subject);
            if (vCon) violations.push(vCon);
        }
    }

    const reachResult = checkDynamicBayReachability(hangar, induction, model.inductions, model.accessPaths);
    if (!reachResult.ok && !reachResult.skipped) {
        violations.push({
            ruleId: 'SFR21_DYNAMIC_REACHABILITY',
            severity: 'error',
            message: reachResult.message,
            subject,
            evidence: reachResult.evidence
        } satisfies DynamicReachabilityViolation);
    }

    if (effectiveDims.wingspan > 0) {
        const corridorResult = checkCorridorFit(hangar, induction, model.accessPaths, effectiveDims.wingspan);
        if (!corridorResult.ok && !corridorResult.skipped) {
            // Group by corridor node — one violation per narrow corridor node.
            const byNode = new Map<string, { nodeWidth: number; bays: string[] }>();
            for (const vi of corridorResult.violations) {
                const entry = byNode.get(vi.nodeName);
                if (entry) {
                    if (!entry.bays.includes(vi.bayName)) entry.bays.push(vi.bayName);
                } else {
                    byNode.set(vi.nodeName, { nodeWidth: vi.nodeWidth, bays: [vi.bayName] });
                }
            }
            for (const [nodeName, { nodeWidth, bays }] of byNode) {
                violations.push({
                    ruleId: 'SFR22_CORRIDOR_FIT',
                    severity: 'warning',
                    message: `[SFR22_CORRIDOR_FIT] Aircraft '${aircraft.name}' (effective wingspan ${effectiveDims.wingspan} m) cannot pass through corridor '${nodeName}' (width ${nodeWidth} m) to reach bay(s) [${bays.join(', ')}]`,
                    subject,
                    evidence: {
                        aircraftName: aircraft.name,
                        effectiveWingspan: effectiveDims.wingspan,
                        corridorNodeName: nodeName,
                        corridorWidth: nodeWidth,
                        unreachableBays: bays
                    }
                } satisfies CorridorFitViolation);
            }
        }
    }

    return violations;
}

// ---------------------------------------------------------------------------
// SFR11 — door fit
// ---------------------------------------------------------------------------

function checkDoorFit(
    effectiveDims: ReturnType<typeof calculateEffectiveDimensions>,
    door: NonNullable<Induction['door']>['ref'] & {},
    aircraft: AircraftType,
    clearance: ClearanceEnvelope | undefined,
    subject: TypedViolation['subject']
): DoorFitViolation | null {
    const result = checkDoorFitEffective(effectiveDims, door, aircraft.name);
    if (result.ok) return null;
    return {
        ruleId: 'SFR11_DOOR_FIT',
        severity: 'error',
        message: result.message,
        subject,
        evidence: {
            aircraftName: aircraft.name,
            doorName: door.name,
            rawDimensions: { wingspan: effectiveDims.rawAircraft.wingspan, tailHeight: effectiveDims.rawAircraft.tailHeight },
            effectiveDimensions: { wingspan: effectiveDims.wingspan, tailHeight: effectiveDims.tailHeight },
            doorDimensions: { width: door.width, height: door.height },
            clearanceName: clearance?.name,
            clearanceMargins: clearance ? { lateral: clearance.lateralMargin, vertical: clearance.verticalMargin } : undefined,
            violations: { wingspanFits: effectiveDims.wingspan <= door.width, heightFits: effectiveDims.tailHeight <= door.height },
            failedConstraints: result.evidence.violations
        }
    };
}

// ---------------------------------------------------------------------------
// SFR12 — bay fit
// ---------------------------------------------------------------------------

function checkBayFit(
    effectiveDims: ReturnType<typeof calculateEffectiveDimensions>,
    bays: HangarBay[],
    aircraft: AircraftType,
    clearance: ClearanceEnvelope | undefined,
    subject: TypedViolation['subject']
): BaySetFitViolation | null {
    const result = checkBaySetFitEffective(effectiveDims, bays, aircraft.name);
    if (result.ok) return null;
    return {
        ruleId: 'SFR12_BAY_FIT',
        severity: 'error',
        message: result.message,
        subject,
        evidence: {
            aircraftName: aircraft.name,
            bayNames: result.evidence.bayNames,
            bayCount: result.evidence.bayCount,
            effectiveDimensions: { wingspan: effectiveDims.wingspan, length: effectiveDims.length, tailHeight: effectiveDims.tailHeight },
            bayMeasurements: {
                sumWidth: result.evidence.sumWidth,
                minDepth: result.evidence.minDepth,
                minHeight: result.evidence.minHeight,
                limitingDepthBay: result.evidence.limitingDepthBay,
                limitingHeightBay: result.evidence.limitingHeightBay
            },
            clearanceName: clearance?.name,
            violations: { widthFits: result.evidence.widthFits, depthFits: result.evidence.depthFits, heightFits: result.evidence.heightFits },
            failedConstraints: result.evidence.violations
        }
    };
}

// ---------------------------------------------------------------------------
// SFR13 — contiguity
// ---------------------------------------------------------------------------

function checkBayContiguity(
    bays: HangarBay[],
    hangar: Hangar,
    aircraft: AircraftType,
    subject: TypedViolation['subject']
): ContiguityViolation | null {
    const { adjacency, metadata } = buildAdjacencyGraph(hangar);
    const result = checkContiguity(bays.map(b => b.name), adjacency, metadata);
    if (result.ok) return null;
    return {
        ruleId: 'SFR16_CONTIGUITY',
        severity: 'error',
        message: result.message,
        subject,
        evidence: {
            bayNames: result.evidence.bayNames,
            bayCount: result.evidence.bayCount,
            connected: result.evidence.connected,
            reachableCount: result.evidence.reachableCount,
            reachableBays: result.evidence.reachableBays,
            unreachableBays: result.evidence.unreachableBays,
            adjacencyMode: {
                derivedFromGrid: metadata.gridDerived,
                explicitEdgesUsed: metadata.explicitEdges,
                gridEdgesUsed: metadata.gridEdges
            }
        }
    };
}

// ---------------------------------------------------------------------------
// SFR16 — time overlaps
// ---------------------------------------------------------------------------

function checkTimeOverlaps(model: Model): TimeOverlapViolation[] {
    const inductionInfos: InductionInfo[] = model.inductions.map(ind => ({
        id: ind.id,
        aircraft: ind.aircraft.ref?.name!,
        hangar: ind.hangar.ref?.name!,
        bays: ind.bays.map(b => b.ref?.name!),
        start: new Date(ind.start),
        end: new Date(ind.end)
    }));

    return detectConflicts(inductionInfos).map(conflict => ({
        ruleId: 'SFR23_TIME_OVERLAP' as const,
        severity: 'error' as const,
        message: conflict.message,
        subject: { type: 'Induction' as const, name: conflict.induction1.aircraft, id: conflict.induction1.id },
        evidence: {
            induction1: inductionSide(conflict.induction1, conflict.hangar, conflict.overlapInterval, inductionInfos),
            induction2: inductionSide(conflict.induction2, conflict.hangar, conflict.overlapInterval, inductionInfos),
            overlapInterval: conflict.overlapInterval,
            intersectingBays: conflict.intersectingBays
        }
    }));
}

function inductionSide(
    party: { id?: string; aircraft: string },
    hangar: string,
    interval: { start: string; end: string },
    infos: InductionInfo[]
) {
    return {
        id: party.id,
        aircraft: party.aircraft,
        hangar,
        bays: infos.find(i => i.id === party.id || i.aircraft === party.aircraft)?.bays ?? [],
        timeWindow: { start: interval.start, end: interval.end }
    };
}

// ---------------------------------------------------------------------------
// SCHED_FAILED — unscheduled autos
// ---------------------------------------------------------------------------

function checkUnscheduledAutos(scheduleResult: ScheduleResult | undefined): SchedulingFailedViolation[] {
    if (!scheduleResult || scheduleResult.unscheduled.length === 0) return [];
    return scheduleResult.unscheduled.map(auto => schedFailedViolation(auto, scheduleResult));
}

function schedFailedViolation(auto: Parameters<typeof checkUnscheduledAutos>[0] extends ScheduleResult ? never : any, scheduleResult: ScheduleResult): SchedulingFailedViolation {
    const autoId = auto.id ?? `auto_${auto.aircraft.ref?.name ?? 'unknown'}`;
    const aircraftName = auto.aircraft.ref?.name ?? 'Unknown';
    const reasons: RejectionReason[] = scheduleResult.rejectionReasons.get(autoId) ?? [];
    const primary = reasons[0];

    let message = `Auto-induction '${autoId}' for ${aircraftName} could not be scheduled`;
    if (primary) {
        if (primary.ruleId === 'SFR23_TIME_OVERLAP') {
            const conflicting: string[] = primary.evidence?.conflictingInductions ?? [];
            message += `: time slot conflict with ${conflicting.join(', ') || 'other inductions'}`;
        } else if (primary.ruleId === 'SFR11_DOOR_FIT') {
            message += `: no suitable doors found (aircraft too large)`;
        } else if (primary.ruleId === 'NO_SUITABLE_BAY_SET') {
            message += `: no suitable bay configuration available`;
        } else {
            message += `: ${primary.message}`;
        }
    }

    return {
        ruleId: 'SCHED_FAILED',
        severity: 'warning',
        message,
        subject: { type: 'AutoInduction', name: aircraftName, id: autoId },
        evidence: {
            autoInductionId: autoId,
            aircraft: aircraftName,
            preferredHangar: auto.preferredHangar?.ref?.name,
            duration: auto.duration,
            timeConstraints: { notBefore: auto.notBefore, notAfter: auto.notAfter },
            rejectionReasons: reasons.map(r => ({
                ruleId: r.ruleId,
                message: r.message,
                hangar: r.evidence?.hangar,
                conflictingWith: r.evidence?.conflictingInductions
            }))
        }
    };
}

// ---------------------------------------------------------------------------
// Sorting & summary
// ---------------------------------------------------------------------------

function sortViolations(violations: TypedViolation[]): TypedViolation[] {
    return [...violations].sort((a, b) =>
        a.ruleId.localeCompare(b.ruleId) ||
        a.subject.type.localeCompare(b.subject.type) ||
        a.subject.name.localeCompare(b.subject.name) ||
        (a.subject.id && b.subject.id ? a.subject.id.localeCompare(b.subject.id) : a.subject.id ? -1 : b.subject.id ? 1 : 0)
    );
}

function buildSummary(violations: TypedViolation[]): ValidationReport['summary'] {
    const byRuleId: Record<string, number> = {};
    let errors = 0;
    let warnings = 0;
    for (const v of violations) {
        byRuleId[v.ruleId] = (byRuleId[v.ruleId] ?? 0) + 1;
        if (v.severity === 'error') errors++;
        else if (v.severity === 'warning') warnings++;
    }
    return { totalViolations: violations.length, byRuleId, bySeverity: { errors, warnings } };
}