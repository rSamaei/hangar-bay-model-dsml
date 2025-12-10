import type { ParseResponse } from '../types/api';

export function renderModelInfo(data: ParseResponse): string {
  if (!data.model) return '<p class="text-gray-400 text-center py-8">No model data</p>';
  
  const { model } = data;
  
  return `
    <div class="space-y-6">
      <div class="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-4 border border-purple-100">
        <h3 class="font-bold text-lg text-gray-900 mb-1">${model.name}</h3>
        <p class="text-sm text-gray-600">Airfield Configuration</p>
      </div>
      
      <div>
        <div class="flex items-center gap-2 mb-3">
          <svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
          </svg>
          <h4 class="font-semibold text-gray-700">Aircraft Types</h4>
          <span class="ml-auto bg-purple-100 text-purple-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">${model.aircraftTypes.length}</span>
        </div>
        <ul class="space-y-2">
          ${model.aircraftTypes.map(ac => `
            <li class="bg-gray-50 rounded-lg p-3 border border-gray-200 hover:border-purple-300 transition-colors">
              <div class="flex items-center justify-between">
                <span class="font-medium text-gray-900">${ac.name}</span>
                <span class="text-sm text-gray-600">Wingspan: <span class="font-semibold text-purple-600">${ac.wingspan}m</span></span>
              </div>
            </li>
          `).join('')}
        </ul>
      </div>
      
      <div>
        <div class="flex items-center gap-2 mb-3">
          <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
          </svg>
          <h4 class="font-semibold text-gray-700">Hangars</h4>
          <span class="ml-auto bg-indigo-100 text-indigo-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">${model.hangars.length}</span>
        </div>
        <ul class="space-y-2">
          ${model.hangars.map(h => `
            <li class="bg-gray-50 rounded-lg p-3 border border-gray-200 hover:border-indigo-300 transition-colors">
              <div class="flex items-center justify-between mb-1">
                <span class="font-medium text-gray-900">${h.name}</span>
              </div>
              <div class="flex gap-4 text-sm text-gray-600">
                <span>Bays: <span class="font-semibold text-indigo-600">${h.bays}</span></span>
                <span>Width: <span class="font-semibold">${h.bayWidth}m</span></span>
              </div>
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
  `;
}