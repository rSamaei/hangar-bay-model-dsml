import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import type { Aircraft, Hangar, ScheduledPlacement } from './types';
import { checkPlacement, type PlacementColor } from './utils/placementCheck';

// ─── Layout constants ──────────────────────────────────────────────────────
const LABEL_W  = 164;
const BAY_H    = 48;
const GROUP_H  = 28;
const HEADER_H = 40;

// ─── View presets ──────────────────────────────────────────────────────────
const PRESETS = [
  { label: '6h',     hours: 6,   pxH: 180, slotMin: 30  },
  { label: '12h',    hours: 12,  pxH: 100, slotMin: 30  },
  { label: '24h',    hours: 24,  pxH: 60,  slotMin: 60  },
  { label: '48h',    hours: 48,  pxH: 32,  slotMin: 60  },
  { label: '1 week', hours: 168, pxH: 12,  slotMin: 240 },
] as const;

const BLOCK_COLS = [
  'bg-cyan-700/75   border-cyan-500/60   text-cyan-50',
  'bg-blue-700/75   border-blue-500/60   text-blue-50',
  'bg-violet-700/75 border-violet-500/60 text-violet-50',
  'bg-emerald-700/75 border-emerald-500/60 text-emerald-50',
  'bg-amber-700/75  border-amber-500/60  text-amber-50',
  'bg-rose-700/75   border-rose-500/60   text-rose-50',
] as const;

const PREVIEW_COLS: Record<PlacementColor, string> = {
  green: 'bg-emerald-500/25 border-emerald-400/60',
  red:   'bg-red-500/25   border-red-400/60',
  amber: 'bg-amber-500/25  border-amber-400/60',
};

// ─── Helpers ──────────────────────────────────────────────────────────────
function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}
function blockCol(id: number): string { return BLOCK_COLS[id % BLOCK_COLS.length]; }
function pad2(n: number): string { return String(n).padStart(2, '0'); }
function fmtTime(d: Date): string { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtDateTime(d: Date): string {
  return `${fmtDate(d)} ${fmtTime(d)}`;
}
function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseDateInput(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date();
  d.setFullYear(+m[1], +m[2] - 1, +m[3]);
  d.setHours(0, 0, 0, 0);
  return d;
}
function headerTickStep(pxH: number): number {
  if (pxH >= 80) return 1;
  if (pxH >= 40) return 2;
  if (pxH >= 18) return 6;
  return 12;
}

// ─── DroppableSlot ────────────────────────────────────────────────────────
function DroppableSlot({ id, left, slotW }: { id: string; left: number; slotW: number }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ position: 'absolute', top: 0, left, width: slotW, height: BAY_H }}
      className={isOver ? 'bg-cyan-500/15 ring-1 ring-inset ring-cyan-500/30 rounded' : ''}
    />
  );
}

