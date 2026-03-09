import type { ValidationReport, ValidationViolation } from '../types/api';
import type { ParseError } from '../services/api';

export interface DiagnosticsOptions {
  langiumDiagnostics?: ParseError[];
}

export function renderDiagnostics(report: ValidationReport, options: DiagnosticsOptions = {}): string {
  const { violations, summary } = report;
  const langiumDiagnostics = options.langiumDiagnostics ?? [];

  // Count Langium diagnostics by severity
  const langiumErrors = langiumDiagnostics.filter(d => d.severity === 1).length;
  const langiumWarnings = langiumDiagnostics.filter(d => d.severity !== 1).length;

  const totalErrors = summary.bySeverity.errors + langiumErrors;
  const totalWarnings = summary.bySeverity.warnings + langiumWarnings;
  const hasIssues = violations.length > 0 || langiumDiagnostics.length > 0;

  if (!hasIssues) {
    return `
      <div class="text-center py-8">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <svg class="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-emerald-400 mb-1">No Violations Found</h3>
        <p class="text-sm text-slate-500">Your model passes all validation rules.</p>
      </div>
    `;
  }

  // Build rule ID counts including Langium diagnostics
  const byRuleId: Record<string, number> = { ...summary.byRuleId };
  if (langiumDiagnostics.length > 0) {
    byRuleId['LANGIUM_VALIDATION'] = langiumDiagnostics.length;
  }
  const sortedRules = Object.entries(byRuleId).sort(([a], [b]) => a.localeCompare(b));

  return `
    <div class="space-y-6">
      <!-- Summary Header -->
      <div class="p-4 rounded-xl bg-slate-900/50 border border-slate-700/50">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-white">Validation Summary</h3>
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-sm font-medium">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              ${totalErrors} errors
            </span>
            <span class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-sm font-medium">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
              </svg>
              ${totalWarnings} warnings
            </span>
          </div>
        </div>

        <!-- Violations by Rule -->
        <div class="flex flex-wrap gap-2">
          ${sortedRules.map(([ruleId, count]) => `
            <span class="px-2 py-1 rounded-md bg-slate-800 text-slate-300 text-xs font-mono">
              ${ruleId}: <span class="text-slate-400">${count}</span>
            </span>
          `).join('')}
        </div>
      </div>

      ${langiumDiagnostics.length > 0 ? `
      <!-- Langium Validation Diagnostics -->
      <div class="space-y-3">
        <h4 class="text-sm font-medium text-slate-400">DSL Validation Issues</h4>
        ${langiumDiagnostics.map(d => renderLangiumDiagnostic(d)).join('')}
      </div>
      ` : ''}

      ${violations.length > 0 ? `
      <!-- Violations List -->
      <div class="space-y-3">
        ${langiumDiagnostics.length > 0 ? '<h4 class="text-sm font-medium text-slate-400">Scheduling & Constraint Violations</h4>' : ''}
        ${violations.map(v => renderViolation(v)).join('')}
      </div>
      ` : ''}
    </div>
  `;
}

function renderViolation(violation: ValidationViolation): string {
  const isError = violation.severity === 'error';
  const colors = isError
    ? { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: 'text-red-400', badge: 'bg-red-500/20 text-red-300' }
    : { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300' };

  const icon = isError
    ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
    : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>';

  return `
    <div class="p-4 rounded-xl ${colors.bg} border ${colors.border}">
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0 mt-0.5">
          <svg class="w-5 h-5 ${colors.icon}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            ${icon}
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center flex-wrap gap-2 mb-2">
            <span class="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 text-xs font-mono font-semibold">${violation.ruleId}</span>
            <span class="px-2 py-0.5 rounded-full ${colors.badge} text-xs">${violation.severity}</span>
            <span class="text-sm text-slate-400">
              ${violation.subject.type}: <span class="text-slate-300">${violation.subject.name}</span>
              ${violation.subject.id ? `<span class="text-slate-500">(${violation.subject.id})</span>` : ''}
            </span>
          </div>
          <p class="text-sm text-slate-300">${violation.message}</p>

          <!-- Evidence Accordion -->
          <details class="mt-3 group">
            <summary class="cursor-pointer text-xs text-slate-500 hover:text-slate-400 transition-colors flex items-center gap-1">
              <svg class="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
              View Evidence
            </summary>
            <div class="mt-2 p-3 rounded-lg bg-slate-900/50 border border-slate-700/50 overflow-x-auto">
              <pre class="text-xs text-slate-400 font-mono">${JSON.stringify(violation.evidence, null, 2)}</pre>
            </div>
          </details>
        </div>
      </div>
    </div>
  `;
}

function renderLangiumDiagnostic(diagnostic: ParseError): string {
  const isError = diagnostic.severity === 1;
  const colors = isError
    ? { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: 'text-red-400', badge: 'bg-red-500/20 text-red-300' }
    : { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300' };

  const icon = isError
    ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
    : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>';

  const locationText = diagnostic.line
    ? `Line ${diagnostic.line}${diagnostic.column ? `:${diagnostic.column}` : ''}`
    : 'Unknown location';

  return `
    <div class="p-4 rounded-xl ${colors.bg} border ${colors.border}">
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0 mt-0.5">
          <svg class="w-5 h-5 ${colors.icon}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            ${icon}
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center flex-wrap gap-2 mb-2">
            <span class="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 text-xs font-mono font-semibold">LANGIUM_VALIDATION</span>
            <span class="px-2 py-0.5 rounded-full ${colors.badge} text-xs">${isError ? 'error' : 'warning'}</span>
            <span class="text-sm text-slate-500">${locationText}</span>
          </div>
          <p class="text-sm text-slate-300">${diagnostic.message}</p>
        </div>
      </div>
    </div>
  `;
}
