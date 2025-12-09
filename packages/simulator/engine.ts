import { Model, Induction } from '../language/out/generated/ast.js';

export interface Conflict {
  time: number;          // time slot when the conflict occurs
  hangarName: string;
  fromBay: number;
  toBay: number;
  induction: Induction;  // the induction that caused the conflict
}

export interface SimulationResult {
  conflicts: Conflict[];
  // e.g. per hangar: max number of simultaneously occupied bays
  maxOccupancyPerHangar: Map<string, number>;
  // Optional timeline for visualisation
  timeline: { time: number; occupied: Record<string, boolean[]> }[];
}

type EventType = 'start' | 'end';

interface Event {
  time: number;
  type: EventType;
  induction: Induction;
}

export function simulate(model: Model): SimulationResult {
  const events: Event[] = [];

  for (const ind of model.inductions) {
    const startTime = ind.start;
    const endTime = ind.start + ind.duration;

    events.push({ time: startTime, type: 'start', induction: ind });
    events.push({ time: endTime, type: 'end', induction: ind });
  }

  // Sort by time; at equal time process 'end' before 'start'
  events.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (a.type === b.type) return 0;
    return a.type === 'end' ? -1 : 1;
  });

  // Build hangar state: boolean array per bay
  const hangarMap = new Map<string, { bays: boolean[] }>();
  for (const hangar of model.hangars) {
    hangarMap.set(hangar.name, { bays: new Array(hangar.bays).fill(false) });
  }

  const conflicts: Conflict[] = [];
  const maxOccupancyPerHangar = new Map<string, number>();
  const timeline: { time: number; occupied: Record<string, boolean[]> }[] = [];

  let currentTime = -Infinity;

  for (const ev of events) {
    // Snapshot state whenever time jumps
    if (ev.time !== currentTime) {
      const occupied: Record<string, boolean[]> = {};
      for (const [name, state] of hangarMap.entries()) {
        occupied[name] = [...state.bays]; // shallow copy
      }
      if (currentTime !== -Infinity) {
        timeline.push({ time: ev.time, occupied });
      }
      currentTime = ev.time;
    }

    const hangar = ev.induction.hangar?.ref;
    if (!hangar) continue;
    const state = hangarMap.get(hangar.name);
    if (!state) continue;

    const from = ev.induction.fromBay;
    const to = ev.induction.toBay;

    if (ev.type === 'start') {
      // Check for conflicts before occupying
      let hasConflict = false;
      for (let bay = from; bay <= to; bay++) {
        const idx = bay - 1; // 1-based -> 0-based
        if (state.bays[idx]) {
          hasConflict = true;
          break;
        }
      }

      if (hasConflict) {
        conflicts.push({
          time: ev.time,
          hangarName: hangar.name,
          fromBay: from,
          toBay: to,
          induction: ev.induction
        });
      }

      // Mark bays as occupied
      for (let bay = from; bay <= to; bay++) {
        state.bays[bay - 1] = true;
      }
    } else {
      // Free bays on 'end'
      for (let bay = from; bay <= to; bay++) {
        state.bays[bay - 1] = false;
      }
    }

    // Update max occupancy metric
    const occupiedCount = state.bays.filter(Boolean).length;
    const prevMax = maxOccupancyPerHangar.get(hangar.name) ?? 0;
    if (occupiedCount > prevMax) {
      maxOccupancyPerHangar.set(hangar.name, occupiedCount);
    }
  }

  return { conflicts, maxOccupancyPerHangar, timeline };
}
