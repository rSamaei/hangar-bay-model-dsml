import { CodeActionKind } from 'vscode-languageserver';
import type { CodeAction, CodeActionParams, Diagnostic } from 'vscode-languageserver';
import type { CodeActionProvider } from 'langium/lsp';
import type { LangiumDocument, MaybePromise } from 'langium';
import { AstUtils, CstUtils } from 'langium';
import { isInduction } from './generated/ast.js';
import type { Induction, Hangar } from './generated/ast.js';

/**
 * Provides quick-fix code actions for two rules:
 *
 *  SFR13_CONTIGUITY  — bay set not connected: offer to insert bridging bay(s)
 *  SFR25_BAY_COUNT   — too few bays for wingspan: offer to insert adjacent bay(s)
 */
export class AirfieldCodeActionProvider implements CodeActionProvider {

    getCodeActions(
        document: LangiumDocument,
        params: CodeActionParams
    ): MaybePromise<Array<CodeAction> | undefined> {
        const result: CodeAction[] = [];
        for (const diagnostic of params.context.diagnostics) {
            const actions = this.createActionsForDiagnostic(diagnostic, document);
            result.push(...actions);
        }
        return result.length > 0 ? result : undefined;
    }

    // -------------------------------------------------------------------------
    // Dispatch
    // -------------------------------------------------------------------------

    private createActionsForDiagnostic(
        diagnostic: Diagnostic,
        document: LangiumDocument
    ): CodeAction[] {
        const msg = diagnostic.message;
        if (msg.includes('SFR13_CONTIGUITY')) {
            return this.createContiguityFix(diagnostic, document);
        }
        if (msg.includes('SFR25_BAY_COUNT')) {
            return this.createBayCountFix(diagnostic, document);
        }
        return [];
    }

    // -------------------------------------------------------------------------
    // SFR13: Contiguity fix
    // -------------------------------------------------------------------------

    private createContiguityFix(diagnostic: Diagnostic, document: LangiumDocument): CodeAction[] {
        const induction = this.findInductionAtDiagnostic(document, diagnostic);
        if (!induction) return [];

        const hangar = induction.hangar?.ref;
        if (!hangar) return [];

        const assigned = induction.bays
            .map(b => b.ref?.name)
            .filter((n): n is string => n !== undefined);
        if (assigned.length < 2) return [];

        const adjacency = this.buildAdjacencyGraph(hangar);
        const bridgingBays = this.findBridgingBays(assigned, adjacency);
        if (bridgingBays.length === 0) return [];

        const insertPos = this.insertionPosition(induction);
        if (!insertPos) return [];

        const bayList = bridgingBays.map(b => `'${b}'`).join(', ');
        return [{
            title: `Add ${bayList} to restore bay contiguity`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: true,
            edit: {
                changes: {
                    [document.textDocument.uri]: [{
                        range: { start: insertPos, end: insertPos },
                        newText: ' ' + bridgingBays.join(' ')
                    }]
                }
            }
        }];
    }

    // -------------------------------------------------------------------------
    // SFR25: Bay count fix
    // -------------------------------------------------------------------------

    private createBayCountFix(diagnostic: Diagnostic, document: LangiumDocument): CodeAction[] {
        const induction = this.findInductionAtDiagnostic(document, diagnostic);
        if (!induction) return [];

        const hangar = induction.hangar?.ref;
        if (!hangar) return [];

        // Parse "requires at least N bays … but only M is/are assigned"
        const match = diagnostic.message.match(/requires at least (\d+) bays.*?only (\d+)/);
        if (!match) return [];
        const needed = parseInt(match[1], 10) - parseInt(match[2], 10);
        if (needed <= 0) return [];

        const assigned = induction.bays
            .map(b => b.ref?.name)
            .filter((n): n is string => n !== undefined);

        const adjacency = this.buildAdjacencyGraph(hangar);
        const allBayNames = hangar.grid.bays.map(b => b.name);
        const candidates = this.findAdjacentCandidateBays(assigned, adjacency, allBayNames, needed);
        if (candidates.length === 0) return [];

        const insertPos = this.insertionPosition(induction);
        if (!insertPos) return [];

        const bayList = candidates.map(b => `'${b}'`).join(', ');
        const label = candidates.length === 1
            ? `Add bay ${bayList} to meet wingspan requirement`
            : `Add bays ${bayList} to meet wingspan requirement`;

        return [{
            title: label,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: true,
            edit: {
                changes: {
                    [document.textDocument.uri]: [{
                        range: { start: insertPos, end: insertPos },
                        newText: ' ' + candidates.join(' ')
                    }]
                }
            }
        }];
    }

    // -------------------------------------------------------------------------
    // Helpers: AST / CST navigation
    // -------------------------------------------------------------------------

    /**
     * Find the Induction node that "owns" the diagnostic position.
     * Walks up the CST leaf at the diagnostic start offset.
     */
    private findInductionAtDiagnostic(
        document: LangiumDocument,
        diagnostic: Diagnostic
    ): Induction | undefined {
        const rootCst = document.parseResult.value?.$cstNode;
        if (!rootCst) return undefined;
        const offset = document.textDocument.offsetAt(diagnostic.range.start);
        const leaf = CstUtils.findLeafNodeAtOffset(rootCst, offset);
        if (!leaf) return undefined;
        return AstUtils.getContainerOfType(leaf.astNode, isInduction);
    }

