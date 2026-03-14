import React from 'react';
import { createPortal } from 'react-dom';

export function DeleteConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onCancel}
    >
      <div
        data-keep-selection="1"
        className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 shadow-2xl shadow-black/70 w-72"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
          Confirm deletion
        </p>
        <h3 className="text-sm font-semibold text-white mb-3">
          Remove this induction?
        </h3>
        <p className="text-xs text-slate-400 mb-5">
          The schedule entry will be permanently deleted and the grid will refresh.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 py-2 text-sm font-medium bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            Delete
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
