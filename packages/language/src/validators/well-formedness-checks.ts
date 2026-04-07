import type { ValidationAcceptor, AstNode } from 'langium';
import type { Model, Hangar, HangarBay, AccessLink } from '../generated/ast.js';

function checkDuplicateNames(
    items: Array<AstNode & { name: string }>,
    message: (name: string) => string,
    accept: ValidationAcceptor
): void {
    const seen = new Set<string>();
    for (const item of items) {
        if (seen.has(item.name)) {
            accept('error', message(item.name), { node: item, property: 'name' as any });
        } else {
            seen.add(item.name);
        }
    }
}

export function checkDuplicateAircraftNames(model: Model, accept: ValidationAcceptor): void {
    checkDuplicateNames(model.aircraftTypes,
        name => `[SFR27_DUPLICATE_AIRCRAFT] Duplicate aircraft type name '${name}' — each aircraft type must have a unique name`,
        accept);
}

export function checkDuplicateBayNames(hangar: Hangar, accept: ValidationAcceptor): void {
    checkDuplicateNames(hangar.grid.bays,
        name => `[SFR27_DUPLICATE_BAY] Duplicate bay name '${name}' in hangar '${hangar.name}' — bay names must be unique within a hangar`,
        accept);
}

export function checkDuplicateHangarNames(model: Model, accept: ValidationAcceptor): void {
    checkDuplicateNames(model.hangars,
        name => `[SFR27_DUPLICATE_HANGAR] Duplicate hangar name '${name}' — each hangar must have a unique name`,
        accept);
}

export function checkDuplicateClearanceNames(model: Model, accept: ValidationAcceptor): void {
    checkDuplicateNames(model.clearanceEnvelopes,
        name => `[WF_DUPLICATE_CLEARANCE] Duplicate clearance envelope name '${name}' — clearance envelope names must be unique`,
        accept);
}

export function checkSelfAdjacency(bay: HangarBay, accept: ValidationAcceptor): void {
    for (let i = 0; i < bay.adjacent.length; i++) {
        if (bay.adjacent[i].ref === bay) {
            accept('warning',
                `[SFR28_SELF_ADJACENCY] Bay '${bay.name}' declares itself as adjacent — self-adjacency is not meaningful`,
                { node: bay, property: 'adjacent', index: i }
            );
        }
    }
}

export function checkSelfLoopAccessLink(link: AccessLink, accept: ValidationAcceptor): void {
    const fromNode = link.from?.ref;
    const toNode = link.to?.ref;
    if (fromNode !== undefined && toNode !== undefined && fromNode === toNode) {
        accept('warning',
            `[SFR28_SELF_LOOP] Access link from '${fromNode.name}' to '${fromNode.name}' is a self-loop`,
            { node: link, property: 'to' }
        );
    }
}

export function checkAtLeastOneHangar(model: Model, accept: ValidationAcceptor): void {
    if (model.hangars.length === 0) {
        accept('warning',
            `[WF_NO_HANGARS] Airfield declares no hangars — the model has no spatial context`,
            { node: model, property: 'hangars' }
        );
    }
}
