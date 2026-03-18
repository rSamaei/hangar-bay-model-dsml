// ── View model types (derived from API response) ─────────────────────

/** A single bar on the timeline (occupancy, waiting overlay, or delay overlay). */
export interface TimelineBar {
  id: string;               // induction ID
  type: 'manual' | 'auto' | 'waiting' | 'departure-delay';
  aircraftType: string;     // e.g. "Hawk"
  inductionId: string;      // e.g. "A_HAWK_CHAIN1" (for tooltip)
  hangarName: string;
  bayNames: string[];       // which bays this bar occupies
  doorName: string;
  startMs: number;          // epoch ms
  endMs: number;            // epoch ms
  // Tooltip data
  waitTimeMinutes?: number;
  waitReason?: string | null;
  departureDelayMinutes?: number;
  departureDelayReason?: string | null;
  placementAttempts?: number;
  queuePosition?: number | null;
}

/** A bay in the sidebar. */
export interface BayInfo {
  name: string;
  hangarName: string;
  row?: number;             // grid row (for display as "(row,col)")
  col?: number;             // grid col
  traversable: boolean;
  /** Failed inductions that wanted this bay. */
  failedIndicators: FailedBayIndicator[];
}

/** Failed induction indicator on a bay or hangar. */
export interface FailedBayIndicator {
  inductionId: string;
  aircraftType: string;
  reasonHumanized: string;
}

/** Hangar group for the sidebar. */
export interface HangarGroup {
  name: string;
  bays: BayInfo[];
  /** Failed inductions targeting this hangar (not a specific bay). */
  failedIndicators: FailedBayIndicator[];
}

/** Per-hangar summary for the strip. */
export interface HangarSummary {
  name: string;
  avgUtilisation: number;   // 0–1
  peakOccupancy: number;
  totalBays: number;
  totalWaitMinutes: number;
  inductionsServed: number;
}

/** Global summary stats. */
export interface GlobalSummary {
  placedCount: number;
  failedCount: number;
  totalWaitMinutes: number;
  maxQueueDepth: number;
}

/** Failed induction for the failures panel. */
export interface FailedInductionView {
  inductionId: string;
  aircraftType: string;
  preferredHangar?: string;
  reasonRuleId: string;
  reasonHumanized: string;  // 1-2 sentence natural language
  evidence: Record<string, any>;
  requestedArrival?: number; // epoch ms
  deadline?: number;         // epoch ms
}

/** Complete view model for the analysis page. */
export interface AnalysisViewModel {
  airfieldName: string;
  hangarGroups: HangarGroup[];
  hangarSummaries: HangarSummary[];
  globalSummary: GlobalSummary;
  bars: TimelineBar[];      // all bars across all bays
  failedInductions: FailedInductionView[];
  minTime: number;           // epoch ms (earliest bar start)
  maxTime: number;           // epoch ms (latest bar end)
  timeMarkers: TimeMarker[];
}

export interface TimeMarker {
  label: string;             // e.g. "Sep 1", "08:00"
  positionPct: number;       // 0–100
}

/** Tooltip state. */
export interface TooltipState {
  bar: TimelineBar;
  x: number;                // clientX
  y: number;                // clientY
}
