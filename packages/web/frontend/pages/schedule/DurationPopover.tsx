import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Aircraft } from './types';

export interface PendingDrop {
  aircraft: Aircraft;
  startMs: number;
  durationMs: number;
}

export function DurationPopover({
  drop,
  onConfirm,
  onCancel,
}: {
  drop: PendingDrop;
  onConfirm: (hours: number) => void;
  onCancel: () => void;
}) {
  const [hours, setHours] = useState(Math.round(drop.durationMs / 3_600_000));

  const fmt = (ms: number) => {
    const d = new Date(ms);
    const day = d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${hh}:${mm}`;
  };

  const endMs = drop.startMs + hours * 3_600_000;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onCancel}
    >
      <div
        className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 shadow-2xl shadow-black/70 w-80"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
          Schedule aircraft
        </p>
        <h3 className="text-sm font-semibold text-white mb-4 truncate">
          {drop.aircraft.name}
        </h3>

        <div className="space-y-3 mb-5">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
              Start time
            </div>
            <div className="text-xs text-slate-200 font-mono">{fmt(drop.startMs)}</div>
          </div>

          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
              Duration (hours)
            </label>
            <input
              type="number"
              min={1}
              max={168}
              value={hours}
              onChange={e =>
                setHours(Math.max(1, Math.min(168, parseInt(e.target.value, 10) || 1)))
              }
              className="w-full px-3 py-1.5 text-sm bg-slate-800/80 border border-slate-700/60 rounded-lg text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            />
          </div>

          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
              End time
            </div>
            <div className="text-xs text-slate-200 font-mono">{fmt(endMs)}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onConfirm(hours)}
            className="flex-1 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
          >
            Schedule
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
