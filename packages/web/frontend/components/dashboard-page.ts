import { router } from '../router';
import { getUser, logout, isLoggedIn } from '../services/auth';
import { getAircraft } from '../services/aircraft-api';
import { getHangars } from '../services/hangars-api';
import { getSchedule, type ScheduleResult } from '../services/scheduling-api';

interface DashboardData {
  aircraftCount: number;
  hangarCount: number;
  inductionCount: number;
  autoInductionCount: number;
}

let dashboardData: DashboardData = {
  aircraftCount: 0,
  hangarCount: 0,
  inductionCount: 0,
  autoInductionCount: 0
};

export function createDashboardPage(): string {
  if (!isLoggedIn()) {
    setTimeout(() => router.navigate('login'), 0);
    return '<div class="min-h-screen bg-slate-900 flex items-center justify-center"><p class="text-white">Redirecting...</p></div>';
  }

  const user = getUser();

  return `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      ${createDashboardNavbar(user?.username || 'User')}
      <main class="container mx-auto px-6 py-8">
        <div class="mb-8">
          <h1 class="text-3xl font-bold text-white mb-2">Welcome, ${user?.username || 'User'}</h1>
          <p class="text-slate-400">Manage your aircraft, hangars, and scheduling</p>
        </div>

        <!-- Stats Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8" id="stats-grid">
          ${createStatCard('Aircraft', 'aircraft-count', '0', 'cyan', 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z')}
          ${createStatCard('Hangars', 'hangar-count', '0', 'blue', 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4')}
          ${createStatCard('Scheduled', 'induction-count', '0', 'indigo', 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z')}
          ${createStatCard('Unplaced', 'auto-count', '0', 'purple', 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z')}
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          ${createActionCard('Add Aircraft', 'Define a new aircraft with dimensions', 'aircraft-form', 'cyan', 'M12 6v6m0 0v6m0-6h6m-6 0H6')}
          ${createActionCard('Add Hangar', 'Create a hangar with bays', 'hangar-form', 'blue', 'M12 6v6m0 0v6m0-6h6m-6 0H6')}
          ${createActionCard('Schedule', 'Plan aircraft storage', 'schedule', 'indigo', 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z')}
        </div>

        <!-- Management Sections -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          ${createManagementCard('Aircraft Fleet', 'View and manage your aircraft', 'aircraft', 'cyan')}
          ${createManagementCard('Hangars', 'View and manage your hangars', 'hangars', 'blue')}
        </div>

        <!-- DSL Mode Link -->
        <div class="mt-8 p-6 bg-slate-800/30 border border-slate-700 rounded-xl">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-white">DSL Editor Mode</h3>
              <p class="text-slate-400 text-sm">Prefer writing code? Use the DSL editor for advanced control.</p>
            </div>
            <button id="dsl-mode-btn" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
              Open DSL Editor
            </button>
          </div>
        </div>
      </main>
    </div>
  `;
}

function createDashboardNavbar(username: string): string {
  return `
    <nav class="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50">
      <div class="container mx-auto px-6 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-cyan-500/25 flex items-center justify-center">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>
              </svg>
            </div>
            <div>
              <h1 class="text-lg font-bold text-white">Airfield Manager</h1>
              <p class="text-xs text-slate-400">Dashboard</p>
            </div>
          </div>

          <div class="flex items-center gap-4">
            <nav class="hidden md:flex items-center gap-2">
              <button data-nav="dashboard" class="px-3 py-2 text-cyan-400 bg-cyan-500/10 rounded-lg text-sm font-medium">Dashboard</button>
              <button data-nav="aircraft" class="px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">Aircraft</button>
              <button data-nav="hangars" class="px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">Hangars</button>
              <button data-nav="schedule" class="px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">Schedule</button>
            </nav>

            <div class="flex items-center gap-3 pl-4 border-l border-slate-700">
              <span class="text-sm text-slate-300">${username}</span>
              <button id="logout-btn" class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors" title="Logout">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `;
}

