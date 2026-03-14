import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDraggable } from '@dnd-kit/core';
import type { ScheduledPlacement } from './types';
import { InfoModal } from './InfoModal';
import { blockCol, fmtTime } from './utils/timelineHelpers';
import { BLOCK_COLS } from './utils/timelineConstants';

export interface PlacementBlockProps {
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

export function PlacementBlock({
  placement, viewStartMs, gridWidth, pxPerMs,
  top, height, borderRadius, showLabel,
  isSelected, onSelect, onRequestDelete, onCommitResize,
}: PlacementBlockProps) {
  const blockElRef = useRef<HTMLDivElement | null>(null);
  const [mouse, setMouse]           = useState<{ x: number; y: number } | null>(null);
  const [blockRect, setBlockRect]   = useState<DOMRect | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [showInfo, setShowInfo]     = useState(false);

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

  useLayoutEffect(() => {
    if (isSelected && showLabel && blockElRef.current) {
      setBlockRect(blockElRef.current.getBoundingClientRect());
    } else {
      setBlockRect(null);
    }
  }, [isSelected, showLabel]);

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

    const MIN_DURATION_MS = 5 * 60_000;

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

  // ── Display positions ──────────────────────────────────────────────────
  const startMs = resizeState ? resizeState.liveStartMs : new Date(placement.start).getTime();
  const endMs   = resizeState ? resizeState.liveEndMs   : new Date(placement.end).getTime();
  const leftPx  = (startMs - viewStartMs) * pxPerMs;
  const widthPx = (endMs - startMs) * pxPerMs;
  const clampL  = Math.max(0, leftPx);
  const clampW  = Math.min(gridWidth, leftPx + widthPx) - clampL;

  if (clampW <= 0) return null;

  const col          = blockCol(placement.entryId, BLOCK_COLS);
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

      {/* Floating toolbar */}
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
