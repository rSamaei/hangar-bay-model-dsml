import type { ExportModel, ExportedInduction } from '../types/api';

function renderOccupancyByHangar(inductions: ExportedInduction[]): string {
  // Calculate max bay usage per hangar
  const hangarBayUsage = new Map<string, number>();
  for (const ind of inductions) {
    const current = hangarBayUsage.get(ind.hangar) || 0;
    hangarBayUsage.set(ind.hangar, Math.max(current, ind.bays.length));
  }

  if (hangarBayUsage.size === 0) {
    return '<p class="text-gray-500">No hangars used</p>';
  }

  return Array.from(hangarBayUsage.entries()).map(([hangar, max]) => `
    <div class="bg-gray-50 p-3 rounded-lg">
      <div class="flex justify-between items-center">
        <span class="font-medium text-gray-700">${hangar}</span>
        <span class="text-lg font-bold text-blue-600">${max} bay${max !== 1 ? 's' : ''}</span>
      </div>
    </div>
  `).join('');
}

export function renderSimulationResults(exportModel: ExportModel): string {
  if (!exportModel) {
    return '<div class="text-red-600">No analysis data available</div>';
  }

  const { inductions = [], autoSchedule } = exportModel;

  // Find inductions with conflicts
  const conflictingInductions = inductions.filter(i => i.conflicts.length > 0);
  const hasConflicts = conflictingInductions.length > 0;

  // Get auto-scheduled info
  const scheduled = autoSchedule?.scheduled || [];
  const unscheduled = autoSchedule?.unscheduled || [];

  return `
    <div class="space-y-6">
      <h2 class="text-2xl font-bold text-gray-800">Analysis Results</h2>

      ${hasConflicts ? `
        <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
          <h3 class="font-semibold text-red-800 mb-2">Conflicts Detected</h3>
          ${renderConflicts(conflictingInductions)}
        </div>
      ` : `
        <div class="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg">
          <p class="text-green-800 font-semibold">No conflicts detected</p>
        </div>
      `}

      <div>
        <h3 class="text-lg font-semibold mb-3 text-gray-700">Maximum Bay Occupancy</h3>
        ${renderOccupancyByHangar(inductions)}
      </div>

      <div>
        <h3 class="text-lg font-semibold mb-3 text-gray-700">Manual Inductions (${inductions.filter(i => i.kind === 'manual').length})</h3>
        ${renderInductions(inductions.filter(i => i.kind === 'manual'))}
      </div>

      ${scheduled.length > 0 ? `
        <div>
          <h3 class="text-lg font-semibold mb-3 text-gray-700">Auto-Scheduled Inductions (${scheduled.length})</h3>
          ${renderInductions(scheduled)}
        </div>
      ` : ''}

      ${unscheduled.length > 0 ? `
        <div class="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-lg">
          <h3 class="font-semibold text-yellow-800 mb-2">Unscheduled Aircraft (${unscheduled.length})</h3>
          ${renderUnscheduled(unscheduled)}
        </div>
      ` : ''}
    </div>
  `;
}

function renderConflicts(conflictingInductions: ExportedInduction[]): string {
  return conflictingInductions.map(ind => `
    <div class="mb-2 pl-4">
      <p><strong>Induction:</strong> ${ind.id} (${ind.aircraft})</p>
      <p><strong>Bays:</strong> ${ind.bays.join(', ')}</p>
      <p><strong>Conflicts with:</strong> ${ind.conflicts.join(', ')}</p>
      <p class="text-sm text-gray-600">
        ${new Date(ind.start).toLocaleString()} - ${new Date(ind.end).toLocaleString()}
      </p>
    </div>
  `).join('');
}

function renderInductions(inductions: ExportedInduction[]): string {
  if (inductions.length === 0) {
    return '<p class="text-gray-500">None</p>';
  }

  return inductions.map(ind => `
    <div class="bg-blue-50 p-3 rounded-lg mb-2 ${ind.conflicts.length > 0 ? 'border-l-4 border-red-400' : ''}">
      <p><strong>${ind.id}</strong>: ${ind.aircraft} → ${ind.hangar}</p>
      <p class="text-sm text-gray-600">Bays: ${ind.bays.join(', ')}</p>
      <p class="text-sm text-gray-600">
        ${new Date(ind.start).toLocaleString()} - ${new Date(ind.end).toLocaleString()}
      </p>
      <p class="text-xs text-gray-500">
        Effective: wingspan ${ind.derived.wingspanEff.toFixed(1)}m,
        length ${ind.derived.lengthEff.toFixed(1)}m,
        requires ${ind.derived.baysRequired} bay(s)
      </p>
      ${ind.conflicts.length > 0 ? `
        <p class="text-xs text-red-600 mt-1">Conflicts with: ${ind.conflicts.join(', ')}</p>
      ` : ''}
    </div>
  `).join('');
}

function renderUnscheduled(unscheduled: any[]): string {
  return unscheduled.map(u => `
    <div class="pl-4 mb-2">
      <p><strong>${u.aircraft}</strong></p>
      <p class="text-sm text-gray-600">Reason: ${u.reasonRuleId}</p>
      ${u.preferredHangar ? `<p class="text-sm text-gray-600">Preferred: ${u.preferredHangar}</p>` : ''}
    </div>
  `).join('');
}