function createStatCard(title: string, id: string, value: string, color: string, icon: string): string {
  const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
    cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
    indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' }
  };

  const c = colorClasses[color];

  return `
    <div class="p-6 ${c.bg} border ${c.border} rounded-xl">
      <div class="flex items-center justify-between mb-4">
        <span class="text-slate-400 text-sm">${title}</span>
        <div class="w-10 h-10 ${c.bg} rounded-lg flex items-center justify-center">
          <svg class="w-5 h-5 ${c.text}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${icon}"></path>
          </svg>
        </div>
      </div>
      <p class="text-3xl font-bold text-white" id="${id}">${value}</p>
    </div>
  `;
}

function createActionCard(title: string, description: string, route: string, color: string, icon: string): string {
  const colorClasses: Record<string, { hover: string; text: string }> = {
    cyan: { hover: 'hover:border-cyan-500/50', text: 'text-cyan-400' },
    blue: { hover: 'hover:border-blue-500/50', text: 'text-blue-400' },
    indigo: { hover: 'hover:border-indigo-500/50', text: 'text-indigo-400' }
  };

  const c = colorClasses[color];

  return `
    <button data-action="${route}" class="p-6 bg-slate-800/30 border border-slate-700 ${c.hover} rounded-xl text-left transition-all hover:scale-[1.02] group">
      <div class="w-12 h-12 bg-slate-700/50 group-hover:bg-slate-700 rounded-xl flex items-center justify-center mb-4 transition-colors">
        <svg class="w-6 h-6 ${c.text}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${icon}"></path>
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-white mb-1">${title}</h3>
      <p class="text-sm text-slate-400">${description}</p>
    </button>
  `;
}

function createManagementCard(title: string, description: string, route: string, color: string): string {
  const colorClasses: Record<string, { border: string; text: string }> = {
    cyan: { border: 'border-cyan-500/30 hover:border-cyan-500/50', text: 'text-cyan-400' },
    blue: { border: 'border-blue-500/30 hover:border-blue-500/50', text: 'text-blue-400' }
  };

  const c = colorClasses[color];

  return `
    <button data-nav="${route}" class="p-6 bg-slate-800/30 border ${c.border} rounded-xl text-left transition-all hover:scale-[1.01] group">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-white mb-1">${title}</h3>
          <p class="text-sm text-slate-400">${description}</p>
        </div>
        <svg class="w-6 h-6 ${c.text} group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
      </div>
    </button>
  `;
}

export async function attachDashboardPageListeners(): Promise<void> {
  // Load stats
  loadDashboardStats();

  // Navigation buttons
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = (btn as HTMLElement).dataset.nav as any;
      router.navigate(route);
    });
  });

  // Action buttons
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = (btn as HTMLElement).dataset.action as any;
      router.navigate(route);
    });
  });

  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logout();
      router.navigate('login');
    });
  }

  // DSL mode button
  const dslModeBtn = document.getElementById('dsl-mode-btn');
  if (dslModeBtn) {
    dslModeBtn.addEventListener('click', () => {
      router.navigate('home');
    });
  }
}

async function loadDashboardStats(): Promise<void> {
  try {
    const [aircraft, hangars, schedule] = await Promise.all([
      getAircraft(),
      getHangars(),
      getSchedule()
    ]);

    const scheduledCount = schedule.placements.filter(p => p.status === 'scheduled').length;
    const failedCount = schedule.placements.filter(p => p.status === 'failed').length;

    dashboardData = {
      aircraftCount: aircraft.length,
      hangarCount: hangars.length,
      inductionCount: scheduledCount,
      autoInductionCount: failedCount
    };

    // Update UI
    const aircraftEl = document.getElementById('aircraft-count');
    const hangarEl = document.getElementById('hangar-count');
    const inductionEl = document.getElementById('induction-count');
    const autoEl = document.getElementById('auto-count');

    if (aircraftEl) aircraftEl.textContent = String(dashboardData.aircraftCount);
    if (hangarEl) hangarEl.textContent = String(dashboardData.hangarCount);
    if (inductionEl) inductionEl.textContent = String(dashboardData.inductionCount);
    if (autoEl) autoEl.textContent = String(dashboardData.autoInductionCount);
  } catch (error) {
    console.error('Failed to load dashboard stats:', error);
  }
}
