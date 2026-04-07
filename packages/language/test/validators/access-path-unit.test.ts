/**
 * Unit tests for access-path-checks.ts (SFR20_PATH_CONNECTIVITY rule).
 *
 * Imports directly from the TypeScript source for v8 coverage.
 * Uses structural mocks — no Langium runtime.
 */
import { describe, expect, test, vi } from 'vitest';
import type { ValidationAcceptor } from 'langium';
import type { AccessPath, AccessNode } from '../../src/generated/ast.js';
import {
    checkAccessPathConnectivity,
} from '../../src/validators/access-path-checks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockAccept(): ValidationAcceptor {
    return vi.fn() as unknown as ValidationAcceptor;
}

function wasCalled(accept: ValidationAcceptor): boolean {
    return (accept as ReturnType<typeof vi.fn>).mock.calls.length > 0;
}

function calledWithCode(accept: ValidationAcceptor, code: string): boolean {
    const calls = (accept as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    return calls.some(args => typeof args[1] === 'string' && (args[1] as string).includes(code));
}

function mkNode(name: string): AccessNode {
    return { name } as unknown as AccessNode;
}

function mkPath(
    nodes: AccessNode[],
    links: { from: AccessNode; to: AccessNode; bidirectional?: boolean }[]
): AccessPath {
    return {
        nodes,
        links: links.map(l => ({
            from: { ref: l.from },
            to:   { ref: l.to },
            bidirectional: l.bidirectional ?? false,
        })),
    } as unknown as AccessPath;
}

// ---------------------------------------------------------------------------
// checkAccessPathConnectivity — SFR20_PATH_CONNECTIVITY
// ---------------------------------------------------------------------------

describe('checkAccessPathConnectivity', () => {
    test('empty nodes array → no warning (early return)', () => {
        const accept = mockAccept();
        const path = mkPath([], []);
        checkAccessPathConnectivity(path, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('single node → trivially connected, no warning', () => {
        const accept = mockAccept();
        const A = mkNode('A');
        const path = mkPath([A], []);
        checkAccessPathConnectivity(path, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('A↔B bidirectional link → fully connected, no warning', () => {
        const accept = mockAccept();
        const A = mkNode('A');
        const B = mkNode('B');
        const path = mkPath([A, B], [{ from: A, to: B, bidirectional: true }]);
        checkAccessPathConnectivity(path, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('A→B→C unidirectional chain (A is start) → all reachable, no warning', () => {
        const accept = mockAccept();
        const A = mkNode('A');
        const B = mkNode('B');
        const C = mkNode('C');
        const path = mkPath(
            [A, B, C],
            [{ from: A, to: B }, { from: B, to: C }]
        );
        checkAccessPathConnectivity(path, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('C has no edges — disconnected node → SFR20_PATH_CONNECTIVITY warning', () => {
        const accept = mockAccept();
        const A = mkNode('A');
        const B = mkNode('B');
        const C = mkNode('C');  // isolated — no links to/from C
        const path = mkPath(
            [A, B, C],
            [{ from: A, to: B, bidirectional: true }]
        );
        checkAccessPathConnectivity(path, accept);
        expect(calledWithCode(accept, 'SFR20_PATH_CONNECTIVITY')).toBe(true);
    });

    test('directed B→A with A as start node → B unreachable → SFR19 warning', () => {
        const accept = mockAccept();
        const A = mkNode('A');
        const B = mkNode('B');
        // Only edge is B→A; BFS starts at A (nodes[0]) so B is never reached
        const path = mkPath([A, B], [{ from: B, to: A }]);
        checkAccessPathConnectivity(path, accept);
        expect(calledWithCode(accept, 'SFR20_PATH_CONNECTIVITY')).toBe(true);
    });

    test('two disconnected components → warning for each node in the second component', () => {
        const accept = mockAccept();
        const A = mkNode('A');
        const B = mkNode('B');
        const C = mkNode('C');
        const D = mkNode('D');
        // A↔B and C↔D, but no link between components; BFS starts at A
        const path = mkPath(
            [A, B, C, D],
            [
                { from: A, to: B, bidirectional: true },
                { from: C, to: D, bidirectional: true },
            ]
        );
        checkAccessPathConnectivity(path, accept);
        expect(calledWithCode(accept, 'SFR20_PATH_CONNECTIVITY')).toBe(true);
        // Both C and D are unreachable → accept called twice
        const calls = (accept as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.length).toBe(2);
    });
});
