/**
 * Main engine module - re-exports all public APIs
 */

// PRIMARY API
export { analyzeAndSchedule, type AnalysisResult } from './analysis.js';

// Configuration
export { SCHEDULER_CONFIG } from './config.js';

// Types
export type { ValidationViolation, ValidationReport } from './types/validation.js';
export type { ExportedInduction, ExportModel, ExportedUnscheduledAuto } from './types/export.js';
export type { EffectiveDimensions } from './types/dimensions.js';
export type { InductionInfo, ConflictInfo } from './types/conflict.js';
export type { SimulationResult, ScheduledInduction, Conflict, UtilizationStats } from './types/simulation.js';

// Scheduler
export { AutoScheduler, type ScheduleResult, type RejectionReason } from './scheduler.js';

// Geometry functions
export { calculateEffectiveDimensions } from './geometry/dimensions.js';
export { calculateBaysRequired } from './geometry/bays-required.js';
export { buildAdjacencyGraph } from './geometry/adjacency.js';

// Rule checking functions
export { checkContiguity } from './rules/contiguity.js';
export { checkDoorFitEffective } from './rules/door-fit.js';
export { checkBaySetFitEffective } from './rules/bay-fit.js';
export { checkTimeOverlap, detectConflicts } from './rules/time-overlap.js';

// Search functions
export { findSuitableDoors } from './search/doors.js';
export { findSuitableBaySets, findConnectedSetsOfSize } from './search/bay-sets.js';
export { calculateSearchWindow } from './search/time-window.js';

// Builders
export { buildValidationReport } from './builders/validation-report.js';
export { buildExportModel } from './builders/export-model.js';

// Re-export from feasibility engine
export { FeasibilityEngine, type RuleResult } from '../../language/out/feasibility-engine.js';