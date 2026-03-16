import { router } from '../router';
import { isLoggedIn } from '../services/auth';
import { getAircraft, type Aircraft } from '../services/aircraft-api';
import {
  getSchedule,
  addScheduleEntry,
  deleteScheduleEntry,
  clearSchedule,
  type ScheduleResult,
  type ScheduledPlacement,
} from '../services/scheduling-api';
import { createNavbar } from './navbar';

let aircraftList: Aircraft[] = [];
let scheduleResult: ScheduleResult | null = null;

export function createSchedulePage(): string {
  if (!isLoggedIn()) {
    setTimeout(() => router.navigate('login'), 0);
    return '<div class="min-h-screen bg-slate-900"></div>';
  }

  return `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      ${createNavbar('schedule')}
      <main class="container mx-auto px-6 py-8">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-3xl font-bold text-white mb-2">Schedule</h1>
            <p class="text-slate-400">Add aircraft to the schedule and let the engine compute optimal placements</p>
          </div>
          <div class="flex gap-3">
            <button id="clear-schedule-btn" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors text-sm">
              Clear All
            </button>
            <button id="view-timeline-btn" class="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2 text-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
              View Timeline
            </button>
          </div>
        </div>

        <!-- Add Entry Form -->
        <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
          <h2 class="text-lg font-semibold text-white mb-4">Add Schedule Entry</h2>
          <div id="add-entry-form" class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">Aircraft</label>
              <select id="entry-aircraft" class="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500">
                <option value="">Loading...</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">Start Time</label>
              <input type="datetime-local" id="entry-start" class="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">End Time</label>
              <input type="datetime-local" id="entry-end" class="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500" />
            </div>
            <div>
              <button id="add-entry-btn" class="w-full px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-medium rounded-lg transition-all">
                Add Entry
              </button>
            </div>
          </div>
          <div id="entry-error" class="hidden mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3"></div>
        </div>

        <!-- Schedule Entries -->
        <div id="schedule-entries" class="bg-slate-800/50 border border-slate-700 rounded-xl">
          <div class="flex items-center justify-center py-12">
            <svg class="w-8 h-8 animate-spin text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            <span class="ml-3 text-slate-400">Loading schedule...</span>
          </div>
        </div>
      </main>
    </div>
  `;
}

function formatDatetimeForDisplay(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch {
    return iso;
  }
}

function getPlacementForEntry(entryId: number): ScheduledPlacement | undefined {
  return scheduleResult?.placements.find(p => p.entryId === entryId);
}

function renderPlacementBadge(placement: ScheduledPlacement | undefined): string {
  if (!placement) {
    return '<span class="px-2 py-1 text-xs rounded-full bg-slate-700 text-slate-400">Pending</span>';
  }
  if (placement.status === 'scheduled') {
    const bays = placement.bays.join(', ');
    return `<span class="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400">${placement.hangar} &rsaquo; ${bays}</span>`;
  }
  const reason = placement.failureReason || 'Could not place';
  return `<span class="px-2 py-1 text-xs rounded-full bg-red-500/20 text-red-400" title="${reason}">Failed</span>`;
}

