import type { ExportModel, ExportedInduction, ExportedUnscheduledAuto } from '../types/api';

// ── Internal types ──────────────────────────────────────────────────

interface BarSegment {
  id: string;
  type: 'waiting' | 'placed' | 'departure-delay' | 'failed';
  kind: 'manual' | 'auto';
  startMs: number;
  endMs: number;
  hangar: string;
  row: number;
  hasConflicts: boolean;
  // Tooltip fields
  aircraft: string;
  bays: string;
  door: string;
  durationLabel: string;
  reason: string;
}

// ── Constants ───────────────────────────────────────────────────────

const LABEL_WIDTH = 140;
const BAR_HEIGHT = 28;
const BAR_GAP = 4;
const LANE_PAD_Y = 8;

/** SVG hatch pattern definitions — embedded inside each lane SVG to avoid
 *  broken url(#id) references when the page URL contains a hash fragment
 *  (hash-based SPA routing makes cross-SVG url(#id) unresolvable). */
const HATCH_DEFS = `
  <defs>
    <pattern id="hatch-waiting" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="rgba(239,68,68,0.1)"/>
      <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(239,68,68,0.5)" stroke-width="2"/>
    </pattern>
    <pattern id="hatch-departure-delay" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="rgba(249,115,22,0.1)"/>
      <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(249,115,22,0.6)" stroke-width="2"/>
    </pattern>
    <pattern id="hatch-failed" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="rgba(220,38,38,0.12)"/>
      <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(220,38,38,0.7)" stroke-width="3"/>
    </pattern>
  </defs>`;

// ── Public API ──────────────────────────────────────────────────────

export function renderTimeline(exportModel: ExportModel): string {
  const { inductions } = exportModel;
  const unscheduled = exportModel.autoSchedule?.unscheduled ?? [];

  if (inductions.length === 0 && unscheduled.length === 0) {
    return emptyState();
  }

  // Build segments for all inductions
  const segments: BarSegment[] = [];
  for (const ind of inductions) {
    segments.push(...buildInductionSegments(ind));
  }
  for (const unsched of unscheduled) {
    const seg = buildFailedSegment(unsched);
    if (seg) segments.push(seg);
  }

  if (segments.length === 0) return emptyState();

  // Calculate time bounds from ALL segments (including requestedStart / actualEnd)
  const allTimes = segments.flatMap(s => [s.startMs, s.endMs]).filter(t => t > 0);
  const minTime = Math.min(...allTimes);
  const maxTime = Math.max(...allTimes);
  const timeSpan = maxTime - minTime || 1;

  // Group segments by hangar
  const byHangar = new Map<string, BarSegment[]>();
  for (const seg of segments) {
    if (!byHangar.has(seg.hangar)) byHangar.set(seg.hangar, []);
    byHangar.get(seg.hangar)!.push(seg);
  }

  // Assign stacking rows per hangar
  for (const [, segs] of byHangar) {
    assignRows(segs);
  }

  // Calculate lane heights
  const laneHeights = new Map<string, number>();
  for (const [hangar, segs] of byHangar) {
    const maxRow = Math.max(...segs.map(s => s.row), 0);
    laneHeights.set(hangar, (maxRow + 1) * (BAR_HEIGHT + BAR_GAP) + LANE_PAD_Y * 2 - BAR_GAP);
  }

  const timeMarkers = generateTimeMarkers(minTime, maxTime);
  const hasFailed = unscheduled.length > 0;
  const hasWaiting = segments.some(s => s.type === 'waiting');
  const hasDepartureDelay = segments.some(s => s.type === 'departure-delay');

  return `
    <!-- Shared tooltip (hidden until hover) -->
    <div id="timeline-tooltip" style="position:fixed;pointer-events:none;opacity:0;transition:opacity 0.15s;z-index:50;display:none">
      <div style="background:#0f172a;border:1px solid #475569;border-radius:8px;box-shadow:0 10px 25px rgba(0,0,0,0.5);padding:10px 12px;font-size:12px;max-width:320px;line-height:1.5">
        <div id="timeline-tooltip-content"></div>
      </div>
    </div>

    <div class="space-y-4">
      ${renderLegend(hasFailed, hasWaiting, hasDepartureDelay)}

      <!-- Timeline Container -->
      <div id="timeline-container" class="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <!-- Time Axis -->
        <div class="flex">
          <div class="flex-shrink-0 bg-slate-800/50 border-b border-slate-700/50" style="width:${LABEL_WIDTH}px"></div>
          <div class="flex-1 flex items-center justify-between px-2 py-2 bg-slate-800/50 border-b border-slate-700/50 text-xs text-slate-500">
            ${timeMarkers.map(m => `<span>${m}</span>`).join('')}
          </div>
        </div>

        <!-- Hangar Lanes -->
        <div class="divide-y divide-slate-700/30">
          ${Array.from(byHangar.entries()).map(([hangar, segs]) => {
            const laneH = laneHeights.get(hangar)!;
            return renderLane(hangar, segs, laneH, minTime, timeSpan);
          }).join('')}
        </div>
      </div>

      <!-- Summary -->
      <div class="flex items-center justify-between text-xs text-slate-500 px-2">
        <span>Start: ${formatDateTime(new Date(minTime))}</span>
        <span>End: ${formatDateTime(new Date(maxTime))}</span>
      </div>
    </div>
  `;
}

