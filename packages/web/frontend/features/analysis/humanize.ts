import type { ExportedUnscheduledAuto, HangarStatistic } from '../../types/api';

/**
 * Rewrites raw simulator reason strings into natural language.
 */
export function humanizeReason(rawReason: string | null | undefined): string {
  if (!rawReason) return '';

  // Split compound reasons on "; " and humanize each part
  const parts = rawReason.split('; ').map(part => {
    // "Bay set {A1, A2} has time conflict in MainHangar"
    let match = part.match(/Bay set \{([^}]+)\} has time conflict in (\w+)/);
    if (match) {
      const bays = match[1].split(',').map(b => b.trim());
      return bays.length === 1
        ? `Bay ${bays[0]} was occupied by another aircraft`
        : `Bays ${bays.join(', ')} were occupied by other aircraft`;
    }

    // "Bays unreachable via access path NN3 in NarrowHangar"
    match = part.match(/Bays unreachable via access path (\w+) in (\w+)/);
    if (match) {
      return `Bay ${match[1]} was unreachable — access path blocked`;
    }

    // "No door in NarrowHangar fits Falcon (wingspan X m, door Y m)"
    match = part.match(/No door in (\w+) fits (\w+)/);
    if (match) {
      return `Too wide for ${match[1]} doors`;
    }

    // "SFR_CORRIDOR_FIT" or corridor-related
    if (part.includes('corridor') || part.includes('CORRIDOR')) {
      return 'Too wide for the corridor leading to available bays';
    }

    // "No suitable bay set found in HangarName"
    match = part.match(/No suitable bay set found in (\w+)/);
    if (match) {
      return `No bay configuration fits in ${match[1]}`;
    }

    // "Door DoorName in HangarName too narrow" pattern
    match = part.match(/[Dd]oor (\w+).*too narrow/);
    if (match) {
      return `Door ${match[1]} is too narrow for this aircraft`;
    }

    // "Blocked by inductions: X, Y"
    match = part.match(/[Bb]locked by inductions?:?\s*(.+)/);
    if (match) {
      return `Exit blocked by ${match[1]}`;
    }

    // Fallback: return raw text
    return part;
  });

  return parts.join('. ');
}

/**
 * Generates a 1-2 sentence natural language explanation for a failed induction.
 */
export function humanizeFailure(
  failed: ExportedUnscheduledAuto,
  hangarStats: Record<string, HangarStatistic>,
): string {
  const aircraft = failed.aircraft;
  const evidence = failed.evidence as Record<string, any>;
  const ruleId = failed.reasonRuleId;

  // ── Door fit ──
  if (ruleId === 'SFR11_DOOR_FIT' || ruleId === 'SFR24_DOOR_FIT_PRECHECK'
      || ruleId === 'STRUCTURALLY_INFEASIBLE') {
    const wingspan = evidence?.wingspanEff ?? evidence?.wingspan;
    const doorWidth = evidence?.doorWidth ?? evidence?.maxDoorWidth;
    if (wingspan && doorWidth) {
      return `The ${aircraft} is too large for any hangar door on this airfield. `
        + `The widest door is ${doorWidth}m, but the aircraft needs ${wingspan}m clearance.`;
    }
    return `The ${aircraft} cannot fit through any hangar door on this airfield.`;
  }

  // ── Time overlap / all bays occupied ──
  if (ruleId === 'SFR16_TIME_OVERLAP' || ruleId === 'NO_SUITABLE_BAY_SET') {
    const notBefore = evidence?.notBefore || evidence?.requestedWindow?.start;
    const notAfter = evidence?.notAfter || evidence?.requestedWindow?.end;
    if (notBefore && notAfter) {
      const start = formatDateShort(new Date(notBefore));
      const end = formatDateShort(new Date(notAfter));
      return `All bays were occupied during the requested window (${start} – ${end}).`;
    }
    return `No bay configuration was available for the ${aircraft} within the scheduling window.`;
  }

  // ── Deadline exceeded ──
  if (ruleId === 'SIM_DEADLINE_EXCEEDED' || ruleId === 'DEADLINE_EXPIRED') {
    const notAfter = evidence?.notAfter || evidence?.requestedWindow?.end;
    if (notAfter) {
      const deadline = formatDateShort(new Date(notAfter));
      return `The ${aircraft}'s deadline (${deadline}) passed before any bay freed up. `
        + `All bays were occupied when it arrived.`;
    }
    return `The ${aircraft}'s deadline expired before a bay became available.`;
  }

  // ── Dynamic reachability ──
  if (ruleId === 'SFR_DYNAMIC_REACHABILITY') {
    return `Bays were available but unreachable — other aircraft blocked the access path to the ${aircraft}'s assigned bays.`;
  }

  // ── Corridor fit ──
  if (ruleId === 'SFR_CORRIDOR_FIT') {
    const wingspan = evidence?.wingspanEff;
    const corridorWidth = evidence?.corridorWidth;
    if (wingspan && corridorWidth) {
      return `The ${aircraft} is too wide for the corridor (${wingspan}m wingspan, corridor is ${corridorWidth}m).`;
    }
    return `The ${aircraft} is too wide for the corridor leading to available bays.`;
  }

  // ── Dependency never placed ──
  if (ruleId === 'DEPENDENCY_NEVER_PLACED') {
    const dep = evidence?.dependency;
    if (dep) {
      return `The ${aircraft} depends on ${dep}, which was never placed.`;
    }
    return `The ${aircraft} depends on another induction that was never placed.`;
  }

  // ── Event limit ──
  if (ruleId === 'SIM_EVENT_LIMIT') {
    return `The simulation hit its event limit before the ${aircraft} could be placed.`;
  }

  // ── Fallback ──
  return `The ${aircraft} could not be scheduled (${ruleId}).`;
}

/**
 * Converts minutes to a natural language duration string.
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (remHours === 0) return `${days}d`;
  return `${days}d ${remHours}h`;
}

/**
 * Formats a date as "Sep 14, 08:00" for use in tooltips and panels.
 */
export function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
