import React from 'react';
import type { ScheduledPlacement } from './types';
import type { PlacementColor } from './utils/placementCheck';
import { DroppableSlot } from './DroppableSlot';
import { PlacementBlock } from './PlacementBlock';
import { sanitize } from './utils/timelineHelpers';
import { BAY_H, LABEL_W, PREVIEW_COLS } from './utils/timelineConstants';

export interface BayRowProps {
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

export function BayRow({
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