/**
 * Attach mouse event listeners for the shared tooltip.
 * Call this AFTER the timeline HTML has been inserted into the DOM.
 */
export function attachTimelineListeners(): void {
  const container = document.getElementById('timeline-container');
  const tooltip = document.getElementById('timeline-tooltip');
  const tooltipContent = document.getElementById('timeline-tooltip-content');
  if (!container || !tooltip || !tooltipContent) return;

  container.addEventListener('mouseenter', (e: Event) => {
    const target = (e.target as Element)?.closest('.timeline-bar') as SVGElement | null;
    if (!target) return;
    tooltipContent.innerHTML = buildTooltipHtml(target);
    tooltip.style.display = 'block';
    // Force reflow before showing
    void tooltip.offsetHeight;
    tooltip.style.opacity = '1';
  }, true);

  container.addEventListener('mousemove', (e: Event) => {
    const me = e as MouseEvent;
    const target = (me.target as Element)?.closest('.timeline-bar');
    if (!target) return;
    const pad = 12;
    const tipW = tooltip.offsetWidth;
    const tipH = tooltip.offsetHeight;
    let left = me.clientX + pad;
    let top = me.clientY - tipH - pad;
    // Clamp to viewport
    if (left + tipW > window.innerWidth - pad) left = me.clientX - tipW - pad;
    if (top < pad) top = me.clientY + pad;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }, true);

  container.addEventListener('mouseleave', (e: Event) => {
    const target = (e.target as Element)?.closest('.timeline-bar');
    if (!target) return;
    tooltip.style.opacity = '0';
    setTimeout(() => { tooltip.style.display = 'none'; }, 150);
  }, true);
}

// ── Segment builders ────────────────────────────────────────────────

