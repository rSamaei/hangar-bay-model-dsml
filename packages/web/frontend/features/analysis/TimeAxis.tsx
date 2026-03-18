import type { TimeMarker } from './types';

export const SIDEBAR_WIDTH = 140;   // px — exported so other components can share
export const ROW_HEIGHT = 32;       // px per bay row
export const HANGAR_HEADER_HEIGHT = 28; // px for hangar group header
export const BAR_VERTICAL_PAD = 3;  // px top/bottom within row

interface TimeAxisProps {
  markers: TimeMarker[];
}

export function TimeAxis({ markers }: TimeAxisProps) {
  return (
    <div className="flex flex-shrink-0" style={{ height: 36 }}>
      {/* Empty sidebar space */}
      <div style={{ width: SIDEBAR_WIDTH, flexShrink: 0 }} className="border-b border-slate-700/30" />

      {/* Bar area with markers */}
      <div className="flex-1 relative border-b border-slate-700/30">
        {markers.map(m => (
          <div
            key={m.label + m.positionPct}
            className="absolute top-0 flex flex-col items-center"
            style={{ left: `${m.positionPct}%`, transform: 'translateX(-50%)' }}
          >
            <span className="text-[10px] text-slate-500 leading-tight pt-1 whitespace-nowrap">
              {m.label}
            </span>
            <div className="w-px h-2 bg-slate-600/60 mt-0.5" />
          </div>
        ))}
      </div>
    </div>
  );
}
