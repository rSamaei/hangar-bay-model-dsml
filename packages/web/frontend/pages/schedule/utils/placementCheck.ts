import type { Aircraft, HangarBay, ScheduledPlacement } from '../types';

export type PlacementColor = 'green' | 'red' | 'amber';

export interface PlacementCheckResult {
  valid: boolean;
  color: PlacementColor;
  issues: string[];
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}

/**
 * Client-side pre-check for a proposed drag-and-drop placement.
 *
 * Returns green  — dimensions fit, no known time/bay conflict.
 * Returns red    — dimensions clearly insufficient or conflict detected.
 * Returns amber  — dimensions OK but overlap uncertain (needs server check).
 *
 * The server is always the final arbiter; this function exists purely for
 * instant drag-preview feedback.
 */
export function checkPlacement(
  aircraft: Aircraft,
  bays: HangarBay[],
  startMs: number,
  endMs: number,
  existingPlacements: ScheduledPlacement[],
  hangarName: string,
): PlacementCheckResult {
  if (bays.length === 0) {
    return { valid: false, color: 'red', issues: ['No bays selected'] };
  }

  const issues: string[] = [];

  // Wingspan vs total combined bay width
  const totalWidth = bays.reduce((sum, b) => sum + b.width, 0);
  if (totalWidth < aircraft.wingspan) {
    issues.push(
      `Width ${totalWidth.toFixed(1)} m < wingspan ${aircraft.wingspan.toFixed(1)} m`,
    );
  }

  // Aircraft length vs minimum bay depth
  const minDepth = Math.min(...bays.map(b => b.depth));
  if (minDepth < aircraft.length) {
    issues.push(
      `Depth ${minDepth.toFixed(1)} m < length ${aircraft.length.toFixed(1)} m`,
    );
  }

  // Aircraft height vs minimum bay height
  const minHeight = Math.min(...bays.map(b => b.height));
  if (aircraft.height > 0 && minHeight < aircraft.height) {
    issues.push(
      `Height ${minHeight.toFixed(1)} m < aircraft height ${aircraft.height.toFixed(1)} m`,
    );
  }

  if (issues.length > 0) {
    return { valid: false, color: 'red', issues };
  }

  // Time-overlap check against already-scheduled placements in the same hangar/bays
  const sanHangar = sanitize(hangarName);
  const sanBayNames = new Set(bays.map(b => sanitize(b.name)));
  const rawBayNames = new Set(bays.map(b => b.name));

  const hasConflict = existingPlacements.some(p => {
    const pHangar = p.hangar ?? '';
    if (p.status !== 'scheduled') return false;
    if (pHangar !== sanHangar && pHangar !== hangarName) return false;
    const pStart = new Date(p.start).getTime();
    const pEnd = new Date(p.end).getTime();
    if (pEnd <= startMs || pStart >= endMs) return false;
    // Bays overlap?
    return p.bays.some(
      b => sanBayNames.has(b) || rawBayNames.has(b) || sanBayNames.has(sanitize(b)),
    );
  });

  if (hasConflict) {
    return {
      valid: false,
      color: 'red',
      issues: ['Time/bay conflict with existing placement'],
    };
  }

  return { valid: true, color: 'green', issues: [] };
}
