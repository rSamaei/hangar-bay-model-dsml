import { router } from '../router';
import { isLoggedIn } from '../services/auth';
import { getSchedule, type ScheduleResult, type ScheduledPlacement } from '../services/scheduling-api';
import { renderTimeline } from './timeline';
import { createNavbar } from './navbar';
import type { ExportModel, ExportedInduction, ExportedUnscheduledAuto } from '../types/api';

let scheduleResult: ScheduleResult = { entries: [], placements: [], validationErrors: [] };

export function createTimelinePage(): string {
  if (!isLoggedIn()) {
    setTimeout(() => router.navigate('login'), 0);
    return '<div class="min-h-screen bg-slate-900"></div>';
  }

  return `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      ${createNavbar('timeline')}
      <main class="container mx-auto px-6 py-8">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-3xl font-bold text-white mb-2">Schedule Timeline</h1>
            <p class="text-slate-400">Visual timeline of all scheduled aircraft placements</p>
          </div>
          <div class="flex gap-3">
            <button id="back-to-schedule" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
              </svg>
              Back to Dashboard
            </button>
            <button id="refresh-timeline" class="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
              Refresh
            </button>
          </div>
        </div>

        <!-- Timeline Container -->
        <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <div id="timeline-container">
            <div class="flex items-center justify-center py-12">
              <svg class="w-8 h-8 animate-spin text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
              <span class="ml-3 text-slate-400">Loading timeline...</span>
            </div>
          </div>
        </div>

        <!-- Schedule Summary -->
        <div class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-slate-800/30 border border-slate-700 rounded-xl p-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div>
                <p class="text-sm text-slate-400">Scheduled</p>
                <p id="scheduled-count" class="text-2xl font-bold text-white">-</p>
              </div>
            </div>
          </div>
          <div class="bg-slate-800/30 border border-slate-700 rounded-xl p-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <div>
                <p class="text-sm text-slate-400">Failed</p>
                <p id="failed-count" class="text-2xl font-bold text-white">-</p>
              </div>
            </div>
          </div>
          <div class="bg-slate-800/30 border border-slate-700 rounded-xl p-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
                </svg>
              </div>
              <div>
                <p class="text-sm text-slate-400">Hangars Used</p>
                <p id="hangars-count" class="text-2xl font-bold text-white">-</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Validation Errors -->
        <div id="validation-errors" class="hidden mt-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <h3 class="text-red-400 font-semibold mb-2">Validation Issues</h3>
          <ul id="error-list" class="text-sm text-red-300 space-y-1"></ul>
        </div>
      </main>
    </div>
  `;
}

// Convert schedule placements to the ExportModel format expected by the timeline component
function convertToExportModel(result: ScheduleResult): ExportModel {
  const inductions: ExportedInduction[] = [];
  const unscheduled: ExportedUnscheduledAuto[] = [];

  for (const placement of result.placements) {
    if (placement.status === 'scheduled' && placement.hangar) {
      inductions.push({
        id: `entry_${placement.entryId}`,
        aircraft: placement.aircraftName,
        hangar: placement.hangar,
        bays: placement.bays,
        start: placement.start,
        end: placement.end,
        conflicts: [],
        kind: 'auto'
      });
    } else {
      unscheduled.push({
        id: `entry_${placement.entryId}`,
        aircraft: placement.aircraftName,
        preferredHangar: null,
        duration: 0,
        reasonRuleId: 'SCHEDULING_FAILED',
        reasonMessage: placement.failureReason || 'Could not find suitable placement',
        evidence: {
          requestedWindow: {
            start: placement.start,
            end: placement.end
          }
        }
      });
    }
  }

  return {
    airfield: 'User Schedule',
    aircraft: [],
    hangars: [],
    inductions,
    autoSchedule: {
      scheduled: [],
      unscheduled
    }
  };
}

function renderTimelineView(): void {
  const container = document.getElementById('timeline-container');
  if (!container) return;

  if (scheduleResult.placements.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12">
        <svg class="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <p class="text-slate-400 mb-4">No scheduled aircraft to display</p>
        <button id="go-to-dashboard" class="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors">
          Go to Dashboard
        </button>
      </div>
    `;

    document.getElementById('go-to-dashboard')?.addEventListener('click', () => {
      router.navigate('dashboard');
    });
    return;
  }

  const exportModel = convertToExportModel(scheduleResult);
  container.innerHTML = renderTimeline(exportModel);
}

function updateStats(): void {
  const scheduled = scheduleResult.placements.filter(p => p.status === 'scheduled');
  const failed = scheduleResult.placements.filter(p => p.status === 'failed');
  const hangars = new Set(scheduled.map(p => p.hangar).filter(Boolean));

  const scheduledCount = document.getElementById('scheduled-count');
  const failedCount = document.getElementById('failed-count');
  const hangarsCount = document.getElementById('hangars-count');

  if (scheduledCount) scheduledCount.textContent = String(scheduled.length);
  if (failedCount) failedCount.textContent = String(failed.length);
  if (hangarsCount) hangarsCount.textContent = String(hangars.size);
}

function renderValidationErrors(): void {
  const container = document.getElementById('validation-errors');
  const list = document.getElementById('error-list');
  if (!container || !list) return;

  if (scheduleResult.validationErrors.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  list.innerHTML = scheduleResult.validationErrors.map(err => `<li>${err}</li>`).join('');
}

async function loadData(): Promise<void> {
  try {
    scheduleResult = await getSchedule();
    renderTimelineView();
    updateStats();
    renderValidationErrors();
  } catch (error) {
    console.error('Failed to load schedule:', error);
    const container = document.getElementById('timeline-container');
    if (container) {
      container.innerHTML = `
        <div class="text-center py-12">
          <svg class="w-12 h-12 mx-auto text-red-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-red-400">Failed to load schedule data</p>
        </div>
      `;
    }
  }
}

export async function attachTimelinePageListeners(): Promise<void> {
  document.getElementById('back-to-schedule')?.addEventListener('click', () => {
    router.navigate('dashboard');
  });

  document.getElementById('refresh-timeline')?.addEventListener('click', async () => {
    const container = document.getElementById('timeline-container');
    if (container) {
      container.innerHTML = `
        <div class="flex items-center justify-center py-12">
          <svg class="w-8 h-8 animate-spin text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
          <span class="ml-3 text-slate-400">Refreshing...</span>
        </div>
      `;
    }
    await loadData();
  });

  // Load initial data
  await loadData();
}
