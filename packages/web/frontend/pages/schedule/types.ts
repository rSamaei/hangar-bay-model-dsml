/** Aircraft as returned by GET /api/aircraft */
export interface Aircraft {
  id: number;
  user_id: number;
  name: string;
  wingspan: number;
  length: number;
  height: number;
  tail_height: number;
  /** Not returned by the API today; reserved for future enrichment */
  clearance_envelope_name?: string;
  created_at: string;
}

/** Individual bay within a hangar */
export interface HangarBay {
  id: number;
  hangar_id: number;
  name: string;
  width: number;
  depth: number;
  height: number;
}

/** Hangar as returned by GET /api/hangars */
export interface Hangar {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
  bays: HangarBay[];
}

/** Raw schedule entry stored in the database */
export interface ScheduleEntry {
  id: number;
  user_id: number;
  aircraft_id: number;
  start_time: string;
  end_time: string;
  created_at: string;
  aircraft_name: string;
  wingspan: number;
  length: number;
  height: number;
  tail_height: number;
}

/** Computed placement for a schedule entry, returned by the scheduler */
export interface ScheduledPlacement {
  entryId: number;
  aircraftName: string;
  hangar: string | null;
  bays: string[];
  start: string;
  end: string;
  status: 'scheduled' | 'failed';
  failureReason?: string;
}

/** Single diagnostic item — from the Langium validator or the scheduler */
export interface DiagnosticItem {
  severity: number;     // 1=error  2=warning  3=info  4=hint
  message: string;
  startLine: number;    // 1-based
  startColumn: number;  // 0-based
  endLine: number;
  endColumn: number;
  source: 'parser' | 'validator' | 'scheduler';
}

/** Full response from GET /api/schedule */
export interface ScheduleResult {
  entries: ScheduleEntry[];
  placements: ScheduledPlacement[];
  validationErrors: string[];
  dslCode?: string;
  schedulerDiagnostics?: DiagnosticItem[];
}

/** Payload attached to a dnd-kit drag event for an aircraft card */
export interface DragAircraftData {
  aircraft: Aircraft;
}
