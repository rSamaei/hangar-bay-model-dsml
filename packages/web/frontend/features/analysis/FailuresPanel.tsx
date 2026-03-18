import type { FailedInductionView } from './types';
import { formatDateShort } from './humanize';

interface FailuresPanelProps {
  failedInductions: FailedInductionView[];
}

interface FailureCardProps {
  failure: FailedInductionView;
}

function FailureCard({ failure }: FailureCardProps) {
  return (
    <div className="p-3 bg-slate-800/40 border border-red-500/20 rounded-lg w-80 flex-shrink-0">
      <p className="text-sm font-semibold text-white">{failure.aircraftType}</p>
      <p className="text-xs text-slate-500">{failure.inductionId}</p>

      <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold bg-red-500/20 text-red-400 rounded">
        Could not be scheduled
      </span>

      <p className="mt-2 text-xs text-slate-400 leading-relaxed">
        {failure.reasonHumanized}
      </p>

      {failure.requestedArrival !== undefined && failure.deadline !== undefined && (
        <p className="text-[10px] text-slate-600 mt-1">
          Window: {formatDateShort(new Date(failure.requestedArrival))} →{' '}
          {formatDateShort(new Date(failure.deadline))}
        </p>
      )}

      {failure.preferredHangar && (
        <p className="text-[10px] text-slate-600 mt-0.5">
          Preferred hangar: {failure.preferredHangar}
        </p>
      )}
    </div>
  );
}

export function FailuresPanel({ failedInductions }: FailuresPanelProps) {
  if (failedInductions.length === 0) return null;

  return (
    <div className="mt-4 p-4 bg-slate-900/50 rounded-xl border border-red-500/10">
      <h2 className="text-base font-semibold text-red-400 mb-3">
        Failed Inductions ({failedInductions.length})
      </h2>
      <div className="flex flex-wrap gap-3">
        {failedInductions.map(f => (
          <FailureCard key={f.inductionId} failure={f} />
        ))}
      </div>
    </div>
  );
}
