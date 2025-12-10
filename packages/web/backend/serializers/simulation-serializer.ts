import type { SimulationResult } from '../../../simulator/out/engine.js';
import type { SchedulingResult } from '../../../simulator/out/scheduler.js';

export interface SerializedSimulation {
  conflicts: Array<{
    time: number;
    hangarName: string;
    fromBay: number;
    toBay: number;
    aircraft: string;
  }>;
  maxOccupancy: Record<string, number>;
  timeline: Array<{
    time: number;
    occupied: Record<string, Array<{ bay: number; occupied: boolean }>>;
  }>;
}

export interface SerializedScheduling {
  scheduled: Array<{
    aircraft: string;
    hangar: string;
    fromBay: number;
    toBay: number;
    start: number;
    duration: number;
  }>;
  unscheduled: Array<{
    aircraft: string;
    duration: number;
    wingspan?: number;
  }>;
}

export function serializeSimulation(simResult: SimulationResult): SerializedSimulation {
  return {
    conflicts: (simResult.conflicts || []).map(c => ({
      time: c.time,
      hangarName: c.hangarName,
      fromBay: c.fromBay,
      toBay: c.toBay,
      aircraft: c.induction?.aircraft?.ref?.name || 'unknown'
    })),
    maxOccupancy: Object.fromEntries(simResult.maxOccupancyPerHangar || new Map()),
    timeline: (simResult.timeline || []).map(t => ({
      time: t.time,
      occupied: Object.fromEntries(
        Object.entries(t.occupied || {}).map(([hangar, bays]) => [
          hangar,
          bays.map((occupied, idx) => ({ bay: idx + 1, occupied }))
        ])
      )
    }))
  };
}

export function serializeScheduling(scheduleResult: SchedulingResult): SerializedScheduling {
  return {
    scheduled: (scheduleResult.scheduled || []).map(s => ({
      aircraft: s.aircraft?.name || 'unknown',
      hangar: s.hangar?.name || 'unknown',
      fromBay: s.fromBay,
      toBay: s.toBay,
      start: s.start,
      duration: s.duration
    })),
    unscheduled: (scheduleResult.unscheduled || []).map(u => ({
      aircraft: u.aircraft?.ref?.name || 'unknown',
      duration: u.duration,
      wingspan: u.aircraft?.ref?.wingspan
    }))
  };
}