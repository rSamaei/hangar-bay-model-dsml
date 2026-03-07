import type { ValidationAcceptor } from 'langium';
import type { AircraftType, HangarBay, HangarDoor, ClearanceEnvelope } from '../generated/ast.js';
import { AstUtils } from 'langium';
import { isModel } from '../generated/ast.js';

/** SFR20: Enforce positive dimensions on aircraft declarations. */
export function checkAircraftDimensions(aircraft: AircraftType, accept: ValidationAcceptor): void {
    if (aircraft.wingspan <= 0) {
        accept('error',
            `[SFR20_DIMENSIONS] Aircraft wingspan must be greater than 0 (got: ${aircraft.wingspan})`,
            { node: aircraft, property: 'wingspan' }
        );
    }
    if (aircraft.length <= 0) {
        accept('error',
            `[SFR20_DIMENSIONS] Aircraft length must be greater than 0 (got: ${aircraft.length})`,
            { node: aircraft, property: 'length' }
        );
    }
    if (aircraft.height <= 0) {
        accept('error',
            `[SFR20_DIMENSIONS] Aircraft height must be greater than 0 (got: ${aircraft.height})`,
            { node: aircraft, property: 'height' }
        );
    }
    if (aircraft.tailHeight !== undefined && aircraft.tailHeight <= 0) {
        accept('error',
            `[SFR20_DIMENSIONS] Aircraft tailHeight must be greater than 0 (got: ${aircraft.tailHeight})`,
            { node: aircraft, property: 'tailHeight' }
        );
    }
}

/** SFR20: Enforce positive dimensions on bay declarations. */
export function checkBayDimensions(bay: HangarBay, accept: ValidationAcceptor): void {
    if (bay.width <= 0) {
        accept('error',
            `[SFR20_DIMENSIONS] Bay width must be greater than 0 (got: ${bay.width})`,
            { node: bay, property: 'width' }
        );
    }
    if (bay.depth <= 0) {
        accept('error',
            `[SFR20_DIMENSIONS] Bay depth must be greater than 0 (got: ${bay.depth})`,
            { node: bay, property: 'depth' }
        );
    }
    if (bay.height <= 0) {
        accept('error',
            `[SFR20_DIMENSIONS] Bay height must be greater than 0 (got: ${bay.height})`,
            { node: bay, property: 'height' }
        );
    }
}

/** SFR20: Enforce positive dimensions on door declarations. */
export function checkDoorDimensions(door: HangarDoor, accept: ValidationAcceptor): void {
    if (door.width <= 0) {
        accept('error',
            `[SFR20_DIMENSIONS] Door width must be greater than 0 (got: ${door.width})`,
            { node: door, property: 'width' }
        );
    }
    if (door.height <= 0) {
        accept('error',
            `[SFR20_DIMENSIONS] Door height must be greater than 0 (got: ${door.height})`,
            { node: door, property: 'height' }
        );
    }
}

/** SFR20: Enforce non-negative margins on clearance envelope declarations. */
export function checkClearanceDimensions(clearance: ClearanceEnvelope, accept: ValidationAcceptor): void {
    if (clearance.lateralMargin < 0) {
        accept('error',
            `[SFR20_DIMENSIONS] Clearance lateralMargin must be 0 or greater (got: ${clearance.lateralMargin})`,
            { node: clearance, property: 'lateralMargin' }
        );
    }
    if (clearance.longitudinalMargin < 0) {
        accept('error',
            `[SFR20_DIMENSIONS] Clearance longitudinalMargin must be 0 or greater (got: ${clearance.longitudinalMargin})`,
            { node: clearance, property: 'longitudinalMargin' }
        );
    }
    if (clearance.verticalMargin < 0) {
        accept('error',
            `[SFR20_DIMENSIONS] Clearance verticalMargin must be 0 or greater (got: ${clearance.verticalMargin})`,
            { node: clearance, property: 'verticalMargin' }
        );
    }
}

/** SFR26: Warn when a clearance envelope is defined but never referenced by any aircraft or induction. */
export function checkUnreferencedClearanceEnvelope(clearance: ClearanceEnvelope, accept: ValidationAcceptor): void {
    const model = AstUtils.getContainerOfType(clearance, isModel);
    if (!model) return;

    const isReferenced =
        model.aircraftTypes.some(a => a.clearance?.ref === clearance) ||
        model.inductions.some(i => i.clearance?.ref === clearance) ||
        model.autoInductions.some(i => i.clearance?.ref === clearance);

    if (!isReferenced) {
        accept('warning',
            `[SFR26_UNREFERENCED_CLEARANCE] Clearance envelope '${clearance.name}' is defined but not referenced by any aircraft type or induction`,
            { node: clearance, property: 'name' }
        );
    }
}
