import type { ValidationAcceptor } from 'langium';
import type { Induction } from '../generated/ast.js';
import { AstUtils } from 'langium';
import { isModel } from '../generated/ast.js';
import { buildAccessGraph, checkCorridorFit, checkDynamicBayReachability, reachableNodes } from '../access-graph.js';

export function checkBayReachability(induction: Induction, accept: ValidationAcceptor): void {
    const door = induction.door?.ref;
    const hangar = induction.hangar?.ref;
    const bays = induction.bays.map(b => b.ref).filter(b => b !== undefined);

    if (!door || !hangar || bays.length === 0) return;

    const doorNodeRef = door.accessNode?.ref;
    if (!doorNodeRef) return;

    const model = AstUtils.getContainerOfType(induction, isModel);
    if (!model) return;

    const graph = buildAccessGraph(hangar, model.accessPaths);
    if (!graph || !graph.nodes.has(doorNodeRef.name)) return;

    const reachable = reachableNodes([doorNodeRef.name], graph);

    for (const bay of bays) {
        const bayNodeRef = bay.accessNode?.ref;
        if (!bayNodeRef) continue;

        if (!reachable.has(bayNodeRef.name)) {
            accept('error',
                `[SFR17_REACHABILITY] Bay '${bay.name}' is not reachable from door '${door.name}'`,
                { node: induction, property: 'bays' }
            );
        }
    }
}

/**
 * SFR_DYNAMIC_REACHABILITY: Check that induction bays remain reachable from a
 * hangar door even after accounting for concurrent inductions that block the
 * access path. Silently skipped when no access graph has been modelled.
 */
export function checkDynamicBayBlockingReachability(induction: Induction, accept: ValidationAcceptor): void {
    const hangar = induction.hangar?.ref;
    if (!hangar) return;

    const model = AstUtils.getContainerOfType(induction, isModel);
    if (!model) return;

    const result = checkDynamicBayReachability(
        hangar,
        induction,
        model.inductions,
        model.accessPaths
    );

    if (!result.skipped && !result.ok) {
        accept('error', result.message, { node: induction, property: 'bays' });
    }
}

/**
 * SFR_CORRIDOR_FIT: Warn when the aircraft's effective wingspan exceeds the
 * width of a corridor node on the access path to an assigned bay.
 * Static check — concurrent inductions are not considered.
 */
export function checkCorridorFitReachability(induction: Induction, accept: ValidationAcceptor): void {
    const hangar = induction.hangar?.ref;
    const aircraft = induction.aircraft?.ref;
    if (!hangar || !aircraft) return;

    const model = AstUtils.getContainerOfType(induction, isModel);
    if (!model) return;

    const clearance = induction.clearance?.ref ?? aircraft.clearance?.ref;
    const wingspanEff = aircraft.wingspan + (clearance?.lateralMargin ?? 0);
    if (wingspanEff <= 0) return;

    const result = checkCorridorFit(hangar, induction, model.accessPaths, wingspanEff);

    for (const v of result.violations) {
        accept('warning',
            `[SFR_CORRIDOR_FIT] Aircraft '${aircraft.name}' (effective wingspan ${v.wingspanEff.toFixed(2)}m) cannot traverse corridor '${v.nodeName}' (width ${v.nodeWidth.toFixed(2)}m) on route to bay '${v.bayName}'.`,
            { node: induction, property: 'bays' }
        );
    }
}
