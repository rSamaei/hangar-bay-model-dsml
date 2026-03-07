import type { ValidationChecks } from 'langium';
import type { AirfieldAstType } from './generated/ast.js';
import type { AirfieldServices } from './airfield-module.js';
import {
    checkAircraftDimensions,
    checkBayDimensions,
    checkDoorDimensions,
    checkClearanceDimensions,
    checkUnreferencedClearanceEnvelope
} from './validators/dimension-checks.js';
import {
    checkInductionFeasibility,
    checkInductionTimeWindow,
    checkBayHangarMembership,
    checkDoorFitPrecheck,
    checkBayCountSufficiency,
    checkDuplicateInductionId,
    checkDuplicateAutoInductionId,
    generateValidationReport
} from './validators/induction-checks.js';
import {
    checkBayReachability,
    checkDynamicBayBlockingReachability,
    checkCorridorFitReachability
} from './validators/reachability-checks.js';
import {
    checkAutoPrecedenceCycles,
    checkAutoInductionTimeWindow,
    checkAutoInductionBayCountOverride
} from './validators/auto-induction-checks.js';
import { checkReachabilitySkipped, checkAdjacencyConsistency } from './validators/hangar-checks.js';
import { checkAccessPathConnectivity } from './validators/access-path-checks.js';

export function registerValidationChecks(services: AirfieldServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.AirfieldValidator;
    const checks: ValidationChecks<AirfieldAstType> = {
        AircraftType: validator.checkAircraftDimensions,
        HangarBay: validator.checkBayDimensions,
        HangarDoor: validator.checkDoorDimensions,
        ClearanceEnvelope: [validator.checkClearanceDimensions, validator.checkUnreferencedClearanceEnvelope],
        Induction: [
            validator.checkInductionFeasibility,
            validator.checkBayReachability,
            validator.checkDynamicBayBlockingReachability,
            validator.checkCorridorFitReachability,
            validator.checkInductionTimeWindow,
            validator.checkDuplicateInductionId,
            validator.checkBayHangarMembership,
            validator.checkDoorFitPrecheck,
            validator.checkBayCountSufficiency
        ],
        AutoInduction: [
            validator.checkAutoPrecedenceCycles,
            validator.checkAutoInductionTimeWindow,
            validator.checkDuplicateAutoInductionId,
            validator.checkAutoInductionBayCountOverride
        ],
        AccessPath: validator.checkAccessPathConnectivity,
        Hangar: [validator.checkReachabilitySkipped, validator.checkAdjacencyConsistency]
    };
    registry.register(checks, validator);
}

export class AirfieldValidator {
    checkAircraftDimensions = checkAircraftDimensions;
    checkBayDimensions = checkBayDimensions;
    checkDoorDimensions = checkDoorDimensions;
    checkClearanceDimensions = checkClearanceDimensions;
    checkUnreferencedClearanceEnvelope = checkUnreferencedClearanceEnvelope;
    checkInductionFeasibility = checkInductionFeasibility;
    checkBayReachability = checkBayReachability;
    checkDynamicBayBlockingReachability = checkDynamicBayBlockingReachability;
    checkCorridorFitReachability = checkCorridorFitReachability;
    checkInductionTimeWindow = checkInductionTimeWindow;
    checkDuplicateInductionId = checkDuplicateInductionId;
    checkDuplicateAutoInductionId = checkDuplicateAutoInductionId;
    checkBayHangarMembership = checkBayHangarMembership;
    checkDoorFitPrecheck = checkDoorFitPrecheck;
    checkBayCountSufficiency = checkBayCountSufficiency;
    checkAutoPrecedenceCycles = checkAutoPrecedenceCycles;
    checkAutoInductionTimeWindow = checkAutoInductionTimeWindow;
    checkAutoInductionBayCountOverride = checkAutoInductionBayCountOverride;
    checkReachabilitySkipped = checkReachabilitySkipped;
    checkAdjacencyConsistency = checkAdjacencyConsistency;
    checkAccessPathConnectivity = checkAccessPathConnectivity;
    generateValidationReport = generateValidationReport;
}

