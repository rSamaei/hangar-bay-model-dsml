import type { ValidationChecks } from 'langium';
import type { AirfieldAstType } from './generated/ast.js';
import type { AirfieldServices } from './airfield-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: AirfieldServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.AirfieldValidator;
    const checks: ValidationChecks<AirfieldAstType> = {
        // Add your custom validation checks here
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class AirfieldValidator {
    // Add custom validation methods here
}
