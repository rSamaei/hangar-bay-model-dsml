import type { DiagnosticItem } from './diagnostics';
import type { AnalysisResult } from '../services/api';
import type { SimulationEventRecord, ExportedInduction, ExportedUnscheduledAuto } from '../types/api';

// Minimal editor interface — avoids importing all of monaco-editor here.
interface EditorLike {
  revealLineInCenter(lineNumber: number): void;
  setPosition(position: { lineNumber: number; column: number }): void;
  focus(): void;
  layout(): void;
}

export interface PanelController {
  updateDiagnostics(items: DiagnosticItem[]): void;
  updateScheduleResults(result: AnalysisResult): void;
  dispose(): void;
}

// ── SFR rule-ID prefix pattern (mirrors diagnostics.ts) ───────────────────────
const SFR_PREFIX_RE = /^\[(SFR\w+)\]\s*/;

// ── HTML escaping ─────────────────────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Severity SVG icons ────────────────────────────────────────────────────────
function severityIcon(severity: number): string {
  switch (severity) {
    case 1: // error
      return `<svg class="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>`;
    case 2: // warning
      return `<svg class="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
      </svg>`;
    case 3: // info
      return `<svg class="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>`;
    default: // hint
      return `<svg class="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>`;
  }
}

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

// ── Main factory ──────────────────────────────────────────────────────────────

