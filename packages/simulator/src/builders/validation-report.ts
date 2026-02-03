import type { Model, HangarBay, AutoInduction } from '../../../language/out/generated/ast.js';
import type {
    ValidationReport,
    TypedViolation,
    DoorFitViolation,
    BaySetFitViolation,
    ContiguityViolation,
    TimeOverlapViolation,
    SchedulingFailedViolation
} from '../types/validation.js';
import type { InductionInfo } from '../types/conflict.js';
import type { ScheduleResult, RejectionReason } from '../scheduler.js';
import { calculateEffectiveDimensions } from '../geometry/dimensions.js';
import { buildAdjacencyGraph } from '../geometry/adjacency.js';
import { checkDoorFitEffective } from '../rules/door-fit.js';
import { checkBaySetFitEffective } from '../rules/bay-fit.js';
import { checkContiguity } from '../rules/contiguity.js';
import { detectConflicts } from '../rules/time-overlap.js';

export function buildValidationReport(model: Model, scheduleResult?: ScheduleResult): ValidationReport {
    const violations: TypedViolation[] = [];
    
    // Validate manual inductions
    for (const induction of model.inductions) {
        const aircraft = induction.aircraft.ref;
        const hangar = induction.hangar.ref;
        const door = induction.door?.ref;
        const bays = induction.bays.map(b => b.ref).filter((b): b is HangarBay => b !== undefined);
        const clearance = induction.clearance?.ref;
        
        if (!aircraft || !hangar) continue;
        
        const effectiveDims = calculateEffectiveDimensions(aircraft, clearance);
        
        // SFR11: Check door fit
        if (door) {
            const doorCheck = checkDoorFitEffective(effectiveDims, door, aircraft.name);
            if (!doorCheck.ok) {
                const violation: DoorFitViolation = {
                    ruleId: 'SFR11_DOOR_FIT',
                    severity: 'error',
                    message: doorCheck.message,
                    subject: {
                        type: 'Induction',
                        name: aircraft.name,
                        id: induction.id
                    },
                    evidence: {
                        aircraftName: aircraft.name,
                        doorName: door.name,
                        rawDimensions: {
                            wingspan: effectiveDims.rawAircraft.wingspan,
                            tailHeight: effectiveDims.rawAircraft.tailHeight
                        },
                        effectiveDimensions: {
                            wingspan: effectiveDims.wingspan,
                            tailHeight: effectiveDims.tailHeight
                        },
                        doorDimensions: {
                            width: door.width,
                            height: door.height
                        },
                        clearanceName: clearance?.name,
                        clearanceMargins: clearance ? {
                            lateral: clearance.lateralMargin,
                            vertical: clearance.verticalMargin
                        } : undefined,
                        violations: {
                            wingspanFits: effectiveDims.wingspan <= door.width,
                            heightFits: effectiveDims.tailHeight <= door.height
                        },
                        failedConstraints: doorCheck.evidence.violations
                    }
                };
                violations.push(violation);
            }
        }
        
        // SFR12: Check bay fit
        if (bays.length > 0) {
            const bayCheck = checkBaySetFitEffective(effectiveDims, bays, aircraft.name);
            if (!bayCheck.ok) {
                const violation: BaySetFitViolation = {
                    ruleId: 'SFR12_BAY_FIT',
                    severity: 'error',
                    message: bayCheck.message,
                    subject: {
                        type: 'Induction',
                        name: aircraft.name,
                        id: induction.id
                    },
                    evidence: {
                        aircraftName: aircraft.name,
                        bayNames: bayCheck.evidence.bayNames,
                        bayCount: bayCheck.evidence.bayCount,
                        effectiveDimensions: {
                            wingspan: effectiveDims.wingspan,
                            length: effectiveDims.length,
                            tailHeight: effectiveDims.tailHeight
                        },
                        bayMeasurements: {
                            sumWidth: bayCheck.evidence.sumWidth,
                            minDepth: bayCheck.evidence.minDepth,
                            minHeight: bayCheck.evidence.minHeight,
                            limitingDepthBay: bayCheck.evidence.limitingDepthBay,
                            limitingHeightBay: bayCheck.evidence.limitingHeightBay
                        },
                        clearanceName: clearance?.name,
                        violations: {
                            widthFits: bayCheck.evidence.widthFits,
                            depthFits: bayCheck.evidence.depthFits,
                            heightFits: bayCheck.evidence.heightFits
                        },
                        failedConstraints: bayCheck.evidence.violations
                    }
                };
                violations.push(violation);
            }
            
            // SFR13: Check contiguity
            if (bays.length > 1) {
                const { adjacency, metadata } = buildAdjacencyGraph(hangar);
                const contiguityCheck = checkContiguity(bays.map(b => b.name), adjacency, metadata);
                if (!contiguityCheck.ok) {
                    const violation: ContiguityViolation = {
                        ruleId: 'SFR13_CONTIGUITY',
                        severity: 'error',
                        message: contiguityCheck.message,
                        subject: {
                            type: 'Induction',
                            name: aircraft.name,
                            id: induction.id
                        },
                        evidence: {
                            bayNames: contiguityCheck.evidence.bayNames,
                            bayCount: contiguityCheck.evidence.bayCount,
                            connected: contiguityCheck.evidence.connected,
                            reachableCount: contiguityCheck.evidence.reachableCount,
                            reachableBays: contiguityCheck.evidence.reachableBays,
                            unreachableBays: contiguityCheck.evidence.unreachableBays,
                            adjacencyMode: {
                                derivedFromGrid: metadata.gridDerived,
                                explicitEdgesUsed: metadata.explicitEdges,
                                gridEdgesUsed: metadata.gridEdges
                            }
                        }
                    };
                    violations.push(violation);
                }
            }
        }
    }
    
    // SFR16: Check time conflicts
    const inductionInfos: InductionInfo[] = model.inductions.map(ind => ({
        id: ind.id,
        aircraft: ind.aircraft.ref?.name!,
        hangar: ind.hangar.ref?.name!,
        bays: ind.bays.map(b => b.ref?.name!),
        start: new Date(ind.start),
        end: new Date(ind.end)
    }));
    
    const conflicts = detectConflicts(inductionInfos);
    for (const conflict of conflicts) {
        const violation: TimeOverlapViolation = {
            ruleId: 'SFR16_TIME_OVERLAP',
            severity: 'error',
            message: conflict.message,
            subject: {
                type: 'Induction',
                name: conflict.induction1.aircraft,
                id: conflict.induction1.id
            },
            evidence: {
                induction1: {
                    id: conflict.induction1.id,
                    aircraft: conflict.induction1.aircraft,
                    hangar: conflict.hangar,
                    bays: inductionInfos.find(i => 
                        i.id === conflict.induction1.id || 
                        i.aircraft === conflict.induction1.aircraft
                    )?.bays ?? [],
                    timeWindow: {
                        start: conflict.overlapInterval.start,
                        end: conflict.overlapInterval.end
                    }
                },
                induction2: {
                    id: conflict.induction2.id,
                    aircraft: conflict.induction2.aircraft,
                    hangar: conflict.hangar,
                    bays: inductionInfos.find(i => 
                        i.id === conflict.induction2.id || 
                        i.aircraft === conflict.induction2.aircraft
                    )?.bays ?? [],
                    timeWindow: {
                        start: conflict.overlapInterval.start,
                        end: conflict.overlapInterval.end
                    }
                },
                overlapInterval: conflict.overlapInterval,
                intersectingBays: conflict.intersectingBays
            }
        };
        violations.push(violation);
    }

    // SCHED_FAILED: Add violations for unscheduled auto-inductions
    if (scheduleResult && scheduleResult.unscheduled.length > 0) {
        for (const unscheduledAuto of scheduleResult.unscheduled) {
            const autoId = unscheduledAuto.id ?? `auto_${unscheduledAuto.aircraft.ref?.name ?? 'unknown'}`;
            const aircraftName = unscheduledAuto.aircraft.ref?.name ?? 'Unknown';
            const preferredHangar = unscheduledAuto.preferredHangar?.ref?.name;
            const reasons = scheduleResult.rejectionReasons.get(autoId) ?? [];

            // Build human-readable message
            const primaryReason = reasons.length > 0 ? reasons[0] : null;
            let message = `Auto-induction '${autoId}' for ${aircraftName} could not be scheduled`;
            if (primaryReason) {
                if (primaryReason.ruleId === 'SFR16_TIME_OVERLAP') {
                    const conflicting = primaryReason.evidence?.conflictingInductions ?? [];
                    message += `: time slot conflict with ${conflicting.join(', ') || 'other inductions'}`;
                } else if (primaryReason.ruleId === 'SFR11_DOOR_FIT') {
                    message += `: no suitable doors found (aircraft too large)`;
                } else if (primaryReason.ruleId === 'NO_SUITABLE_BAY_SET') {
                    message += `: no suitable bay configuration available`;
                } else {
                    message += `: ${primaryReason.message}`;
                }
            }

            const violation: SchedulingFailedViolation = {
                ruleId: 'SCHED_FAILED',
                severity: 'warning',
                message,
                subject: {
                    type: 'AutoInduction',
                    name: aircraftName,
                    id: autoId
                },
                evidence: {
                    autoInductionId: autoId,
                    aircraft: aircraftName,
                    preferredHangar,
                    duration: unscheduledAuto.duration,
                    timeConstraints: {
                        notBefore: unscheduledAuto.notBefore,
                        notAfter: unscheduledAuto.notAfter
                    },
                    rejectionReasons: reasons.map((r: RejectionReason) => ({
                        ruleId: r.ruleId,
                        message: r.message,
                        hangar: r.evidence?.hangar,
                        conflictingWith: r.evidence?.conflictingInductions
                    }))
                }
            };
            violations.push(violation);
        }
    }

    // Sort deterministically
    const sortedViolations = sortViolationsDeterministically(violations);
    
    // Build summary
    const byRuleId: Record<string, number> = {};
    let errors = 0;
    let warnings = 0;
    
    for (const v of sortedViolations) {
        byRuleId[v.ruleId] = (byRuleId[v.ruleId] || 0) + 1;
        if (v.severity === 'error') errors++;
        if (v.severity === 'warning') warnings++;
    }
    
    return {
        violations: sortedViolations,
        timestamp: new Date().toISOString(),
        summary: {
            totalViolations: sortedViolations.length,
            byRuleId,
            bySeverity: {
                errors,
                warnings
            }
        }
    };
}

/**
 * Deterministic sorting for violations
 * Primary: ruleId (alphabetical)
 * Secondary: subject.type (alphabetical)
 * Tertiary: subject.name (alphabetical)
 * Quaternary: subject.id (alphabetical, if present)
 */
function sortViolationsDeterministically(violations: TypedViolation[]): TypedViolation[] {
    return [...violations].sort((a, b) => {
        // Primary: ruleId
        if (a.ruleId !== b.ruleId) {
            return a.ruleId.localeCompare(b.ruleId);
        }
        
        // Secondary: subject.type
        if (a.subject.type !== b.subject.type) {
            return a.subject.type.localeCompare(b.subject.type);
        }
        
        // Tertiary: subject.name
        if (a.subject.name !== b.subject.name) {
            return a.subject.name.localeCompare(b.subject.name);
        }
        
        // Quaternary: subject.id (if both present)
        if (a.subject.id && b.subject.id) {
            return a.subject.id.localeCompare(b.subject.id);
        }
        
        // If only one has id, prefer that one first
        if (a.subject.id && !b.subject.id) return -1;
        if (!a.subject.id && b.subject.id) return 1;
        
        return 0;
    });
}