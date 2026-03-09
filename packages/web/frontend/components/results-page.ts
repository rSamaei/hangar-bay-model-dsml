import type { AnalysisResult, ParseError } from '../services/api';
import { renderTimeline } from './timeline';
import { renderDiagnostics } from './diagnostics';
import type { ExportModel, ExportedInduction, ValidationReport } from '../types/api';

export function createResultsPage(data: AnalysisResult): string {
  const { report, exportModel, langiumDiagnostics } = data;

  return `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      ${createResultsNavbar()}
      <main class="container mx-auto px-6 py-8">
        ${createResultsHeader(exportModel, report)}
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
          ${createSummaryCards(exportModel, report)}
        </div>
        ${createTimelineSection(exportModel)}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          ${createScheduleSection(exportModel)}
          ${createValidationSection(report, langiumDiagnostics)}
        </div>
      </main>
    </div>
  `;
}

function createResultsNavbar(): string {
  return `
    <nav class="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50">
      <div class="container mx-auto px-6 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-cyan-500/25 flex items-center justify-center">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>
              </svg>
            </div>
            <div>
              <h1 class="text-lg font-bold text-white">Analysis Results</h1>
              <p class="text-xs text-slate-400">Schedule & Validation Report</p>
            </div>
          </div>
          <button
            id="back-btn"
            class="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg transition-all border border-slate-700 hover:border-slate-600"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
            </svg>
            Back to Editor
          </button>
        </div>
      </div>
    </nav>
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

function createSummaryCards(exportModel: ExportModel, report: ValidationReport): string {
  const manualCount = exportModel.inductions.filter(i => i.kind === 'manual').length;
  const autoCount = exportModel.autoSchedule?.scheduled?.length || 0;
  const unscheduledCount = exportModel.autoSchedule?.unscheduled?.length || 0;
  const conflictCount = exportModel.inductions.filter(i => i.conflicts.length > 0).length;
  const hangarsUsed = new Set(exportModel.inductions.map(i => i.hangar)).size;

  const cards = [
    {
      label: 'Total Inductions',
      value: exportModel.inductions.length,
      subtext: `${manualCount} manual, ${autoCount} auto`,
      color: 'cyan',
      icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'
    },
    {
      label: 'Hangars Used',
      value: hangarsUsed,
      subtext: `${Object.keys(exportModel.derived.adjacencyModeByHangar).length} total`,
      color: 'blue',
      icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'
    },
    {
      label: 'Conflicts',
      value: conflictCount,
      subtext: conflictCount === 0 ? 'No conflicts detected' : 'Requires attention',
      color: conflictCount === 0 ? 'emerald' : 'red',
      icon: conflictCount === 0
        ? 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
        : 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
    }
  ];

  const colorClasses: Record<string, { bg: string, border: string, icon: string, value: string }> = {
    cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', icon: 'text-cyan-400', value: 'text-cyan-400' },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: 'text-blue-400', value: 'text-blue-400' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: 'text-emerald-400', value: 'text-emerald-400' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: 'text-red-400', value: 'text-red-400' }
  };

  return cards.map(card => {
    const colors = colorClasses[card.color];
    return `
      <div class="p-5 rounded-xl ${colors.bg} border ${colors.border}">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-sm text-slate-400 mb-1">${card.label}</p>
            <p class="text-3xl font-bold ${colors.value}">${card.value}</p>
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
