// ============================================================
// Public API — the single entry point for the simulator package
// ============================================================

// Primary pipeline
export { analyseAndSchedule, analyzeAndSchedule, type AnalysisResult } from './analysis.js';

// Configuration
export { SCHEDULER_CONFIG } from './config.js';

// Scheduler
export { AutoScheduler, type ScheduleResult, type RejectionReason } from './scheduler.js';

// Builders
export { buildValidationReport } from './builders/validation-report.js';
export { buildExportModel } from './builders/export-model.js';

// Types — validation & export
export type { ValidationViolation, ValidationReport } from './types/validation.js';
export type { ExportedInduction, ExportModel, ExportedUnscheduledAuto, HangarStatistic, GlobalSimulationStatistics } from './types/export.js';
export type { EffectiveDimensions } from './types/dimensions.js';
export type { InductionInfo, ConflictInfo } from './types/conflict.js';
export type { ScheduledInduction } from './types/simulation.js';

// Types — domain model
export type {
  DomainModel,
  AircraftType,
  ClearanceEnvelope,
  Hangar,
  HangarBay,
  HangarDoor,
  AccessPath,
  AccessNode,
  AccessLink,
  Induction,
  AutoInduction
} from './types/model.js';

// Geometry
export { calculateEffectiveDimensions } from './geometry/dimensions.js';
export { calculateBaysRequired } from './geometry/bays-required.js';
export { buildAdjacencyGraph } from './geometry/adjacency.js';
export {
    buildAccessGraph,
    reachableNodes,
    checkDynamicBayReachability,
    type AccessGraph,
    type AccessGraphNode,
    type AccessGraphEdge,
    type BlockingBayInfo,
    type ReachabilityResult
} from './geometry/access.js';

// Rules
export { checkContiguity } from './rules/contiguity.js';
export { checkDoorFitEffective } from './rules/door-fit.js';
export { checkBaySetFitEffective } from './rules/bay-fit.js';
export { checkTimeOverlap, detectConflicts } from './rules/time-overlap.js';

// Search
export { findSuitableDoors } from './search/doors.js';
export { findSuitableBaySets, findConnectedSetsOfSize } from './search/bay-sets.js';
export { calculateSearchWindow } from './search/time-window.js';

// Feasibility engine bridge
export { type RuleResult } from '../../language/out/feasibility-engine.js';