// ─── InfoModal ────────────────────────────────────────────────────────────
function InfoModal({
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

// ─── PlacementBlock ───────────────────────────────────────────────────────
interface PlacBlockProps {
  placement: ScheduledPlacement;
  viewStartMs: number;
  gridWidth: number;
  pxPerMs: number;
  top: number;
  height: number;
  borderRadius: string;
  showLabel: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
  onCommitResize: (newStartIso: string, newEndIso: string) => void;
}

interface ResizeState {
  edge: 'left' | 'right';
  pointerStartX: number;
  originalStartMs: number;
  originalEndMs: number;
  liveStartMs: number;
  liveEndMs: number;
}

function PlacementBlock({
  placement, viewStartMs, gridWidth, pxPerMs,
  top, height, borderRadius, showLabel,
  isSelected, onSelect, onRequestDelete, onCommitResize,
}: PlacBlockProps) {
  const blockElRef = useRef<HTMLDivElement | null>(null);
  const [mouse, setMouse]           = useState<{ x: number; y: number } | null>(null);
  const [blockRect, setBlockRect]   = useState<DOMRect | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [showInfo, setShowInfo]     = useState(false);

  // Drag-to-move
  const {
    attributes: dragAttrs,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `block-${placement.entryId}`,
    data: { type: 'placement', placement },
    disabled: resizeState !== null,
  });

  const mergeRef = useCallback(
    (el: HTMLDivElement | null) => {
      blockElRef.current = el;
      setDragRef(el);
    },
    [setDragRef],
  );

  // Keep toolbar position fresh whenever selection state changes
  useLayoutEffect(() => {
    if (isSelected && showLabel && blockElRef.current) {
      setBlockRect(blockElRef.current.getBoundingClientRect());
    } else {
      setBlockRect(null);
    }
  }, [isSelected, showLabel]);

  // Scroll the block into view when it becomes selected (e.g. via a
  // diagnostics-panel click that fires setSelectedEntryId externally).
  useEffect(() => {
    if (isSelected && blockElRef.current) {
      blockElRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [isSelected]);

  // ── Resize document listeners ──────────────────────────────────────────
  const pxPerMsRef        = useRef(pxPerMs);
  pxPerMsRef.current      = pxPerMs;
  const onCommitResizeRef = useRef(onCommitResize);
  onCommitResizeRef.current = onCommitResize;

  useEffect(() => {
    if (!resizeState) return;

    const MIN_DURATION_MS = 5 * 60_000; // 5 minutes

    const onMove = (e: MouseEvent) => {
      const dx  = e.clientX - resizeState.pointerStartX;
      const dMs = dx / pxPerMsRef.current;

      if (resizeState.edge === 'right') {
        const newEnd = Math.max(
          resizeState.originalStartMs + MIN_DURATION_MS,
          resizeState.originalEndMs + dMs,
        );
        setResizeState(s => s && { ...s, liveEndMs: newEnd });
      } else {
        const newStart = Math.min(
          resizeState.originalEndMs - MIN_DURATION_MS,
          resizeState.originalStartMs + dMs,
        );
        setResizeState(s => s && { ...s, liveStartMs: newStart });
      }
    };

    const onUp = () => {
      setResizeState(s => {
        if (!s) return null;
        onCommitResizeRef.current(
          new Date(s.liveStartMs).toISOString(),
          new Date(s.liveEndMs).toISOString(),
        );
        document.body.style.cursor    = '';
        document.body.style.userSelect = '';
        return null;
      });
    };

    document.body.style.cursor    = 'ew-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [resizeState]);

  // ── Display positions (live during resize, computed otherwise) ──────────
  const startMs = resizeState ? resizeState.liveStartMs : new Date(placement.start).getTime();
  const endMs   = resizeState ? resizeState.liveEndMs   : new Date(placement.end).getTime();
  const leftPx  = (startMs - viewStartMs) * pxPerMs;
  const widthPx = (endMs - startMs) * pxPerMs;
  const clampL  = Math.max(0, leftPx);
  const clampW  = Math.min(gridWidth, leftPx + widthPx) - clampL;

  if (clampW <= 0) return null;

  const col          = blockCol(placement.entryId);
  const dragTransform = transform
    ? `translate(${transform.x}px, ${transform.y}px)`
    : undefined;

  function startResize(edge: 'left' | 'right', clientX: number) {
    setResizeState({
      edge,
      pointerStartX: clientX,
      originalStartMs: new Date(placement.start).getTime(),
      originalEndMs:   new Date(placement.end).getTime(),
      liveStartMs:     new Date(placement.start).getTime(),
      liveEndMs:       new Date(placement.end).getTime(),
    });
  }

  const suppressTooltip = isSelected || resizeState !== null || isDragging;

  return (
    <>
      <div
        ref={mergeRef}
        data-keep-selection="1"
        style={{
          position: 'absolute',
          left: clampL,
          top,
          width: Math.max(4, clampW),
          height,
          borderRadius,
          minWidth: 4,
          zIndex: isDragging ? 2 : (isSelected ? 8 : 5),
          transform: dragTransform,
          opacity: isDragging ? 0.4 : 1,
        }}
        className={`border ${col} overflow-hidden select-none cursor-grab active:cursor-grabbing
          ${isSelected ? 'ring-2 ring-inset ring-blue-400/80' : 'transition-opacity hover:opacity-85'}`}
        onPointerDown={e => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (!resizeState) onSelect();
        }}
        {...(resizeState ? {} : dragListeners)}
        {...dragAttrs}
        onMouseMove={e => !suppressTooltip && setMouse({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setMouse(null)}
      >
        {/* Left resize handle */}
        {isSelected && showLabel && !isDragging && (
          <div
            data-keep-selection="1"
            style={{ position: 'absolute', left: 0, top: 0, width: 8, height: '100%', cursor: 'ew-resize', zIndex: 10 }}
            className="bg-blue-400/20 hover:bg-blue-400/50 transition-colors"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              startResize('left', e.clientX);
            }}
          />
        )}

        {/* Label */}
        {showLabel && clampW > 36 && !resizeState && (
          <span
            className="block text-[11px] font-medium leading-tight truncate"
            style={{ paddingLeft: isSelected ? 10 : 6, paddingTop: 3 }}
          >
            {placement.aircraftName}
          </span>
        )}

        {/* Right resize handle */}
        {isSelected && showLabel && !isDragging && (
          <div
            data-keep-selection="1"
            style={{ position: 'absolute', right: 0, top: 0, width: 8, height: '100%', cursor: 'ew-resize', zIndex: 10 }}
            className="bg-blue-400/20 hover:bg-blue-400/50 transition-colors"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              startResize('right', e.clientX);
            }}
          />
        )}
      </div>

      {/* Floating toolbar — only on first bay row (showLabel) when selected */}
      {showLabel && blockRect && createPortal(
        <div
          data-keep-selection="1"
          style={{
            position: 'fixed',
            left: Math.max(4, blockRect.left + blockRect.width / 2 - 72),
            top: Math.max(4, blockRect.top - 36),
            zIndex: 9998,
          }}
          className="flex items-center gap-0.5 px-1.5 py-1 bg-slate-900 border border-slate-700/50 rounded-lg shadow-xl shadow-black/60"
          onPointerDown={e => e.stopPropagation()}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setShowInfo(true); }}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-slate-300 hover:text-white hover:bg-slate-700/50 rounded transition-colors"
          >
            ℹ Info
          </button>
          <div className="w-px h-4 bg-slate-700/60" />
          <button
            onClick={(e) => { e.stopPropagation(); onRequestDelete(); }}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-red-400 hover:text-red-200 hover:bg-red-950/40 rounded transition-colors"
          >
            ✕ Delete
          </button>
        </div>,
        document.body,
      )}

      {/* Hover tooltip */}
      {mouse && !suppressTooltip && createPortal(
        <div
          style={{ position: 'fixed', left: mouse.x + 14, top: mouse.y - 8, zIndex: 9999, pointerEvents: 'none' }}
          className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl shadow-black/60 text-xs min-w-[180px] max-w-[260px]"
        >
          <div className="font-semibold text-white mb-1.5 truncate">{placement.aircraftName}</div>
          {placement.hangar && (
            <div className="text-slate-400 truncate">
              <span className="text-slate-500">Hangar: </span>{placement.hangar}
            </div>
          )}
          {placement.bays.length > 0 && (
            <div className="text-slate-400 truncate">
              <span className="text-slate-500">Bays: </span>{placement.bays.join(', ')}
            </div>
          )}
          <div className="text-slate-400 mt-1.5">
            {fmtTime(new Date(placement.start))} → {fmtTime(new Date(placement.end))}
          </div>
          {placement.status === 'failed' && (
            <div className="text-red-400 mt-1">{placement.failureReason ?? 'Failed'}</div>
          )}
        </div>,
        document.body,
      )}

      {/* Info modal */}
      {showInfo && (
        <InfoModal placement={placement} onClose={() => setShowInfo(false)} />
      )}
    </>
  );
}

