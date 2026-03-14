import React from 'react';

export function Banner({ type, children }: { type: 'warn' | 'info'; children: React.ReactNode }) {
  const styles = type === 'warn'
    ? 'bg-amber-950/60 border-amber-700/40 text-amber-300'
    : 'bg-slate-800/60 border-slate-700/40 text-slate-400';
  return (
    <div className={`flex items-center gap-2 px-4 py-2 border-b text-xs ${styles}`}>
      {type === 'warn' ? (
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      {children}
    </div>
  );
}
