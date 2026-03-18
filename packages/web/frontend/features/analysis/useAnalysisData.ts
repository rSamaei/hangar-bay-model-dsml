import { useMemo } from 'react';
import type { AnalysisResult } from '../../services/api';
import type {
  ExportModel,
  ExportedUnscheduledAuto,
  HangarStatistic,
} from '../../types/api';
import type {
  AnalysisViewModel,
  TimelineBar,
  HangarGroup,
  BayInfo,
  HangarSummary,
  GlobalSummary,
  FailedInductionView,
  FailedBayIndicator,
  TimeMarker,
} from './types';
import { humanizeFailure } from './humanize';

export function useAnalysisData(result: AnalysisResult | null): AnalysisViewModel | null {
  return useMemo(() => {
    if (!result) return null;
    return buildViewModel(result);
  }, [result]);
}

function buildViewModel(result: AnalysisResult): AnalysisViewModel {
  const { exportModel } = result;
  const bars: TimelineBar[] = [];

  // 1. Build bars from exportModel.inductions (contains both manual + auto)
  for (const ind of exportModel.inductions) {
    // Main occupancy bar
    bars.push({
      id: ind.id,
      type: ind.kind,
      aircraftType: ind.aircraft,
      inductionId: ind.id,
      hangarName: ind.hangar,
      bayNames: ind.bays,
      doorName: ind.door ?? '',
      startMs: new Date(ind.actualStart ?? ind.start).getTime(),
      endMs: new Date(ind.scheduledEnd ?? ind.end).getTime(),
      waitTimeMinutes: ind.waitTime,
      waitReason: ind.waitReason,
      departureDelayMinutes: ind.departureDelay,
      departureDelayReason: ind.departureDelayReason,
      placementAttempts: ind.placementAttempts,
      queuePosition: ind.queuePosition,
    });

    // Waiting overlay (if auto and waited)
    if (ind.kind === 'auto' && ind.requestedStart && ind.actualStart
        && (ind.waitTime ?? 0) > 0) {
      const reqMs = new Date(ind.requestedStart).getTime();
      const actMs = new Date(ind.actualStart).getTime();
      if (actMs > reqMs) {
        bars.push({
          id: ind.id,
          type: 'waiting',
          aircraftType: ind.aircraft,
          inductionId: ind.id,
          hangarName: ind.hangar,
          bayNames: ind.bays,
          doorName: ind.door ?? '',
          startMs: reqMs,
          endMs: actMs,
          waitTimeMinutes: ind.waitTime,
          waitReason: ind.waitReason,
        });
      }
    }

    // Departure delay overlay
    if (ind.kind === 'auto' && ind.scheduledEnd && ind.actualEnd
        && (ind.departureDelay ?? 0) > 0) {
      const schedMs = new Date(ind.scheduledEnd).getTime();
      const actEndMs = new Date(ind.actualEnd).getTime();
      if (actEndMs > schedMs) {
        bars.push({
          id: ind.id,
          type: 'departure-delay',
          aircraftType: ind.aircraft,
          inductionId: ind.id,
          hangarName: ind.hangar,
          bayNames: ind.bays,
          doorName: ind.door ?? '',
          startMs: schedMs,
          endMs: actEndMs,
          departureDelayMinutes: ind.departureDelay,
          departureDelayReason: ind.departureDelayReason,
        });
      }
    }
  }

  // 2. Build hangar groups
  const hangarGroups = buildHangarGroups(exportModel, bars);

  // 3. Build failed inductions
  const failedInductions: FailedInductionView[] = (exportModel.autoSchedule?.unscheduled ?? []).map(u => ({
    inductionId: u.id,
    aircraftType: u.aircraft,
    preferredHangar: u.preferredHangar,
    reasonRuleId: u.reasonRuleId,
    reasonHumanized: humanizeFailure(u, exportModel.hangarStatistics ?? {}),
    evidence: u.evidence,
    requestedArrival: u.evidence?.notBefore
      ? new Date(u.evidence.notBefore as string).getTime() : undefined,
    deadline: u.evidence?.notAfter
      ? new Date(u.evidence.notAfter as string).getTime() : undefined,
  }));

  // 4. Compute time range
  const allTimes = bars.flatMap(b => [b.startMs, b.endMs]).filter(t => !isNaN(t));
  const minTime = allTimes.length > 0 ? Math.min(...allTimes) : Date.now();
  const maxTime = allTimes.length > 0 ? Math.max(...allTimes) : Date.now() + 86_400_000;

  // 5. Build time markers
  const timeMarkers = buildTimeMarkers(minTime, maxTime);

  // 6. Build summaries
  const hangarSummaries = buildHangarSummaries(exportModel);
  const globalSummary = buildGlobalSummary(exportModel);

  return {
    airfieldName: exportModel.airfieldName,
    hangarGroups,
    hangarSummaries,
    globalSummary,
    bars,
    failedInductions,
    minTime,
    maxTime,
    timeMarkers,
  };
}

