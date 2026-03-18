import type { HangarGroup, TimelineBar, TimeMarker } from './types';
import { BayRow } from './BayRow';
import { ExpandedBayRows } from './ExpandedBayRows';
import { SIDEBAR_WIDTH, ROW_HEIGHT, HANGAR_HEADER_HEIGHT, BAR_VERTICAL_PAD } from './TimeAxis';
import { assignLanes } from './lane-utils';

interface HangarSectionProps {
  group: HangarGroup;
  bars: TimelineBar[];    // pre-filtered to this hangar
  minTime: number;
  timeSpan: number;
  timeMarkers: TimeMarker[];
  onBarHover: (bar: TimelineBar, x: number, y: number) => void;
  onBarMove: (x: number, y: number) => void;
  onBarLeave: () => void;
  expandedBays: Set<string>;
  onBayHover: (bayName: string, hangarName: string) => void;
}

/** Solid colour for connector lines (overlay types have no connector). */
function connectorColour(type: TimelineBar['type']): string {
  return type === 'auto' ? '#10B981' : '#4B8BBE';
}

export function HangarSection({
  group,
  bars,
  minTime,
  timeSpan,
  timeMarkers,
  onBarHover,
  onBarMove,
  onBarLeave,
  expandedBays,
  onBayHover,
}: HangarSectionProps) {
  // ── Cumulative Y-offset map (accounts for expanded rows) ─────────────
  let cumulativeY = 0;
  const bayYOffset = new Map<string, number>();
  for (const bay of group.bays) {
    bayYOffset.set(bay.name, cumulativeY);
    const isExpanded = expandedBays.has(bay.name);
    if (isExpanded) {
      const bayBars = bars.filter(b => b.bayNames.includes(bay.name));
      const laneCount = assignLanes(bayBars).length;
      cumulativeY += laneCount * ROW_HEIGHT;
    } else {
      cumulativeY += ROW_HEIGHT;
    }
  }

  // ── Multi-bay connectors ──────────────────────────────────────────
  const connectors: Array<{
    key: string;
    leftPct: number;
    topPx: number;
    heightPx: number;
    colour: string;
  }> = [];

  const seen = new Set<string>();
  for (const bar of bars) {
    if (bar.type === 'waiting' || bar.type === 'departure-delay') continue;
    if (bar.bayNames.length <= 1) continue;
    if (seen.has(bar.id)) continue;
    seen.add(bar.id);

    const offsets = bar.bayNames
      .map(name => bayYOffset.get(name))
      .filter((y): y is number => y !== undefined);
    if (offsets.length < 2) continue;

    const firstY = Math.min(...offsets);
    const lastBayName = bar.bayNames
      .filter(n => bayYOffset.has(n))
      .reduce((a, b) => (bayYOffset.get(a)! > bayYOffset.get(b)! ? a : b));

    // Height spans from top of first bay to bottom of last bay (including its expanded height)
    const lastBayIsExpanded = expandedBays.has(lastBayName);
    const lastBayLanes = lastBayIsExpanded
      ? assignLanes(bars.filter(b => b.bayNames.includes(lastBayName))).length
      : 1;
    const lastY = bayYOffset.get(lastBayName)!;
    const totalHeight = lastY + lastBayLanes * ROW_HEIGHT - firstY;

    const leftPct = ((bar.startMs - minTime) / timeSpan) * 100;

    connectors.push({
      key: `conn-${bar.id}`,
      leftPct,
      topPx: firstY + BAR_VERTICAL_PAD,
      heightPx: totalHeight - BAR_VERTICAL_PAD * 2,
      colour: connectorColour(bar.type),
    });
  }

  return (
    <div className="relative">
      {/* Hangar group header */}
      <div className="flex flex-shrink-0 bg-slate-800/40" style={{ height: HANGAR_HEADER_HEIGHT }}>
        <div
          className="flex-shrink-0 flex items-center px-3 text-sm font-semibold text-slate-200 border-r border-slate-700/30"
          style={{ width: SIDEBAR_WIDTH }}
        >
          <span className="truncate">{group.name}</span>
          {group.failedIndicators.length > 0 && (
            <span className="ml-1 text-amber-400 text-xs" title="Has failed inductions">⚠️</span>
          )}
        </div>
        {/* Empty bar area for header — darker stripe */}
        <div className="flex-1 bg-slate-800/20" />
      </div>

      {/* Bay rows */}
      {group.bays.map((bay, idx) => {
        const bayBars = bars.filter(b => b.bayNames.includes(bay.name));
        const isExpanded = expandedBays.has(bay.name);

        if (isExpanded) {
          const lanes = assignLanes(bayBars);
          return (
            <ExpandedBayRows
              key={bay.name}
              bay={bay}
              lanes={lanes}
              minTime={minTime}
              timeSpan={timeSpan}
              rowIndex={idx}
              timeMarkers={timeMarkers}
              onBarHover={onBarHover}
              onBarMove={onBarMove}
              onBarLeave={onBarLeave}
              onBayHover={onBayHover}
              hangarName={group.name}
            />
          );
        }

        return (
          <BayRow
            key={bay.name}
            bay={bay}
            bars={bayBars}
            minTime={minTime}
            timeSpan={timeSpan}
            rowIndex={idx}
            timeMarkers={timeMarkers}
            onBarHover={onBarHover}
            onBarMove={onBarMove}
            onBarLeave={onBarLeave}
            onBayHover={onBayHover}
            hangarName={group.name}
          />
        );
      })}

      {/* Multi-bay connector overlay — positioned in the bar area column */}
      {connectors.length > 0 && (
        <div
          className="absolute top-0 pointer-events-none"
          style={{
            left: SIDEBAR_WIDTH,
            top: HANGAR_HEADER_HEIGHT,
            right: 0,
            bottom: 0,
          }}
        >
          {connectors.map(c => (
            <div
              key={c.key}
              className="absolute"
              style={{
                left: `${c.leftPct}%`,
                top: c.topPx,
                height: c.heightPx,
                width: 3,
                backgroundColor: c.colour,
                borderRadius: 2,
                zIndex: 5,
                opacity: 0.7,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
