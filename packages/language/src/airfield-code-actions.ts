import { CodeActionKind } from 'vscode-languageserver';
import type { CodeAction, CodeActionParams, Diagnostic } from 'vscode-languageserver';
import type { CodeActionProvider } from 'langium/lsp';
import type { LangiumDocument, MaybePromise } from 'langium';
import { AstUtils, CstUtils } from 'langium';
import { isInduction } from './generated/ast.js';
import type { Induction } from './generated/ast.js';
import { buildBayAdjacencyGraph } from './bay-adjacency.js';

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
        if (msg.includes('SFR12_BAY_FIT')) {
            return this.createBayFitWidthFix(diagnostic, document);
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

        const { adjacency } = buildBayAdjacencyGraph(hangar.grid);
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
    // SFR12: Bay fit width fix
    // -------------------------------------------------------------------------

    /**
     * When the aircraft wingspan exceeds a single bay's width, offer to add
     * enough adjacent bays so their combined width covers the aircraft.
     * Height and depth violations cannot be resolved by adding bays, so only
     * wingspan failures get a fix.
     */
    private createBayFitWidthFix(diagnostic: Diagnostic, document: LangiumDocument): CodeAction[] {
        // Only fix wingspan (width) violations — height/depth can't be resolved by adding bays
        const wingspanMatch = diagnostic.message.match(/wingspan:\s*([\d.]+)m\s*>\s*([\d.]+)m/);
        if (!wingspanMatch) return [];

        const induction = this.findInductionAtDiagnostic(document, diagnostic);
        if (!induction) return [];

        const hangar = induction.hangar?.ref;
        if (!hangar) return [];

        const assigned = induction.bays
            .map(b => b.ref?.name)
            .filter((n): n is string => n !== undefined);
        if (assigned.length === 0) return [];

        const effectiveWingspan = parseFloat(wingspanMatch[1]);
        const bayWidth = parseFloat(wingspanMatch[2]);
        const needed = Math.ceil(effectiveWingspan / bayWidth) - assigned.length;
        if (needed <= 0) return [];

        const adjacency = this.buildAdjacencyGraph(hangar);
        const allBayNames = hangar.grid.bays.map(b => b.name);
        const candidates = this.findAdjacentCandidateBays(assigned, adjacency, allBayNames, needed);
        if (candidates.length === 0) return [];

        const insertPos = this.insertionPosition(induction);
        if (!insertPos) return [];

        const bayList = candidates.map(b => `'${b}'`).join(', ');
        const label = candidates.length === 1
            ? `Add bay ${bayList} to accommodate aircraft wingspan`
            : `Add bays ${bayList} to accommodate aircraft wingspan`;

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

        const { adjacency } = buildBayAdjacencyGraph(hangar.grid);
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
