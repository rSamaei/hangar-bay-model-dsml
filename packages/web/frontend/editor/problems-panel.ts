import type { DiagnosticItem } from './diagnostics';
import type { AnalysisResult } from '../services/api';

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
const SFR_PREFIX_RE = /^(SFR\w+):\s*/;

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

  function updateScheduleResults(result: AnalysisResult) {
    activateTab('schedule');
    if (!schedContent) return;

    const { report, exportModel } = result;
    const manual      = exportModel.inductions;
    const scheduled   = exportModel.autoSchedule?.scheduled   ?? [];
    const unscheduled = exportModel.autoSchedule?.unscheduled ?? [];

    const errCount  = report.summary.bySeverity.errors;
    const warnCount = report.summary.bySeverity.warnings;

    let html = `
      <div class="flex items-center gap-3 px-3 py-1.5 border-b border-slate-800/60 text-xs bg-slate-800/20">
        <span class="text-slate-400 font-medium">Validation:</span>
        ${errCount  > 0 ? `<span class="text-red-400">${errCount} error${errCount !== 1 ? 's' : ''}</span>` : ''}
        ${warnCount > 0 ? `<span class="text-amber-400">${warnCount} warning${warnCount !== 1 ? 's' : ''}</span>` : ''}
        ${errCount === 0 && warnCount === 0
          ? `<span class="text-emerald-400">No violations</span>`
          : ''}
      </div>`;

    if (manual.length > 0) {
      html += `<div class="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-800/30 border-b border-slate-800/60">
        Manual Inductions (${manual.length})</div>`;
      html += manual.map(ind => `
        <div class="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800/30 text-xs hover:bg-slate-800/30">
          <svg class="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
          <span class="text-slate-200 font-medium">${esc(ind.aircraft)}</span>
          <span class="text-slate-400">→ ${esc(ind.hangar)}</span>
          <span class="text-slate-500">[${ind.bays.map(esc).join(', ')}]</span>
          <span class="ml-auto text-slate-500 shrink-0 font-mono">${formatTime(ind.start)}–${formatTime(ind.end)}</span>
        </div>`).join('');
    }

    if (scheduled.length > 0) {
      html += `<div class="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-800/30 border-b border-slate-800/60">
        Auto-Scheduled (${scheduled.length})</div>`;
      html += scheduled.map(ind => `
        <div class="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800/30 text-xs hover:bg-slate-800/30">
          <svg class="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span class="text-slate-200 font-medium">${esc(ind.aircraft)}</span>
          <span class="text-slate-400">→ ${esc(ind.hangar)}</span>
          <span class="text-slate-500">[${ind.bays.map(esc).join(', ')}]</span>
          <span class="ml-auto text-slate-500 shrink-0 font-mono">${formatTime(ind.start)}–${formatTime(ind.end)}</span>
        </div>`).join('');
    }

    if (unscheduled.length > 0) {
      html += `<div class="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-800/30 border-b border-slate-800/60">
        Failed to Schedule (${unscheduled.length})</div>`;
      html += unscheduled.map(ind => `
        <div class="flex items-start gap-2 px-3 py-1.5 border-b border-slate-800/30 text-xs hover:bg-slate-800/30">
          <svg class="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
          </svg>
          <div>
            <span class="text-slate-200 font-medium">${esc(ind.aircraft)}</span>
            ${ind.preferredHangar ? `<span class="text-slate-400"> (pref: ${esc(ind.preferredHangar)})</span>` : ''}
            <div class="text-red-400 mt-0.5 font-mono">${esc(ind.reasonRuleId)}</div>
          </div>
        </div>`).join('');
    }

    if (manual.length === 0 && scheduled.length === 0 && unscheduled.length === 0) {
      html += `<div class="flex items-center justify-center h-12 text-slate-500 text-xs">No inductions found</div>`;
    }

    schedContent.innerHTML = html;

    // Expand panel if it was collapsed
    if (panelCollapsed) setCollapsed(false);
  }

  // ── Dispose ────────────────────────────────────────────────────────────────

  return {
    updateDiagnostics,
    updateScheduleResults,
    dispose() {
      divider?.removeEventListener('mousedown', onDividerMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    },
  };
}
