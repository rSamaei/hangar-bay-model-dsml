import type { AircraftType, Hangar, HangarBay, ClearanceEnvelope } from '../../../language/out/generated/ast.js';
import { calculateEffectiveDimensions } from '../geometry/dimensions.js';
import { calculateBaysRequired } from '../geometry/bays-required.js';
import { buildAdjacencyGraph } from '../geometry/adjacency.js';
import { checkContiguity } from '../rules/contiguity.js';
import { checkBaySetFitEffective } from '../rules/bay-fit.js';

export function findSuitableBaySets(
    aircraft: AircraftType,
    hangar: Hangar,
    clearance?: ClearanceEnvelope,
    maxBaysPerSet: number = 5
): { baySets: HangarBay[][]; rejections: any[]; derivedProps: any } {
    const effectiveDims = calculateEffectiveDimensions(aircraft, clearance);
    const baysRequiredInfo = calculateBaysRequired(effectiveDims, hangar);
    const { adjacency, metadata } = buildAdjacencyGraph(hangar);
    
    const suitable: HangarBay[][] = [];
    const rejections: any[] = [];

    console.log(`  [findSuitableBaySets] ${baysRequiredInfo.evidence.calculation}`);
    console.log(`  [findSuitableBaySets] Adjacency: grid=${metadata.gridDerived}, ` +
               `gridEdges=${metadata.gridEdges}, explicitEdges=${metadata.explicitEdges}`);

    const candidates: HangarBay[][] = [];
    
    for (let size = baysRequiredInfo.baysRequired; size <= Math.min(maxBaysPerSet, hangar.grid.bays.length); size++) {
        const setsOfSize = findConnectedSetsOfSize(hangar.grid.bays, adjacency, size);
        candidates.push(...setsOfSize);
        
        if (candidates.length > 0) {
            console.log(`  [findSuitableBaySets] Found ${candidates.length} connected sets of size ${size}`);
            break;
        }
    }

    for (const baySet of candidates) {
        const contiguityCheck = checkContiguity(baySet.map(b => b.name), adjacency, metadata);
        if (!contiguityCheck.ok) {
            rejections.push(contiguityCheck);
            continue;
        }

        const fitCheck = checkBaySetFitEffective(effectiveDims, baySet, aircraft.name);
        if (fitCheck.ok) {
            suitable.push(baySet);
        } else {
            rejections.push(fitCheck);
        }
    }

    suitable.sort((a, b) => {
        if (a.length !== b.length) return a.length - b.length;
        const namesA = a.map(bay => bay.name).sort().join(',');
        const namesB = b.map(bay => bay.name).sort().join(',');
        return namesA.localeCompare(namesB);
    });

    return { 
        baySets: suitable, 
        rejections,
        derivedProps: {
            ...baysRequiredInfo,
            adjacencyMetadata: metadata
        }
    };
}

export function findConnectedSetsOfSize(
    allBays: HangarBay[],
    adjacency: Map<string, Set<string>>,
    targetSize: number
): HangarBay[][] {
    const results: HangarBay[][] = [];
    const seen = new Set<string>();

    for (const startBay of allBays) {
        const queue: { current: HangarBay[]; visited: Set<string> }[] = [
            { current: [startBay], visited: new Set([startBay.name]) }
        ];

        while (queue.length > 0) {
            const { current, visited } = queue.shift()!;

            if (current.length === targetSize) {
                const signature = current.map(b => b.name).sort().join(',');
                if (!seen.has(signature)) {
                    seen.add(signature);
                    results.push([...current]);
                }
                continue;
            }

            if (current.length >= targetSize) continue;

            const lastBay = current[current.length - 1];
            const neighbors = adjacency.get(lastBay.name) ?? new Set();

            for (const neighborName of neighbors) {
                if (!visited.has(neighborName)) {
                    const neighborBay = allBays.find(b => b.name === neighborName);
                    if (neighborBay) {
                        const newVisited = new Set(visited);
                        newVisited.add(neighborName);
                        queue.push({
                            current: [...current, neighborBay],
                            visited: newVisited
                        });
                    }
                }
            }
        }
    }

    return results;
}