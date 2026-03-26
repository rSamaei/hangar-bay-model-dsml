# Test Coverage & Code Quality Improvement Plan

**Current state**: 776 tests pass, 74.7% statement coverage overall.
**Goal**: Raise coverage to ~90%+ statements, refactor problem code, standardise test structure.

---

## Phase 0 — Test Infrastructure Standardisation

> Before writing new tests, unify the test helpers so every package follows the same patterns.

### 0.1 — Web package: create `packages/web/test/helpers/setup.ts`

Create a shared test helper file that:
- Exports a `createTestApp()` function that builds an Express app with all routes mounted (no `app.listen()` side effect)
- Exports a `mockDb()` helper that sets up common `vi.mock()` calls for database functions
- Exports a `mockLangiumServices()` helper that mocks `parseDocument` and `getLangiumServices`

This replaces the current pattern where every web route test file independently sets up mocks inline.

### 0.2 — Web package: create `packages/web/test/helpers/fixtures.ts`

Create shared fixture constants:
- `VALID_DSL` — a syntactically correct `.air` string (reuse from existing route tests)
- `INVALID_DSL` — a string with parse errors
- `SAMPLE_AIRCRAFT` — `{ name: 'Cessna', wingspan: 11, length: 8, height: 3 }`
- `SAMPLE_HANGAR` — a minimal hangar object matching the DB schema
- `SAMPLE_SCHEDULE_ENTRY` — a schedule entry object

### 0.3 — CLI package: create `packages/cli/test/helpers/fixtures.ts`

Extract the inline mock document/services setup from `generator.test.ts` and `generator-extended.test.ts` into a shared helper:
- `mockLangiumDocument(dslCode, diagnostics?)` — returns a mock `LangiumDocument`
- `mockServices()` — returns mock Langium services

### 0.4 — Simulator package: add builder helpers to existing `packages/simulator/test/helpers/fixtures.ts`

Add these missing builders to the existing fixtures file:
- `mkAccessPath(overrides?)` — builds an access path with nodes and links
- `mkAccessNode(overrides?)` — builds an access node
- `mkPlacementEngineState(overrides?)` — builds the state object needed by `PlacementEngine`

---

## Phase 1 — Refactor Before Testing (Code Quality)

> These refactors make the code testable and eliminate duplication. Do each as a separate commit. Run `npm run test` after each refactor to confirm no regressions.

### 1.1 — Extract `server.ts` app from listen (web)

**File**: `packages/web/backend/server.ts`
**Problem**: `app.listen()` runs as a side effect on import → untestable.
**Fix**:
1. Export the Express `app` object from `server.ts` WITHOUT calling `app.listen()`
2. Create a new `packages/web/backend/start.ts` that imports `app` and calls `app.listen()`
3. Update the package.json `start` script to point to `start.ts` instead of `server.ts`
4. Now tests can `import { app } from '../backend/server'` safely

### 1.2 — Extract validation logic from route handlers (web)

**File**: `packages/web/backend/routes/aircraft.ts`
**Problem**: ~70 lines of validation duplicated between POST and PUT handlers.
**Fix**:
1. Create `packages/web/backend/validators/aircraft-validator.ts`
2. Export a `validateAircraftBody(body: unknown): { valid: boolean; errors: string[] }` function
3. Extract the shared name/wingspan/length/height checks into this function
4. Both POST and PUT handlers call `validateAircraftBody()` and return 400 if invalid
5. The validator is now independently unit-testable

**File**: `packages/web/backend/routes/scheduling.ts`
**Problem**: ~115 lines of date/time validation duplicated between single-entry and multi-entry flows.
**Fix**:
1. Create `packages/web/backend/validators/schedule-validator.ts`
2. Export `validateScheduleEntry(entry: unknown): { valid: boolean; errors: string[] }`
3. Export `validateScheduleEntries(entries: unknown[]): { valid: boolean; errors: string[] }`
   (calls `validateScheduleEntry` in a loop, collects errors)
4. Replace inline validation in the route handlers with calls to these functions

### 1.3 — Extract scheduling service layer (web)

**File**: `packages/web/backend/routes/scheduling.ts` (452 lines, 18.18% coverage)
**Problem**: Business logic (DSL generation, scheduling, result extraction) is embedded in Express handlers.
**Fix**:
1. Create `packages/web/backend/services/scheduling-service.ts`
2. Move these functions out of the route file:
   - `generateDSLFromEntries(entries, hangars, aircraft): string` — builds DSL code from DB objects
   - `computeSchedule(dslCode): Promise<ScheduleResult>` — parses, validates, runs scheduler
   - `extractPlacements(result, entries): PlacementMap` — maps simulation results back to entries
