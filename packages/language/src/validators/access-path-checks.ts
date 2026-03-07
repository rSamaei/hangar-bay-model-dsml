import type { ValidationAcceptor } from 'langium';
import type { AccessPath, AccessNode } from '../generated/ast.js';

export function checkAccessPathConnectivity(accessPath: AccessPath, accept: ValidationAcceptor): void {
    const nodes = accessPath.nodes;
    if (nodes.length === 0) return;

    const adjacency = new Map<AccessNode, Set<AccessNode>>();
    for (const node of nodes) {
        adjacency.set(node, new Set());
    }

    for (const link of accessPath.links) {
        const from = link.from?.ref;
        const to = link.to?.ref;
        if (!from || !to) continue;

        adjacency.get(from)?.add(to);
        if (link.bidirectional) {
            adjacency.get(to)?.add(from);
        }
    }

    const reachable = new Set<AccessNode>();
    const queue = [nodes[0]];
    reachable.add(nodes[0]);

    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const neighbor of adjacency.get(current) ?? []) {
            if (!reachable.has(neighbor)) {
                reachable.add(neighbor);
                queue.push(neighbor);
            }
        }
    }

    for (const node of nodes) {
        if (!reachable.has(node)) {
            accept('warning',
                `[SFR19_PATH_CONNECTIVITY] Node ${node.name} is not connected to the rest of the access path`,
                { node: accessPath, property: 'nodes' }
            );
        }
    }
}
