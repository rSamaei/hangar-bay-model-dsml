import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { AirfieldAstType, Induction } from './generated/ast.js';
import type { AirfieldServices } from './airfield-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: AirfieldServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.AirfieldValidator;
    const checks: ValidationChecks<AirfieldAstType> = {
        Induction: validator.checkInductionFits
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class AirfieldValidator {
  checkInductionFits(induction: Induction, accept: ValidationAcceptor): void {
    const aircraft = induction.aircraft?.ref;
    const hangar = induction.hangar?.ref;
    if (!aircraft || !hangar) return;

    const bayCount = induction.toBay - induction.fromBay + 1;
    const availableWidth = bayCount * hangar.bayWidth;
    if (aircraft.wingspan > availableWidth) {
      accept('error',
        'Aircraft wingspan does not fit in the selected bay range.',
        { node: induction });
    }
  }
}