3. The route file becomes thin: validate request → call service → send response
4. Each service function is independently testable with plain objects (no Express req/res)

### 1.4 — Eliminate `any` casts in event-handlers (simulator)

**File**: `packages/simulator/src/simulation/event-handlers.ts`
**Problem**: 6 `any` casts defeat type safety and make tests unreliable.
**Fix**:
1. Create a discriminated union type for placement results:
   ```typescript
   type PlacementOutcome =
     | { status: 'placed'; hangarName: string; bayNames: string[]; doorName: string }
     | { status: 'rejected'; rejection: RuleViolation }
     | { status: 'waiting'; reason: string };
   ```
2. Update `PlacementEngine.attemptPlacement()` return type to `PlacementOutcome`
3. Replace all `as any` casts in `event-handlers.ts` with proper type narrowing on `outcome.status`
4. Update existing tests to use the new discriminated union

### 1.5 — Extract bay-key utility (simulator)

**File**: `packages/simulator/src/simulation/state-mutator.ts`
**Problem**: `\`${hangarName}::${bayName}\`` repeated 5+ times.
**Fix**:
1. Add to an existing utils or types file:
   ```typescript
   export function bayKey(hangarName: string, bayName: string): string {
     return `${hangarName}::${bayName}`;
   }
   ```
2. Replace all inline template literals in `state-mutator.ts` with `bayKey()` calls
3. Search other files (`placement-engine.ts`, `graph-queries.ts`) for the same pattern and replace

### 1.6 — Extract reason formatting (simulator)

**File**: `packages/simulator/src/simulation/reason-builders.ts`
**Problem**: Switch over rule IDs with unsafe `evidence as Record<string, any>` casts.
**Fix**:
1. Define typed evidence interfaces per rule:
   ```typescript
   interface DoorFitEvidence { doorName: string; doorWidth: number; effectiveWingspan: number }
   interface BayFitEvidence { bayNames: string[]; totalWidth: number; effectiveWingspan: number }
   // etc.
   ```
2. Replace the switch with a `Map<string, (evidence: unknown) => string>` formatter registry
3. Each formatter validates its own evidence shape before formatting
4. Export the registry so tests can verify individual formatters

### 1.7 — Refactor induction-checks lateral/longitudinal duplication (language)

**File**: `packages/language/src/validators/induction-checks.ts`
**Problem**: `checkBayCountSufficiency()` has near-identical lateral/longitudinal branches (~30 lines each).
**Fix**:
1. Extract a helper:
   ```typescript
   function computeAxisBaysRequired(
     effectiveDim: number, bayDim: number, label: string
   ): { min: number; axis: string }
   ```
2. Call it twice — once for lateral (wingspan, bay widths), once for longitudinal (length, bay depths)
3. Keep the diagnostic emission in the main function, just use the helper for the math

### 1.8 — Refactor code-actions duplication (language)

**File**: `packages/language/src/airfield-code-actions.ts`
**Problem**: Three fix methods (`createContiguityFix`, `createBayFitWidthFix`, `createBayCountFix`) share ~80% structure.
**Fix**:
1. Extract a shared `createBayExpansionFix(params)` function:
   ```typescript
   interface BayExpansionParams {
     diagnostic: Diagnostic;
     document: LangiumDocument;
     induction: Induction;
     candidateCount: number;
     findCandidates: (assigned: Set<string>, graph: AdjacencyGraph) => string[];
   }
   ```
2. Each specific fix becomes a thin wrapper that provides the `findCandidates` strategy
3. This reduces the file by ~100 lines and makes each strategy independently testable

---

## Phase 2 — New Tests for Uncovered Code

> Write tests for the files with 0% or very low coverage. Each section specifies what to test and the expected file location.

### 2.1 — `packages/web/test/backend/routes/scheduling-extended.test.ts`

**Target**: `packages/web/backend/routes/scheduling.ts` (18.18% → ~80%)

After the Phase 1.2 + 1.3 refactors, write tests for:

**Validator tests** (in `packages/web/test/backend/validators/schedule-validator.test.ts`):
- Missing required fields (startDate, endDate, aircraftId, hangarId) → errors
- Invalid date format → error
- startDate > endDate → error
- Valid entry → no errors
- Multiple entries, one invalid → collects per-entry errors

**Service tests** (in `packages/web/test/backend/services/scheduling-service.test.ts`):
- `generateDSLFromEntries`: produces valid DSL string from entry + hangar + aircraft objects
- `computeSchedule`: with valid DSL → returns result with placements
- `computeSchedule`: with invalid DSL → returns parse errors
- `extractPlacements`: maps simulation output to entry IDs correctly