function buildInductionSegments(ind: ExportedInduction): BarSegment[] {
  const segs: BarSegment[] = [];
  const conflicts = ind.conflicts.length > 0;

  if (ind.kind === 'auto') {
    // 1) Waiting segment
    if (ind.requestedStart && ind.actualStart && (ind.waitTime ?? 0) > 0) {
      const reqStart = new Date(ind.requestedStart).getTime();
      const actStart = new Date(ind.actualStart).getTime();
      if (actStart > reqStart) {
        segs.push({
          id: ind.id, type: 'waiting', kind: 'auto',
          startMs: reqStart, endMs: actStart,
          hangar: ind.hangar, row: 0, hasConflicts: conflicts,
          aircraft: ind.aircraft,
          bays: ind.bays.join(', '), door: ind.door ?? '',
          durationLabel: `${ind.waitTime} min`,
          reason: ind.waitReason ?? '',
        });
      }
    }

    // 2) Placed segment
    const placedStart = ind.actualStart
      ? new Date(ind.actualStart).getTime()
      : new Date(ind.start).getTime();
    const placedEnd = ind.scheduledEnd
      ? new Date(ind.scheduledEnd).getTime()
      : new Date(ind.end).getTime();
    segs.push({
      id: ind.id, type: 'placed', kind: 'auto',
      startMs: placedStart, endMs: placedEnd,
      hangar: ind.hangar, row: 0, hasConflicts: conflicts,
      aircraft: ind.aircraft,
      bays: ind.bays.join(', '), door: ind.door ?? '',
      durationLabel: formatDurationMs(placedEnd - placedStart),
      reason: '',
    });

    // 3) Departure delay segment
    if (ind.scheduledEnd && ind.actualEnd && (ind.departureDelay ?? 0) > 0) {
      const schedEnd = new Date(ind.scheduledEnd).getTime();
      const actEnd = new Date(ind.actualEnd).getTime();
      if (actEnd > schedEnd) {
        segs.push({
          id: ind.id, type: 'departure-delay', kind: 'auto',
          startMs: schedEnd, endMs: actEnd,
          hangar: ind.hangar, row: 0, hasConflicts: conflicts,
          aircraft: ind.aircraft,
          bays: ind.bays.join(', '), door: ind.door ?? '',
          durationLabel: `${ind.departureDelay} min`,
          reason: ind.departureDelayReason ?? '',
        });
      }
    }
  } else {
    // Manual — single placed segment
    segs.push({
      id: ind.id, type: 'placed', kind: 'manual',
      startMs: new Date(ind.start).getTime(),
      endMs: new Date(ind.end).getTime(),
      hangar: ind.hangar, row: 0, hasConflicts: conflicts,
      aircraft: ind.aircraft,
      bays: ind.bays.join(', '), door: ind.door ?? '',
      durationLabel: formatDurationMs(
        new Date(ind.end).getTime() - new Date(ind.start).getTime()
      ),
      reason: '',
    });
  }

  return segs;
}

function buildFailedSegment(unsched: ExportedUnscheduledAuto): BarSegment | null {
  const evidence = unsched.evidence as Record<string, any>;
  let startMs = 0, endMs = 0;

  if (evidence?.requestedWindow?.start && evidence?.requestedWindow?.end) {
    startMs = new Date(evidence.requestedWindow.start).getTime();
    endMs = new Date(evidence.requestedWindow.end).getTime();
  } else if (evidence?.notBefore && evidence?.notAfter) {
    startMs = new Date(evidence.notBefore).getTime();
    endMs = new Date(evidence.notAfter).getTime();
  }

  if (startMs <= 0 || endMs <= 0) return null;

  const hangar = String(evidence?.hangar ?? unsched.preferredHangar ?? 'Unknown');
  const reason = getReasonMessage(unsched.reasonRuleId, evidence);

  return {
    id: unsched.id, type: 'failed', kind: 'auto',
    startMs, endMs,
    hangar, row: 0, hasConflicts: false,
    aircraft: unsched.aircraft,
    bays: '', door: '',
    durationLabel: formatDurationMs(endMs - startMs),
    reason,
  };
}

// ── Row assignment (interval packing) ───────────────────────────────

function assignRows(segments: BarSegment[]): void {
  // Group all segments by induction ID so the full time range (including
  // waiting and departure-delay) is used for row packing.  Without this,
  // a waiting segment can share a row with a manual bar that visually
  // covers it (solid bars render in front of hatched bars).
  const byId = new Map<string, BarSegment[]>();
  for (const seg of segments) {
    if (!byId.has(seg.id)) byId.set(seg.id, []);
    byId.get(seg.id)!.push(seg);
  }

  // Build one packing interval per induction (union of all its segments).
  const intervals: { id: string; start: number; end: number }[] = [];
  for (const [id, segs] of byId) {
    const start = Math.min(...segs.map(s => s.startMs));
    const end   = Math.max(...segs.map(s => s.endMs));
    intervals.push({ id, start, end });
  }
  intervals.sort((a, b) => a.start - b.start);

  // Greedy interval packing
  const rowEnds: number[] = [];
  const rowById = new Map<string, number>();

  for (const iv of intervals) {
    let assigned = -1;
    for (let r = 0; r < rowEnds.length; r++) {
      if (rowEnds[r] <= iv.start) {
        assigned = r;
        break;
      }
    }
    if (assigned === -1) {
      assigned = rowEnds.length;
      rowEnds.push(0);
    }
    rowById.set(iv.id, assigned);
    rowEnds[assigned] = iv.end;
  }

  // Apply assigned row to every segment
  for (const seg of segments) {
    seg.row = rowById.get(seg.id) ?? 0;
  }
}