function renderScheduleEntries(): void {
  const container = document.getElementById('schedule-entries');
  if (!container) return;

  const entries = scheduleResult?.entries ?? [];

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12">
        <svg class="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
        </svg>
        <p class="text-slate-400 mb-1">No schedule entries yet</p>
        <p class="text-sm text-slate-500">Use the form above to add aircraft to the schedule</p>
      </div>
    `;
    return;
  }

  const scheduled = scheduleResult?.placements.filter(p => p.status === 'scheduled').length ?? 0;
  const failed = scheduleResult?.placements.filter(p => p.status === 'failed').length ?? 0;

  container.innerHTML = `
    <div class="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
      <h2 class="text-lg font-semibold text-white">${entries.length} Entries</h2>
      <div class="flex gap-3 text-sm">
        <span class="text-green-400">${scheduled} placed</span>
        ${failed > 0 ? `<span class="text-red-400">${failed} failed</span>` : ''}
      </div>
    </div>
    <div class="divide-y divide-slate-700/50">
      <!-- Header -->
      <div class="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
        <div class="col-span-3">Aircraft</div>
        <div class="col-span-3">Start</div>
        <div class="col-span-3">End</div>
        <div class="col-span-2">Placement</div>
        <div class="col-span-1"></div>
      </div>
      ${entries.map(entry => {
        const placement = getPlacementForEntry(entry.id);
        return `
          <div class="grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-slate-800/50 transition-colors">
            <div class="col-span-3">
              <span class="text-white font-medium">${entry.aircraft_name}</span>
              <span class="text-slate-500 text-xs ml-1">(${entry.wingspan}m)</span>
            </div>
            <div class="col-span-3 text-sm text-slate-300">${formatDatetimeForDisplay(entry.start_time)}</div>
            <div class="col-span-3 text-sm text-slate-300">${formatDatetimeForDisplay(entry.end_time)}</div>
            <div class="col-span-2">${renderPlacementBadge(placement)}</div>
            <div class="col-span-1 text-right">
              <button data-delete-entry="${entry.id}" class="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Delete entry">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Attach delete handlers
  container.querySelectorAll('[data-delete-entry]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt((btn as HTMLElement).dataset.deleteEntry!, 10);
      try {
        scheduleResult = await deleteScheduleEntry(id);
        renderScheduleEntries();
      } catch (err: any) {
        console.error('Failed to delete entry:', err);
      }
    });
  });
}

function populateAircraftDropdown(): void {
  const select = document.getElementById('entry-aircraft') as HTMLSelectElement | null;
  if (!select) return;

  if (aircraftList.length === 0) {
    select.innerHTML = '<option value="">No aircraft defined</option>';
    return;
  }

  select.innerHTML = `
    <option value="">Select aircraft...</option>
    ${aircraftList.map(a => `<option value="${a.id}">${a.name} (${a.wingspan}m wingspan)</option>`).join('')}
  `;
}

function getDefaultDatetime(hoursOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8 + hoursOffset, 0, 0, 0);
  // Format as YYYY-MM-DDTHH:MM for datetime-local input
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showError(msg: string): void {
  const el = document.getElementById('entry-error');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function hideError(): void {
  const el = document.getElementById('entry-error');
  if (el) {
    el.classList.add('hidden');
  }
}

export async function attachSchedulePageListeners(): Promise<void> {
  // Set default datetime values
  const startInput = document.getElementById('entry-start') as HTMLInputElement | null;
  const endInput = document.getElementById('entry-end') as HTMLInputElement | null;
  if (startInput) startInput.value = getDefaultDatetime(0);
  if (endInput) endInput.value = getDefaultDatetime(2);

  // Load data in parallel
  try {
    const [aircraft, schedule] = await Promise.all([
      getAircraft(),
      getSchedule(),
    ]);
    aircraftList = aircraft;
    scheduleResult = schedule;
  } catch (err: any) {
    console.error('Failed to load schedule data:', err);
    aircraftList = [];
    scheduleResult = { entries: [], placements: [], validationErrors: [] };
  }

  populateAircraftDropdown();
  renderScheduleEntries();

  // Add entry handler
  document.getElementById('add-entry-btn')?.addEventListener('click', async () => {
    hideError();

    const aircraftSelect = document.getElementById('entry-aircraft') as HTMLSelectElement | null;
    const aircraftId = parseInt(aircraftSelect?.value || '', 10);
    const startTime = startInput?.value || '';
    const endTime = endInput?.value || '';

    if (!aircraftId) {
      showError('Please select an aircraft.');
      return;
    }
    if (!startTime || !endTime) {
      showError('Please specify both start and end times.');
      return;
    }
    if (new Date(startTime) >= new Date(endTime)) {
      showError('Start time must be before end time.');
      return;
    }

    try {
      scheduleResult = await addScheduleEntry({
        aircraftId,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
      });
      renderScheduleEntries();
      // Reset times for next entry (shift forward by duration)
      const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
      if (endInput) {
        const newStart = endTime;
        const newEnd = new Date(new Date(endTime).getTime() + durationMs);
        const pad = (n: number) => String(n).padStart(2, '0');
        startInput!.value = newStart;
        endInput.value = `${newEnd.getFullYear()}-${pad(newEnd.getMonth() + 1)}-${pad(newEnd.getDate())}T${pad(newEnd.getHours())}:${pad(newEnd.getMinutes())}`;
      }
    } catch (err: any) {
      showError(err.message || 'Failed to add entry.');
    }
  });

  // Clear all handler
  document.getElementById('clear-schedule-btn')?.addEventListener('click', async () => {
    if (scheduleResult?.entries.length === 0) return;
    try {
      scheduleResult = await clearSchedule();
      renderScheduleEntries();
    } catch (err: any) {
      console.error('Failed to clear schedule:', err);
    }
  });

  // View timeline handler
  document.getElementById('view-timeline-btn')?.addEventListener('click', () => {
    router.navigate('timeline');
  });
}
