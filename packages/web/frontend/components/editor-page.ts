import { examples, type Example } from '../services/examples';
import { createNavbar } from './navbar';

export function createEditorPage(): string {
  return `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      ${createNavbar('editor')}
      <main class="container mx-auto px-6 py-8">
        ${createExamplesSection()}
        ${createEditorSection()}
      </main>
    </div>
  `;
}

function createExamplesSection(): string {
  const categories = [
    { key: 'basic', label: 'Basic', icon: 'M13 10V3L4 14h7v7l9-11h-7z', color: 'emerald' },
    { key: 'auto-scheduling', label: 'Auto-Scheduling', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', color: 'cyan' },
    { key: 'complex', label: 'Complex', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z', color: 'purple' },
    { key: 'validation', label: 'Validation', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', color: 'amber' }
  ];

  return `
    <section class="mb-8">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold text-white">Select an Example</h2>
        <span id="selected-example-name" class="text-sm text-slate-400"></span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        ${categories.map(cat => {
          const categoryExamples = examples.filter(e => e.category === cat.key);
          return categoryExamples.map(example => createExampleCard(example, cat)).join('');
        }).join('')}
      </div>
    </section>
  `;
}

function createExampleCard(example: Example, category: { key: string, label: string, icon: string, color: string }): string {
  const colorClasses: Record<string, { bg: string, border: string, icon: string, badge: string }> = {
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30 hover:border-emerald-500/60', icon: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300' },
    cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30 hover:border-cyan-500/60', icon: 'text-cyan-400', badge: 'bg-cyan-500/20 text-cyan-300' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30 hover:border-purple-500/60', icon: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30 hover:border-amber-500/60', icon: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300' }
  };

  const colors = colorClasses[category.color];

  return `
    <button
      data-example-id="${example.id}"
      class="example-card group relative p-4 rounded-xl border ${colors.border} ${colors.bg} text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-${category.color}-500/10"
    >
      <div class="flex items-start gap-3">
        <div class="w-9 h-9 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center flex-shrink-0">
          <svg class="w-4 h-4 ${colors.icon}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${category.icon}"></path>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <h3 class="font-semibold text-white text-sm truncate">${example.name}</h3>
          </div>
          <p class="text-xs text-slate-400 line-clamp-2">${example.description}</p>
          <span class="inline-block mt-2 px-2 py-0.5 rounded-full text-xs ${colors.badge}">${category.label}</span>
        </div>
      </div>
      <div class="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
    </button>
  `;
}

function createEditorSection(): string {
  return `
    <section class="mb-8">
      <h2 class="text-xl font-bold text-white mb-4">DSL Editor</h2>

      <!-- Vertical split: editor (top) + divider + problems panel (bottom) -->
      <div
        id="editor-panel-wrapper"
        class="rounded-xl border border-slate-700 flex flex-col overflow-hidden"
        style="height: 680px;"
      >
        <!-- Monaco editor pane — grows to fill remaining height -->
        <div class="relative min-h-0" style="flex: 1;">
          <div class="absolute top-3 left-3 flex items-center gap-1.5 z-10 pointer-events-none">
            <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
            <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
          </div>

          <div id="code-editor-container" class="w-full h-full"></div>

          <div class="absolute bottom-3 right-3 text-xs text-slate-500 z-10 pointer-events-none">
            <span id="editor-line-count">0 lines</span>
          </div>
        </div>

        <!-- Drag divider -->
        <div
          id="panel-divider"
          class="relative flex items-center justify-center bg-slate-800/80 border-t border-b border-slate-700 cursor-row-resize select-none flex-shrink-0"
          style="height: 24px;"
        >
          <div class="w-12 h-1 rounded-full bg-slate-600 pointer-events-none"></div>
          <button
            id="panel-collapse-btn"
            class="absolute right-2 p-1 rounded hover:bg-slate-700 transition-colors text-slate-400"
            title="Toggle problems panel"
          >
            <svg id="panel-collapse-icon" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
        </div>

        <!-- Problems panel -->
        <div
          id="problems-panel"
          class="flex flex-col bg-slate-900 flex-shrink-0"
          style="height: 200px;"
        >
          <!-- Tab bar + Analyze button -->
          <div
            class="flex items-center justify-between px-3 bg-slate-800/50 border-b border-slate-700 flex-shrink-0"
            style="height: 36px;"
          >
            <div class="flex items-center h-full">
              <button
                id="tab-problems"
                class="h-full px-3 text-sm font-medium border-b-2 border-cyan-500 text-white flex items-center gap-1.5"
              >
                Problems
                <span id="panel-error-badge"   class="hidden px-1 py-0.5 rounded text-xs bg-red-500/80   text-white font-mono leading-none">0</span>
                <span id="panel-warning-badge" class="hidden px-1 py-0.5 rounded text-xs bg-amber-500/80 text-white font-mono leading-none">0</span>
                <span id="panel-info-badge"    class="hidden px-1 py-0.5 rounded text-xs bg-blue-500/80  text-white font-mono leading-none">0</span>
              </button>
              <button
                id="tab-schedule"
                class="h-full px-3 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition-colors"
              >
                Schedule Results
              </button>
            </div>

            <button
              id="panel-analyze-btn"
              class="px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 hover:from-cyan-400 hover:via-blue-400 hover:to-indigo-400 transition-all shadow-sm shadow-cyan-500/20 flex items-center gap-1.5"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Analyze
            </button>
          </div>

          <!-- Problems list (scrollable) -->
          <div id="panel-problems-content" class="flex-1 overflow-y-auto">
            <div class="flex items-center justify-center h-12 text-slate-500 text-xs">No diagnostics</div>
          </div>

          <!-- Schedule results list (scrollable, hidden by default) -->
          <div id="panel-schedule-content" class="flex-1 overflow-y-auto hidden">
            <div class="flex items-center justify-center h-12 text-slate-500 text-xs">Run Analyze to see schedule results</div>
          </div>
        </div>
      </div>

      <!-- Action buttons below the split view -->
      <div class="flex justify-between items-center gap-3 mt-4">
        <button
          id="load-from-schedule-btn"
          class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 font-medium rounded-xl transition-all border border-slate-700 hover:border-slate-600 flex items-center gap-2 text-sm"
          title="Load the current schedule's DSL into the editor"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
          </svg>
          Load from Schedule
        </button>
        <div class="flex gap-3">
          <button
            id="parse-btn"
            class="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl transition-all border border-slate-700 hover:border-slate-600 flex items-center gap-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
            </svg>
            Parse Only
          </button>
          <button
            id="analyze-btn"
            class="px-8 py-3 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 hover:from-cyan-400 hover:via-blue-400 hover:to-indigo-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:-translate-y-0.5 flex items-center gap-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            Analyze & Schedule
          </button>
        </div>
      </div>

      <div id="parse-results" class="mt-4"></div>
    </section>
  `;
}