// ── SVG lane rendering ──────────────────────────────────────────────

function renderLane(
  hangar: string,
  segments: BarSegment[],
  laneHeight: number,
  minTime: number,
  timeSpan: number,
): string {
  function toPct(ms: number): number {
    return ((ms - minTime) / timeSpan) * 100;
  }

  function segY(seg: BarSegment): number {
    return LANE_PAD_Y + seg.row * (BAR_HEIGHT + BAR_GAP);
  }

  // Separate hatched (render first, behind) and solid (render last, in front)
  const hatched = segments.filter(s =>
    s.type === 'waiting' || s.type === 'departure-delay' || s.type === 'failed'
  );
  const solid = segments.filter(s => s.type === 'placed');
  const hasHatched = hatched.length > 0;

  // Build SVG content
  const svgParts: string[] = [];

  // Grid lines (at 25% intervals)
  for (let i = 1; i < 4; i++) {
    svgParts.push(
      `<line x1="${i * 25}%" y1="0" x2="${i * 25}%" y2="${laneHeight}" stroke="rgba(100,116,139,0.15)" stroke-width="1"/>`
    );
  }

  // Hatched bars (behind)
  for (const seg of hatched) {
    const x = toPct(seg.startMs);
    const w = Math.max(toPct(seg.endMs) - x, 0.3);
    const y = segY(seg);
    let fill: string;
    let stroke: string;
    if (seg.type === 'waiting') {
      fill = 'url(#hatch-waiting)';
      stroke = 'rgba(239,68,68,0.35)';
    } else if (seg.type === 'departure-delay') {
      fill = 'url(#hatch-departure-delay)';
      stroke = 'rgba(249,115,22,0.45)';
    } else {
      fill = 'url(#hatch-failed)';
      stroke = 'rgba(220,38,38,0.55)';
    }
    svgParts.push(
      `<rect class="timeline-bar" x="${x}%" y="${y}" width="${w}%" height="${BAR_HEIGHT}" rx="4"` +
      ` fill="${fill}" stroke="${stroke}" stroke-width="1"` +
      ` ${dataAttrs(seg)}/>`
    );
  }

  // Solid bars (in front, rendered after hatched → SVG painter's model)
  for (const seg of solid) {
    const x = toPct(seg.startMs);
    const w = Math.max(toPct(seg.endMs) - x, 0.3);
    const y = segY(seg);

    let fill: string;
    if (seg.hasConflicts) {
      fill = 'rgba(239,68,68,0.85)';
    } else if (seg.kind === 'manual') {
      fill = 'rgba(59,130,246,0.85)';
    } else {
      fill = 'rgba(16,185,129,0.85)';
    }

    // Conflict ring
    const strokeAttr = seg.hasConflicts
      ? `stroke="rgba(248,113,113,0.6)" stroke-width="2"`
      : '';

    svgParts.push(
      `<rect class="timeline-bar" x="${x}%" y="${y}" width="${w}%" height="${BAR_HEIGHT}" rx="4"` +
      ` fill="${fill}" ${strokeAttr}` +
      ` ${dataAttrs(seg)}/>`
    );

    // Label inside the bar — show aircraft type (optionally with ID)
    // Estimate pixel width: w% of container width. Container is ~700-1200px
    // so use a conservative estimate for label thresholds as percentage.
    // 120px / 900px ≈ 13.3%, 60px / 900px ≈ 6.7% — use percentage thresholds
    if (w > 12) {
      // Wide bar: "Aircraft (ID)"
      const label = `${escXml(seg.aircraft)} (${escXml(seg.id)})`;
      svgParts.push(
        `<text x="${x + w / 2}%" y="${y + BAR_HEIGHT / 2}" text-anchor="middle" dominant-baseline="central"` +
        ` fill="white" font-size="11" font-weight="500" pointer-events="none"` +
        ` style="font-family:ui-monospace,monospace"><tspan>${label}</tspan></text>`
      );
    } else if (w > 5) {
      // Medium bar: aircraft type only
      svgParts.push(
        `<text x="${x + w / 2}%" y="${y + BAR_HEIGHT / 2}" text-anchor="middle" dominant-baseline="central"` +
        ` fill="white" font-size="11" font-weight="500" pointer-events="none"` +
        ` style="font-family:ui-monospace,monospace">${escXml(seg.aircraft)}</text>`
      );
    }
    // Narrow bars (w <= 5): no label, tooltip only
  }

  return `
    <div class="flex items-stretch">
      <div class="flex-shrink-0 px-4 py-2 bg-slate-800/30 border-r border-slate-700/50 flex items-center" style="width:${LABEL_WIDTH}px">
        <span class="font-medium text-slate-300 text-sm truncate">${escHtml(hangar)}</span>
      </div>
      <div class="flex-1 relative bg-slate-900/30" style="min-height:${laneHeight}px">
        <svg width="100%" height="${laneHeight}" style="display:block">
          ${hasHatched ? HATCH_DEFS : ''}
          ${svgParts.join('\n          ')}
        </svg>
      </div>
    </div>
  `;
}

