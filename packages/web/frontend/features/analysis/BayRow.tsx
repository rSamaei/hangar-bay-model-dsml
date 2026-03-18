import { useRef, useState, useEffect } from 'react';
import type { BayInfo, TimelineBar, TimeMarker } from './types';
import { formatDuration } from './humanize';
import { ROW_HEIGHT, BAR_VERTICAL_PAD } from './TimeAxis';

interface BayRowProps {
  bay: BayInfo;
  bars: TimelineBar[];    // filtered: bars where bayNames includes this bay
  minTime: number;
  timeSpan: number;
  rowIndex: number;       // 0-based within hangar, for alternating background
  timeMarkers: TimeMarker[];
  onBarHover: (bar: TimelineBar, x: number, y: number) => void;
  onBarMove: (x: number, y: number) => void;
  onBarLeave: () => void;
  onBayHover: (bayName: string, hangarName: string) => void;
  hangarName: string;
}

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

export function BayRow({
  bay,
  bars,
  minTime,
  timeSpan,
  rowIndex,
  timeMarkers,
  onBarHover,
  onBarMove,
  onBarLeave,
  onBayHover,
  hangarName,
}: BayRowProps) {
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
    <div
      className={`flex flex-shrink-0 ${rowBg}`}
      style={{ height: ROW_HEIGHT }}
      onMouseEnter={() => onBayHover(bay.name, hangarName)}
    >
      {/* Sidebar */}
      <div
        className="flex-shrink-0 flex items-center pl-6 pr-2 border-r border-slate-700/20 text-[11px] text-slate-400"
        style={{ width: 140 }}
      >
        <span className="truncate">{bay.name}</span>
        {bay.traversable && (
          <span className="ml-1 text-cyan-400" title="Traversable">⚡</span>
        )}
        {bay.failedIndicators.length > 0 && (
          <FailedIndicatorBadge indicators={bay.failedIndicators} />
        )}
      </div>

      {/* Bar area */}
      <div ref={barAreaRef} className="flex-1 relative overflow-hidden">
        {/* Grid lines from time markers */}
        {timeMarkers.map(m => (
          <div
            key={`grid-${m.positionPct}`}
            className="absolute top-0 bottom-0 border-l border-slate-700/20 pointer-events-none"
            style={{ left: `${m.positionPct}%` }}
          />
        ))}

        {/* Bars */}
        {bars.map(bar => {
          const leftPct = ((bar.startMs - minTime) / timeSpan) * 100;
          const widthPct = Math.max(((bar.endMs - bar.startMs) / timeSpan) * 100, 0.3);
          const bgStyle = barBackground(bar.type);
          const isOverlay = bar.type === 'waiting' || bar.type === 'departure-delay';

          // Label: only on occupancy bars, and only on the first bay of a multi-bay set
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
  );
}

// ── Failed indicator badge with hover popover ────────────────────────

interface FailedIndicatorBadgeProps {
  indicators: BayInfo['failedIndicators'];
}

function FailedIndicatorBadge({ indicators }: FailedIndicatorBadgeProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative ml-1 flex-shrink-0">
      <span
        className="text-amber-400 cursor-default"
        title="Failed inductions"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      >
        ⚠️
      </span>
      {visible && (
        <div className="absolute left-5 top-0 z-20 bg-slate-800 border border-red-500/30 rounded-md p-2 shadow-lg min-w-[200px] max-w-xs">
          {indicators.map(ind => (
            <div key={ind.inductionId} className="mb-1 last:mb-0">
              <p className="text-[11px] font-semibold text-amber-300">
                ⚠️ {ind.aircraftType}{' '}
                <span className="font-normal text-slate-500">({ind.inductionId})</span>
              </p>
              <p className="text-[10px] text-slate-400 leading-snug">{ind.reasonHumanized}</p>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
