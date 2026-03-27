export interface AircraftValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates aircraft fields present in a request body.
 * Only validates fields that are present (not undefined), so it works for
 * both POST (all fields required) and PUT (partial update).
 *
 * For POST, callers should check that all required fields are present before
 * calling this function, or pass `requireAll: true`.
 */
export function validateAircraftBody(
  body: unknown,
  options: { requireAll?: boolean } = {},
): AircraftValidationResult {
  const errors: string[] = [];
  const b = body as Record<string, unknown>;
  const { requireAll = false } = options;

  if (requireAll || b.name !== undefined) {
    if (!b.name || typeof b.name !== 'string' || (b.name as string).trim().length === 0) {
      errors.push('Aircraft name is required');
    }
  }

  if (requireAll || b.wingspan !== undefined) {
    if (b.wingspan === undefined || typeof b.wingspan !== 'number' || b.wingspan <= 0) {
      errors.push('Wingspan must be a positive number');
    }
  }

  if (requireAll || b.length !== undefined) {
    if (b.length === undefined || typeof b.length !== 'number' || b.length <= 0) {
      errors.push('Length must be a positive number');
    }
  }

  if (requireAll || b.height !== undefined) {
    if (b.height === undefined || typeof b.height !== 'number' || b.height <= 0) {
      errors.push('Height must be a positive number');
    }
  }

  if (requireAll || b.tailHeight !== undefined) {
    if (b.tailHeight === undefined || typeof b.tailHeight !== 'number' || b.tailHeight <= 0) {
      errors.push('Tail height must be a positive number');
    }
  }

  return { valid: errors.length === 0, errors };
}
