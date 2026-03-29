/**
 * Source-level coverage tests for airfield-module.ts and airfield-validator.ts.
 *
 * These files show 0% coverage because all other tests import from the compiled
 * `airfield-language` package. This file imports directly from TypeScript source
 * to get v8 coverage for the module and validator files.
 */
import { describe, test, expect, vi, beforeAll } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { AirfieldModule, createAirfieldServices } from '../src/airfield-module.js';
import { AirfieldValidator, registerValidationChecks } from '../src/airfield-validator.js';
import type { Model } from '../src/generated/ast.js';

// ---------------------------------------------------------------------------
// AirfieldModule constant
// ---------------------------------------------------------------------------

describe('AirfieldModule constant', () => {
    test('has validation, references, and lsp service keys', () => {
        expect(AirfieldModule.validation).toBeDefined();
        expect(AirfieldModule.references).toBeDefined();
        expect(AirfieldModule.lsp).toBeDefined();
    });

    test('validation.AirfieldValidator is a factory function', () => {
        expect(typeof (AirfieldModule.validation as any).AirfieldValidator).toBe('function');
    });
});

// ---------------------------------------------------------------------------
// AirfieldValidator class
// ---------------------------------------------------------------------------

describe('AirfieldValidator', () => {
    test('can be instantiated and all check methods are bound functions', () => {
        const v = new AirfieldValidator();
        expect(typeof v.checkAircraftDimensions).toBe('function');
        expect(typeof v.checkBayDimensions).toBe('function');
        expect(typeof v.checkDoorDimensions).toBe('function');
        expect(typeof v.checkClearanceDimensions).toBe('function');
        expect(typeof v.checkUnreferencedClearanceEnvelope).toBe('function');
        expect(typeof v.checkInductionFeasibility).toBe('function');
        expect(typeof v.checkBayReachability).toBe('function');
        expect(typeof v.checkDynamicBayBlockingReachability).toBe('function');
        expect(typeof v.checkCorridorFitReachability).toBe('function');
        expect(typeof v.checkInductionTimeWindow).toBe('function');
        expect(typeof v.checkDuplicateInductionId).toBe('function');
        expect(typeof v.checkBayHangarMembership).toBe('function');
        expect(typeof v.checkDoorFitPrecheck).toBe('function');
        expect(typeof v.checkBayCountSufficiency).toBe('function');
        expect(typeof v.checkAutoPrecedenceCycles).toBe('function');
        expect(typeof v.checkAutoInductionTimeWindow).toBe('function');
        expect(typeof v.checkAutoInductionBayCountOverride).toBe('function');
        expect(typeof v.checkReachabilitySkipped).toBe('function');
        expect(typeof v.checkAdjacencyConsistency).toBe('function');
        expect(typeof v.checkAsymmetricAdjacency).toBe('function');
        expect(typeof v.checkAccessPathConnectivity).toBe('function');
        expect(typeof v.generateValidationReport).toBe('function');
        expect(typeof v.checkDuplicateAircraftNames).toBe('function');
        expect(typeof v.checkDuplicateBayNames).toBe('function');
        expect(typeof v.checkDuplicateHangarNames).toBe('function');
        expect(typeof v.checkDuplicateClearanceNames).toBe('function');
        expect(typeof v.checkSelfAdjacency).toBe('function');
        expect(typeof v.checkSelfLoopAccessLink).toBe('function');
        expect(typeof v.checkAtLeastOneHangar).toBe('function');
    });
});

// ---------------------------------------------------------------------------
// registerValidationChecks
// ---------------------------------------------------------------------------

describe('registerValidationChecks', () => {
    test('calls registry.register exactly once with checks and validator', () => {
        const registerFn = vi.fn();
        const mockServices = {
            validation: {
                ValidationRegistry: { register: registerFn },
                AirfieldValidator: new AirfieldValidator(),
            },
        } as any;
        registerValidationChecks(mockServices);
        expect(registerFn).toHaveBeenCalledOnce();
        // First argument is the checks map
        const [checksArg, validatorArg] = registerFn.mock.calls[0];
        expect(typeof checksArg).toBe('object');
        expect(checksArg.Induction).toBeDefined();
        expect(checksArg.Hangar).toBeDefined();
        expect(checksArg.Model).toBeDefined();
        expect(validatorArg).toBeInstanceOf(AirfieldValidator);
    });
});

// ---------------------------------------------------------------------------
// createAirfieldServices (source-level)
// ---------------------------------------------------------------------------

