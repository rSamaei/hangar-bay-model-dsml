import type { ValidationAcceptor } from 'langium';
import type { AutoInduction } from '../generated/ast.js';
import { AstUtils } from 'langium';
import { isAutoInduction, isModel } from '../generated/ast.js';
import { greedyBaysRequired } from './induction-checks.js';

export function checkAutoPrecedenceCycles(autoInduction: AutoInduction, accept: ValidationAcceptor): void {
    if (!autoInduction.precedingInductions || autoInduction.precedingInductions.length === 0) return;

    const visited = new Set<AutoInduction>();
    const inProgress = new Set<AutoInduction>();

    const hasCycle = (current: AutoInduction): boolean => {
        if (inProgress.has(current)) return true;
        if (visited.has(current)) return false;

        visited.add(current);
        inProgress.add(current);

        for (const precRef of (current.precedingInductions ?? [])) {
            const prec = precRef.ref;
            if (prec && isAutoInduction(prec) && hasCycle(prec)) return true;
        }

        inProgress.delete(current);
        return false;
    };

    if (hasCycle(autoInduction)) {
        accept('error',
            `[SFR24_PRECEDENCE_CYCLE] Circular precedence dependency detected in auto-induction`,
            { node: autoInduction, property: 'precedingInductions' }
        );
    }
}

/** SFR21: Enforce that an auto-induction's optional time bounds are well-formed: notBefore < notAfter. */
export function checkAutoInductionTimeWindow(autoInduction: AutoInduction, accept: ValidationAcceptor): void {
    if (!autoInduction.notBefore || !autoInduction.notAfter) return;
    const notBefore = new Date(autoInduction.notBefore);
    const notAfter = new Date(autoInduction.notAfter);
    if (notBefore >= notAfter) {
        accept('error',
            `[SFR26_TIME_WINDOW] Auto-induction time window is invalid: notBefore (${autoInduction.notBefore}) is not before notAfter (${autoInduction.notAfter})`,
            { node: autoInduction, property: 'notAfter' }
        );
    }
}

/** SFR15_BAY_COUNT_OVERRIDE: Warn when `requires N bays` is less than the geometry-derived minimum. */
export function checkAutoInductionBayCountOverride(autoInduction: AutoInduction, accept: ValidationAcceptor): void {
    if (autoInduction.requires === undefined) return;
    const aircraft = autoInduction.aircraft?.ref;
    if (!aircraft) return;

    const model = AstUtils.getContainerOfType(autoInduction, isModel);
    if (!model) return;

    const targetHangars = autoInduction.preferredHangar?.ref
        ? [autoInduction.preferredHangar.ref]
        : model.hangars;
    if (targetHangars.length === 0) return;

    const hangar = targetHangars[0];
    if (hangar.grid.bays.length === 0) return;

    const clearance = autoInduction.clearance?.ref ?? aircraft.clearance?.ref;
    const effectiveWingspan = aircraft.wingspan + (clearance?.lateralMargin ?? 0);
    if (effectiveWingspan <= 0) return;

    const { count: baysRequired, used: bayWidthsUsed } = greedyBaysRequired(
        hangar.grid.bays.map(b => b.width), effectiveWingspan
    );

    if (autoInduction.requires < baysRequired) {
        accept('warning',
            `[SFR15_BAY_COUNT_OVERRIDE] Aircraft '${aircraft.name}' requires at least ${baysRequired} bays` +
            ` by geometry (widths [${bayWidthsUsed.map(w => w.toFixed(2)).join(', ')}]m cover effective wingspan ${effectiveWingspan.toFixed(2)}m)` +
            ` but 'requires ${autoInduction.requires} bays' declares less. The geometric minimum will take precedence.`,
            { node: autoInduction, property: 'requires' }
        );
    }
}
