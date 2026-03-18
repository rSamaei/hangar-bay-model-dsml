import { useRef, useState, useEffect } from 'react';
import type { BayInfo, TimelineBar, TimeMarker } from './types';
import { ROW_HEIGHT, BAR_VERTICAL_PAD, SIDEBAR_WIDTH } from './TimeAxis';
import { formatDuration } from './humanize';

// Re-use the same bar background logic as BayRow
function barBackground(type: TimelineBar['type']): React.CSSProperties {
  switch (type) {
    case 'manual':
      return { backgroundColor: '#4B8BBE' };
    case 'auto':
      return { backgroundColor: '#10B981' };
    case 'waiting':
      return {
        background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(249,115,22,0.5) 3px, rgba(249,115,22,0.5) 5px)',
        opacity: 0.45,
        zIndex: 10,
      };
    case 'departure-delay':
      return {
        background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(245,158,11,0.5) 3px, rgba(245,158,11,0.5) 5px)',
        opacity: 0.45,
        zIndex: 10,
      };
  }
}

interface ExpandedBayRowsProps {
  bay: BayInfo;
  lanes: TimelineBar[][];
  minTime: number;
  timeSpan: number;
  rowIndex: number;       // base row index for alternating background
  timeMarkers: TimeMarker[];
  onBarHover: (bar: TimelineBar, x: number, y: number) => void;
  onBarMove: (x: number, y: number) => void;
  onBarLeave: () => void;
  onBayHover: (bayName: string, hangarName: string) => void;
  hangarName: string;
}

export function ExpandedBayRows({
  bay,
  lanes,
  minTime,
  timeSpan,
  rowIndex,
  timeMarkers,
  onBarHover,
  onBarMove,
  onBarLeave,
  onBayHover,
  hangarName,
}: ExpandedBayRowsProps) {
  const barAreaRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!barAreaRef.current) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(barAreaRef.current);
    return () => ro.disconnect();
  }, []);

  const rowBg = rowIndex % 2 === 0 ? 'bg-slate-900/20' : 'bg-slate-900/40';

  return (
    <div onMouseEnter={() => onBayHover(bay.name, hangarName)}>
      {lanes.map((laneBars, laneIdx) => (
        <div
          key={laneIdx}
          className={`flex flex-shrink-0 ${rowBg}`}
          style={{ height: ROW_HEIGHT }}
        >
          {/* Sidebar */}
          <div
            className="flex-shrink-0 flex items-center pl-6 pr-2 border-r border-slate-700/20 text-[11px] border-l-2"
            style={{
              width: SIDEBAR_WIDTH,
              borderLeftColor: laneIdx === 0 ? 'transparent' : 'rgba(6,182,212,0.35)',
            }}
          >
            {laneIdx === 0 ? (
              <span className="truncate text-slate-400">{bay.name}</span>
            ) : (
              <span className="truncate text-slate-600 pl-2">{bay.name}</span>
            )}
          </div>

          {/* Bar area */}
          <div ref={laneIdx === 0 ? barAreaRef : undefined} className="flex-1 relative overflow-hidden">
            {/* Grid lines */}
            {timeMarkers.map(m => (
              <div
                key={`grid-${m.positionPct}`}
                className="absolute top-0 bottom-0 border-l border-slate-700/20 pointer-events-none"
                style={{ left: `${m.positionPct}%` }}
              />
            ))}

            {/* Bars for this lane */}
            {laneBars.map(bar => {
              const leftPct = ((bar.startMs - minTime) / timeSpan) * 100;
              const widthPct = Math.max(((bar.endMs - bar.startMs) / timeSpan) * 100, 0.3);
              const bgStyle = barBackground(bar.type);
              const isOverlay = bar.type === 'waiting' || bar.type === 'departure-delay';

              let label = '';
              if (!isOverlay) {
                const isFirstBay = bar.bayNames.length <= 1 || bar.bayNames[0] === bay.name;
                if (isFirstBay && containerWidth > 0) {
                  const pxWidth = (widthPct / 100) * containerWidth;
                  const durationMin = (bar.endMs - bar.startMs) / 60_000;
                  if (pxWidth > 100) {
                    label = `${bar.aircraftType} — ${formatDuration(durationMin)}`;
                  } else if (pxWidth > 60) {
                    label = bar.aircraftType;
                  }
                }
              }

              return (
                <div
                  key={`${bar.id}-${bar.type}`}
                  className="absolute cursor-pointer"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    top: BAR_VERTICAL_PAD,
                    height: ROW_HEIGHT - BAR_VERTICAL_PAD * 2,
                    borderRadius: 3,
                    ...bgStyle,
                  }}
                  onMouseEnter={e => onBarHover(bar, e.clientX, e.clientY)}
                  onMouseMove={e => onBarMove(e.clientX, e.clientY)}
                  onMouseLeave={onBarLeave}
                >
                  {label && (
                    <span className="flex items-center h-full text-[11px] font-medium text-white truncate pointer-events-none px-1 whitespace-nowrap overflow-hidden">
                      {label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
