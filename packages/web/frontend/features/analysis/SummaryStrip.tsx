import type { HangarSummary, GlobalSummary } from './types';
import { formatDuration } from './humanize';

interface SummaryStripProps {
  hangarSummaries: HangarSummary[];
  globalSummary: GlobalSummary;
}

function utilisationColour(util: number): string {
  if (util > 0.9) return 'bg-red-500';
  if (util > 0.7) return 'bg-amber-500';
  return 'bg-emerald-500';
}

interface HangarMiniSummaryProps {
  summary: HangarSummary;
}

function HangarMiniSummary({ summary }: HangarMiniSummaryProps) {
  const fillColour = utilisationColour(summary.avgUtilisation);
  const fillPct = Math.round(summary.avgUtilisation * 100);

  return (
    <div className="flex flex-col gap-0.5 min-w-[120px]">
      <span className="text-xs font-medium text-slate-300 truncate">{summary.name}</span>

      {/* Utilisation bar */}
      <div className="h-1.5 w-[60px] rounded-full bg-slate-700 overflow-hidden">
        <div
          className={`h-full rounded-full ${fillColour}`}
          style={{ width: `${fillPct}%` }}
        />
      </div>

      <span className="text-[10px] text-slate-500">
        {fillPct}% util · {summary.peakOccupancy}/{summary.totalBays} peak
      </span>
      <span className="text-[10px] text-slate-500">
        {summary.inductionsServed} served
        {summary.totalWaitMinutes > 0 && ` · ${formatDuration(summary.totalWaitMinutes)} wait`}
      </span>
    </div>
  );
}

export function SummaryStrip({ hangarSummaries, globalSummary }: SummaryStripProps) {
  const total = globalSummary.placedCount + globalSummary.failedCount;

  return (
    <div className="h-20 flex items-center gap-6 px-4 bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-x-auto">
      {/* Per-hangar mini-summaries */}
      {hangarSummaries.length > 0 ? (
        <>
          <div className="flex items-center gap-6 flex-shrink-0">
            {hangarSummaries.map(hs => (
              <HangarMiniSummary key={hs.name} summary={hs} />
            ))}
          </div>

          {/* Divider */}
          <div className="h-10 w-px bg-slate-700/50 flex-shrink-0" />

          {/* Global stats */}
          <div className="ml-auto flex flex-col gap-1 flex-shrink-0 text-sm text-slate-400">
            <span>
              <span className="text-emerald-400 font-semibold">{globalSummary.placedCount}</span>
              /{total} scheduled
              {globalSummary.failedCount > 0 && (
                <span className="ml-2 text-red-400">
                  ({globalSummary.failedCount} failed)
                </span>
              )}
            </span>
            {globalSummary.totalWaitMinutes > 0 && (
              <span>{formatDuration(globalSummary.totalWaitMinutes)} total wait</span>
            )}
            {globalSummary.maxQueueDepth > 0 && (
              <span>Queue: <span className="text-white font-semibold">{globalSummary.maxQueueDepth}</span> max</span>
            )}
          </div>
        </>
      ) : (
        <span className="text-sm text-slate-500 italic">No simulation data available.</span>
      )}
    </div>
  );
}
