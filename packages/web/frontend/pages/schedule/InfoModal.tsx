import React from 'react';
import { createPortal } from 'react-dom';
import type { ScheduledPlacement } from './types';
import { fmtDateTime, fmtTime } from './utils/timelineHelpers';

export function InfoModal({
  placement,
  onClose,
}: {
  placement: ScheduledPlacement;
  onClose: () => void;
}) {
  const durationMs = new Date(placement.end).getTime() - new Date(placement.start).getTime();
  const durationH  = (durationMs / 3_600_000).toFixed(1);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onPointerDown={e => e.stopPropagation()}
      onClick={onClose}
    >
      <div
        data-keep-selection="1"
        className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 shadow-2xl shadow-black/70 w-80"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Induction details</p>
            <h3 className="text-sm font-semibold text-white">{placement.aircraftName}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2 text-xs mb-4">
          <div className="flex justify-between py-1.5 border-b border-slate-800">
            <span className="text-slate-500">Hangar</span>
            <span className="text-slate-200">{placement.hangar ?? '—'}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-800">
            <span className="text-slate-500">Bays</span>
            <span className="text-slate-200 text-right max-w-[180px] truncate">
              {placement.bays.length > 0 ? placement.bays.join(', ') : '—'}
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-800">
            <span className="text-slate-500">Start</span>
            <span className="text-slate-200 font-mono">{fmtDateTime(new Date(placement.start))}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-800">
            <span className="text-slate-500">End</span>
            <span className="text-slate-200 font-mono">{fmtDateTime(new Date(placement.end))}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-800">
            <span className="text-slate-500">Duration</span>
            <span className="text-slate-200">{durationH} h</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-slate-500">Status</span>
            {placement.status === 'scheduled' ? (
              <span className="text-emerald-400">Scheduled</span>
            ) : (
              <span className="text-red-400">{placement.failureReason ?? 'Failed'}</span>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
        >
          Close
        </button>
      </div>
    </div>,
    document.body,
  );
}
