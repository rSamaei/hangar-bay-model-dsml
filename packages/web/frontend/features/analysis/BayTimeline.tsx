import { useState, useCallback } from 'react';
import type {
  HangarGroup,
  TimelineBar,
  TimeMarker,
  FailedInductionView,
  TooltipState,
} from './types';
import { TimeAxis } from './TimeAxis';
import { HangarSection } from './HangarSection';
import { GanttTooltip } from './GanttTooltip';
import { checkHasTimeOverlap, computeExpandedGroup } from './lane-utils';

interface BayTimelineProps {
  hangarGroups: HangarGroup[];
  bars: TimelineBar[];
  minTime: number;
  maxTime: number;
  timeMarkers: TimeMarker[];
  failedInductions: FailedInductionView[];
}

export function BayTimeline({
  hangarGroups,
  bars,
  minTime,
  maxTime,
  timeMarkers,
}: BayTimelineProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [expandedBayKey, setExpandedBayKey] = useState<string | null>(null);
  const timeSpan = maxTime - minTime || 1;

  const handleBarHover = (bar: TimelineBar, x: number, y: number) =>
    setTooltip({ bar, x, y });
  const handleBarMove = (x: number, y: number) =>
    setTooltip(prev => prev ? { ...prev, x, y } : null);
  const handleBarLeave = () => setTooltip(null);

  const handleBayHover = useCallback((bayName: string, hangarName: string) => {
    const bayBars = bars.filter(b => b.hangarName === hangarName && b.bayNames.includes(bayName));
    if (!checkHasTimeOverlap(bayBars)) {
      setExpandedBayKey(null);
      return;
    }
    const group = computeExpandedGroup(bayName, hangarName, bars);
    setExpandedBayKey(`${hangarName}::${group.join(',')}`);
  }, [bars]);

  if (hangarGroups.length === 0) {
    return (
      <div className="mt-4 p-6 text-center text-slate-500 text-sm bg-slate-900/50 rounded-xl border border-slate-700/50">
        No inductions to display.
      </div>
    );
  }

  return (
    <div className="mt-4 relative bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Time axis */}
          <TimeAxis markers={timeMarkers} />

          {/* Hangar sections */}
          {hangarGroups.map(group => {
            const groupBars = bars.filter(b => b.hangarName === group.name);
            // Derive which bays are expanded for this hangar
            const expandedBays: Set<string> =
              expandedBayKey?.startsWith(`${group.name}::`)
                ? new Set(expandedBayKey.slice(group.name.length + 2).split(','))
                : new Set();
            return (
              <HangarSection
                key={group.name}
                group={group}
                bars={groupBars}
                minTime={minTime}
                timeSpan={timeSpan}
                timeMarkers={timeMarkers}
                onBarHover={handleBarHover}
                onBarMove={handleBarMove}
                onBarLeave={handleBarLeave}
                expandedBays={expandedBays}
                onBayHover={handleBayHover}
              />
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-t border-slate-700/30 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-8 h-2.5 rounded-sm" style={{ backgroundColor: '#4B8BBE' }} />
          Manual
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-8 h-2.5 rounded-sm" style={{ backgroundColor: '#10B981' }} />
          Auto-scheduled
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-8 h-2.5 rounded-sm" style={{
            background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(249,115,22,0.7) 3px, rgba(249,115,22,0.7) 5px)',
          }} />
          Waiting
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-8 h-2.5 rounded-sm" style={{
            background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(245,158,11,0.7) 3px, rgba(245,158,11,0.7) 5px)',
          }} />
          Departure delay
        </span>
        <span className="flex items-center gap-1">
          <span className="text-amber-400">⚠️</span>
          Failed induction
        </span>
        <span className="flex items-center gap-1">
          <span className="text-cyan-400">⚡</span>
          Traversable bay
        </span>
      </div>

      {/* Gantt tooltip — rendered via portal to document.body */}
      <GanttTooltip tooltip={tooltip} />
    </div>
  );
}
