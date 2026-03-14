import React from 'react';

export function ScheduleSkeleton() {
  return (
    <div className="flex h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden animate-pulse">
      {/* Sidebar skeleton */}
      <div className="w-[260px] h-full bg-slate-900/60 border-r border-slate-700/50 shrink-0 flex flex-col gap-3 p-4">
        <div className="h-5 w-24 rounded bg-slate-700/60" />
        <div className="h-8 w-full rounded bg-slate-800/60" />
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-lg bg-slate-800/40" />
        ))}
      </div>
      {/* Main area skeleton */}
      <div className="flex-1 flex flex-col gap-4 p-6">
        <div className="h-8 w-48 rounded bg-slate-700/40" />
        <div className="flex-1 rounded-xl bg-slate-800/30" />
      </div>
    </div>
  );
}

export function ScheduleError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="text-center max-w-sm px-6">
        <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-700/50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-white mb-1">Failed to load</h2>
        <p className="text-xs text-slate-400 mb-4">{message}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm font-medium bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
