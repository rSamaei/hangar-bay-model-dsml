import type { ValidationAcceptor } from 'langium';
import type { Model, Hangar, HangarBay, AccessLink } from '../generated/ast.js';

// ---------------------------------------------------------------------------
// 2a — Duplicate aircraft type names (Equation 5.21)
// ---------------------------------------------------------------------------

/** WF_DUPLICATE_AIRCRAFT: No two AircraftType nodes in the same model may share a name. */
export function checkDuplicateAircraftNames(model: Model, accept: ValidationAcceptor): void {
    const seen = new Map<string, true>();
    for (const aircraft of model.aircraftTypes) {
        const name = aircraft.name;
        if (seen.has(name)) {
            accept('error',
                `[WF_DUPLICATE_AIRCRAFT] Duplicate aircraft type name '${name}' — each aircraft type must have a unique name`,
                { node: aircraft, property: 'name' }
            );
        } else {
            seen.set(name, true);
        }
    }
}

// ---------------------------------------------------------------------------
// 2b — Duplicate bay names within a hangar (Equation 5.21)
// ---------------------------------------------------------------------------

/** WF_DUPLICATE_BAY: No two HangarBay nodes within the same Hangar may share a name. */
export function checkDuplicateBayNames(hangar: Hangar, accept: ValidationAcceptor): void {
    const seen = new Map<string, true>();
    for (const bay of hangar.grid.bays) {
        const name = bay.name;
        if (seen.has(name)) {
            accept('error',
                `[WF_DUPLICATE_BAY] Duplicate bay name '${name}' in hangar '${hangar.name}' — bay names must be unique within a hangar`,
                { node: bay, property: 'name' }
            );
        } else {
            seen.set(name, true);
        }
    }
}

// ---------------------------------------------------------------------------
// 2c — Duplicate hangar names (Equation 5.21)
// ---------------------------------------------------------------------------

/** WF_DUPLICATE_HANGAR: No two Hangar nodes in the same model may share a name. */
export function checkDuplicateHangarNames(model: Model, accept: ValidationAcceptor): void {
    const seen = new Map<string, true>();
    for (const hangar of model.hangars) {
        const name = hangar.name;
        if (seen.has(name)) {
            accept('error',
                `[WF_DUPLICATE_HANGAR] Duplicate hangar name '${name}' — each hangar must have a unique name`,
                { node: hangar, property: 'name' }
            );
        } else {
            seen.set(name, true);
        }
    }
}

// ---------------------------------------------------------------------------
// 2d — Duplicate clearance envelope names (Equation 5.21)
// ---------------------------------------------------------------------------

/** WF_DUPLICATE_CLEARANCE: No two ClearanceEnvelope nodes may share a name. */
export function checkDuplicateClearanceNames(model: Model, accept: ValidationAcceptor): void {
    const seen = new Map<string, true>();
    for (const clearance of model.clearanceEnvelopes) {
        const name = clearance.name;
        if (seen.has(name)) {
            accept('error',
                `[WF_DUPLICATE_CLEARANCE] Duplicate clearance envelope name '${name}' — clearance envelope names must be unique`,
                { node: clearance, property: 'name' }
            );
        } else {
            seen.set(name, true);
        }
    }
}

// ---------------------------------------------------------------------------
// 2e — Self-adjacency (SFR7)
// ---------------------------------------------------------------------------

/** SFR7_SELF_ADJACENCY: A bay's adjacent list must not contain a reference to itself. */
export function checkSelfAdjacency(bay: HangarBay, accept: ValidationAcceptor): void {
    for (let i = 0; i < bay.adjacent.length; i++) {
        if (bay.adjacent[i].ref === bay) {
            accept('warning',
                `[SFR7_SELF_ADJACENCY] Bay '${bay.name}' declares itself as adjacent — self-adjacency is not meaningful`,
                { node: bay, property: 'adjacent', index: i }
            );
        }
    }
}

// ---------------------------------------------------------------------------
// 2f — Self-loop access links (SFR7)
// ---------------------------------------------------------------------------

/** SFR7_SELF_LOOP: An AccessLink must not connect a node to itself. */
export function checkSelfLoopAccessLink(link: AccessLink, accept: ValidationAcceptor): void {
    const fromNode = link.from?.ref;
    const toNode = link.to?.ref;
    if (fromNode !== undefined && toNode !== undefined && fromNode === toNode) {
        accept('warning',
            `[SFR7_SELF_LOOP] Access link from '${fromNode.name}' to '${fromNode.name}' is a self-loop`,
            { node: link, property: 'to' }
        );
    }
}

// ---------------------------------------------------------------------------
// 2g — Empty airfield (SFR4 — at least one hangar)
// ---------------------------------------------------------------------------

/** WF_NO_HANGARS: A model must declare at least one hangar to have spatial context. */
export function checkAtLeastOneHangar(model: Model, accept: ValidationAcceptor): void {
    if (model.hangars.length === 0) {
        accept('warning',
            `[WF_NO_HANGARS] Airfield declares no hangars — the model has no spatial context`,
            { node: model, property: 'hangars' }
        );
    }
}
