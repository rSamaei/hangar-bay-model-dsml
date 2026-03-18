import { useState, useEffect, useRef } from 'react';
import type { AnalysisResult } from '../../services/api';
import type { SimulationEventRecord, ExportedInduction, ExportedUnscheduledAuto } from '../../types/api';

// ── Format helpers ─────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : iso;
}

function formatEpoch(epochMs: number): string {
  const d = new Date(epochMs);
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mo}-${da} ${hh}:${mm}`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function humanizeFailureReason(ruleId: string): string {
  switch (ruleId) {
    case 'STRUCTURALLY_INFEASIBLE': return 'No bay set large enough';
    case 'SIM_DEADLINE_EXCEEDED':   return 'Exceeded time window while waiting';
    case 'SIM_NEVER_PLACED':        return 'Never placed (simulation ended)';
    case 'SIM_EVENT_LIMIT':         return 'Simulation event limit reached';
    case 'DEPENDENCY_NEVER_PLACED': return 'Dependency was never placed';
    case 'SCHED_FAILED':            return 'Scheduling failed';
    default:                        return ruleId;
  }
}

// ── Event description ──────────────────────────────────────────────────────

function describeEvent(evt: SimulationEventRecord): { icon: string; color: string; desc: string } {
  const bays = evt.bays?.join(', ') ?? '';
  const door = evt.door ?? '';
  switch (evt.kind) {
    case 'ARRIVAL_PLACED':
      return { icon: '▶', color: 'text-emerald-400', desc: `placed in ${bays}${door ? ` via ${door}` : ''}` };
    case 'ARRIVAL_QUEUED':
      return { icon: '⏲', color: 'text-amber-400', desc: 'queued (no available bay set)' };
    case 'DEPARTURE_CLEARED':
      return { icon: '✓', color: 'text-cyan-400', desc: `departed${door ? ` via ${door}` : ''}` };
    case 'DEPARTURE_BLOCKED':
      return { icon: '⚠', color: 'text-amber-400', desc: `departure delayed${evt.blockedBy ? ` (blocked by ${evt.blockedBy.join(', ')})` : ''}` };
    case 'RETRY_PLACED':
      return { icon: '↻', color: 'text-emerald-400', desc: `placed on retry in ${bays}` };
    case 'DEADLINE_EXPIRED':
      return { icon: '✗', color: 'text-red-400', desc: 'could not place within time window' };
    case 'DEPENDENCY_UNLOCKED':
      return { icon: '🔓', color: 'text-blue-400', desc: 'dependencies met, ready for placement' };
    case 'STRUCTURALLY_INFEASIBLE':
      return { icon: '✗', color: 'text-red-400', desc: `structurally infeasible${evt.reason ? `: ${evt.reason}` : ''}` };
    case 'DEADLOCK_DETECTED':
      return { icon: '🔒', color: 'text-red-400', desc: 'deadlock detected' };
    case 'SIM_EVENT_LIMIT':
      return { icon: '⛔', color: 'text-red-400', desc: 'simulation event limit reached' };
    default:
      return { icon: '?', color: 'text-slate-500', desc: evt.kind };
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

const SECTION_HEADER = 'px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-800/30 border-b border-slate-800/60';
const TABLE_HEADER   = 'px-3 py-1 border-b border-slate-800/60 text-xs text-slate-500 font-medium bg-slate-800/10';

function TimelineEvent({ evt, highlighted, onHighlight }: {
  evt: SimulationEventRecord;
  highlighted: boolean;
  onHighlight: (id: string) => void;
}) {
  const { icon, color, desc } = describeEvent(evt);
  return (
    <button
      onClick={() => onHighlight(evt.inductionId)}
      className={`w-full flex items-start gap-2 px-3 py-1 border-b border-slate-800/30 text-xs text-left hover:bg-slate-800/30 transition-colors ${highlighted ? 'bg-cyan-500/10' : ''}`}
    >
      <span className="text-slate-500 font-mono shrink-0 w-[84px]">{formatEpoch(evt.time)}</span>
      <span className={`${color} shrink-0 w-4 text-center`}>{icon}</span>
      <span className="text-slate-200 font-medium shrink-0">{evt.inductionId}</span>
      <span className="text-slate-400 min-w-0 truncate">— {desc}</span>
    </button>
  );
}

function ScheduledRow({ ind, highlighted, onHighlight }: {
  ind: ExportedInduction;
  highlighted: boolean;
  onHighlight: (id: string) => void;
}) {
  const wait  = ind.waitTime  ?? 0;
  const delay = ind.departureDelay ?? 0;
  const rowBg = highlighted
    ? 'bg-cyan-500/10'
    : delay > 0 ? 'bg-red-500/5'
    : wait  > 0 ? 'bg-amber-500/5'
    : '';

  return (
    <button
      onClick={() => onHighlight(ind.id)}
      className={`w-full grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_60px_60px_55px_55px] gap-1 px-3 py-1 border-b border-slate-800/30 text-xs text-left hover:bg-slate-800/30 transition-colors ${rowBg}`}
    >
      <span className="text-slate-200 font-medium truncate flex items-center gap-1">
        <span className={`px-1 py-0.5 rounded text-[9px] leading-none uppercase ${ind.kind === 'manual' ? 'bg-slate-700/60 text-slate-400' : 'bg-cyan-900/40 text-cyan-400'}`}>
          {ind.kind === 'manual' ? 'man' : 'auto'}
        </span>
        {ind.id}
      </span>
      <span className="text-slate-300 truncate">{ind.aircraft}</span>
      <span className="text-slate-400 truncate">{ind.hangar}</span>
      <span className="text-slate-500 truncate">{ind.bays.join(', ')}</span>
      <span className="text-slate-500 font-mono">{formatTime(ind.start)}</span>
      <span className="text-slate-500 font-mono">{formatTime(ind.end)}</span>
      <span className={`font-mono ${wait  > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{formatDuration(wait)}</span>
      <span className={`font-mono ${delay > 0 ? 'text-red-400'   : 'text-slate-600'}`}>{formatDuration(delay)}</span>
    </button>
  );
}

