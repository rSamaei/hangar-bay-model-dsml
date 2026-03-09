import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Aircraft } from './types';

// ─── Accent colours ───────────────────────────────────────────────────────────
const ACCENTS = [
  'border-l-cyan-500',
  'border-l-blue-500',
  'border-l-violet-500',
  'border-l-emerald-500',
  'border-l-amber-500',
  'border-l-rose-500',
] as const;
function accentFor(id: number): string { return ACCENTS[id % ACCENTS.length]; }

// ─── Shared card visual ───────────────────────────────────────────────────────
export function AircraftCardContent({ aircraft }: { aircraft: Aircraft }) {
  const dims = [
    aircraft.wingspan.toFixed(1),
    aircraft.length.toFixed(1),
    aircraft.height.toFixed(1),
  ].join(' × ') + ' m';

  return (
    <div className={`rounded-lg bg-slate-800/80 border border-slate-700/40 border-l-2 ${accentFor(aircraft.id)} p-3 w-full`}>
      <div className="text-sm font-semibold text-white leading-tight truncate">{aircraft.name}</div>
      <div className="text-xs text-slate-400 mt-1 font-mono">{dims}</div>
      {aircraft.clearance_envelope_name && (
        <div className="text-xs text-cyan-400/70 mt-0.5 truncate">{aircraft.clearance_envelope_name}</div>
      )}
    </div>
  );
}

// ─── Draggable card wrapper ───────────────────────────────────────────────────
function DraggableAircraftCard({ aircraft }: { aircraft: Aircraft }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `aircraft-${aircraft.id}`,
    data: { aircraft } satisfies { aircraft: Aircraft },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`cursor-grab active:cursor-grabbing transition-opacity ${isDragging ? 'opacity-30' : 'opacity-100'}`}
      {...listeners}
      {...attributes}
    >
      <AircraftCardContent aircraft={aircraft} />
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export interface AircraftSidebarProps {
  /** Aircraft list owned by ScheduleApp — no internal fetch. */
  aircraft: Aircraft[];
  loading: boolean;
  /** Collapsed = narrow 48-px strip; expand button visible. */
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function AircraftSidebar({ aircraft, loading, collapsed, onToggleCollapse }: AircraftSidebarProps) {
  const [search, setSearch] = useState('');

  // ── Collapsed ─────────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside className="w-12 h-full flex flex-col items-center bg-slate-900/60 border-r border-slate-700/50 shrink-0 py-3 gap-3">
        <button
          onClick={onToggleCollapse}
          className="p-2 text-slate-500 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
          title="Show aircraft panel"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div
          className="flex-1 flex items-center justify-center overflow-hidden"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest select-none">
            Aircraft{aircraft.length > 0 ? ` (${aircraft.length})` : ''}
          </span>
        </div>
      </aside>
    );
  }

  // ── Expanded ───────────────────────────────────────────────────────────────
  const filtered = aircraft.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <aside className="w-[260px] h-full flex flex-col bg-slate-900/60 border-r border-slate-700/50 shrink-0">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-700/40">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Aircraft</h2>
          <button
            onClick={onToggleCollapse}
            className="p-1 text-slate-500 hover:text-white hover:bg-slate-700/50 rounded transition-colors"
            title="Collapse sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
        <input
          type="search"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 text-sm bg-slate-800/60 border border-slate-700/50 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        />
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {loading && (
          <>
            {[0, 1, 2].map(i => (
              <div key={i} className="h-16 bg-slate-800/40 rounded-lg animate-pulse" />
            ))}
          </>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-xs text-slate-500 px-1 py-2">
            {search ? 'No matches' : 'No aircraft defined'}
          </p>
        )}
        {filtered.map(ac => (
          <DraggableAircraftCard key={ac.id} aircraft={ac} />
        ))}
      </div>

      {/* Footer count */}
      {!loading && aircraft.length > 0 && (
        <div className="px-4 py-2 border-t border-slate-700/40">
          <span className="text-xs text-slate-500">
            {filtered.length} / {aircraft.length} aircraft
          </span>
        </div>
      )}
    </aside>
  );
}
