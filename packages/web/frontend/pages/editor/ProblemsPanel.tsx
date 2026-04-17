import type { DiagnosticItem } from './useValidation';
import type { AnalysisResult } from '../../services/api';
import { ScheduleTab } from './ScheduleTab';

const SEVERITY_ICON: Record<number, { path: string; color: string; label: string }> = {
  1: { path: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-red-400',   label: 'Error' },
  2: { path: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', color: 'text-amber-400', label: 'Warning' },
  3: { path: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-blue-400',  label: 'Info' },
  4: { path: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-slate-400', label: 'Hint' },
};

// Strip SFR prefix from message for display; return code separately
const SFR_RE = /^\[(SFR\w+)\]\s*/;
function splitMessage(msg: string): { code: string | null; text: string } {
  const m = SFR_RE.exec(msg);
  return m ? { code: m[1], text: msg.slice(m[0].length) } : { code: null, text: msg };
}

interface Props {
  diagnostics: DiagnosticItem[];
  panelHeight: number;
  collapsed: boolean;
  activeTab: 'problems' | 'schedule';
  onTabChange: (tab: 'problems' | 'schedule') => void;
  onDiagnosticClick: (line: number) => void;
  onPanelAnalyze: () => void;
  panelAnalyzing: boolean;
  scheduleResult: AnalysisResult | null;
}

export function ProblemsPanel({
  diagnostics,
  panelHeight,
  collapsed,
  activeTab,
  onTabChange,
  onDiagnosticClick,
  onPanelAnalyze,
  panelAnalyzing,
  scheduleResult,
}: Props) {
  const errors   = diagnostics.filter(d => d.severity === 1).length;
  const warnings = diagnostics.filter(d => d.severity === 2).length;
  const infos    = diagnostics.filter(d => d.severity === 3).length;

  return (
    <div
      className="flex flex-col bg-slate-900 flex-shrink-0 overflow-hidden transition-all duration-150"
      style={{ height: collapsed ? 0 : panelHeight }}
    >
      {/* Tab bar */}
      <div
        className="flex items-center justify-between px-3 bg-slate-800/50 border-b border-slate-700 flex-shrink-0"
        style={{ height: 36 }}
      >
        <div className="flex items-center h-full">
          {/* Problems tab */}
          <button
            onClick={() => onTabChange('problems')}
            className={`h-full px-3 text-sm font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'problems'
                ? 'border-cyan-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Problems
            {errors > 0 && (
              <span className="px-1 py-0.5 rounded text-xs bg-red-500/80 text-white font-mono leading-none">{errors}</span>
            )}
            {warnings > 0 && (
              <span className="px-1 py-0.5 rounded text-xs bg-amber-500/80 text-white font-mono leading-none">{warnings}</span>
            )}
            {infos > 0 && (
              <span className="px-1 py-0.5 rounded text-xs bg-blue-500/80 text-white font-mono leading-none">{infos}</span>
            )}
          </button>

          {/* Schedule tab */}
          <button
            onClick={() => onTabChange('schedule')}
            className={`h-full px-3 text-sm font-medium border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'schedule'
                ? 'border-cyan-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Schedule Results
            {scheduleResult && (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 flex-shrink-0" />
            )}
          </button>
        </div>

        {/* Inline analyze button */}
        <button
          onClick={onPanelAnalyze}
          disabled={panelAnalyzing}
          className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 hover:from-cyan-400 hover:via-blue-400 hover:to-indigo-400 transition-all shadow-sm shadow-cyan-500/20 flex items-center gap-1.5 disabled:opacity-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {panelAnalyzing ? 'Analysing…' : 'Analyse'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'problems' ? (
          diagnostics.length === 0 ? (
            <div className="flex items-center justify-center h-12 text-slate-500 text-xs">No diagnostics</div>
          ) : (
            <div className="divide-y divide-slate-800">
              {diagnostics.map((d, i) => {
                const sev = SEVERITY_ICON[d.severity] ?? SEVERITY_ICON[1];
                const { code, text } = splitMessage(d.message);
                return (
                  <button
                    key={i}
                    onClick={() => onDiagnosticClick(d.startLine)}
                    className="w-full flex items-start gap-2 px-3 py-2 hover:bg-slate-800/60 text-left transition-colors group"
                  >
                    <svg className={`w-4 h-4 flex-shrink-0 mt-0.5 ${sev.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sev.path} />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-300 group-hover:text-white transition-colors truncate">{text}</span>
                        {code && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-400 font-mono flex-shrink-0">{code}</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {d.source === 'parser' ? 'Parser' : 'Validator'} · line {d.startLine}, col {d.startColumn + 1}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          scheduleResult ? (
            <ScheduleTab result={scheduleResult} />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-xs p-4 text-center">
              Click <strong className="text-slate-400 mx-1">Analyse</strong> in the panel above to see schedule results.
            </div>
          )
        )}
      </div>
    </div>
  );
}