export function setupProblemsPanel(editor: EditorLike): PanelController {
  let currentDiagnostics: DiagnosticItem[] = [];
  let panelCollapsed = false;
  let panelHeight = 200;
  let activeTab: 'problems' | 'schedule' = 'problems';

  // DOM refs
  const panel        = document.getElementById('problems-panel');
  const divider      = document.getElementById('panel-divider');
  const collapseBtn  = document.getElementById('panel-collapse-btn');
  const collapseIcon = document.getElementById('panel-collapse-icon');
  const tabProblems  = document.getElementById('tab-problems');
  const tabSchedule  = document.getElementById('tab-schedule');
  const probContent  = document.getElementById('panel-problems-content');
  const schedContent = document.getElementById('panel-schedule-content');
  const errorBadge   = document.getElementById('panel-error-badge');
  const warnBadge    = document.getElementById('panel-warning-badge');
  const infoBadge    = document.getElementById('panel-info-badge');

  // Guard: if the panel DOM isn't present (wrong route), return a no-op
  if (!panel) {
    return { updateDiagnostics() {}, updateScheduleResults() {}, dispose() {} };
  }

  // ── Tab switching ──────────────────────────────────────────────────────────

  function activateTab(tab: 'problems' | 'schedule') {
    activeTab = tab;
    const isProblems = tab === 'problems';

    tabProblems?.classList.toggle('border-cyan-500',    isProblems);
    tabProblems?.classList.toggle('text-white',         isProblems);
    tabProblems?.classList.toggle('border-transparent', !isProblems);
    tabProblems?.classList.toggle('text-slate-400',     !isProblems);

    tabSchedule?.classList.toggle('border-cyan-500',    !isProblems);
    tabSchedule?.classList.toggle('text-white',         !isProblems);
    tabSchedule?.classList.toggle('border-transparent', isProblems);
    tabSchedule?.classList.toggle('text-slate-400',     isProblems);

    probContent?.classList.toggle('hidden',  !isProblems);
    schedContent?.classList.toggle('hidden', isProblems);
  }

  tabProblems?.addEventListener('click', () => activateTab('problems'));
  tabSchedule?.addEventListener('click', () => activateTab('schedule'));

  // ── Collapse / expand ──────────────────────────────────────────────────────

  function setCollapsed(collapsed: boolean) {
    panelCollapsed = collapsed;
    if (collapsed) {
      panel.style.height   = '0px';
      panel.style.overflow = 'hidden';
      collapseIcon?.querySelector('path')?.setAttribute('d', 'M5 15l7-7 7 7');
    } else {
      panel.style.height   = `${panelHeight}px`;
      panel.style.overflow = '';
      collapseIcon?.querySelector('path')?.setAttribute('d', 'M19 9l-7 7-7-7');
    }
    editor.layout();
  }

  collapseBtn?.addEventListener('click', () => setCollapsed(!panelCollapsed));

  // ── Drag to resize ─────────────────────────────────────────────────────────

  let isDragging    = false;
  let dragStartY    = 0;
  let dragStartH    = 0;

  const onDividerMouseDown = (e: MouseEvent) => {
    // Ignore clicks on the collapse button inside the divider
    if ((e.target as HTMLElement).closest('#panel-collapse-btn')) return;
    isDragging = true;
    dragStartY = e.clientY;
    dragStartH = panel.offsetHeight;
    document.body.style.cursor     = 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    // Dragging the divider UP increases panel height
    const delta  = dragStartY - e.clientY;
    const newH   = Math.max(36, Math.min(480, dragStartH + delta));
    panelHeight  = newH;
    panel.style.height   = `${newH}px`;
    panel.style.overflow = '';
    panelCollapsed = newH <= 36;
    editor.layout();
  };

  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  };

  divider?.addEventListener('mousedown', onDividerMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup',   onMouseUp);

  // ── Badge helper ───────────────────────────────────────────────────────────

  function setBadge(el: HTMLElement | null, count: number) {
    if (!el) return;
    el.textContent = String(count);
    el.classList.toggle('hidden', count === 0);
  }

  // ── Diagnostics update ─────────────────────────────────────────────────────

  function updateDiagnostics(items: DiagnosticItem[]) {
    currentDiagnostics = items;

    const errors   = items.filter(d => d.severity === 1);
    const warnings = items.filter(d => d.severity === 2);
    const infos    = items.filter(d => d.severity >= 3);

    setBadge(errorBadge, errors.length);
    setBadge(warnBadge,  warnings.length);
    setBadge(infoBadge,  infos.length);

    if (!probContent) return;

    if (items.length === 0) {
      probContent.innerHTML = `
        <div class="flex items-center justify-center h-12 text-slate-500 text-xs">
          No problems detected
        </div>`;
      return;
    }

    probContent.innerHTML = items.map((d, i) => {
      const match   = SFR_PREFIX_RE.exec(d.message);
      const code    = match?.[1];
      const message = match ? d.message.slice(match[0].length) : d.message;
      const codeTag = code
        ? `<span class="px-1 py-0.5 rounded bg-slate-700/80 text-slate-300 font-mono text-xs leading-none">${esc(code)}</span>`
        : '';
      const src = d.source === 'parser' ? 'parser' : 'validator';

      return `
        <div class="diagnostic-item flex items-start gap-2 px-3 py-1.5 hover:bg-slate-800/50 border-b border-slate-800/40 cursor-pointer" data-index="${i}">
          ${severityIcon(d.severity)}
          <div class="flex-1 min-w-0">
            <div class="text-slate-200 text-xs leading-snug">${esc(message.trim())}</div>
            <div class="flex items-center flex-wrap gap-1.5 mt-0.5">
              ${codeTag}
              <span class="text-slate-500 text-xs">${src}</span>
              <span class="text-slate-600 text-xs">line ${d.startLine}, col ${d.startColumn + 1}</span>
            </div>
          </div>
        </div>`;
    }).join('');

    // Click to jump cursor to diagnostic location
    probContent.querySelectorAll<HTMLElement>('.diagnostic-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset['index'] ?? '0', 10);
        const d   = currentDiagnostics[idx];
        if (!d) return;
        if (panelCollapsed) setCollapsed(false);
        editor.revealLineInCenter(d.startLine);
        editor.setPosition({ lineNumber: d.startLine, column: d.startColumn + 1 });
        editor.focus();
      });
    });
  }

  // ── Schedule results update ────────────────────────────────────────────────

  let timelineExpanded = false;

  function updateScheduleResults(result: AnalysisResult) {
    activateTab('schedule');
    if (!schedContent) return;

    const { report, exportModel, simulationLog, simulationStats } = result;
    const manual      = exportModel.inductions.filter(i => i.kind === 'manual');
    const scheduled   = exportModel.autoSchedule?.scheduled   ?? [];
    const unscheduled = exportModel.autoSchedule?.unscheduled ?? [];

    const errCount  = report.summary.bySeverity.errors;
    const warnCount = report.summary.bySeverity.warnings;

    let html = '';

    // ── Validation summary bar ──────────────────────────────────────────
    html += `
      <div class="flex items-center gap-3 px-3 py-1.5 border-b border-slate-800/60 text-xs bg-slate-800/20">
        <span class="text-slate-400 font-medium">Validation:</span>
        ${errCount  > 0 ? `<span class="text-red-400">${errCount} error${errCount !== 1 ? 's' : ''}</span>` : ''}
        ${warnCount > 0 ? `<span class="text-amber-400">${warnCount} warning${warnCount !== 1 ? 's' : ''}</span>` : ''}
        ${errCount === 0 && warnCount === 0
          ? `<span class="text-emerald-400">No violations</span>`
          : ''}`;

    // Simulation summary stats (inline with validation)
    if (simulationStats) {
      html += `
        <span class="text-slate-600 mx-1">|</span>
        <span class="text-slate-400 font-medium">Sim:</span>
        <span class="text-cyan-400">${simulationStats.placedCount} placed</span>
        ${simulationStats.failedCount > 0
          ? `<span class="text-red-400">${simulationStats.failedCount} failed</span>`
          : ''}
        <span class="text-slate-500">peak ${simulationStats.peakOccupancy} bays</span>
        ${simulationStats.maxQueueDepth > 0
          ? `<span class="text-amber-400">queue ${simulationStats.maxQueueDepth}</span>`
          : ''}`;
    }
    html += `</div>`;

    // ── Timeline section ────────────────────────────────────────────────
    if (simulationLog && simulationLog.length > 0) {
      const TIMELINE_LIMIT = 50;
      const hasMore = simulationLog.length > TIMELINE_LIMIT;
      const visibleEvents = timelineExpanded ? simulationLog : simulationLog.slice(0, TIMELINE_LIMIT);

      html += `<div class="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-800/30 border-b border-slate-800/60 flex items-center justify-between">
        <span>Event Timeline (${simulationLog.length})</span>
        ${hasMore ? `<button id="sched-timeline-toggle" class="text-cyan-400 hover:text-cyan-300 normal-case font-normal">${timelineExpanded ? 'Show less' : 'Show all'}</button>` : ''}
      </div>`;

      html += visibleEvents.map(evt => renderTimelineEvent(evt)).join('');
    }

    // ── Scheduled inductions table ──────────────────────────────────────
    const allScheduled = [...manual, ...scheduled];
    if (allScheduled.length > 0) {
      html += `<div class="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-800/30 border-b border-slate-800/60">
        Scheduled Inductions (${allScheduled.length})</div>`;

      // Header row
      html += `<div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_80px_80px_60px_60px] gap-1 px-3 py-1 border-b border-slate-800/60 text-xs text-slate-500 font-medium bg-slate-800/10">
        <span>ID</span><span>Aircraft</span><span>Hangar</span><span>Bays</span><span>Start</span><span>End</span><span>Wait</span><span>Delay</span>
      </div>`;

      html += allScheduled.map(ind => renderScheduledRow(ind)).join('');
    }

    // ── Failed inductions ───────────────────────────────────────────────
    if (unscheduled.length > 0) {
      html += `<div class="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-800/30 border-b border-slate-800/60">
        Failed to Schedule (${unscheduled.length})</div>`;

      // Header row
      html += `<div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-1 px-3 py-1 border-b border-slate-800/60 text-xs text-slate-500 font-medium bg-slate-800/10">
        <span>ID</span><span>Aircraft</span><span>Reason</span>
      </div>`;

      html += unscheduled.map(ind => renderFailedRow(ind)).join('');
    }

    if (allScheduled.length === 0 && unscheduled.length === 0 && (!simulationLog || simulationLog.length === 0)) {
      html += `<div class="flex items-center justify-center h-12 text-slate-500 text-xs">No inductions found</div>`;
    }

    schedContent.innerHTML = html;

    // Wire up "Show all" / "Show less" toggle
    document.getElementById('sched-timeline-toggle')?.addEventListener('click', () => {
      timelineExpanded = !timelineExpanded;
      updateScheduleResults(result);
    });

    // ── Cross-panel highlight on click ────────────────────────────────
    wireInductionHighlighting(schedContent);

    // Expand panel if it was collapsed
    if (panelCollapsed) setCollapsed(false);
  }

  // ── Timeline event renderer ────────────────────────────────────────────────

  function renderTimelineEvent(evt: SimulationEventRecord): string {
    const ts = formatEpoch(evt.time);
    const { icon, color, description } = describeEvent(evt);

    return `
      <div class="ind-timeline flex items-start gap-2 px-3 py-1 border-b border-slate-800/30 text-xs hover:bg-slate-800/30 cursor-pointer" data-induction-id="${esc(evt.inductionId)}">
        <span class="text-slate-600 font-mono shrink-0 w-[90px]">${ts}</span>
        <span class="${color} shrink-0 w-4 text-center">${icon}</span>
        <span class="text-slate-300 min-w-0">${description}</span>
      </div>`;
  }

  function describeEvent(evt: SimulationEventRecord): { icon: string; color: string; description: string } {
    const id = esc(evt.inductionId);
    const ac = evt.aircraft ? esc(evt.aircraft) : '';
    const bays = evt.bays?.map(esc).join(', ') ?? '';
    const door = evt.door ? esc(evt.door) : '';

    switch (evt.kind) {
      case 'ARRIVAL_PLACED':
        return { icon: '&#9654;', color: 'text-emerald-400', description: `<span class="text-slate-200 font-medium">${id}</span> — ${ac} placed in ${bays}${door ? ` via ${door}` : ''}` };
      case 'ARRIVAL_QUEUED':
        return { icon: '&#9202;', color: 'text-amber-400', description: `<span class="text-slate-200 font-medium">${id}</span> — ${ac} queued (no available bay set)` };
      case 'DEPARTURE_CLEARED':
        return { icon: '&#10003;', color: 'text-cyan-400', description: `<span class="text-slate-200 font-medium">${id}</span> — ${ac} departed${door ? ` via ${door}` : ''}` };
      case 'DEPARTURE_BLOCKED':
        return { icon: '&#9888;', color: 'text-amber-400', description: `<span class="text-slate-200 font-medium">${id}</span> — departure delayed${evt.blockedBy ? ` (blocked by ${evt.blockedBy.map(esc).join(', ')})` : ''}` };
      case 'RETRY_PLACED':
        return { icon: '&#8635;', color: 'text-emerald-400', description: `<span class="text-slate-200 font-medium">${id}</span> — ${ac} placed on retry in ${bays}` };
      case 'DEADLINE_EXPIRED':
        return { icon: '&#10007;', color: 'text-red-400', description: `<span class="text-slate-200 font-medium">${id}</span> — could not place within time window` };
      case 'DEPENDENCY_UNLOCKED':
        return { icon: '&#128275;', color: 'text-blue-400', description: `<span class="text-slate-200 font-medium">${id}</span> — dependencies met, ready for placement` };
      case 'STRUCTURALLY_INFEASIBLE':
        return { icon: '&#10007;', color: 'text-red-400', description: `<span class="text-slate-200 font-medium">${id}</span> — structurally infeasible${evt.reason ? `: ${esc(evt.reason)}` : ''}` };
      case 'DEADLOCK_DETECTED':
        return { icon: '&#128274;', color: 'text-red-400', description: `<span class="text-slate-200 font-medium">${id}</span> — deadlock detected` };
      case 'SIM_EVENT_LIMIT':
        return { icon: '&#9940;', color: 'text-red-400', description: `<span class="text-slate-200 font-medium">${id}</span> — simulation event limit reached` };
      default:
        return { icon: '?', color: 'text-slate-500', description: `<span class="text-slate-200 font-medium">${id}</span> — ${evt.kind}` };
    }
  }

  // ── Scheduled induction row ──────────────────────────────────────────────

  function renderScheduledRow(ind: ExportedInduction): string {
    const wait = ind.waitTime ?? 0;
    const delay = ind.departureDelay ?? 0;
    const rowColor = delay > 0
      ? 'bg-red-500/5'
      : wait > 0
        ? 'bg-amber-500/5'
        : '';
    const kindBadge = ind.kind === 'manual'
      ? `<span class="px-1 py-0.5 rounded bg-slate-700/60 text-slate-400 text-[9px] leading-none uppercase">man</span>`
      : `<span class="px-1 py-0.5 rounded bg-cyan-900/40 text-cyan-400 text-[9px] leading-none uppercase">auto</span>`;

    return `
      <div class="ind-card grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_80px_80px_60px_60px] gap-1 px-3 py-1 border-b border-slate-800/30 text-xs hover:bg-slate-800/30 cursor-pointer ${rowColor}" data-induction-id="${esc(ind.id)}">
        <span class="text-slate-200 font-medium truncate flex items-center gap-1">${kindBadge} ${esc(ind.id)}</span>
        <span class="text-slate-300 truncate">${esc(ind.aircraft)}</span>
        <span class="text-slate-400 truncate">${esc(ind.hangar)}</span>
        <span class="text-slate-500 truncate">${ind.bays.map(esc).join(', ')}</span>
        <span class="text-slate-500 font-mono">${formatTime(ind.start)}</span>
        <span class="text-slate-500 font-mono">${formatTime(ind.end)}</span>
        <span class="${wait > 0 ? 'text-amber-400' : 'text-slate-600'} font-mono">${formatDuration(wait)}</span>
        <span class="${delay > 0 ? 'text-red-400' : 'text-slate-600'} font-mono">${formatDuration(delay)}</span>
      </div>`;
  }

  // ── Failed induction row ─────────────────────────────────────────────────

  function renderFailedRow(ind: ExportedUnscheduledAuto): string {
    return `
      <div class="ind-card grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-1 px-3 py-1.5 border-b border-slate-800/30 text-xs hover:bg-slate-800/30 cursor-pointer" data-induction-id="${esc(ind.id)}">
        <span class="text-slate-200 font-medium truncate">${esc(ind.id)}</span>
        <span class="text-slate-300 truncate">${esc(ind.aircraft)}</span>
        <span class="text-red-400">${esc(humanizeFailureReason(ind.reasonRuleId))}</span>
      </div>`;
  }

  // ── Cross-panel induction highlighting ─────────────────────────────────────

  let highlightTimer: ReturnType<typeof setTimeout> | null = null;

  function clearHighlights() {
    document.querySelectorAll('.ind-highlighted').forEach(el =>
      el.classList.remove('ind-highlighted'),
    );
    if (highlightTimer) { clearTimeout(highlightTimer); highlightTimer = null; }
  }

  function highlightInduction(inductionId: string) {
    clearHighlights();

    const matches = schedContent!.querySelectorAll<HTMLElement>(
      `[data-induction-id="${CSS.escape(inductionId)}"]`,
    );
    matches.forEach(el => el.classList.add('ind-highlighted'));

    // Scroll to first matching card and first matching timeline entry
    const firstCard = schedContent!.querySelector<HTMLElement>(
      `.ind-card[data-induction-id="${CSS.escape(inductionId)}"]`,
    );
    const firstTimeline = schedContent!.querySelector<HTMLElement>(
      `.ind-timeline[data-induction-id="${CSS.escape(inductionId)}"]`,
    );
    firstCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    firstTimeline?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    highlightTimer = setTimeout(clearHighlights, 3000);
  }

  function wireInductionHighlighting(container: HTMLElement) {
    container.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-induction-id]');
      if (!target) return;
      const id = target.dataset['inductionId'];
      if (id) highlightInduction(id);
    });
  }

  // ── Dispose ────────────────────────────────────────────────────────────────

  return {
    updateDiagnostics,
    updateScheduleResults,
    dispose() {
      divider?.removeEventListener('mousedown', onDividerMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
      clearHighlights();
    },
  };
}
