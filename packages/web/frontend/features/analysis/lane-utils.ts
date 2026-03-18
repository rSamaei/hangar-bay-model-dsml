import type { TimelineBar } from './types';

/**
 * Assign bars to non-overlapping lanes (greedy interval scheduling).
 * Returns an array of lanes, each lane being an array of bars.
 * Bars ending exactly when another starts (touching) go in the same lane.
 */
export function assignLanes(bars: TimelineBar[]): TimelineBar[][] {
  if (bars.length === 0) return [[]];

  const sorted = [...bars].sort((a, b) => a.startMs - b.startMs);
  const lanes: TimelineBar[][] = [];

  for (const bar of sorted) {
    let placed = false;
    for (const lane of lanes) {
      const lastInLane = lane[lane.length - 1];
      if (lastInLane.endMs <= bar.startMs) {
        lane.push(bar);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lanes.push([bar]);
    }
  }

  return lanes.length > 0 ? lanes : [[]];
}

/**
 * Returns true if any two bars in the array overlap in time (not just touching).
 */
export function checkHasTimeOverlap(bars: TimelineBar[]): boolean {
  if (bars.length < 2) return false;
  const sorted = [...bars].sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startMs < sorted[i - 1].endMs) return true;
  }
  return false;
}

/**
 * Compute the transitive closure of bays connected through multi-bay inductions,
 * starting from the hovered bay. Returns sorted bay names.
 */
export function computeExpandedGroup(
  bayName: string,
  hangarName: string,
  allBars: TimelineBar[]
): string[] {
  const hangarBars = allBars.filter(b => b.hangarName === hangarName);

  const visited = new Set<string>([bayName]);
  const queue = [bayName];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const bar of hangarBars) {
      if (bar.bayNames.includes(current) && bar.bayNames.length > 1) {
        for (const linkedBay of bar.bayNames) {
          if (!visited.has(linkedBay)) {
            visited.add(linkedBay);
            queue.push(linkedBay);
          }
        }
      }
    }
  }

  return Array.from(visited).sort();
}
