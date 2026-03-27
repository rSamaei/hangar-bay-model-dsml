export interface ScheduleValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a single schedule entry from a request body.
 * Checks aircraftId, startTime, endTime for presence, type, and date validity.
 */
export function validateScheduleEntry(entry: unknown): ScheduleValidationResult {
  const errors: string[] = [];
  const e = entry as Record<string, unknown>;

  if (typeof e.aircraftId !== 'number') {
    errors.push('Aircraft ID is required');
  }

  if (!e.startTime || typeof e.startTime !== 'string') {
    errors.push('Start time is required');
  } else {
    const start = new Date(e.startTime as string);
    if (isNaN(start.getTime())) {
      errors.push('Invalid start time format');
    }
  }

  if (!e.endTime || typeof e.endTime !== 'string') {
    errors.push('End time is required');
  } else {
    const end = new Date(e.endTime as string);
    if (isNaN(end.getTime())) {
      errors.push('Invalid end time format');
    }
  }

  // Cross-field check — only run if both dates are individually valid
  if (errors.length === 0) {
    const start = new Date(e.startTime as string);
    const end = new Date(e.endTime as string);
    if (end <= start) {
      errors.push('End time must be after start time');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an array of schedule entries.
 * Returns combined errors prefixed with the 1-based entry index.
 */
export function validateScheduleEntries(entries: unknown[]): ScheduleValidationResult {
  const errors: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const result = validateScheduleEntry(entries[i]);
    for (const err of result.errors) {
      errors.push(`Entry ${i + 1}: ${err}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
