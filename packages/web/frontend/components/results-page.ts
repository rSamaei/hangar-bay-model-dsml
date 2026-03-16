import type { AnalysisResult, ParseError } from '../services/api';
import { renderTimeline, attachTimelineListeners } from './timeline';
import { renderDiagnostics } from './diagnostics';
import { createNavbar } from './navbar';
import type { ExportModel, ExportedInduction, ValidationReport, HangarStatistic, SimulationEventRecord, SimulationEventKind } from '../types/api';

/**
 * Call after injecting createResultsPage HTML into the DOM
 * to wire up interactive timeline tooltips.
 */
export function attachResultsPageListeners(): void {
  attachTimelineListeners();
  attachSimulationLogListeners();
}

export function createResultsPage(data: AnalysisResult): string {
  const { report, exportModel, langiumDiagnostics, simulationLog } = data;

  return `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      ${createNavbar('editor')}
      <main class="container mx-auto px-6 py-8">
        <div class="mb-6">
          <button
            id="back-btn"
            class="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
            </svg>
            Back to Editor
          </button>
        </div>
        ${createResultsHeader(exportModel, report)}
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          ${createSummaryCards(exportModel, report)}
        </div>
        ${createHangarStatisticsSection(exportModel)}
        ${createTimelineSection(exportModel)}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          ${createScheduleSection(exportModel)}
          ${createValidationSection(report, langiumDiagnostics)}
        </div>
        ${createSimulationLogSection(simulationLog)}
      </main>
    </div>
  `;
}

