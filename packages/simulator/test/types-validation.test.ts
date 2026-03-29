/**
 * Unit tests for sortViolations() in types/validation.ts.
 *
 * The other files in src/types/ (conflict, dimensions, export, model, simulation)
 * contain only interface/type declarations that TypeScript erases at compile time.
 * They are excluded from coverage in vitest.config.ts — v8 cannot execute empty
 * JavaScript and there is nothing behavioural to test.
 *
 * sortViolations() comparator branches:
 *   1. Different ruleId          → sort by ruleId
 *   2. Same ruleId, diff type    → sort by subject.type
 *   3. Same ruleId+type, diff name → sort by subject.name
 *   4. Same prefix, both ids     → sort by subject.id
 *   5. Only a.subject.id         → a before b (-1)
 *   6. Only b.subject.id         → b before a (+1)
 *   7. Neither has id            → stable (0)
 */
import { describe, expect, test } from 'vitest';
import { sortViolations } from '../src/types/validation.js';
import type { ValidationViolation } from '../src/types/validation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkViolation(
    ruleId: string,
    type: ValidationViolation['subject']['type'],
    name: string,
    id?: string,
): ValidationViolation {
    return {
        ruleId,
        severity: 'error',
        message: 'test',
        subject: { type, name, ...(id !== undefined ? { id } : {}) },
        evidence: {},
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sortViolations', () => {
    test('empty array returns empty array', () => {
        expect(sortViolations([])).toEqual([]);
    });

    test('single violation returns single-element array', () => {
        const v = mkViolation('SFR11', 'Induction', 'Alpha');
        expect(sortViolations([v])).toEqual([v]);
    });

    // Branch 1 — different ruleId
    test('sorts by ruleId ascending when ruleIds differ', () => {
        const v1 = mkViolation('SFR20', 'Bay', 'Bay1');
        const v2 = mkViolation('SFR11', 'Bay', 'Bay1');
        const [first, second] = sortViolations([v1, v2]);
        expect(first.ruleId).toBe('SFR11');
        expect(second.ruleId).toBe('SFR20');
    });

    // Branch 2 — same ruleId, different subject.type
    test('sorts by subject.type when ruleIds are equal', () => {
        const v1 = mkViolation('SFR20', 'Induction', 'X');
        const v2 = mkViolation('SFR20', 'Bay', 'X');
        const [first, second] = sortViolations([v1, v2]);
        expect(first.subject.type).toBe('Bay');
        expect(second.subject.type).toBe('Induction');
    });

    // Branch 3 — same ruleId+type, different name
    test('sorts by subject.name when ruleId and type are equal', () => {
        const v1 = mkViolation('SFR12', 'Bay', 'ZBay');
        const v2 = mkViolation('SFR12', 'Bay', 'ABay');
        const [first, second] = sortViolations([v1, v2]);
        expect(first.subject.name).toBe('ABay');
        expect(second.subject.name).toBe('ZBay');
    });

    // Branch 4 — both have subject.id
    test('sorts by subject.id when both violations have an id', () => {
        const v1 = mkViolation('SFR11', 'Induction', 'Cessna', 'IND-Z');
        const v2 = mkViolation('SFR11', 'Induction', 'Cessna', 'IND-A');
        const [first, second] = sortViolations([v1, v2]);
        expect(first.subject.id).toBe('IND-A');
        expect(second.subject.id).toBe('IND-Z');
    });

    // Branch 5 — only a has id (a before b in input, a.id present, b.id absent) → returns -1
    test('violation with id sorts before violation without id (id-first in input)', () => {
        const withId    = mkViolation('SFR11', 'Induction', 'Cessna', 'IND-1');
        const withoutId = mkViolation('SFR11', 'Induction', 'Cessna');
        const [first, second] = sortViolations([withId, withoutId]);
        expect(first.subject.id).toBe('IND-1');
        expect(second.subject.id).toBeUndefined();
    });

    // Branch 6 — only b has id (no-id first in input, b.id present) → returns +1
    test('violation with id sorts before violation without id (no-id-first in input)', () => {
        const withId    = mkViolation('SFR11', 'Induction', 'Cessna', 'IND-1');
        const withoutId = mkViolation('SFR11', 'Induction', 'Cessna');
        const [first, second] = sortViolations([withoutId, withId]);
        expect(first.subject.id).toBe('IND-1');
        expect(second.subject.id).toBeUndefined();
    });

    // Branch 7 — neither has id → treated as equal, original order preserved
    test('violations without ids that share all keys are considered equal (stable)', () => {
        const v1 = mkViolation('SFR13', 'Induction', 'Hawk');
        const v2 = mkViolation('SFR13', 'Induction', 'Hawk');
        const sorted = sortViolations([v1, v2]);
        // Both equal — just assert neither blows up and length is preserved
        expect(sorted).toHaveLength(2);
    });

    test('does not mutate the input array', () => {
        const v1 = mkViolation('SFR20', 'Bay', 'B');
        const v2 = mkViolation('SFR11', 'Bay', 'A');
        const input = [v1, v2];
        sortViolations(input);
        expect(input[0]).toBe(v1);
        expect(input[1]).toBe(v2);
    });
});
