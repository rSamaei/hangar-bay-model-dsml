import { router } from '../router';
import { isLoggedIn, getUser, logout } from '../services/auth';

export type NavItem = 'home' | 'dashboard' | 'aircraft' | 'hangars' | 'schedule' | 'timeline' | 'editor' | 'results';

export function createNavbar(active?: NavItem): string {
  const loggedIn = isLoggedIn();
  const user = loggedIn ? getUser() : null;

  return `
    <nav class="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50">
      <div class="container mx-auto px-6 py-3">
        <div class="flex items-center justify-between">
          <a href="${loggedIn ? '#dashboard' : '#'}" class="flex items-center gap-3 no-underline">
            <div class="w-9 h-9 bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-cyan-500/25 flex items-center justify-center">
              <svg class="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>
              </svg>
            </div>
            <span class="text-lg font-bold text-white">Airfield Manager</span>
          </a>

          <div class="flex items-center gap-2">
            <nav class="hidden md:flex items-center gap-1">
              ${loggedIn ? `
                ${navButton('dashboard', 'Dashboard', active)}
                ${navButton('aircraft', 'Aircraft', active)}
                ${navButton('hangars', 'Hangars', active)}
                ${navButton('schedule', 'Schedule', active)}
                ${navButton('timeline', 'Timeline', active)}
              ` : ''}
              ${navButton('editor', 'DSL Editor', active)}
            </nav>

            ${loggedIn ? `
              <div class="flex items-center gap-3 pl-3 ml-2 border-l border-slate-700">
                <span class="text-sm text-slate-300">${user?.username || ''}</span>
                <button id="logout-btn" class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors" title="Logout">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                  </svg>
                </button>
              </div>
            ` : `
              <a href="#login" class="ml-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg transition-colors border border-slate-700 hover:border-slate-600 flex items-center gap-2 text-sm">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
                Sign In
              </a>
            `}
          </div>
        </div>
      </div>
    </nav>
  `;
}

function navButton(route: string, label: string, active?: string): string {
  const isActive = active === route;
  return `<button data-nav="${route}" class="px-3 py-1.5 ${isActive ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-800'} rounded-lg text-sm font-medium transition-colors">${label}</button>`;
}

/**
 * Attach click handlers for all `[data-nav]` buttons and the logout button.
 * Call this after inserting the navbar HTML into the DOM.
 */
export function attachNavbarListeners(): void {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = (btn as HTMLElement).dataset.nav as any;
      router.navigate(route);
    });
  });

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await logout();
    router.navigate('login');
  });
}
