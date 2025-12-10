import type { ParseResponse } from '../types/api';

export function renderDiagnostics(data: ParseResponse): string {
  if (!data.diagnostics || data.diagnostics.length === 0) {
    return `
      <div class="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
          </svg>
          <p class="text-green-800 font-semibold">Model parsed successfully!</p>
        </div>
      </div>
    `;
  }
  
  return `
    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
      <div class="flex items-start gap-2 mb-2">
        <svg class="w-5 h-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
        </svg>
        <div class="flex-1">
          <h3 class="font-semibold text-yellow-800 mb-1">Validation Issues</h3>
          <ul class="space-y-1">
            ${data.diagnostics.map(d => `
              <li class="text-sm text-yellow-700 flex items-start gap-2">
                <span class="font-mono text-yellow-600">Line ${d.line}:</span>
                <span>${d.message}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    </div>
  `;
}