function FailedRow({ ind, highlighted, onHighlight }: {
  ind: ExportedUnscheduledAuto;
  highlighted: boolean;
  onHighlight: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onHighlight(ind.id)}
      className={`w-full grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-1 px-3 py-1.5 border-b border-slate-800/30 text-xs text-left hover:bg-slate-800/30 transition-colors ${highlighted ? 'bg-cyan-500/10' : ''}`}
    >
      <span className="text-slate-200 font-medium truncate">{ind.id}</span>
      <span className="text-slate-300 truncate">{ind.aircraft}</span>
      <span className="text-red-400">{humanizeFailureReason(ind.reasonRuleId)}</span>
    </button>
  );
}

// ── ScheduleTab ────────────────────────────────────────────────────────────

const TIMELINE_LIMIT = 50;

interface Props {
  result: AnalysisResult;
}

export function ScheduleTab({ result }: Props) {
  const { report, exportModel, simulationLog, simulationStats } = result;

  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const manual      = exportModel.inductions.filter(i => i.kind === 'manual');
  const scheduled   = exportModel.autoSchedule?.scheduled   ?? [];
  const unscheduled = exportModel.autoSchedule?.unscheduled ?? [];
  const allScheduled = [...manual, ...scheduled];

  const errCount  = report.summary.bySeverity.errors;
  const warnCount = report.summary.bySeverity.warnings;

  const events = simulationLog ?? [];
  const visibleEvents = timelineExpanded ? events : events.slice(0, TIMELINE_LIMIT);
  const hasMore = events.length > TIMELINE_LIMIT;

  function handleHighlight(id: string) {
    setHighlighted(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlighted(null), 3000);
  }

  useEffect(() => () => { if (highlightTimer.current) clearTimeout(highlightTimer.current); }, []);

  return (
    <div className="flex flex-col">

      {/* Validation + sim stats bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-xs bg-slate-800/20 border-b border-slate-800/60 flex-wrap">
        <span className="text-slate-400 font-medium">Validation:</span>
        {errCount  > 0 && <span className="text-red-400">{errCount} error{errCount !== 1 ? 's' : ''}</span>}
        {warnCount > 0 && <span className="text-amber-400">{warnCount} warning{warnCount !== 1 ? 's' : ''}</span>}
        {errCount === 0 && warnCount === 0 && <span className="text-emerald-400">No violations</span>}
        {simulationStats && (
          <>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400 font-medium">Sim:</span>
            <span className="text-cyan-400">{simulationStats.placedCount} placed</span>
            {simulationStats.failedCount > 0 && (
              <span className="text-red-400">{simulationStats.failedCount} failed</span>
            )}
            <span className="text-slate-500">peak {simulationStats.peakOccupancy} bays</span>
            {simulationStats.maxQueueDepth > 0 && (
              <span className="text-amber-400">queue {simulationStats.maxQueueDepth}</span>
            )}
          </>
        )}
      </div>

      {/* Event timeline */}
      {events.length > 0 && (
        <>
          <div className={`${SECTION_HEADER} flex items-center justify-between`}>
            <span>Event Timeline ({events.length})</span>
            {hasMore && (
              <button
                onClick={() => setTimelineExpanded(e => !e)}
                className="text-cyan-400 hover:text-cyan-300 normal-case font-normal tracking-normal"
              >
                {timelineExpanded ? 'Show less' : 'Show all'}
              </button>
            )}
          </div>
          {visibleEvents.map((evt, i) => (
            <TimelineEvent
              key={i}
              evt={evt}
              highlighted={highlighted === evt.inductionId}
              onHighlight={handleHighlight}
            />
          ))}
        </>
      )}

      {/* Scheduled inductions */}
      {allScheduled.length > 0 && (
        <>
          <div className={SECTION_HEADER}>Scheduled Inductions ({allScheduled.length})</div>
          <div className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_60px_60px_55px_55px] gap-1 ${TABLE_HEADER}`}>
            <span>ID</span><span>Aircraft</span><span>Hangar</span><span>Bays</span>
            <span>Start</span><span>End</span><span>Wait</span><span>Delay</span>
          </div>
          {allScheduled.map((ind, i) => (
            <ScheduledRow
              key={i}
              ind={ind}
              highlighted={highlighted === ind.id}
              onHighlight={handleHighlight}
            />
          ))}
        </>
      )}

      {/* Failed to schedule */}
      {unscheduled.length > 0 && (
        <>
          <div className={SECTION_HEADER}>Failed to Schedule ({unscheduled.length})</div>
          <div className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-1 ${TABLE_HEADER}`}>
            <span>ID</span><span>Aircraft</span><span>Reason</span>
          </div>
          {unscheduled.map((ind, i) => (
            <FailedRow
              key={i}
              ind={ind}
              highlighted={highlighted === ind.id}
              onHighlight={handleHighlight}
            />
          ))}
        </>
      )}

      {allScheduled.length === 0 && unscheduled.length === 0 && events.length === 0 && (
        <div className="flex items-center justify-center h-12 text-slate-500 text-xs">
          No inductions found
        </div>
      )}
    </div>
  );
}
