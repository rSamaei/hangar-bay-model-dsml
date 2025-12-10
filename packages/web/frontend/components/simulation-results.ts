import type { SimulateResponse, SimulationData, SchedulingData } from '../types/api';

export function renderSimulationResults(data: SimulateResponse): string {
  if (!data.simulation) return '<p class="text-gray-400 text-center py-8">No simulation data</p>';
  
  let html = '<div class="space-y-6">';
  
  if (data.scheduling) {
    html += renderScheduling(data.scheduling);
  }
  
  html += renderConflicts(data.simulation.conflicts);
  html += renderOccupancy(data.simulation.maxOccupancy);
  
  html += '</div>';
  return html;
}

function renderScheduling(scheduling: SchedulingData): string {
  return `
    <div class="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-4 border border-purple-100">
      <div class="flex items-center gap-2 mb-3">
        <svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
        </svg>
        <h3 class="font-semibold text-gray-900">Auto-Scheduling</h3>
      </div>
      
      <div class="bg-white rounded-lg p-4 border border-green-200 mb-3">
        <div class="flex items-center gap-2 mb-2">
          <svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
          </svg>
          <p class="text-sm font-semibold text-green-800">Scheduled: ${scheduling.scheduled.length} aircraft</p>
        </div>
        <div class="space-y-1">
          ${scheduling.scheduled.map(s => `
            <div class="text-sm text-gray-700 pl-7 font-mono">
              ${s.aircraft} → ${s.hangar} <span class="text-purple-600">bays ${s.fromBay}..${s.toBay}</span> <span class="text-gray-500">at t=${s.start} for ${s.duration}</span>
            </div>
          `).join('')}
        </div>
      </div>
      
      ${scheduling.unscheduled.length > 0 ? `
        <div class="bg-white rounded-lg p-4 border border-yellow-200">
          <div class="flex items-center gap-2 mb-2">
            <svg class="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
            </svg>
            <p class="text-sm font-semibold text-yellow-800">Could not schedule: ${scheduling.unscheduled.length} aircraft</p>
          </div>
          <div class="space-y-1">
            ${scheduling.unscheduled.map(u => `
              <div class="text-sm text-gray-700 pl-7">${u.aircraft} <span class="text-gray-500">(${u.duration} slots)</span></div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderConflicts(conflicts: SimulationData['conflicts']): string {
  return `
    <div class="bg-gradient-to-br from-gray-50 to-slate-50 rounded-lg p-4 border border-gray-200">
      <div class="flex items-center gap-2 mb-3">
        <svg class="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <h3 class="font-semibold text-gray-900">Simulation Results</h3>
      </div>
      
      ${conflicts.length > 0 ? `
        <div class="bg-white rounded-lg p-4 border border-red-200">
          <div class="flex items-center gap-2 mb-2">
            <svg class="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
            </svg>
            <p class="text-sm font-semibold text-red-800">Found ${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''}</p>
          </div>
          <div class="space-y-1">
            ${conflicts.map(c => `
              <div class="text-sm text-gray-700 pl-7">
                <span class="text-red-600 font-mono">Time ${c.time}:</span> ${c.aircraft} in ${c.hangarName} <span class="text-purple-600">bays ${c.fromBay}..${c.toBay}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : `
        <div class="bg-white rounded-lg p-4 border border-green-200">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
            </svg>
            <p class="text-sm font-semibold text-green-800">No conflicts detected</p>
          </div>
        </div>
      `}
    </div>
  `;
}

function renderOccupancy(maxOccupancy: Record<string, number>): string {
  return `
    <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-100">
      <div class="flex items-center gap-2 mb-3">
        <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path>
        </svg>
        <h3 class="font-semibold text-gray-900">Max Bay Occupancy</h3>
      </div>
      <div class="grid grid-cols-2 gap-3">
        ${Object.entries(maxOccupancy).map(([hangar, count]) => `
          <div class="bg-white rounded-lg p-3 border border-indigo-200">
            <div class="text-sm text-gray-600 mb-1">${hangar}</div>
            <div class="text-2xl font-bold text-indigo-600">${count} <span class="text-sm text-gray-500">bays</span></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}