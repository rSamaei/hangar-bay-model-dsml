import { CodeActionKind } from 'vscode-languageserver';
import type { CodeAction, CodeActionParams, Diagnostic } from 'vscode-languageserver';
import type { CodeActionProvider } from 'langium/lsp';
import type { LangiumDocument, MaybePromise } from 'langium';
import { AstUtils, CstUtils } from 'langium';
import { isInduction } from './generated/ast.js';
import type { Induction } from './generated/ast.js';
import { buildBayAdjacencyGraph } from './bay-adjacency.js';

interface BayExpansionParams {
    diagnostic: Diagnostic;
    document: LangiumDocument;
    induction: Induction;
    candidateCount: number;
    findCandidates: (assigned: Set<string>, adjacency: Map<string, Set<string>>) => string[];
    titleSingular: (bayList: string) => string;
    titlePlural: (bayList: string) => string;
}

function createBayExpansionFix(params: BayExpansionParams): CodeAction[] {
    const { diagnostic, document, induction, findCandidates, titleSingular, titlePlural } = params;

    const hangar = induction.hangar?.ref;
    if (!hangar) return [];

    const assigned = induction.bays
        .map(b => b.ref?.name)
        .filter((n): n is string => n !== undefined);
    if (assigned.length === 0) return [];

    const { adjacency } = buildBayAdjacencyGraph(hangar.grid);
    const assignedSet = new Set(assigned);
    const candidates = findCandidates(assignedSet, adjacency);
    if (candidates.length === 0) return [];

    const bays = induction.bays;
    if (bays.length === 0) return [];
    const insertPos = bays[bays.length - 1].$refNode?.range.end;
    if (!insertPos) return [];

    const bayList = candidates.map(b => `'${b}'`).join(', ');
    const title = candidates.length === 1 ? titleSingular(bayList) : titlePlural(bayList);

    return [{
        title,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        isPreferred: true,
        edit: {
            changes: {
                [document.textDocument.uri]: [{
                    range: { start: insertPos, end: insertPos },
                    newText: ' ' + candidates.join(' '),
                }]
            }
        }
    }];
}

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

    private createActionsForDiagnostic(
        diagnostic: Diagnostic,
        document: LangiumDocument
    ): CodeAction[] {
        const data = diagnostic.data as { ruleId?: string; evidence?: any } | undefined;
        const ruleId = data?.ruleId;

        if (ruleId === 'SFR12_BAY_FIT') return this.createBayFitWidthFix(diagnostic, document, data?.evidence);
        if (ruleId === 'SFR13_CONTIGUITY') return this.createContiguityFix(diagnostic, document, data?.evidence);
        if (ruleId === 'SFR25_BAY_COUNT') return this.createBayCountFix(diagnostic, document, data?.evidence);

        // Legacy fallback: substring match on message (backward compatibility)
        const msg = diagnostic.message;
        if (msg.includes('SFR13_CONTIGUITY')) return this.createContiguityFix(diagnostic, document);
        if (msg.includes('SFR25_BAY_COUNT')) return this.createBayCountFix(diagnostic, document);
        if (msg.includes('SFR12_BAY_FIT')) return this.createBayFitWidthFix(diagnostic, document);
        return [];
    }

    private createContiguityFix(diagnostic: Diagnostic, document: LangiumDocument, _evidence?: any): CodeAction[] {
        const induction = this.findInductionAtDiagnostic(document, diagnostic);
        if (!induction) return [];

        const assigned = induction.bays
            .map(b => b.ref?.name)
            .filter((n): n is string => n !== undefined);
        if (assigned.length < 2) return [];

        return createBayExpansionFix({
            diagnostic, document, induction,
            candidateCount: Infinity,
            findCandidates: (_assignedSet, adjacency) =>
                this.findBridgingBays(assigned, adjacency),
            titleSingular: (bayList) => `Add ${bayList} to restore bay contiguity`,
            titlePlural:   (bayList) => `Add ${bayList} to restore bay contiguity`,
        });
    }

    /** SFR12: Offer adjacent bays to cover wingspan (only width failures are fixable by adding bays). */
    private createBayFitWidthFix(
        diagnostic: Diagnostic,
        document: LangiumDocument,
        evidence?: { effectiveWingspan?: number; bayWidth?: number; widthFits?: boolean; [key: string]: any }
    ): CodeAction[] {
        let effectiveWingspan: number;
        let bayWidth: number;

        if (evidence !== undefined && evidence.effectiveWingspan !== undefined && evidence.bayWidth !== undefined) {
            if (evidence.widthFits !== false) return [];
            effectiveWingspan = evidence.effectiveWingspan;
            bayWidth = evidence.bayWidth;
        } else {
            const wingspanMatch = diagnostic.message.match(/wingspan:\s*([\d.]+)m\s*>\s*([\d.]+)m/);
            if (!wingspanMatch) return [];
            effectiveWingspan = parseFloat(wingspanMatch[1]);
            bayWidth = parseFloat(wingspanMatch[2]);
        }

        const induction = this.findInductionAtDiagnostic(document, diagnostic);
        if (!induction) return [];

        const assigned = induction.bays
            .map(b => b.ref?.name)
            .filter((n): n is string => n !== undefined);
        if (assigned.length === 0) return [];

        const needed = Math.ceil(effectiveWingspan / bayWidth) - assigned.length;
        if (needed <= 0) return [];

        const allBayNames = induction.hangar?.ref?.grid.bays.map(b => b.name) ?? [];

        return createBayExpansionFix({
            diagnostic, document, induction,
            candidateCount: needed,
            findCandidates: (assignedSet, adjacency) =>
                this.findAdjacentCandidateBays([...assignedSet], adjacency, allBayNames, needed),
            titleSingular: (bayList) => `Add bay ${bayList} to accommodate aircraft wingspan`,
            titlePlural:   (bayList) => `Add bays ${bayList} to accommodate aircraft wingspan`,
        });
    }

    private createBayCountFix(
        diagnostic: Diagnostic,
        document: LangiumDocument,
        evidence?: { effectiveMin?: number; assignedCount?: number; [key: string]: any }
    ): CodeAction[] {
        let needed: number;
        if (evidence !== undefined && evidence.effectiveMin !== undefined && evidence.assignedCount !== undefined) {
            needed = evidence.effectiveMin - evidence.assignedCount;
        } else {
            const match = diagnostic.message.match(/requires at least (\d+) bays.*?only (\d+)/);
            if (!match) return [];
            needed = parseInt(match[1], 10) - parseInt(match[2], 10);
        }
        if (needed <= 0) return [];

        const induction = this.findInductionAtDiagnostic(document, diagnostic);
        if (!induction) return [];

        const allBayNames = induction.hangar?.ref?.grid.bays.map(b => b.name) ?? [];

        return createBayExpansionFix({
            diagnostic, document, induction,
            candidateCount: needed,
            findCandidates: (assignedSet, adjacency) =>
                this.findAdjacentCandidateBays([...assignedSet], adjacency, allBayNames, needed),
            titleSingular: (bayList) => `Add bay ${bayList} to meet wingspan requirement`,
            titlePlural:   (bayList) => `Add bays ${bayList} to meet wingspan requirement`,
        });
    }

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

    /** BFS to find unassigned bays that bridge disconnected components of the assigned set. */
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

    /** Find up to `count` unassigned bays adjacent to the assigned set via BFS. */
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
