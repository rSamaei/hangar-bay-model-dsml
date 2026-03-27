/**
 * Unit tests for aircraft-validator.ts
 *
 * Covers validateAircraftBody with requireAll=true (POST) and default/false (PUT).
 */
import { describe, expect, test } from 'vitest';
import { validateAircraftBody } from '../../../backend/validators/aircraft-validator.js';

// ---------------------------------------------------------------------------
// requireAll=true (POST — all fields required)
// ---------------------------------------------------------------------------

describe('validateAircraftBody (requireAll=true)', () => {

  describe('name', () => {
    test('returns error when name is missing', () => {
      const result = validateAircraftBody({ wingspan: 11, length: 8, height: 3, tailHeight: 3 }, { requireAll: true });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    test('returns error when name is an empty string', () => {
      const result = validateAircraftBody({ name: '  ', wingspan: 11, length: 8, height: 3, tailHeight: 3 }, { requireAll: true });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    test('returns error when name is not a string', () => {
      const result = validateAircraftBody({ name: 42, wingspan: 11, length: 8, height: 3, tailHeight: 3 }, { requireAll: true });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });
  });

  describe('wingspan', () => {
    test('returns error when wingspan is zero', () => {
      const result = validateAircraftBody({ name: 'X', wingspan: 0, length: 8, height: 3, tailHeight: 3 }, { requireAll: true });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Wingspan'))).toBe(true);
    });

    test('returns error when wingspan is negative', () => {
      const result = validateAircraftBody({ name: 'X', wingspan: -5, length: 8, height: 3, tailHeight: 3 }, { requireAll: true });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Wingspan'))).toBe(true);
    });

    test('returns error when wingspan is a string', () => {
      const result = validateAircraftBody({ name: 'X', wingspan: '11', length: 8, height: 3, tailHeight: 3 }, { requireAll: true });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Wingspan'))).toBe(true);
    });

    test('returns error when wingspan is missing with requireAll', () => {
      const result = validateAircraftBody({ name: 'X', length: 8, height: 3, tailHeight: 3 }, { requireAll: true });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Wingspan'))).toBe(true);
    });
  });

  describe('length', () => {
    test('returns error when length is negative', () => {
      const result = validateAircraftBody({ name: 'X', wingspan: 11, length: -1, height: 3, tailHeight: 3 }, { requireAll: true });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Length'))).toBe(true);
    });
  });

  describe('height', () => {
    test('returns error when height is missing', () => {
      const result = validateAircraftBody({ name: 'X', wingspan: 11, length: 8, tailHeight: 3 }, { requireAll: true });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Height'))).toBe(true);
    });
  });

  describe('tailHeight', () => {
    test('returns error when tailHeight is missing', () => {
      const result = validateAircraftBody({ name: 'X', wingspan: 11, length: 8, height: 3 }, { requireAll: true });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Tail height'))).toBe(true);
    });
  });

  describe('valid body', () => {
    test('returns valid=true with no errors for a complete correct body', () => {
      const result = validateAircraftBody(
        { name: 'Cessna', wingspan: 11, length: 8, height: 3, tailHeight: 3 },
        { requireAll: true },
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// requireAll=false / default (PUT — only validate provided fields)
// ---------------------------------------------------------------------------

describe('validateAircraftBody (partial / PUT)', () => {
  test('returns valid=true for empty body (no fields to validate)', () => {
    const result = validateAircraftBody({});
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('validates wingspan when present — rejects zero', () => {
    const result = validateAircraftBody({ wingspan: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Wingspan'))).toBe(true);
  });

  test('validates wingspan when present — accepts positive', () => {
    const result = validateAircraftBody({ wingspan: 12.5 });
    expect(result.valid).toBe(true);
  });

  test('skips name validation when name is not in body', () => {
    const result = validateAircraftBody({ wingspan: 11 });
    expect(result.errors.some(e => e.includes('name'))).toBe(false);
  });

  test('validates name when present — rejects blank', () => {
    const result = validateAircraftBody({ name: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('name'))).toBe(true);
  });

  test('accepts valid partial update with multiple fields', () => {
    const result = validateAircraftBody({ wingspan: 11, height: 3 });
    expect(result.valid).toBe(true);
  });
});