function buildHangarGroups(exportModel: ExportModel, bars: TimelineBar[]): HangarGroup[] {
  // Collect all unique bays per hangar from occupancy bars
  const hangarBays = new Map<string, Set<string>>();
  for (const bar of bars) {
    if (bar.type === 'waiting' || bar.type === 'departure-delay') continue;
    if (!hangarBays.has(bar.hangarName)) hangarBays.set(bar.hangarName, new Set());
    for (const bay of bar.bayNames) {
      hangarBays.get(bar.hangarName)!.add(bay);
    }
  }

  // Build failed indicators per bay and per hangar
  const failedByBay = new Map<string, FailedBayIndicator[]>();   // "hangar::bay"
  const failedByHangar = new Map<string, FailedBayIndicator[]>();

  for (const u of exportModel.autoSchedule?.unscheduled ?? []) {
    const indicator: FailedBayIndicator = {
      inductionId: u.id,
      aircraftType: u.aircraft,
      reasonHumanized: humanizeFailure(u, exportModel.hangarStatistics ?? {}),
    };
    const hangar = u.preferredHangar ?? (u.evidence?.hangar as string | undefined);
    if (hangar) {
      const bays = u.evidence?.bays as string[] | undefined;
      if (bays && bays.length > 0) {
        for (const bay of bays) {
          const key = `${hangar}::${bay}`;
          if (!failedByBay.has(key)) failedByBay.set(key, []);
          failedByBay.get(key)!.push(indicator);
        }
      } else {
        if (!failedByHangar.has(hangar)) failedByHangar.set(hangar, []);
        failedByHangar.get(hangar)!.push(indicator);
      }
    }
  }

  const groups: HangarGroup[] = [];
  for (const [hangarName, baySet] of hangarBays) {
    const bays: BayInfo[] = Array.from(baySet).sort().map(name => ({
      name,
      hangarName,
      traversable: false,
      failedIndicators: failedByBay.get(`${hangarName}::${name}`) ?? [],
    }));
    groups.push({
      name: hangarName,
      bays,
      failedIndicators: failedByHangar.get(hangarName) ?? [],
    });
  }
  return groups;
}

function buildTimeMarkers(minTime: number, maxTime: number): TimeMarker[] {
  const span = maxTime - minTime;
  if (span <= 0) return [];

  const MS_HOUR = 3_600_000;
  const MS_DAY = 86_400_000;
  const MS_WEEK = 7 * MS_DAY;

  let step: number;
  let formatFn: (d: Date) => string;

  if (span <= MS_DAY) {
    step = 2 * MS_HOUR;
    formatFn = d => d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' });
  } else if (span <= 14 * MS_DAY) {
    step = MS_DAY;
    formatFn = d => d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
  } else {
    step = MS_WEEK;
    formatFn = d => d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
  }

  const firstMark = Math.ceil(minTime / step) * step;
  const markers: TimeMarker[] = [];
  for (let t = firstMark; t <= maxTime; t += step) {
    markers.push({
      label: formatFn(new Date(t)),
      positionPct: ((t - minTime) / span) * 100,
    });
  }
  return markers;
}

function buildHangarSummaries(exportModel: ExportModel): HangarSummary[] {
  const stats = exportModel.hangarStatistics ?? {};
  return Object.entries(stats).map(([name, hs]) => ({
    name,
    avgUtilisation: hs.avgUtilisation,
    peakOccupancy: hs.peakOccupancy,
    totalBays: hs.totalBays,
    totalWaitMinutes: hs.totalWaitTime,
    inductionsServed: hs.inductionsServed,
  }));
}

function buildGlobalSummary(exportModel: ExportModel): GlobalSummary {
  const sim = exportModel.simulation;
  const stats = exportModel.simulationStatistics;
  return {
    placedCount: sim?.placedCount ?? 0,
    failedCount: sim?.failedCount ?? 0,
    totalWaitMinutes: stats?.totalWaitTime ?? 0,
    maxQueueDepth: sim?.maxQueueDepth ?? 0,
  };
}
