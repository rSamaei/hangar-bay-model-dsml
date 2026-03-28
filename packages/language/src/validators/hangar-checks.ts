import type { ValidationAcceptor } from 'langium';
import type { Hangar, HangarBay } from '../generated/ast.js';
import { AstUtils } from 'langium';
import { isModel } from '../generated/ast.js';
import { buildAccessGraph } from '../access-graph.js';

/** SFR_REACHABILITY_SKIPPED: Hint when hangar has inductions but no access graph. */
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

/** SFR7_ASYMMETRIC_ADJACENCY: Warn when explicit adjacency is not symmetric (non-grid hangars only). */
export function checkAsymmetricAdjacency(hangar: Hangar, accept: ValidationAcceptor): void {
    if (hangar.grid.rows !== undefined && hangar.grid.cols !== undefined) return;

    // Build a map from bay name → set of explicitly declared neighbour names
    const explicitAdj = new Map<string, Set<string>>();
    for (const bay of hangar.grid.bays) {
        const declared = new Set<string>();
        for (const adjRef of bay.adjacent ?? []) {
            if (adjRef.ref) declared.add(adjRef.ref.name);
        }
        explicitAdj.set(bay.name, declared);
    }

    for (const bay of hangar.grid.bays) {
        for (const adjRef of bay.adjacent ?? []) {
            const nb = adjRef.ref;
            if (!nb) continue;
            const nbDeclared = explicitAdj.get(nb.name);
            if (!nbDeclared?.has(bay.name)) {
                accept('warning',
                    `[SFR7_ASYMMETRIC_ADJACENCY] Bay '${bay.name}' declares '${nb.name}' as adjacent, but '${nb.name}' does not declare '${bay.name}' — the adjacency builder will add the reverse edge automatically, but explicit models should be symmetric.`,
                    { node: bay, property: 'adjacent' }
                );
            }
        }
    }
}

/** SFR_NONGRID_ADJACENCY / SFR_GRID_OVERRIDE: Warn when explicit adjacency contradicts grid coordinates. */
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
        const bayHasCoords = bayRow !== undefined && bayCol !== undefined;

        const gridNeighborNames = new Set<string>();
        if (bayHasCoords) {
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

            if (bayHasCoords && nb.row !== undefined && nb.col !== undefined) {
                const dr = Math.abs(bayRow! - nb.row);
                const dc = Math.abs(bayCol! - nb.col);
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