// ── Data attributes for tooltip ─────────────────────────────────────

function dataAttrs(seg: BarSegment): string {
  return [
    `data-seg-id="${escAttr(seg.id)}"`,
    `data-seg-type="${seg.type}"`,
    `data-seg-kind="${seg.kind}"`,
    `data-seg-aircraft="${escAttr(seg.aircraft)}"`,
    `data-seg-bays="${escAttr(seg.bays)}"`,
    `data-seg-door="${escAttr(seg.door)}"`,
    `data-seg-duration="${escAttr(seg.durationLabel)}"`,
    `data-seg-reason="${escAttr(seg.reason)}"`,
    `data-seg-conflicts="${seg.hasConflicts ? 'true' : ''}"`,
  ].join(' ');
}

// ── Tooltip HTML builder (reads data-* from SVG element) ────────────

function buildTooltipHtml(el: SVGElement): string {
  const ds = el.dataset;
  const id = ds.segId ?? '';
  const type = ds.segType ?? '';
  const kind = ds.segKind ?? '';
  const aircraft = ds.segAircraft ?? '';
  const bays = ds.segBays ?? '';
  const door = ds.segDoor ?? '';
  const duration = ds.segDuration ?? '';
  const reason = ds.segReason ?? '';
  const hasConflicts = ds.segConflicts === 'true';

  const parts: string[] = [];

  // ID — Aircraft (bold header)
  parts.push(`<div style="font-weight:600;color:#fff;margin-bottom:4px">${escHtml(id)} — ${escHtml(aircraft)}</div>`);

  // Segment type badge
  const badges: Record<string, { label: string; icon: string; color: string }> = {
    'waiting':         { label: 'Waiting',           icon: '\u23F3', color: '#f87171' },
    'placed':          { label: 'Placed',            icon: '\u2705', color: kind === 'manual' ? '#60a5fa' : '#34d399' },
    'departure-delay': { label: 'Departure Delayed', icon: '\uD83D\uDD34', color: '#fb923c' },
    'failed':          { label: 'Failed',            icon: '\u274C', color: '#dc2626' },
  };
  const badge = badges[type] ?? { label: type, icon: '', color: '#94a3b8' };
  parts.push(
    `<div style="margin-top:4px"><span style="color:${badge.color};font-weight:500">${badge.icon} ${badge.label}</span>` +
    `<span style="color:#64748b;margin-left:8px">${escHtml(duration)}</span></div>`
  );

  // Reason (for waiting / departure-delay / failed)
  if (reason) {
    parts.push(
      `<div style="margin-top:6px;padding:4px 6px;background:rgba(100,116,139,0.15);border-radius:4px;color:#cbd5e1;white-space:pre-wrap;word-break:break-word">${escHtml(reason)}</div>`
    );
  }

  // Bay set and door (for placed)
  if (type === 'placed' && bays) {
    parts.push(`<div style="color:#64748b;margin-top:4px">Bays: ${escHtml(bays)}</div>`);
    if (door) {
      parts.push(`<div style="color:#64748b">Door: ${escHtml(door)}</div>`);
    }
  }

  // Conflicts
  if (hasConflicts) {
    parts.push(`<div style="color:#f87171;margin-top:4px;font-weight:500">Has conflicts</div>`);
  }

  return parts.join('');
}