    /**
     * Return the LSP Position immediately after the last bay reference token.
     * New bay names are appended here, separated by a space.
     */
    private insertionPosition(induction: Induction): import('vscode-languageserver-types').Position | undefined {
        const bays = induction.bays;
        if (bays.length === 0) return undefined;
        const lastRefNode = bays[bays.length - 1].$refNode;
        return lastRefNode?.range.end;
    }

    // -------------------------------------------------------------------------
    // Helpers: Bay adjacency graph
    // -------------------------------------------------------------------------

    /**
     * Build a symmetric adjacency map for the hangar's bay grid.
     * Prefers explicit grid coordinates (row/col) when available;
     * falls back to declarative `adjacent` references.
     */
    private buildAdjacencyGraph(hangar: Hangar): Map<string, Set<string>> {
        const adj = new Map<string, Set<string>>();
        for (const bay of hangar.grid.bays) {
            adj.set(bay.name, new Set());
        }

        const hasGrid = hangar.grid.rows !== undefined && hangar.grid.cols !== undefined;
        if (hasGrid) {
            for (const bay of hangar.grid.bays) {
                if (bay.row === undefined || bay.col === undefined) continue;
                const r = bay.row;
                const c = bay.col;
                for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
                    const nb = hangar.grid.bays.find(b => b.row === r + dr && b.col === c + dc);
                    if (nb) adj.get(bay.name)!.add(nb.name);
                }
            }
        }

        for (const bay of hangar.grid.bays) {
            for (const adjacentRef of (bay.adjacent ?? [])) {
                const nbName = adjacentRef.ref?.name;
                if (!nbName) continue;
                adj.get(bay.name)!.add(nbName);
                adj.get(nbName)?.add(bay.name);
            }
        }

        return adj;
    }

    // -------------------------------------------------------------------------
    // Helpers: Bridging bay search (for SFR13)
    // -------------------------------------------------------------------------

    /**
     * Given an assigned set of bays that are NOT all connected, find the
     * smallest set of currently-unassigned bays whose addition would connect
     * the two disconnected components.
     *
     * Algorithm:
     *  1. BFS within `assigned` only → componentA (reachable from assigned[0])
     *  2. Identify the unreachable assigned bays (componentB targets)
     *  3. BFS through the full hangar graph from componentA, traversing only
     *     unassigned nodes as intermediates, until a target is reached
     *  4. Reconstruct the path; return only the unassigned intermediate bays
     */
    private findBridgingBays(
        assigned: string[],
        adjacency: Map<string, Set<string>>
    ): string[] {
        if (assigned.length <= 1) return [];

        const assignedSet = new Set(assigned);

        // Step 1: BFS inside the assigned set only
        const reachable = new Set<string>([assigned[0]]);
        const q1: string[] = [assigned[0]];
        while (q1.length > 0) {
            const cur = q1.shift()!;
            for (const nb of adjacency.get(cur) ?? []) {
                if (assignedSet.has(nb) && !reachable.has(nb)) {
                    reachable.add(nb);
                    q1.push(nb);
                }
            }
        }

        const unreachableTargets = new Set(assigned.filter(b => !reachable.has(b)));
        if (unreachableTargets.size === 0) return []; // already contiguous

        // Step 2: BFS through full graph from reachable component
        // Traverse freely through unassigned bays; stop when hitting a target
        const parent = new Map<string, string | null>();
        const q2: string[] = [];
        for (const b of reachable) {
            parent.set(b, null);
            q2.push(b);
        }

        let found: string | undefined;
        outer: while (q2.length > 0) {
            const cur = q2.shift()!;
            for (const nb of adjacency.get(cur) ?? []) {
                if (parent.has(nb)) continue;
                parent.set(nb, cur);
                if (unreachableTargets.has(nb)) {
                    found = nb;
                    break outer;
                }
                // Only expand through unassigned intermediates
                if (!assignedSet.has(nb)) {
                    q2.push(nb);
                }
            }
        }

        if (!found) return [];

        // Step 3: Reconstruct path — collect unassigned intermediates only
        const bridging: string[] = [];
        let cur: string | null = parent.get(found) ?? null;
        while (cur !== null && !reachable.has(cur)) {
            if (!assignedSet.has(cur)) {
                bridging.unshift(cur);
            }
            cur = parent.get(cur) ?? null;
        }
        return bridging;
    }

    // -------------------------------------------------------------------------
    // Helpers: Adjacent candidate search (for SFR25)
    // -------------------------------------------------------------------------

    /**
     * Find up to `count` unassigned bays adjacent to the currently assigned set.
     * Uses BFS outward from the assigned frontier.
     */
    private findAdjacentCandidateBays(
        assigned: string[],
        adjacency: Map<string, Set<string>>,
        _allBayNames: string[],
        count: number
    ): string[] {
        const seen = new Set<string>(assigned);
        const candidates: string[] = [];
        let frontier = [...assigned];

        while (frontier.length > 0 && candidates.length < count) {
            const next: string[] = [];
            for (const cur of frontier) {
                for (const nb of adjacency.get(cur) ?? []) {
                    if (!seen.has(nb)) {
                        seen.add(nb);
                        candidates.push(nb);
                        next.push(nb);
                        if (candidates.length >= count) break;
                    }
                }
                if (candidates.length >= count) break;
            }
            frontier = next;
        }

        return candidates;
    }
}
