import { createNavbar } from './navbar';
import { isLoggedIn } from '../services/auth';

export function createHomePage(): string {
  const loggedIn = isLoggedIn();

  return `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      ${createNavbar('home')}

      <!-- Hero -->
      <div class="relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-indigo-500/10"></div>
        <div class="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl"></div>
        <div class="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl"></div>

        <div class="relative container mx-auto px-6 py-24 text-center">
          <div class="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-full text-sm text-slate-300 mb-6">
            <span class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            DSL-Powered Hangar Bay Management
          </div>

          <h1 class="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            <span class="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 text-transparent bg-clip-text">
              Airfield Simulation Platform
            </span>
          </h1>

          <p class="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
            Model, validate, and schedule aircraft hangar bay allocations.
            Use the visual scheduler or write DSL code for advanced control.
          </p>

          <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
            ${loggedIn ? `
              <a href="#dashboard" class="px-8 py-3 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 hover:from-cyan-400 hover:via-blue-400 hover:to-indigo-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5 flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
                </svg>
                Go to Dashboard
              </a>
            ` : `
              <a href="#login" class="px-8 py-3 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 hover:from-cyan-400 hover:via-blue-400 hover:to-indigo-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5 flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
                Sign In to Manage
              </a>
            `}
            <a href="#editor" class="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl transition-all border border-slate-700 hover:border-slate-600 flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
              </svg>
              Open DSL Editor
            </a>
          </div>
        </div>
      </div>

      <!-- Features -->
      <main class="container mx-auto px-6 py-16">
        <h2 class="text-2xl font-bold text-white text-center mb-10">How It Works</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          ${featureCard(
            'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
            'Define Your Airfield',
            'Set up hangars, bays, and aircraft with dimensions. Use the visual interface or write DSL code directly.',
            'cyan'
          )}
          ${featureCard(
            'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
            'Schedule & Auto-Place',
            'Drag-and-drop aircraft onto timelines, or let the auto-scheduler find optimal bay placements.',
            'blue'
          )}
          ${featureCard(
            'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
            'Validate & Analyse',
            'Catch conflicts, dimension mismatches, and scheduling errors with real-time validation and detailed reports.',
            'indigo'
          )}
        </div>
      </main>
    </div>
  `;
}

function featureCard(icon: string, title: string, description: string, color: string): string {
  const colorClasses: Record<string, { bg: string, border: string, iconColor: string }> = {
    cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', iconColor: 'text-cyan-400' },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', iconColor: 'text-blue-400' },
    indigo: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', iconColor: 'text-indigo-400' },
  };
  const c = colorClasses[color];

  return `
    <div class="p-6 rounded-xl ${c.bg} border ${c.border} text-center">
      <div class="w-12 h-12 ${c.bg} border ${c.border} rounded-xl flex items-center justify-center mx-auto mb-4">
        <svg class="w-6 h-6 ${c.iconColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${icon}"></path>
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-white mb-2">${title}</h3>
      <p class="text-sm text-slate-400">${description}</p>
    </div>
  `;
}
