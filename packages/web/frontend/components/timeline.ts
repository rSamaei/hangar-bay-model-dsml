import type { ExportModel, ExportedInduction, ExportedUnscheduledAuto } from '../types/api';

interface ConflictMarker {
  id: string;
  aircraft: string;
  hangar: string;
  startTime: number;
  endTime: number;
  conflictingWith: string[];
  reason: string;
}

export function renderTimeline(exportModel: ExportModel): string {
  const { inductions } = exportModel;
  const unscheduled = exportModel.autoSchedule?.unscheduled ?? [];

  if (inductions.length === 0 && unscheduled.length === 0) {
    return `
      <div class="text-center py-12">
        <svg class="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <p class="text-slate-500">No inductions to display</p>
      </div>
    `;
  }

  // Group by hangar
  const byHangar = new Map<string, ExportedInduction[]>();
  for (const ind of inductions) {
    if (!byHangar.has(ind.hangar)) {
      byHangar.set(ind.hangar, []);
    }
    byHangar.get(ind.hangar)!.push(ind);
  }

  // Extract conflict markers from unscheduled items
  const conflictMarkers: ConflictMarker[] = [];
  for (const unsched of unscheduled) {
    // Find time overlap conflicts with specific time windows
    const evidence = unsched.evidence as Record<string, any>;
    if (evidence?.requestedWindow?.start && evidence?.requestedWindow?.end) {
      conflictMarkers.push({
        id: unsched.id,
        aircraft: unsched.aircraft,
        hangar: evidence.hangar ?? unsched.preferredHangar ?? 'Unknown',
        startTime: new Date(evidence.requestedWindow.start).getTime(),
        endTime: new Date(evidence.requestedWindow.end).getTime(),
        conflictingWith: evidence.conflictingInductions ?? [],
        reason: getReasonMessage(unsched.reasonRuleId, evidence)
      });
    } else if (unsched.preferredHangar) {
      // For other failure types, show as a marker at a default position
      conflictMarkers.push({
        id: unsched.id,
        aircraft: unsched.aircraft,
        hangar: unsched.preferredHangar,
        startTime: 0, // Will be positioned at start
        endTime: 0,
        conflictingWith: [],
        reason: getReasonMessage(unsched.reasonRuleId, evidence)
      });
    }
  }

  // Group conflict markers by hangar
  const conflictsByHangar = new Map<string, ConflictMarker[]>();
  for (const marker of conflictMarkers) {
    if (!conflictsByHangar.has(marker.hangar)) {
      conflictsByHangar.set(marker.hangar, []);
    }
    conflictsByHangar.get(marker.hangar)!.push(marker);
  }

  // Ensure all hangars with conflicts are in the main hangar map
  for (const hangar of conflictsByHangar.keys()) {
    if (!byHangar.has(hangar)) {
      byHangar.set(hangar, []);
    }
  }

  // Calculate timeline bounds
  const allTimes = inductions.flatMap(i => [
    new Date(i.start).getTime(),
    new Date(i.end).getTime()
  ]);
  const minTime = Math.min(...allTimes);
  const maxTime = Math.max(...allTimes);
  const timeSpan = maxTime - minTime || 1; // Prevent division by zero

  // Generate time markers
  const timeMarkers = generateTimeMarkers(minTime, maxTime);

  return `
    <div class="space-y-4">
      <!-- Legend -->
      <div class="flex flex-wrap items-center gap-4 text-sm">
        <div class="flex items-center gap-2">
          <span class="w-4 h-4 rounded bg-blue-500"></span>
          <span class="text-slate-400">Manual</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-4 rounded bg-emerald-500"></span>
          <span class="text-slate-400">Auto-scheduled</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-4 rounded bg-red-500 ring-2 ring-red-400"></span>
          <span class="text-slate-400">Has Conflicts</span>
        </div>
        ${conflictMarkers.length > 0 ? `
        <div class="flex items-center gap-2">
          <span class="w-4 h-4 rounded border-2 border-dashed border-orange-500 bg-orange-500/20"></span>
          <span class="text-slate-400">Conflict (blocked)</span>
        </div>
        ` : ''}
      </div>

      <!-- Timeline Container -->
      <div class="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <!-- Time Axis -->
        <div class="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700/50 text-xs text-slate-500">
          ${timeMarkers.map(marker => `<span>${marker}</span>`).join('')}
        </div>

        <!-- Hangar Lanes -->
        <div class="divide-y divide-slate-700/30">
          ${Array.from(byHangar.entries()).map(([hangar, inds]) => `
            <div class="flex items-stretch">
              <!-- Hangar Label -->
              <div class="w-32 flex-shrink-0 px-4 py-4 bg-slate-800/30 border-r border-slate-700/50 flex items-center">
                <span class="font-medium text-slate-300 text-sm truncate">${hangar}</span>
              </div>

              <!-- Timeline Track -->
              <div class="flex-1 relative h-16 bg-slate-900/30">
                <!-- Grid Lines -->
                <div class="absolute inset-0 flex">
                  ${[0, 25, 50, 75, 100].map(pct => `
                    <div class="flex-1 border-r border-slate-700/20 last:border-r-0"></div>
                  `).join('')}
                </div>

                <!-- Induction Bars -->
                ${inds.map(ind => {
                  const start = new Date(ind.start).getTime();
                  const end = new Date(ind.end).getTime();
                  const left = ((start - minTime) / timeSpan) * 100;
                  const width = Math.max(((end - start) / timeSpan) * 100, 2); // Minimum width of 2%
                  const hasConflicts = ind.conflicts.length > 0;

                  const barColors = hasConflicts
                    ? 'bg-red-500/80 ring-2 ring-red-400/50'
                    : ind.kind === 'manual'
                      ? 'bg-blue-500/80 hover:bg-blue-400/80'
                      : 'bg-emerald-500/80 hover:bg-emerald-400/80';

                  return `
                    <div
                      class="absolute top-2 h-12 rounded-md ${barColors} cursor-pointer transition-all hover:scale-y-110 hover:z-10 shadow-lg group"
                      style="left: ${left}%; width: ${width}%;"
                    >
                      <!-- Bar Content -->
                      <div class="h-full flex items-center justify-center px-1 overflow-hidden">
                        <span class="text-xs font-medium text-white truncate">${ind.id}</span>
                      </div>

                      <!-- Tooltip -->
                      <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                        <div class="bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 text-xs whitespace-nowrap">
                          <div class="font-semibold text-white mb-1">${ind.id}</div>
                          <div class="text-slate-400">${ind.aircraft}</div>
                          <div class="text-slate-500 mt-1">Bays: ${ind.bays.join(', ')}</div>
                          <div class="text-slate-500">${formatTime(ind.start)} - ${formatTime(ind.end)}</div>
                          ${hasConflicts ? `<div class="text-red-400 mt-1 font-medium">Conflicts: ${ind.conflicts.join(', ')}</div>` : ''}
                          <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                            <div class="w-2 h-2 bg-slate-900 border-r border-b border-slate-700 rotate-45"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}

                <!-- Conflict Markers for Unscheduled Items -->
                ${(conflictsByHangar.get(hangar) ?? []).filter(m => m.startTime > 0).map(marker => {
                  const left = ((marker.startTime - minTime) / timeSpan) * 100;
                  const width = Math.max(((marker.endTime - marker.startTime) / timeSpan) * 100, 2);

                  return `
                    <div
                      class="absolute top-2 h-12 rounded-md border-2 border-dashed border-orange-500 bg-orange-500/10 cursor-pointer transition-all hover:bg-orange-500/20 hover:z-10 group"
                      style="left: ${left}%; width: ${width}%;"
                    >
                      <!-- Blocked indicator -->
                      <div class="h-full flex items-center justify-center px-1 overflow-hidden">
                        <svg class="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path>
                        </svg>
                      </div>

                      <!-- Tooltip -->
                      <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                        <div class="bg-slate-900 border border-orange-500/50 rounded-lg shadow-xl p-3 text-xs whitespace-nowrap max-w-xs">
                          <div class="font-semibold text-orange-400 mb-1">Conflict: ${marker.id}</div>
                          <div class="text-slate-400">${marker.aircraft}</div>
                          <div class="text-slate-500 mt-1">${new Date(marker.startTime).toLocaleTimeString()} - ${new Date(marker.endTime).toLocaleTimeString()}</div>
                          <div class="text-orange-300 mt-2 font-medium">${marker.reason}</div>
                          ${marker.conflictingWith.length > 0 ? `
                            <div class="text-slate-400 mt-1">Blocked by: ${marker.conflictingWith.join(', ')}</div>
                          ` : ''}
                          <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                            <div class="w-2 h-2 bg-slate-900 border-r border-b border-orange-500/50 rotate-45"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Summary -->
      <div class="flex items-center justify-between text-xs text-slate-500 px-2">
        <span>Start: ${new Date(minTime).toLocaleString()}</span>
        <span>End: ${new Date(maxTime).toLocaleString()}</span>
      </div>
    </div>
  `;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function generateTimeMarkers(minTime: number, maxTime: number): string[] {
  const timeSpan = maxTime - minTime;
  const markers: string[] = [];

  // Generate 5 markers (0%, 25%, 50%, 75%, 100%)
  for (let i = 0; i <= 4; i++) {
    const time = new Date(minTime + (timeSpan * i / 4));
    markers.push(time.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }));
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
    case 'INVALID_AIRCRAFT_REF':
      return 'Invalid aircraft reference';
    default:
      return `Scheduling failed: ${ruleId}`;
  }
}
