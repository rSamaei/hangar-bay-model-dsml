// Re-export all access graph symbols from the language package.
// The implementation lives in packages/language/src/access-graph.ts to allow
// the Langium validator to import it without creating a circular dependency
// (the simulator already imports from the language package's compiled output).
export * from '../../../language/out/access-graph.js';
