import React from 'react';
import type { DiagnosticItem } from './types';

export type { DiagnosticItem };

export interface DiagnosticsPanelProps {
  diagnostics: DiagnosticItem[];
  /** Generated DSL text for the current schedule — used to map line numbers back
   *  to auto-induction entry IDs so that clicking a diagnostic can highlight the
   *  relevant block on the timeline grid. */
  dslCode: string | null;
  onClickDiagnostic: (entryId: number | null) => void;
}

// ─── DSL line → entryId mapping ──────────────────────────────────────────────

/**
 * Walk the generated DSL to find which auto-induction block a given line falls
 * within.  Each block starts with `auto-induct id "entry_N"` and ends at the
 * start of the next block (or EOF).
 */
function findEntryIdForLine(dslCode: string, line: number): number | null {
  const lines = dslCode.split('\n');
  const entryStarts: Array<{ lineNum: number; entryId: number }> = [];

  lines.forEach((l, i) => {
    const m = /auto-induct id "entry_(\d+)"/.exec(l);
    if (m) entryStarts.push({ lineNum: i + 1, entryId: parseInt(m[1], 10) });
  });

  for (let i = 0; i < entryStarts.length; i++) {
    const blockStart = entryStarts[i].lineNum;
    const blockEnd   = i + 1 < entryStarts.length
      ? entryStarts[i + 1].lineNum
      : lines.length + 1;
    if (line >= blockStart && line < blockEnd) return entryStarts[i].entryId;
  }
  return null;
}

// ─── Severity icon ─────────────────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: number }) {
  if (severity === 1) {
    return (
      <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (severity === 2) {
    return (
      <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// ─── Rule ID prefix pattern (SFR_* from Langium validator, SCHED_* from scheduler) ──
const SFR_PREFIX_RE = /^((?:SFR|SCHED)\w+):\s*/;

// ─── Component ────────────────────────────────────────────────────────────────

export function DiagnosticsPanel({
  diagnostics,
  dslCode,
  onClickDiagnostic,
}: DiagnosticsPanelProps) {
  if (diagnostics.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-xs select-none">
        {dslCode ? 'No diagnostics — schedule is valid' : 'No schedule entries yet'}
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      {diagnostics.map((d, i) => {
        const match   = SFR_PREFIX_RE.exec(d.message);
        const code    = match?.[1];
        const message = match ? d.message.slice(match[0].length) : d.message;

        return (
          <div
            key={i}
            className="flex items-start gap-2 px-3 py-1.5 hover:bg-slate-800/50 border-b border-slate-800/40 cursor-pointer"
            onClick={() => {
              const entryId = dslCode ? findEntryIdForLine(dslCode, d.startLine) : null;
              onClickDiagnostic(entryId);
            }}
          >
            <SeverityIcon severity={d.severity} />
            <div className="flex-1 min-w-0">
              <div className="text-slate-200 text-xs leading-snug">{message.trim()}</div>
              <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                {code && (
                  <span className="px-1 py-0.5 rounded bg-slate-700/80 text-slate-300 font-mono text-[10px] leading-none">
                    {code}
                  </span>
                )}
                <span className="text-slate-500 text-[10px]">{d.source}</span>
                <span className="text-slate-600 text-[10px]">line {d.startLine}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