function createResultsHeader(exportModel: ExportModel, report: ValidationReport): string {
  const hasConflicts = exportModel.inductions.some(i => i.conflicts.length > 0);
  const hasErrors = report.summary.bySeverity.errors > 0;
  const status = hasConflicts || hasErrors ? 'warning' : 'success';

  const statusConfig = {
    success: { bg: 'from-emerald-500/20 to-emerald-500/5', border: 'border-emerald-500/30', icon: 'text-emerald-400', text: 'All Clear' },
    warning: { bg: 'from-amber-500/20 to-amber-500/5', border: 'border-amber-500/30', icon: 'text-amber-400', text: 'Issues Found' }
  };

  const config = statusConfig[status];

  return `
    <div class="mb-8 p-6 rounded-2xl bg-gradient-to-r ${config.bg} border ${config.border}">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-slate-800/50 flex items-center justify-center">
            <svg class="w-6 h-6 ${config.icon}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              ${status === 'success'
                ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
                : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>'
              }
            </svg>
          </div>
          <div>
            <h2 class="text-xl font-bold text-white">${exportModel.airfieldName}</h2>
            <p class="text-slate-400">Analysis completed - ${config.text}</p>
          </div>
        </div>
        <div class="text-right text-sm text-slate-400">
          <p>Generated: ${new Date().toLocaleString()}</p>
        </div>
      </div>
    </div>
  `;
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function createSummaryCards(exportModel: ExportModel, report: ValidationReport): string {
  const manualCount = exportModel.inductions.filter(i => i.kind === 'manual').length;
  const autoCount = exportModel.autoSchedule?.scheduled?.length || 0;
  const conflictCount = exportModel.inductions.filter(i => i.conflicts && i.conflicts.length > 0).length;
  const hangarsUsed = new Set(exportModel.inductions.map(i => i.hangar)).size;

  // Compute delay count from inductions with departureDelay > 0
  const delayCount = exportModel.inductions.filter(i => (i.departureDelay ?? 0) > 0).length;
  const waitCount = exportModel.inductions.filter(i => (i.waitTime ?? 0) > 0).length;
  const failedCount = exportModel.autoSchedule?.unscheduled?.length ?? 0;

  // Compute global total wait time
  const globalStats = exportModel.simulationStatistics;
  const totalWaitTime = globalStats?.totalWaitTime ?? 0;
  const totalAircraft = globalStats?.totalAircraftProcessed ?? exportModel.inductions.length;
  const avgWaitPerAircraft = totalAircraft > 0 ? totalWaitTime / totalAircraft : 0;
  const waitColor = avgWaitPerAircraft < 15 ? 'emerald' : avgWaitPerAircraft <= 60 ? 'amber' : 'red';

  const issueTotal = conflictCount + delayCount + waitCount + failedCount;
  const conflictSubtext = issueTotal === 0
    ? 'No issues detected'
    : [
        waitCount > 0 ? `${waitCount} waited` : '',
        delayCount > 0 ? `${delayCount} delayed` : '',
        conflictCount > 0 ? `${conflictCount} conflict${conflictCount !== 1 ? 's' : ''}` : '',
        failedCount > 0 ? `${failedCount} failed` : ''
      ].filter(Boolean).join(' · ');

  const conflictColorKey = issueTotal === 0 ? 'emerald' : conflictCount > 0 || failedCount > 0 ? 'red' : 'amber';

  const cards = [
    {
      label: 'Total Inductions',
      value: String(exportModel.inductions.length),
      subtext: `${manualCount} manual, ${autoCount} auto`,
      color: 'cyan',
      icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'
    },
    {
      label: 'Hangars Used',
      value: String(hangarsUsed),
      subtext: `${Object.keys(exportModel.derived.adjacencyModeByHangar).length} total`,
      color: 'blue',
      icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'
    },
    {
      label: 'Conflicts & Delays',
      value: conflictSubtext,
      subtext: issueTotal === 0 ? 'All clear' : 'Requires attention',
      color: conflictColorKey,
      icon: issueTotal === 0
        ? 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
        : 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
    },
    {
      label: 'Total Wait Time',
      value: formatMinutes(totalWaitTime),
      subtext: `avg ${formatMinutes(avgWaitPerAircraft)} per aircraft`,
      color: waitColor,
      // Clock icon
      icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
    }
  ];

  const colorClasses: Record<string, { bg: string, border: string, icon: string, value: string }> = {
    cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', icon: 'text-cyan-400', value: 'text-cyan-400' },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: 'text-blue-400', value: 'text-blue-400' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: 'text-emerald-400', value: 'text-emerald-400' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: 'text-amber-400', value: 'text-amber-400' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: 'text-red-400', value: 'text-red-400' }
  };

  return cards.map(card => {
    const colors = colorClasses[card.color];
    return `
      <div class="p-5 rounded-xl ${colors.bg} border ${colors.border}">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-sm text-slate-400 mb-1">${card.label}</p>
            <p class="text-2xl font-bold ${colors.value}">${card.value}</p>
            <p class="text-xs text-slate-500 mt-1">${card.subtext}</p>
          </div>
          <div class="w-10 h-10 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center">
            <svg class="w-5 h-5 ${colors.icon}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${card.icon}"></path>
            </svg>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function createHangarStatisticsSection(exportModel: ExportModel): string {
  const stats = exportModel.hangarStatistics;
  if (!stats || Object.keys(stats).length === 0) return '';

  const hangarCards = Object.entries(stats).map(([name, hs]) => {
    const pct = Math.round(hs.avgUtilisation * 100);
    const barColor = pct < 70 ? 'bg-emerald-500' : pct <= 90 ? 'bg-amber-500' : 'bg-red-500';
    const barTrack = pct < 70 ? 'bg-emerald-500/20' : pct <= 90 ? 'bg-amber-500/20' : 'bg-red-500/20';

    const waitText = hs.totalWaitTime > 0
      ? `<span class="text-amber-400">${formatMinutes(hs.totalWaitTime)} total</span>`
      : `<span class="text-emerald-400">0m — no waiting</span>`;

    const delayText = hs.totalDepartureDelay > 0
      ? `<span class="text-amber-400">${formatMinutes(hs.totalDepartureDelay)} total</span>`
      : `<span class="text-slate-500">0m</span>`;

    return `
      <div class="p-5 rounded-xl bg-slate-800/60 border border-slate-700/50 min-w-[260px] flex-shrink-0">
        <h4 class="text-base font-semibold text-white mb-4">${name}</h4>
        <div class="space-y-3">
          <div>
            <div class="flex items-center justify-between text-sm mb-1">
              <span class="text-slate-400">Utilisation</span>
              <span class="font-medium text-white">${pct}%</span>
            </div>
            <div class="h-2 rounded-full ${barTrack}">
              <div class="h-2 rounded-full ${barColor}" style="width: ${pct}%"></div>
            </div>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-slate-400">Peak occupancy</span>
            <span class="text-white">${hs.peakOccupancy}/${hs.totalBays} bays</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-slate-400">Wait time</span>
            ${waitText}
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-slate-400">Departure delay</span>
            ${delayText}
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-slate-400">Served</span>
            <span class="text-white">${hs.inductionsServed} induction${hs.inductionsServed !== 1 ? 's' : ''}</span>
          </div>
          <div class="flex items-center justify-between text-sm">
            <span class="text-slate-400">Max queue</span>
            <span class="text-white">${hs.queuedAtPeak} aircraft</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <section class="mb-8">
      <div class="rounded-2xl bg-slate-800/50 border border-slate-700/50 overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-700/50 bg-slate-800/30">
          <h3 class="text-lg font-semibold text-white flex items-center gap-2">
            <svg class="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
            Hangar Statistics
          </h3>
        </div>
        <div class="p-6 flex gap-4 overflow-x-auto">
          ${hangarCards}
        </div>
      </div>
    </section>
  `;
}

function createTimelineSection(exportModel: ExportModel): string {
  return `
    <section class="mb-8">
      <div class="rounded-2xl bg-slate-800/50 border border-slate-700/50 overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-700/50 bg-slate-800/30">
          <h3 class="text-lg font-semibold text-white flex items-center gap-2">
            <svg class="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            Schedule Timeline
          </h3>
        </div>
        <div class="p-6">
          ${renderTimeline(exportModel)}
        </div>
      </div>
    </section>
  `;
}

function createScheduleSection(exportModel: ExportModel): string {
  const manualInductions = exportModel.inductions.filter(i => i.kind === 'manual');
  const autoInductions = exportModel.autoSchedule?.scheduled || [];
  const unscheduled = exportModel.autoSchedule?.unscheduled || [];

  return `
    <section class="rounded-2xl bg-slate-800/50 border border-slate-700/50 overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-700/50 bg-slate-800/30">
        <h3 class="text-lg font-semibold text-white flex items-center gap-2">
          <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          Scheduled Inductions
        </h3>
      </div>
      <div class="p-6 space-y-6 max-h-[600px] overflow-y-auto">
        ${manualInductions.length > 0 ? `
          <div>
            <h4 class="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-blue-400"></span>
              Manual Inductions (${manualInductions.length})
            </h4>
            <div class="space-y-2">
              ${manualInductions.map(ind => renderInductionCard(ind)).join('')}
            </div>
          </div>
        ` : ''}

        ${autoInductions.length > 0 ? `
          <div>
            <h4 class="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
              Auto-Scheduled (${autoInductions.length})
            </h4>
            <div class="space-y-2">
              ${autoInductions.map(ind => renderInductionCard(ind)).join('')}
            </div>
          </div>
        ` : ''}

        ${unscheduled.length > 0 ? `
          <div>
            <h4 class="text-sm font-medium text-orange-400 mb-3 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-orange-400"></span>
              Conflicts (${unscheduled.length})
            </h4>
            <div class="space-y-2">
              ${unscheduled.map(u => `
                <div class="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                  <div class="flex items-center justify-between">
                    <span class="font-medium text-orange-200">${u.aircraft}</span>
                    <span class="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300">${u.reasonRuleId}</span>
                  </div>
                  ${u.preferredHangar ? `<p class="text-xs text-slate-400 mt-1">Preferred: ${u.preferredHangar}</p>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </section>
  `;
}

function renderInductionCard(ind: ExportedInduction): string {
  const hasConflict = ind.conflicts.length > 0;
  const borderColor = hasConflict ? 'border-red-500/50' : ind.kind === 'manual' ? 'border-blue-500/30' : 'border-emerald-500/30';
  const bgColor = hasConflict ? 'bg-red-500/10' : ind.kind === 'manual' ? 'bg-blue-500/10' : 'bg-emerald-500/10';

  return `
    <div class="p-3 rounded-lg ${bgColor} border ${borderColor}">
      <div class="flex items-start justify-between">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-medium text-white">${ind.id}</span>
            <span class="text-xs px-2 py-0.5 rounded-full ${ind.kind === 'manual' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'}">${ind.kind}</span>
            ${hasConflict ? '<span class="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">conflict</span>' : ''}
          </div>
          <p class="text-sm text-slate-400 mt-1">${ind.aircraft} → ${ind.hangar}</p>
          <p class="text-xs text-slate-500">Bays: ${ind.bays.join(', ')}</p>
        </div>
        <div class="text-right text-xs text-slate-500">
          <p>${new Date(ind.start).toLocaleString()}</p>
          <p>to ${new Date(ind.end).toLocaleString()}</p>
        </div>
      </div>
      ${hasConflict ? `<p class="text-xs text-red-400 mt-2">Conflicts with: ${ind.conflicts.join(', ')}</p>` : ''}
    </div>
  `;
}

function createValidationSection(report: ValidationReport, langiumDiagnostics?: ParseError[]): string {
  return `
    <section class="rounded-2xl bg-slate-800/50 border border-slate-700/50 overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-700/50 bg-slate-800/30">
        <h3 class="text-lg font-semibold text-white flex items-center gap-2">
          <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
          </svg>
          Validation Report
        </h3>
      </div>
      <div class="p-6 max-h-[600px] overflow-y-auto">
        ${renderDiagnostics(report, { langiumDiagnostics })}
      </div>
    </section>
  `;
}

// ── Simulation Log Section ────────────────────────────────────────────

type LogFilterKind = 'all' | 'placements' | 'departures' | 'waiting' | 'delays' | 'failures';

const EVENT_FILTER_MAP: Record<SimulationEventKind, LogFilterKind> = {
  'ARRIVAL_PLACED':            'placements',
  'RETRY_PLACED':              'placements',
  'ARRIVAL_QUEUED':            'waiting',
  'DEPARTURE_CLEARED':         'departures',
  'DEPARTURE_BLOCKED':         'delays',
  'DEADLINE_EXPIRED':          'failures',
  'DEPENDENCY_UNLOCKED':       'waiting',
  'STRUCTURALLY_INFEASIBLE':   'failures',
  'DEADLOCK_DETECTED':         'failures',
  'SIM_EVENT_LIMIT':           'failures',
};

const EVENT_ICON: Record<SimulationEventKind, string> = {
  'ARRIVAL_PLACED':            '\uD83D\uDFE2', // green circle
  'RETRY_PLACED':              '\uD83D\uDFE2',
  'ARRIVAL_QUEUED':            '\u23F3',         // hourglass
  'DEPARTURE_CLEARED':         '\u2708\uFE0F',   // airplane
  'DEPARTURE_BLOCKED':         '\uD83D\uDD34',   // red circle
  'DEPENDENCY_UNLOCKED':       '\uD83D\uDD13',   // unlocked
  'DEADLINE_EXPIRED':          '\u274C',          // cross mark
  'STRUCTURALLY_INFEASIBLE':   '\u274C',
  'DEADLOCK_DETECTED':         '\u274C',
  'SIM_EVENT_LIMIT':           '\u274C',
};

function formatEventTime(epochMs: number): string {
  const d = new Date(epochMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatWaitMs(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function escLogHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatEventDescription(ev: SimulationEventRecord): string {
  const id = escLogHtml(ev.inductionId);
  const aircraft = ev.aircraft ? escLogHtml(ev.aircraft) : '';
  const hangar = ev.hangar ? escLogHtml(ev.hangar) : '';
  const bays = ev.bays?.length ? ev.bays.map(escLogHtml).join(', ') : '';
  const door = ev.door ? escLogHtml(ev.door) : '';
  const reason = ev.reason ? escLogHtml(ev.reason) : '';
  const blockedBy = ev.blockedBy?.length ? ev.blockedBy.map(escLogHtml).join(', ') : '';

  const location = [
    hangar && `in ${hangar}`,
    bays && `${bays}`,
    door && `via ${door}`,
  ].filter(Boolean).join(' ');

  switch (ev.kind) {
    case 'ARRIVAL_PLACED':
      return `<span class="text-white font-medium">${id}</span> <span class="text-slate-400">${aircraft}</span> placed ${location}`;
    case 'RETRY_PLACED':
      return `<span class="text-white font-medium">${id}</span> <span class="text-slate-400">${aircraft}</span> placed ${location}${reason ? ` (${reason})` : ''}`;
    case 'ARRIVAL_QUEUED':
      return `<span class="text-white font-medium">${id}</span> <span class="text-slate-400">${aircraft}</span> queued${reason ? ` \u2014 ${reason}` : ' \u2014 no bay available'}`;
    case 'DEPARTURE_CLEARED':
      return `<span class="text-white font-medium">${id}</span> <span class="text-slate-400">${aircraft}</span> departed${hangar ? ` ${hangar}` : ''}${door ? ` via ${door}` : ''}`;
    case 'DEPARTURE_BLOCKED':
      return `<span class="text-white font-medium">${id}</span> <span class="text-slate-400">${aircraft}</span> departure delayed${blockedBy ? ` \u2014 blocked by ${blockedBy}` : ''}${reason ? ` \u2014 ${reason}` : ''}`;
    case 'DEPENDENCY_UNLOCKED':
      return `<span class="text-white font-medium">${id}</span> <span class="text-slate-400">${aircraft}</span> dependency satisfied${reason ? ` (${reason})` : ''}`;
    case 'DEADLINE_EXPIRED':
      return `<span class="text-white font-medium">${id}</span> <span class="text-slate-400">${aircraft}</span> failed \u2014 deadline expired`;
    case 'STRUCTURALLY_INFEASIBLE':
      return `<span class="text-white font-medium">${id}</span> <span class="text-slate-400">${aircraft}</span> failed \u2014 structurally infeasible${reason ? ` (${reason})` : ''}`;
    case 'DEADLOCK_DETECTED':
      return `<span class="text-white font-medium">${id}</span> <span class="text-slate-400">${aircraft}</span> failed \u2014 deadlock detected`;
    case 'SIM_EVENT_LIMIT':
      return `<span class="text-white font-medium">${id}</span> simulation event limit reached`;
    default:
      return `<span class="text-white font-medium">${id}</span> ${ev.kind}`;
  }
}

function eventTextColorClass(kind: SimulationEventKind): string {
  const filter = EVENT_FILTER_MAP[kind];
  switch (filter) {
    case 'failures':   return 'text-red-400';
    case 'waiting':    return 'text-amber-400';
    case 'delays':     return 'text-amber-400';
    default:           return 'text-slate-300';
  }
}

function createSimulationLogSection(simulationLog?: SimulationEventRecord[]): string {
  if (!simulationLog || simulationLog.length === 0) return '';

  const sorted = [...simulationLog].sort((a, b) => a.time - b.time);

  const filterButtons: { key: LogFilterKind; label: string; count: number }[] = [
    { key: 'all',        label: 'All',        count: sorted.length },
    { key: 'placements', label: 'Placements', count: sorted.filter(e => EVENT_FILTER_MAP[e.kind] === 'placements').length },
    { key: 'departures', label: 'Departures', count: sorted.filter(e => EVENT_FILTER_MAP[e.kind] === 'departures').length },
    { key: 'waiting',    label: 'Waiting',    count: sorted.filter(e => EVENT_FILTER_MAP[e.kind] === 'waiting').length },
    { key: 'delays',     label: 'Delays',     count: sorted.filter(e => EVENT_FILTER_MAP[e.kind] === 'delays').length },
    { key: 'failures',   label: 'Failures',   count: sorted.filter(e => EVENT_FILTER_MAP[e.kind] === 'failures').length },
  ];

  const eventRows = sorted.map(ev => {
    const filterKind = EVENT_FILTER_MAP[ev.kind] ?? 'all';
    const icon = EVENT_ICON[ev.kind] ?? '\u2022';
    const colorClass = eventTextColorClass(ev.kind);
    const desc = formatEventDescription(ev);
    const time = formatEventTime(ev.time);

    return `<div class="simlog-row flex items-start gap-3 py-1.5 px-2 rounded hover:bg-slate-700/30 ${colorClass}" data-filter="${filterKind}">` +
      `<span class="flex-shrink-0 w-12 text-slate-500 font-mono text-xs leading-5">${time}</span>` +
      `<span class="flex-shrink-0 w-6 text-center leading-5">${icon}</span>` +
      `<span class="text-sm leading-5">${desc}</span>` +
      `</div>`;
  }).join('');

  const filterButtonsHtml = filterButtons
    .filter(f => f.key === 'all' || f.count > 0)
    .map(f => {
      const active = f.key === 'all' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700';
      return `<button class="simlog-filter px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${active}" data-filter="${f.key}">${f.label} <span class="text-slate-500">${f.count}</span></button>`;
    }).join('');

  return `
    <section class="mb-6">
      <div class="rounded-2xl bg-slate-800/50 border border-slate-700/50 overflow-hidden">
        <button id="simlog-toggle" class="w-full px-6 py-4 border-b border-slate-700/50 bg-slate-800/30 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition-colors">
          <h3 class="text-lg font-semibold text-white flex items-center gap-2">
            <svg class="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path>
            </svg>
            Simulation Log
            <span class="text-sm font-normal text-slate-500">(${sorted.length} events)</span>
          </h3>
          <svg id="simlog-chevron" class="w-5 h-5 text-slate-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>
        <div id="simlog-body" class="hidden">
          <div class="px-6 py-3 border-b border-slate-700/30 flex flex-wrap gap-2">
            ${filterButtonsHtml}
          </div>
          <div id="simlog-list" class="px-4 py-3 max-h-[400px] overflow-y-auto space-y-0.5">
            ${eventRows}
          </div>
        </div>
      </div>
    </section>
  `;
}

function attachSimulationLogListeners(): void {
  const toggle = document.getElementById('simlog-toggle');
  const body = document.getElementById('simlog-body');
  const chevron = document.getElementById('simlog-chevron');
  if (!toggle || !body || !chevron) return;

  toggle.addEventListener('click', () => {
    const isHidden = body.classList.contains('hidden');
    body.classList.toggle('hidden');
    chevron.style.transform = isHidden ? 'rotate(180deg)' : '';
  });

  // Filter buttons
  const filterBtns = document.querySelectorAll<HTMLButtonElement>('.simlog-filter');
  const rows = document.querySelectorAll<HTMLElement>('.simlog-row');

  // Track active filters — start with 'all'
  const activeFilters = new Set<LogFilterKind>(['all']);

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.filter as LogFilterKind;

      if (key === 'all') {
        // Reset to all
        activeFilters.clear();
        activeFilters.add('all');
      } else {
        // Remove 'all' if present, toggle the specific filter
        activeFilters.delete('all');
        if (activeFilters.has(key)) {
          activeFilters.delete(key);
        } else {
          activeFilters.add(key);
        }
        // If nothing selected, revert to all
        if (activeFilters.size === 0) {
          activeFilters.add('all');
        }
      }

      // Update button styles
      filterBtns.forEach(b => {
        const bKey = b.dataset.filter as LogFilterKind;
        const isActive = activeFilters.has('all') ? bKey === 'all' : activeFilters.has(bKey);
        b.className = b.className.replace(
          /bg-slate-\d+ text-(?:white|slate-\d+) (?:hover:text-white hover:bg-slate-\d+ )?/g, ''
        );
        if (isActive) {
          b.classList.add('bg-slate-600', 'text-white');
          b.classList.remove('bg-slate-800', 'text-slate-400', 'hover:text-white', 'hover:bg-slate-700');
        } else {
          b.classList.add('bg-slate-800', 'text-slate-400', 'hover:text-white', 'hover:bg-slate-700');
          b.classList.remove('bg-slate-600', 'text-white');
        }
      });

      // Filter rows
      rows.forEach(row => {
        const rowFilter = row.dataset.filter as LogFilterKind;
        const visible = activeFilters.has('all') || activeFilters.has(rowFilter);
        row.style.display = visible ? '' : 'none';
      });
    });
  });
}