**Route tests** (extend existing `scheduling.test.ts`):
- POST single entry → 200 with placement result
- POST single entry, validation fail → 400
- POST multiple entries → 200
- DELETE entry → 200
- GET schedule → 200 with entries

### 2.2 — `packages/web/test/backend/routes/aircraft-extended.test.ts`

**Target**: `packages/web/backend/routes/aircraft.ts` (73.48% → ~95%)

After Phase 1.2 refactor, write tests for the extracted validator:

**In `packages/web/test/backend/validators/aircraft-validator.test.ts`:**
- Missing name → error
- Negative wingspan → error
- Zero length → error
- Non-numeric height → error
- Valid body → no errors

**In `aircraft-extended.test.ts`:**
- PUT with duplicate name → 409 (SQLITE_CONSTRAINT_UNIQUE)
- DELETE non-existent aircraft → 404
- GET all aircraft → 200 with array
- GET single aircraft → 200 with object

### 2.3 — `packages/web/test/backend/routes/code-actions-extended.test.ts`

**Target**: `packages/web/backend/routes/code-actions.ts` (64.28% → ~90%)

Tests:
- POST with valid DSL + diagnostic → returns code actions array
- POST with missing `dslCode` → 400
- POST with missing `diagnostic` → returns empty actions (graceful)
- POST with DSL that has no matching actions → returns empty array
- Position conversion: verify 1-based input → 0-based LSP conversion

### 2.4 — `packages/language/test/validators/induction-checks-extended.test.ts`

**Target**: `packages/language/src/validators/induction-checks.ts` (76.08% → ~95%)

Look at the uncovered lines (62, 122, 133-140, 198-222, 264-268, 296-317) and write tests for:
- `checkBayCountSufficiency` with longitudinal span direction
- `checkBayCountSufficiency` with `requires` override < geometric minimum (SFR_BAY_COUNT_OVERRIDE)
- `checkBayCountSufficiency` with `requires` override >= geometric minimum (no warning)
- `checkDuplicateAutoInductionId` with duplicate auto-induction IDs
- `generateValidationReport` — pass a model with mixed violations, verify report structure

### 2.5 — `packages/language/test/hover-provider-extended.test.ts`

**Target**: `packages/language/src/hover-provider.ts` (0% → ~80%)

Tests (these need Langium services, use the existing `helpers/setup.ts` pattern):
- Hover over aircraft name → shows dimensions (wingspan × length × height)
- Hover over hangar name → shows bay count, door count, grid dimensions
- Hover over bay name → shows dimensions (width × depth × height)
- Hover over induction → shows aircraft, hangar, bay count, time window, bays-required estimate
- Hover over clearance → shows margin values

### 2.6 — `packages/language/test/code-actions-extended.test.ts`

**Target**: `packages/language/src/airfield-code-actions.ts` (34.66% → ~70%)

After Phase 1.8 refactor, test the extracted `createBayExpansionFix`:
- SFR13 contiguity violation → returns fix that adds bridge bays
- SFR25 bay count violation → returns fix that adds adjacent bays
- SFR12 bay fit width → returns fix that adds extra bays for width
- No matching diagnostic code → returns empty actions
- Induction with no bays → returns empty actions (edge case)

### 2.7 — Simulator simulation module gap tests

**Target**: Uncovered lines in `event-handlers.ts`, `state-mutator.ts`, `placement-engine.ts`, `reason-builders.ts`, `result-builder.ts`

**`packages/simulator/test/simulation/event-handlers-extended.test.ts`:**
- Arrival when all bays occupied → rejection, added to waiting queue
- Arrival with deadline expired → immediate failure (DEADLINE_EXCEEDED)
- Departure triggers waiting queue retry → waiting induction gets placed
- Departure with no waiting inductions → clean completion

**`packages/simulator/test/simulation/state-mutator-extended.test.ts`:**
- `recordPlacement` updates occupiedBays, activeInductions, and schedules departure event
- `completeDeparture` frees bays, moves to completed, triggers dependency unlock
- `findEarliestBlockerEnd` returns correct time when multiple blockers
- Bay key consistency across record/complete cycle

**`packages/simulator/test/simulation/reason-builders.test.ts`:**
After Phase 1.6 refactor:
- Door fit rejection → human-readable reason string
- Bay fit rejection → includes bay names and dimensions
- Contiguity rejection → mentions non-contiguous bays
- Time overlap rejection → mentions conflicting induction
- Unknown rule ID → generic fallback message
- Departure delay → includes wait duration

**`packages/simulator/test/simulation/result-builder-extended.test.ts`:**
- Empty simulation (no inductions) → empty placements, zero stats
- Mixed placed + failed → correct partition
- Statistics: max wait time, total delay, utilization percentage
- Auto-induction with missing aircraft ref → graceful handling

