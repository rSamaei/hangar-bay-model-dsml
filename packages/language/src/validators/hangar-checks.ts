import type { ValidationAcceptor } from 'langium';
import type { Hangar, HangarBay } from '../generated/ast.js';
import { AstUtils } from 'langium';
import { isModel } from '../generated/ast.js';
import { buildAccessGraph } from '../access-graph.js';

/**
 * SFR_REACHABILITY_SKIPPED: Info-level diagnostic emitted once per hangar
 * when the hangar has at least one induction targeting it but no access graph
 * has been modelled (no accessNode hooks on any of its doors or bays).
 *
 * This tells authors that dynamic bay-blocking analysis was not performed and
 * they can enable it by defining an accessPath with nodes linked to their doors
 * and bays.
 */
export function checkReachabilitySkipped(hangar: Hangar, accept: ValidationAcceptor): void {
    const model = AstUtils.getContainerOfType(hangar, isModel);
    if (!model) return;

    const hasInduction = model.inductions.some(i => i.hangar?.ref === hangar);
    if (!hasInduction) return;

    const graph = buildAccessGraph(hangar, model.accessPaths);
    if (graph !== null) return;

    accept('hint',
        `[SFR_REACHABILITY_SKIPPED] Hangar '${hangar.name}' has no access path defined — reachability analysis was not performed. Define an accessPath to enable bay-blocking checks.`,
        { node: hangar, property: 'name' }
    );
}

/**
 * SFR_NONGRID_ADJACENCY / SFR_GRID_OVERRIDE: Warn when explicit adjacent {}
 * declarations contradict the grid-derived 4-connected neighbour structure.
 *
 * SFR_NONGRID_ADJACENCY fires when Bay A declares Bay B as adjacent but their
 * grid coordinates are not 4-connected (Manhattan distance != 1).
 *
 * SFR_GRID_OVERRIDE fires when Bay A has a non-empty explicit adjacent {} block
 * but a grid-neighbour Bay B is absent from that list (the grid edge is silently
 * overridden by the explicit declaration).
 *
 * Both checks are skipped for bays without grid coordinates and for bays with
 * no explicit adjacent {} block, so pure-grid hangars never produce false positives.
 */
export function checkAdjacencyConsistency(hangar: Hangar, accept: ValidationAcceptor): void {
    if (hangar.grid.rows === undefined || hangar.grid.cols === undefined) return;

    const bayByCoord = new Map<string, HangarBay>();
    for (const bay of hangar.grid.bays) {
        if (bay.row !== undefined && bay.col !== undefined) {
            bayByCoord.set(`${bay.row},${bay.col}`, bay);
        }
    }

    const is8Connected = hangar.grid.adjacency === 8;
    const offsets = [
        { dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
        ...(is8Connected ? [
            { dr: -1, dc: -1 }, { dr: -1, dc: 1 },
            { dr: 1, dc: -1 }, { dr: 1, dc: 1 }
        ] : [])
    ];

    for (const bay of hangar.grid.bays) {
        if (!bay.adjacent || bay.adjacent.length === 0) continue;

        const bayRow = bay.row;
        const bayCol = bay.col;

        const gridNeighborNames = new Set<string>();
        if (bayRow !== undefined && bayCol !== undefined) {
            for (const { dr, dc } of offsets) {
                const nb = bayByCoord.get(`${bayRow + dr},${bayCol + dc}`);
                if (nb) gridNeighborNames.add(nb.name);
            }
        }

        const explicitNeighborNames = new Set<string>();
        for (const adjRef of bay.adjacent) {
            const nb = adjRef.ref;
            if (!nb) continue;
            explicitNeighborNames.add(nb.name);

            if (bayRow !== undefined && bayCol !== undefined &&
                    nb.row !== undefined && nb.col !== undefined) {
                const dr = Math.abs(bayRow - nb.row);
                const dc = Math.abs(bayCol - nb.col);
                const isValidNeighbour = is8Connected
                    ? Math.max(dr, dc) === 1
                    : (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
                if (!isValidNeighbour) {
                    accept('warning',
                        `[SFR_NONGRID_ADJACENCY] Bay '${bay.name}' and Bay '${nb.name}' are declared adjacent but are not grid-neighbours (distance: row ${dr}, col ${dc}). Verify this is intentional for a non-rectangular layout.`,
                        { node: bay, property: 'adjacent' }
                    );
                }
            }
        }

        for (const gridNbName of gridNeighborNames) {
            if (!explicitNeighborNames.has(gridNbName)) {
                accept('warning',
                    `[SFR_GRID_OVERRIDE] Bay '${bay.name}' has explicit adjacency that excludes grid-neighbour '${gridNbName}'. Grid adjacency to '${gridNbName}' is overridden.`,
                    { node: bay, property: 'adjacent' }
                );
            }
        }
    }
}
