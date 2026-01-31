import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { 
    AirfieldAstType, 
    Induction, 
    AutoInduction,
    AccessPath,
    AccessNode
} from './generated/ast.js';
import type { AirfieldServices } from './airfield-module.js';
import { AstUtils } from 'langium';
import { isAutoInduction } from './generated/ast.js';
import { FeasibilityEngine } from './feasibility-engine.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: AirfieldServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.AirfieldValidator;
    const checks: ValidationChecks<AirfieldAstType> = {
        Induction: [
            validator.checkInductionFeasibility,
            validator.checkBayReachability
        ],
        AutoInduction: [
            validator.checkAutoPrecedenceCycles
        ],
        AccessPath: validator.checkAccessPathConnectivity
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations using FeasibilityEngine.
 */
export class AirfieldValidator {
    private feasibility = new FeasibilityEngine();

    /**
     * Check all feasibility rules for an induction using the core engine
     */
    checkInductionFeasibility(induction: Induction, accept: ValidationAcceptor): void {
        const aircraft = induction.aircraft?.ref;
        const hangar = induction.hangar?.ref;
        const door = induction.door?.ref;
        const bays = induction.bays.map(b => b.ref).filter(b => b !== undefined);
        
        if (!aircraft || !hangar || bays.length === 0) return;

        // Use feasibility engine to validate
        const results = this.feasibility.validateInduction({
            aircraft,
            hangar,
            bays,
            door,
            clearance: induction.clearance?.ref ?? aircraft.clearance?.ref
        });

        // Convert results to diagnostics
        for (const result of results) {
            if (!result.ok) {
                accept('error', 
                    `[${result.ruleId}] ${result.message}\nEvidence: ${JSON.stringify(result.evidence, null, 2)}`,
                    { node: induction, property: this.getPropertyForRule(result.ruleId) }
                );
            }
        }
    }

    private getPropertyForRule(ruleId: string): 'aircraft' | 'bays' | 'door' {
        if (ruleId.includes('DOOR')) return 'door';
        if (ruleId.includes('BAY')) return 'bays';
        return 'aircraft';
    }

    /**
     * Check that inducted bays are reachable from the specified door via access paths
     */
    checkBayReachability(induction: Induction, accept: ValidationAcceptor): void {
        const door = induction.door?.ref;
        const bays = induction.bays.map(b => b.ref).filter(b => b !== undefined);
        
        if (!door || bays.length === 0) return;

        const doorNode = door.accessNode?.ref;
        if (!doorNode) return;

        const model = AstUtils.getContainerOfType(induction, (n): n is any => 'accessPaths' in n);
        if (!model) return;

        const accessPath = model.accessPaths.find((ap: AccessPath) => ap.nodes.includes(doorNode));
        if (!accessPath) return;

        for (const bay of bays) {
            if (!bay) continue;
            
            const bayNode = bay.accessNode?.ref;
            if (!bayNode) {
                accept('warning', 
                    `Bay ${bay.name} has no access node defined - cannot verify reachability`, 
                    { node: induction, property: 'bays' }
                );
                continue;
            }

            if (!this.isReachable(doorNode, bayNode, accessPath)) {
                accept('error', 
                    `[SFR17_REACHABILITY] Bay ${bay.name} is not reachable from door ${door.name}`, 
                    { node: induction, property: 'bays' }
                );
            }
        }
    }

    /**
     * Check for circular dependencies in AutoInduction precedence
     */
    checkAutoPrecedenceCycles(autoInduction: AutoInduction, accept: ValidationAcceptor): void {
        if (!autoInduction.precedingInductions || autoInduction.precedingInductions.length === 0) {
            return;
        }

        const visited = new Set<AutoInduction>();
        const inProgress = new Set<AutoInduction>();

        const hasCycle = (current: AutoInduction): boolean => {
            if (inProgress.has(current)) return true;
            if (visited.has(current)) return false;

            visited.add(current);
            inProgress.add(current);

            for (const precRef of (current.precedingInductions ?? [])) {
                const prec = precRef.ref;
                if (prec && isAutoInduction(prec) && hasCycle(prec)) {
                    return true;
                }
            }

            inProgress.delete(current);
            return false;
        };

        if (hasCycle(autoInduction)) {
            accept('error', 
                `[SFR18_PRECEDENCE_CYCLE] Circular precedence dependency detected in auto-induction`, 
                { node: autoInduction, property: 'precedingInductions' }
            );
        }
    }

    /**
     * Validate access path connectivity (all nodes reachable)
     */
    checkAccessPathConnectivity(accessPath: AccessPath, accept: ValidationAcceptor): void {
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

    private isReachable(from: AccessNode, to: AccessNode, accessPath: AccessPath): boolean {
        if (from === to) return true;

        const adjacency = new Map<AccessNode, Set<AccessNode>>();
        for (const node of accessPath.nodes) {
            adjacency.set(node, new Set());
        }

        for (const link of accessPath.links) {
            const fromNode = link.from?.ref;
            const toNode = link.to?.ref;
            if (!fromNode || !toNode) continue;

            adjacency.get(fromNode)?.add(toNode);
            if (link.bidirectional) {
                adjacency.get(toNode)?.add(fromNode);
            }
        }

        const visited = new Set<AccessNode>([from]);
        const queue = [from];

        while (queue.length > 0) {
            const current = queue.shift()!;
            if (current === to) return true;

            for (const neighbor of adjacency.get(current) ?? []) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }

        return false;
    }

    /**
     * Generate machine-readable validation report for a model
     */
    generateValidationReport(model: any): any {
        const allResults: any[] = [];

        // Validate all inductions
        for (const induction of model.inductions ?? []) {
            const aircraft = induction.aircraft?.ref;
            const hangar = induction.hangar?.ref;
            const bays = induction.bays?.map((b: any) => b.ref).filter((b: any) => b !== undefined) ?? [];
            
            if (aircraft && hangar && bays.length > 0) {
                const results = this.feasibility.validateInduction({
                    aircraft,
                    hangar,
                    bays,
                    door: induction.door?.ref,
                    clearance: induction.clearance?.ref ?? aircraft.clearance?.ref
                });
                
                allResults.push(...results);
            }
        }

        return this.feasibility.generateValidationReport(allResults);
    }
}