// ── Legend ───────────────────────────────────────────────────────────

function renderLegend(hasFailed: boolean, hasWaiting: boolean, hasDepartureDelay: boolean): string {
  const items: string[] = [];

  // Manual (solid blue)
  items.push(`
    <div class="flex items-center gap-2">
      <span class="w-4 h-4 rounded" style="background:rgba(59,130,246,0.85)"></span>
      <span class="text-slate-400">Manual</span>
    </div>
  `);

  // Auto-scheduled (solid green)
  items.push(`
    <div class="flex items-center gap-2">
      <span class="w-4 h-4 rounded" style="background:rgba(16,185,129,0.85)"></span>
      <span class="text-slate-400">Auto-scheduled</span>
    </div>
  `);

  // Waiting (red hatching) — only if relevant
  if (hasWaiting) {
    items.push(`
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4" viewBox="0 0 16 16">
          <defs>
            <pattern id="legend-hatch-wait" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
              <rect width="4" height="4" fill="rgba(239,68,68,0.12)"/>
              <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(239,68,68,0.6)" stroke-width="1.5"/>
            </pattern>
          </defs>
          <rect width="16" height="16" rx="3" fill="url(#legend-hatch-wait)" stroke="rgba(239,68,68,0.35)" stroke-width="1"/>
        </svg>
        <span class="text-slate-400">Waiting (requested but not yet placed)</span>
      </div>
    `);
  }

  // Departure delay (orange hatching) — only if relevant
  if (hasDepartureDelay) {
    items.push(`
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4" viewBox="0 0 16 16">
          <defs>
            <pattern id="legend-hatch-delay" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
              <rect width="4" height="4" fill="rgba(249,115,22,0.12)"/>
              <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(249,115,22,0.7)" stroke-width="1.5"/>
            </pattern>
          </defs>
          <rect width="16" height="16" rx="3" fill="url(#legend-hatch-delay)" stroke="rgba(249,115,22,0.45)" stroke-width="1"/>
        </svg>
        <span class="text-slate-400">Departure delayed (exit blocked)</span>
      </div>
    `);
  }

  // Failed (dark red hatching) — only if relevant
  if (hasFailed) {
    items.push(`
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4" viewBox="0 0 16 16">
          <defs>
            <pattern id="legend-hatch-fail" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
              <rect width="4" height="4" fill="rgba(220,38,38,0.15)"/>
              <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(220,38,38,0.8)" stroke-width="2"/>
            </pattern>
          </defs>
          <rect width="16" height="16" rx="3" fill="url(#legend-hatch-fail)" stroke="rgba(220,38,38,0.55)" stroke-width="1"/>
        </svg>
        <span class="text-slate-400">Failed (could not place in window)</span>
      </div>
    `);
  }

  return `
    <div class="flex flex-wrap items-center gap-4 text-sm">
      ${items.join('')}
    </div>
  `;
}

// ── Utilities ───────────────────────────────────────────────────────

function emptyState(): string {
  return `
    <div class="text-center py-12">
      <svg class="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      <p class="text-slate-500">No inductions to display</p>
    </div>
  `;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDurationMs(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function generateTimeMarkers(minTime: number, maxTime: number): string[] {
  const span = maxTime - minTime;
  const markers: string[] = [];
  for (let i = 0; i <= 4; i++) {
    markers.push(formatDateTime(new Date(minTime + (span * i) / 4)));
  }
  return markers;
}

function getReasonMessage(ruleId: string, evidence: Record<string, any>): string {
  switch (ruleId) {
    case 'SFR16_TIME_OVERLAP':
      return 'Time slot blocked by another aircraft';
    case 'SFR11_DOOR_FIT':
      return 'Aircraft too large for hangar doors';
    case 'NO_SUITABLE_BAY_SET':
      return 'No bay configuration fits this aircraft';
    case 'STRUCTURALLY_INFEASIBLE':
      return 'No feasible placement exists';
    case 'SIM_DEADLINE_EXCEEDED':
      return 'Deadline expired before placement';
    case 'INVALID_AIRCRAFT_REF':
      return 'Invalid aircraft reference';
    default:
      return `Scheduling failed: ${ruleId}`;
  }
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