// ─── BayRow ───────────────────────────────────────────────────────────────
interface BayRowProps {
  hangarId: number;
  hangarName: string;
  bayId: number;
  bayName: string;
  bayDims: string;
  placements: ScheduledPlacement[];
  viewStartMs: number;
  viewEndMs: number;
  gridWidth: number;
  pxPerMs: number;
  slotW: number;
  slotCount: number;
  even: boolean;
  preview?: { startMs: number; endMs: number; color: PlacementColor } | null;
  selectedEntryId?: number | null;
  onSelectEntry?: (id: number) => void;
  onDeleteEntry?: (id: number) => void;
  onResizeCommit?: (id: number, startIso: string, endIso: string) => void;
}

function BayRow({
  hangarId, hangarName, bayId, bayName, bayDims,
  placements, viewStartMs, viewEndMs, gridWidth, pxPerMs,
  slotW, slotCount, even,
  preview,
  selectedEntryId,
  onSelectEntry,
  onDeleteEntry,
  onResizeCommit,
}: BayRowProps) {
  const sanHangar = sanitize(hangarName);
  const sanBay    = sanitize(bayName);

  const relevant = placements.filter(p =>
    (p.hangar === sanHangar || p.hangar === hangarName) &&
    (p.bays.includes(sanBay) || p.bays.includes(bayName)),
  );

  const rowBg   = even ? 'bg-slate-900/50' : 'bg-slate-800/30';
  const labelBg = even ? 'bg-slate-900/70' : 'bg-slate-800/50';

  return (
    <div style={{ display: 'flex', height: BAY_H }}>
      {/* Bay label — sticky left */}
      <div
        style={{ position: 'sticky', left: 0, width: LABEL_W, height: BAY_H, flexShrink: 0, zIndex: 10 }}
        className={`${labelBg} border-r border-slate-700/40 flex flex-col justify-center px-3`}
      >
        <div className="text-xs font-medium text-slate-200 truncate">{bayName}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">{bayDims}</div>
      </div>

      {/* Timeline area */}
      <div
        style={{ position: 'relative', width: gridWidth, height: BAY_H, flexShrink: 0 }}
        className={`${rowBg} border-b border-slate-700/25`}
      >
        {/* Drop slots */}
        {Array.from({ length: slotCount }, (_, i) => (
          <DroppableSlot key={i} id={`${hangarId}-${bayId}-${i}`} left={i * slotW} slotW={slotW} />
        ))}

        {/* Drag-preview stripe */}
        {preview && (() => {
          const startPx = (preview.startMs - viewStartMs) * pxPerMs;
          const endPx   = (preview.endMs   - viewStartMs) * pxPerMs;
          const cl = Math.max(0, startPx);
          const cw = Math.min(gridWidth, endPx) - cl;
          if (cw <= 0) return null;
          return (
            <div
              style={{
                position: 'absolute', left: cl, top: 3,
                width: cw, height: BAY_H - 6,
                zIndex: 6, pointerEvents: 'none', borderRadius: 4,
              }}
              className={`border ${PREVIEW_COLS[preview.color]}`}
            />
          );
        })()}

        {/* Placement blocks */}
        {relevant.map(p => {
          const sanBays = p.bays;
          let bayIdx = sanBays.indexOf(sanBay);
          if (bayIdx === -1) bayIdx = sanBays.indexOf(bayName);
          if (bayIdx === -1) bayIdx = 0;

          const isFirst = bayIdx === 0;
          const isLast  = bayIdx === p.bays.length - 1;
          const bTop    = isFirst ? 4 : 0;
          const bH      = BAY_H - bTop - (isLast ? 4 : 0);
          const rTop    = isFirst ? '4px' : '0';
          const rBot    = isLast  ? '4px' : '0';

          return (
            <PlacementBlock
              key={p.entryId}
              placement={p}
              viewStartMs={viewStartMs}
              gridWidth={gridWidth}
              pxPerMs={pxPerMs}
              top={bTop}
              height={bH}
              borderRadius={`${rTop} ${rTop} ${rBot} ${rBot}`}
              showLabel={isFirst}
              isSelected={selectedEntryId === p.entryId}
              onSelect={() => onSelectEntry?.(p.entryId)}
              onRequestDelete={() => onDeleteEntry?.(p.entryId)}
              onCommitResize={(s, e) => onResizeCommit?.(p.entryId, s, e)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── TimelineGrid ─────────────────────────────────────────────────────────
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