describe('createAirfieldServices (from source)', () => {
    let services: ReturnType<typeof createAirfieldServices>;

    beforeAll(() => {
        services = createAirfieldServices(EmptyFileSystem);
    });

    test('returns shared and Airfield services', () => {
        expect(services.shared).toBeDefined();
        expect(services.Airfield).toBeDefined();
    });

    test('Airfield services has validator and scope provider', () => {
        expect(services.Airfield.validation.AirfieldValidator).toBeDefined();
        expect(services.Airfield.references.ScopeProvider).toBeDefined();
    });

    test('Airfield services has code action and hover providers', () => {
        expect(services.Airfield.lsp.CodeActionProvider).toBeDefined();
        expect(services.Airfield.lsp.HoverProvider).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// AirfieldScopeProvider — exercise via document parsing
// ---------------------------------------------------------------------------

describe('AirfieldScopeProvider scope resolution', () => {
    let parse: ReturnType<typeof parseHelper<Model>>;

    beforeAll(() => {
        const { Airfield } = createAirfieldServices(EmptyFileSystem);
        parse = parseHelper<Model>(Airfield);
    });

    const BASE_DSL = `
        airfield T {
            aircraft A { wingspan 10 m  length 8 m  height 3 m }
            hangar H {
                doors { door D1 { width 15 m  height 5 m } }
                grid baygrid {
                    bay B1 { width 12 m  depth 15 m  height 5 m }
                    bay B2 { width 12 m  depth 15 m  height 5 m  adjacent { B1 } }
                }
            }
            induct A into H bays B1 from 2025-01-01T08:00 to 2025-01-02T08:00;
        }
    `;

    test('bays are scoped to the target hangar (first branch — induction with hangar.ref)', async () => {
        const doc = await parse(BASE_DSL);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const ind = doc.parseResult.value.inductions[0];
        expect(ind.bays[0].ref?.name).toBe('B1');
    });

    test('hangar and aircraft references use default scope (super.getScope fallback)', async () => {
        const doc = await parse(BASE_DSL);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const ind = doc.parseResult.value.inductions[0];
        expect(ind.aircraft?.ref?.name).toBe('A');
        expect(ind.hangar?.ref?.name).toBe('H');
    });

    test('door is scoped to target hangar via property="door"', async () => {
        const doc = await parse(`
            airfield T {
                aircraft A { wingspan 10 m  length 8 m  height 3 m }
                hangar H {
                    doors { door D1 { width 15 m  height 5 m } }
                    grid baygrid {
                        bay B1 { width 12 m  depth 15 m  height 5 m }
                    }
                }
                induct A into H bays B1 via D1 from 2025-01-01T08:00 to 2025-01-02T08:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const ind = doc.parseResult.value.inductions[0];
        expect(ind.door?.ref?.name).toBe('D1');
    });

    test('accessNode on door resolves to AccessPath node (property="accessNode")', async () => {
        const doc = await parse(`
            airfield T {
                aircraft A { wingspan 10 m  length 8 m  height 3 m }
                accessPath AP {
                    nodes { node N1  node N2 }
                    links { link N1 to N2 bidirectional true }
                }
                hangar H {
                    doors { door D1 { width 15 m  height 5 m  accessNode N1 } }
                    grid baygrid {
                        bay B1 { width 12 m  depth 15 m  height 5 m  accessNode N2 }
                    }
                }
                induct A into H bays B1 from 2025-01-01T08:00 to 2025-01-02T08:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const hangar = doc.parseResult.value.hangars[0];
        expect(hangar.doors[0].accessNode?.ref?.name).toBe('N1');
        expect(hangar.grid.bays[0].accessNode?.ref?.name).toBe('N2');
    });

    test('from/to in AccessLink resolve within access path (property="from"/"to")', async () => {
        const doc = await parse(`
            airfield T {
                aircraft A { wingspan 10 m  length 8 m  height 3 m }
                accessPath AP {
                    nodes { node N1  node N2 }
                    links { link N1 to N2 bidirectional true }
                }
                hangar H {
                    doors { door D1 { width 15 m  height 5 m  accessNode N1 } }
                    grid baygrid {
                        bay B1 { width 12 m  depth 15 m  height 5 m  accessNode N2 }
                    }
                }
                induct A into H bays B1 from 2025-01-01T08:00 to 2025-01-02T08:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const link = doc.parseResult.value.accessPaths[0].links[0];
        expect(link.from?.ref?.name).toBe('N1');
        expect(link.to?.ref?.name).toBe('N2');
    });

    test('precedingInductions in auto-induction resolves induction by id (property="precedingInductions")', async () => {
        const doc = await parse(`
            airfield T {
                aircraft A { wingspan 10 m  length 8 m  height 3 m }
                hangar H {
                    doors { door D1 { width 15 m  height 5 m } }
                    grid baygrid {
                        bay B1 { width 12 m  depth 15 m  height 5 m }
                    }
                }
                induct id "IND001" A into H bays B1 from 2025-01-01T08:00 to 2025-01-02T08:00;
                auto-induct A duration 60 minutes after IND001;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        const auto = doc.parseResult.value.autoInductions[0];
        expect(auto.precedingInductions[0].ref).toBeDefined();
        expect(auto.precedingInductions[0].ref?.id).toBe('IND001');
    });

    test('bays fallback to all hangars when hangar is unresolved (fallback branch)', async () => {
        // "Unknown" hangar doesn't exist → induction.hangar?.ref is undefined → fallback scope
        const doc = await parse(`
            airfield T {
                aircraft A { wingspan 10 m  length 8 m  height 3 m }
                hangar H {
                    doors { door D1 { width 15 m  height 5 m } }
                    grid baygrid {
                        bay B1 { width 12 m  depth 15 m  height 5 m }
                    }
                }
                induct A into Unknown bays B1 from 2025-01-01T08:00 to 2025-01-02T08:00;
            }
        `);
        // Parser errors=0 even with unresolved hangar; linking errors are non-fatal
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        // Induction parsed successfully
        expect(doc.parseResult.value.inductions).toHaveLength(1);
    });

    test('door fallback to all hangars doors when hangar is unresolved (fallback branch)', async () => {
        const doc = await parse(`
            airfield T {
                aircraft A { wingspan 10 m  length 8 m  height 3 m }
                hangar H {
                    doors { door D1 { width 15 m  height 5 m } }
                    grid baygrid {
                        bay B1 { width 12 m  depth 15 m  height 5 m }
                    }
                }
                induct A into Unknown bays B1 via D1 from 2025-01-01T08:00 to 2025-01-02T08:00;
            }
        `);
        expect(doc.parseResult.parserErrors).toHaveLength(0);
        expect(doc.parseResult.value.inductions).toHaveLength(1);
    });
});
