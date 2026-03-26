/**
 * Custom hover provider for the Airfield DSL.
 *
 * Shows computed derived properties (effective dimensions, bays required,
 * contiguity, clearance margins) when hovering over AST nodes in the editor.
 */
import type { AstNode, MaybePromise, LangiumDocument } from 'langium';
import { CstUtils } from 'langium';
import { AstNodeHoverProvider } from 'langium/lsp';
import type { LangiumServices } from 'langium/lsp';
import type { Hover, HoverParams } from 'vscode-languageserver';
import {
    isInduction, isAircraftType, isHangarBay, isClearanceEnvelope,
    type AircraftType, type ClearanceEnvelope, type Induction, type HangarBay
} from './generated/ast.js';
import { checkBayContiguity } from './feasibility-engine.js';
import { greedyBaysRequired } from './validators/induction-checks.js';

export class AirfieldHoverProvider extends AstNodeHoverProvider {
    constructor(services: LangiumServices) {
        super(services);
    }

    /**
     * Override to also provide hover for keyword positions (e.g. `induct`)
     * which the default implementation skips because they aren't name tokens.
     */
    override async getHoverContent(document: LangiumDocument, params: HoverParams): Promise<Hover | undefined> {
        // Try the default name-based resolution first
        const result = await super.getHoverContent(document, params);
        if (result) return result;

        // Fall back: find the leaf CST node at the cursor and check its AST parent
        const rootCst = document.parseResult?.value?.$cstNode;
        if (!rootCst) return undefined;
        const offset = document.textDocument.offsetAt(params.position);
        const leaf = CstUtils.findLeafNodeAtOffset(rootCst, offset);
        if (!leaf?.astNode) return undefined;

        const content = await this.getAstNodeHoverContent(leaf.astNode);
        if (typeof content === 'string') {
            return { contents: { kind: 'markdown', value: content } };
        }
        return undefined;
    }

    protected getAstNodeHoverContent(node: AstNode): MaybePromise<string | undefined> {
        if (isInduction(node)) return this.inductionHover(node);
        if (isAircraftType(node)) return this.aircraftHover(node);
        if (isHangarBay(node)) return this.bayHover(node);
        if (isClearanceEnvelope(node)) return this.clearanceHover(node);
        return undefined;
    }

    private effectiveDims(aircraft: AircraftType, clearance?: ClearanceEnvelope) {
        const ew = aircraft.wingspan + (clearance?.lateralMargin ?? 0);
        const el = aircraft.length + (clearance?.longitudinalMargin ?? 0);
        const eh = (aircraft.tailHeight ?? aircraft.height) + (clearance?.verticalMargin ?? 0);
        return { ew, el, eh };
    }

    private fmt(n: number): string {
        return n % 1 === 0 ? `${n}` : n.toFixed(2);
    }

    private inductionHover(ind: Induction): string | undefined {
        const aircraft = ind.aircraft?.ref;
        if (!aircraft) return undefined;
        const hangar = ind.hangar?.ref;
        const clearance = ind.clearance?.ref ?? aircraft.clearance?.ref;
        const { ew, el, eh } = this.effectiveDims(aircraft, clearance);
        const span = ind.span ?? 'lateral';
        const bays = ind.bays.map(b => b.ref).filter((b): b is HangarBay => b !== undefined);
        const bayNames = bays.map(b => b.name);

        // Bays required
        let baysRequired = 1;
        if (hangar && hangar.grid.bays.length > 0) {
            const isLong = span === 'longitudinal';
            const dims = hangar.grid.bays.map(b => isLong ? b.depth : b.width);
            const threshold = isLong ? el : ew;
            baysRequired = greedyBaysRequired(dims, threshold).count;
        }

        // Contiguity
        let connectivity = 'n/a';
        if (bays.length === 1) {
            connectivity = 'single bay';
        } else if (bays.length > 1 && hangar) {
            const result = checkBayContiguity(bays, hangar.grid);
            connectivity = result.ok
                ? 'connected'
                : `${result.evidence.reachableCount}/${result.evidence.bayCount} reachable`;
        }

        const label = ind.id ? `**Induction: ${ind.id}**` : '**Induction**';
        const clrName = clearance ? ` (clearance: ${clearance.name})` : '';

        const lines = [
            `${label} (${aircraft.name})`,
            `Effective: ${this.fmt(ew)}m × ${this.fmt(el)}m × ${this.fmt(eh)}m${clrName}`,
            `Bays: ${bayNames.join(', ') || 'none'} (${bays.length} allocated, ${baysRequired} required) — ${connectivity}`,
            `Span: ${span} | Window: ${ind.start} → ${ind.end}`,
        ];
        return lines.join('  \n');
    }

    private aircraftHover(aircraft: AircraftType): string | undefined {
        const lines: string[] = [`**Aircraft: ${aircraft.name}**`];
        let rawDims = `${this.fmt(aircraft.wingspan)}m × ${this.fmt(aircraft.length)}m × ${this.fmt(aircraft.height)}m`;
        if (aircraft.tailHeight !== undefined) rawDims += ` (tail: ${this.fmt(aircraft.tailHeight)}m)`;
        lines.push(`Dimensions: ${rawDims}`);

        const clearance = aircraft.clearance?.ref;
        if (clearance) {
            const { ew, el, eh } = this.effectiveDims(aircraft, clearance);
            lines.push(`Clearance: ${clearance.name} (L:${this.fmt(clearance.lateralMargin)} / D:${this.fmt(clearance.longitudinalMargin)} / V:${this.fmt(clearance.verticalMargin)})`);
            lines.push(`Effective: ${this.fmt(ew)}m × ${this.fmt(el)}m × ${this.fmt(eh)}m`);
        }
        return lines.join('  \n');
    }

    private bayHover(bay: HangarBay): string | undefined {
        const lines: string[] = [`**Bay: ${bay.name}**`];
        lines.push(`Dimensions: ${this.fmt(bay.width)}m × ${this.fmt(bay.depth)}m × ${this.fmt(bay.height)}m`);
        if (bay.row !== undefined && bay.col !== undefined) {
            lines.push(`Grid: row ${bay.row}, col ${bay.col}`);
        }
        if (bay.traversable) {
            lines.push(`Traversable: yes`);
        }
        return lines.join('  \n');
    }

    private clearanceHover(env: ClearanceEnvelope): string | undefined {
        return [
            `**Clearance: ${env.name}**`,
            `Lateral: ${this.fmt(env.lateralMargin)}m | Longitudinal: ${this.fmt(env.longitudinalMargin)}m | Vertical: ${this.fmt(env.verticalMargin)}m`,
        ].join('  \n');
    }
}