---

## Phase 3 — Test Structure Conventions

> Apply these conventions to ALL new test files and gradually migrate existing ones.

### 3.1 — File naming convention

```
<module-name>.test.ts          — core unit tests (happy path + primary edge cases)
<module-name>-extended.test.ts — boundary conditions, complex scenarios, integration
```

This convention already exists in the codebase — formalise it.

### 3.2 — Test file internal structure

Every test file should follow this template:

```typescript
import { describe, expect, test, beforeAll, beforeEach } from 'vitest';

// ── Fixtures & Helpers ─────────────────────────────────────────
// Import shared helpers, define file-scoped constants

// ── Tests ──────────────────────────────────────────────────────
describe('<ModuleName>', () => {

  describe('<functionName>()', () => {
    // Group by function under test

    test('returns X when given Y', () => {
      // Arrange
      // Act
      // Assert
    });

    test('throws when given invalid input', () => { ... });
  });

  describe('<anotherFunction>()', () => { ... });
});
```

Rules:
- **One top-level `describe` per file**, named after the module
- **Nested `describe` per exported function/class method**
- **Test names start with a verb**: "returns", "throws", "emits", "creates", "rejects"
- **No test logic in `describe` callback body** — only `test()`, `beforeEach()`, and nested `describe()`
- **Fixtures at the top**, not scattered between tests

### 3.3 — Shared helpers per package

Each package should have a `test/helpers/` directory with:
- `fixtures.ts` — shared mock objects/builders/DSL strings
- `setup.ts` — shared `beforeAll`/`beforeEach` logic (if needed)
- `assertions.ts` (optional) — custom assertion helpers (e.g., `hasDiag()`)

Currently:
- **language** ✅ has `helpers/setup.ts` + `helpers/fixtures.ts`
- **simulator** ✅ has `helpers/fixtures.ts`
- **cli** ❌ missing — create in Phase 0.3
- **web** ❌ missing — create in Phase 0.1 + 0.2

### 3.4 — Coverage thresholds

After all phases complete, add to `vitest.config.ts` at the workspace root:

```typescript
coverage: {
  thresholds: {
    statements: 85,
    branches: 75,
    functions: 85,
    lines: 85,
  }
}
```

This prevents coverage from regressing below the new baseline.

---

## Execution Order

| Step | Phase | What | Files touched |
|------|-------|------|--------------|
| 1 | 0.1–0.4 | Create shared test helpers | 4 new helper files |
| 2 | 1.1 | Extract server.ts app from listen | `server.ts`, new `start.ts` |
| 3 | 1.2 | Extract route validators | `aircraft.ts`, `scheduling.ts`, 2 new validator files |
| 4 | 1.3 | Extract scheduling service | `scheduling.ts`, new `scheduling-service.ts` |
| 5 | 1.4 | Eliminate `any` casts | `event-handlers.ts`, `placement-engine.ts` |
| 6 | 1.5 | Extract bay-key utility | `state-mutator.ts`, `placement-engine.ts`, `graph-queries.ts` |
| 7 | 1.6 | Extract reason formatters | `reason-builders.ts` |
| 8 | 1.7 | Refactor induction-checks | `induction-checks.ts` |
| 9 | 1.8 | Refactor code-actions | `airfield-code-actions.ts` |
| 10 | 2.1 | Scheduling tests | 3 new test files |
| 11 | 2.2 | Aircraft tests | 2 new test files |
| 12 | 2.3 | Code-actions route tests | 1 new test file |
| 13 | 2.4 | Induction-checks tests | 1 new test file |
| 14 | 2.5 | Hover provider tests | 1 new test file |
| 15 | 2.6 | Code-actions language tests | 1 new test file |
| 16 | 2.7 | Simulator gap tests | 4 new test files |
| 17 | 3.4 | Add coverage thresholds | `vitest.config.ts` |

**Run `npm run test` after every step. Do not proceed to the next step if tests fail.**

---

## Files Intentionally Excluded from Coverage Targets

These files are 0% but don't need dedicated tests:
- `simulator/src/types/*.ts` — pure type definitions, no runtime code
- `simulator/src/engine.ts` — re-export barrel (`export * from ...`)
- `simulator/src/index.ts` — re-export barrel
- `language/src/index.ts` — re-export barrel
- `language/src/airfield-module.ts` — Langium DI wiring (integration-tested via language service tests)
- `language/src/airfield-validator.ts` — registration facade (all logic is in `validators/*.ts`, already well-tested)
- `cli/src/main.ts` — CLI entry point with `process.argv` (tested via CLI integration)
