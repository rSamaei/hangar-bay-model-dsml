import React, { useState, useEffect, useMemo } from 'react';
import type { Aircraft, Hangar, ScheduledPlacement } from './types';
import { checkPlacement, type PlacementColor } from './utils/placementCheck';
import { LABEL_W, GROUP_H, HEADER_H, PRESETS } from './utils/timelineConstants';
import { fmtDate, fmtTime, toDateInputValue, parseDateInput, headerTickStep } from './utils/timelineHelpers';
import { BayRow } from './BayRow';

export interface TimelineGridProps {
  hangars: Hangar[];
  placements: ScheduledPlacement[];
  activeAircraft?: Aircraft | null;
  hoveredSlotId?: string | null;
  onViewChange?: (viewStartMs: number, slotMin: number) => void;
  selectedEntryId?: number | null;
  onSelectEntry?: (id: number) => void;
  onDeleteEntry?: (id: number) => void;
  onResizeCommit?: (id: number, startIso: string, endIso: string) => void;
}

export function TimelineGrid({
  hangars,
  placements,
  activeAircraft,
  hoveredSlotId,
  onViewChange,
  selectedEntryId,
  onSelectEntry,
  onDeleteEntry,
  onResizeCommit,
}: TimelineGridProps) {
  const todayMidnight = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const [viewStart, setViewStart] = useState<Date>(todayMidnight);
  const [presetIdx, setPresetIdx] = useState(2); // 24h default

  const preset    = PRESETS[presetIdx];
  const viewHours = preset.hours;
  const pxPerHour = preset.pxH;
  const slotMin   = preset.slotMin;

  const viewStartMs = viewStart.getTime();
  const viewEndMs   = viewStartMs + viewHours * 3_600_000;
  const gridWidth   = viewHours * pxPerHour;
  const slotW       = (slotMin / 60) * pxPerHour;
  const slotCount   = Math.round((viewHours * 60) / slotMin);
  const pxPerMs     = gridWidth / (viewHours * 3_600_000);

  useEffect(() => {
    onViewChange?.(viewStartMs, slotMin);
  }, [viewStartMs, slotMin, onViewChange]);

  // ── Drag-preview computation ──────────────────────────────────────────
  const previewInfo = useMemo(() => {
    const empty = new Map<number, { startMs: number; endMs: number; color: PlacementColor }>();
    if (!activeAircraft || !hoveredSlotId) return empty;

    const parts = hoveredSlotId.split('-');
    if (parts.length !== 3) return empty;

    const [hHangarId, hBayId, hSlotIdx] = parts.map(Number);
    if ([hHangarId, hBayId, hSlotIdx].some(isNaN)) return empty;

    const hangar = hangars.find(h => h.id === hHangarId);
    if (!hangar || hangar.bays.length === 0) return empty;

    const startBayIdx = hangar.bays.findIndex(b => b.id === hBayId);
    if (startBayIdx < 0) return empty;

    const minBayWidth = Math.min(...hangar.bays.map(b => b.width));
    const baysNeeded  = Math.min(
      hangar.bays.length - startBayIdx,
      Math.max(1, Math.ceil(activeAircraft.wingspan / (minBayWidth || 1))),
    );
    const previewBays  = hangar.bays.slice(startBayIdx, startBayIdx + baysNeeded);
    const previewStart = viewStartMs + hSlotIdx * slotMin * 60_000;
    const previewEnd   = previewStart + 4 * 3_600_000;

    const result = checkPlacement(activeAircraft, previewBays, previewStart, previewEnd, placements, hangar.name);

    const map = new Map<number, { startMs: number; endMs: number; color: PlacementColor }>();
    for (const bay of previewBays) {
      map.set(bay.id, { startMs: previewStart, endMs: previewEnd, color: result.color });
    }
    return map;
  }, [activeAircraft, hoveredSlotId, hangars, viewStartMs, slotMin, placements]);

  // ── Time-axis ticks ──
  const tickStep = headerTickStep(pxPerHour);
  const ticks: { left: number; label: string; isDay: boolean }[] = [];
  for (let h = 0; h <= viewHours; h += tickStep) {
    const t = new Date(viewStartMs + h * 3_600_000);
    ticks.push({ left: h * pxPerHour, label: t.getHours() === 0 && t.getMinutes() === 0 ? fmtDate(t) : fmtTime(t), isDay: t.getHours() === 0 && t.getMinutes() === 0 });
  }

  const nowMs   = Date.now();
  const nowPx   = (nowMs - viewStartMs) * pxPerMs;
  const showNow = nowPx >= 0 && nowPx <= gridWidth;

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const d = parseDateInput(e.target.value);
    if (d) setViewStart(d);
  }
  function goToday() { setViewStart(todayMidnight()); }

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-w-0">
      {/* Controls bar */}
      <div className="flex items-center gap-2.5 px-4 py-2 bg-slate-900/80 border-b border-slate-700/50 flex-none flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-slate-700/60">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => setPresetIdx(i)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                i === presetIdx ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/70'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={toDateInputValue(viewStart)}
          onChange={handleDateChange}
          className="px-3 py-1.5 text-xs bg-slate-800/80 border border-slate-700/60 rounded-lg text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        />
        <button
          onClick={goToday}
          className="px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors border border-slate-700/60"
        >
          Today
        </button>
        {hangars.length === 0 && (
          <span className="text-xs text-slate-500 ml-1">No hangars defined — add a hangar to see the grid.</span>
        )}
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-auto">
        <div style={{ minWidth: LABEL_W + gridWidth }}>
          {/* Time header */}
          <div style={{ position: 'sticky', top: 0, height: HEADER_H, display: 'flex', zIndex: 20 }} className="bg-slate-950/95 border-b border-slate-700/50">
            <div style={{ position: 'sticky', left: 0, width: LABEL_W, height: HEADER_H, flexShrink: 0, zIndex: 30 }} className="bg-slate-950/95 border-r border-slate-700/40 flex items-end pb-2 px-3">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Bay</span>
            </div>
            <div style={{ position: 'relative', width: gridWidth, height: HEADER_H, flexShrink: 0 }}>
              {ticks.map((t, i) => (
                <div key={i} style={{ position: 'absolute', left: t.left, top: 0, bottom: 0, width: 1 }} className="bg-slate-700/40" />
              ))}
              {ticks.map((t, i) => (
                <div key={i} style={{ position: 'absolute', left: t.left, bottom: 6, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }} className="pointer-events-none">
                  <span className={`text-[10px] ${t.isDay ? 'text-cyan-400 font-semibold' : 'text-slate-400'}`}>{t.label}</span>
                </div>
              ))}
              {showNow && <div style={{ position: 'absolute', left: nowPx, top: 0, bottom: 0, width: 2 }} className="bg-cyan-400/70" />}
            </div>
          </div>

          {/* Hangar groups */}
          {hangars.length === 0 ? (
            <div style={{ paddingLeft: LABEL_W }} className="py-16 flex items-center justify-center">
              <span className="text-slate-500 text-sm">Add hangars and bays to see the schedule grid.</span>
            </div>
          ) : (
            hangars.map(hangar => (
              <React.Fragment key={hangar.id}>
                <div style={{ position: 'sticky', top: HEADER_H, height: GROUP_H, display: 'flex', zIndex: 15 }} className="bg-slate-900/95 border-b border-t border-slate-700/50">
                  <div style={{ position: 'sticky', left: 0, width: LABEL_W, height: GROUP_H, flexShrink: 0, zIndex: 20 }} className="bg-slate-900/95 border-r border-slate-700/40 flex items-center px-3">
                    <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider truncate">{hangar.name}</span>
                  </div>
                  <div style={{ width: gridWidth, height: GROUP_H, flexShrink: 0, position: 'relative' }} className="flex items-center px-2">
                    <span className="text-[10px] text-slate-500">{hangar.bays.length} bay{hangar.bays.length !== 1 ? 's' : ''}</span>
                    {showNow && <div style={{ position: 'absolute', left: nowPx, top: 0, bottom: 0, width: 2 }} className="bg-cyan-400/50" />}
                  </div>
                </div>
                {hangar.bays.map((bay, rowIdx) => (
                  <BayRow
                    key={bay.id}
                    hangarId={hangar.id}
                    hangarName={hangar.name}
                    bayId={bay.id}
                    bayName={bay.name}
                    bayDims={`${bay.width} × ${bay.depth} m`}
                    placements={placements}
                    viewStartMs={viewStartMs}
                    viewEndMs={viewEndMs}
                    gridWidth={gridWidth}
                    pxPerMs={pxPerMs}
                    slotW={slotW}
                    slotCount={slotCount}
                    even={rowIdx % 2 === 0}
                    preview={previewInfo.get(bay.id) ?? null}
                    selectedEntryId={selectedEntryId}
                    onSelectEntry={onSelectEntry}
                    onDeleteEntry={onDeleteEntry}
                    onResizeCommit={onResizeCommit}
                  />
                ))}
              </React.Fragment>
            ))
          )}
          <div style={{ height: 24 }} />
        </div>
      </div>
    </div>
  );
}
