/**
 * Unit tests for schedule-validator.ts
 *
 * Covers validateScheduleEntry and validateScheduleEntries
 * with all branches: missing fields, invalid dates, cross-field check,
 * valid entries, and multi-entry collection.
 */
import { describe, expect, test } from 'vitest';
import {
  validateScheduleEntry,
  validateScheduleEntries,
} from '../../../backend/validators/schedule-validator.js';

// ---------------------------------------------------------------------------
// validateScheduleEntry
// ---------------------------------------------------------------------------

describe('validateScheduleEntry', () => {

  describe('aircraftId', () => {
    test('returns error when aircraftId is missing', () => {
      const result = validateScheduleEntry({ startTime: '2024-06-01T08:00', endTime: '2024-06-01T10:00' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Aircraft ID'))).toBe(true);
    });

    test('returns error when aircraftId is a string', () => {
      const result = validateScheduleEntry({ aircraftId: 'abc', startTime: '2024-06-01T08:00', endTime: '2024-06-01T10:00' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Aircraft ID'))).toBe(true);
    });

    test('accepts aircraftId 0 (valid number)', () => {
      const result = validateScheduleEntry({ aircraftId: 0, startTime: '2024-06-01T08:00', endTime: '2024-06-01T10:00' });
      // 0 is a valid number, no aircraftId error
      expect(result.errors.some(e => e.includes('Aircraft ID'))).toBe(false);
    });
  });

  describe('startTime', () => {
    test('returns error when startTime is missing', () => {
      const result = validateScheduleEntry({ aircraftId: 1, endTime: '2024-06-01T10:00' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Start time'))).toBe(true);
    });

    test('returns error when startTime is not a string', () => {
      const result = validateScheduleEntry({ aircraftId: 1, startTime: 12345, endTime: '2024-06-01T10:00' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Start time'))).toBe(true);
    });

    test('returns error when startTime is an invalid date string', () => {
      const result = validateScheduleEntry({ aircraftId: 1, startTime: 'not-a-date', endTime: '2024-06-01T10:00' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid start time'))).toBe(true);
    });
  });

  describe('endTime', () => {
    test('returns error when endTime is missing', () => {
      const result = validateScheduleEntry({ aircraftId: 1, startTime: '2024-06-01T08:00' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('End time'))).toBe(true);
    });

    test('returns error when endTime is an invalid date string', () => {
      const result = validateScheduleEntry({ aircraftId: 1, startTime: '2024-06-01T08:00', endTime: 'bad-date' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid end time'))).toBe(true);
    });
  });

  describe('cross-field: end must be after start', () => {
    test('returns error when endTime equals startTime', () => {
      const result = validateScheduleEntry({
        aircraftId: 1,
        startTime: '2024-06-01T08:00',
        endTime: '2024-06-01T08:00',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('End time must be after'))).toBe(true);
    });

    test('returns error when endTime is before startTime', () => {
      const result = validateScheduleEntry({
        aircraftId: 1,
        startTime: '2024-06-01T10:00',
        endTime: '2024-06-01T08:00',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('End time must be after'))).toBe(true);
    });

    test('cross-field check is skipped when individual fields have errors', () => {
      // Invalid startTime → individual error; cross-field check should NOT also fire
      const result = validateScheduleEntry({ aircraftId: 1, startTime: 'bad', endTime: '2024-06-01T10:00' });
      expect(result.errors.some(e => e.includes('End time must be after'))).toBe(false);
    });
  });

  describe('valid entry', () => {
    test('returns valid=true with no errors for a correct entry', () => {
      const result = validateScheduleEntry({
        aircraftId: 5,
        startTime: '2024-06-01T08:00',
        endTime: '2024-06-01T10:00',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// validateScheduleEntries
// ---------------------------------------------------------------------------

describe('validateScheduleEntries', () => {
  test('returns valid=true for an array of valid entries', () => {
    const entries = [
      { aircraftId: 1, startTime: '2024-06-01T08:00', endTime: '2024-06-01T10:00' },
      { aircraftId: 2, startTime: '2024-06-02T08:00', endTime: '2024-06-02T10:00' },
    ];
    const result = validateScheduleEntries(entries);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('prefixes errors with 1-based entry index', () => {
    const entries = [
      { aircraftId: 1, startTime: '2024-06-01T08:00', endTime: '2024-06-01T10:00' },
      { startTime: '2024-06-02T08:00', endTime: '2024-06-02T10:00' }, // missing aircraftId
    ];
    const result = validateScheduleEntries(entries);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.startsWith('Entry 2:'))).toBe(true);
  });

  test('collects errors from multiple invalid entries', () => {
    const entries = [
      { endTime: '2024-06-01T10:00' }, // missing aircraftId and startTime
      { aircraftId: 1, startTime: '2024-06-02T10:00', endTime: '2024-06-02T08:00' }, // end before start
    ];
    const result = validateScheduleEntries(entries);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.startsWith('Entry 1:'))).toBe(true);
    expect(result.errors.some(e => e.startsWith('Entry 2:'))).toBe(true);
  });
});
