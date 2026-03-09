export function createLayout(): string {
  return `
    <div class="min-h-screen bg-slate-50 text-slate-900">
      ${createHeader()}
      <div class="container mx-auto px-6 py-8 space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          ${createEditorPanel()}
          ${createResultsPanel()}
        </div>
        ${createTimelinePanel()}
      </div>
    </div>
  `;
}

function createHeader(): string {
  return `
    <div class="border-b border-slate-200 bg-white shadow-sm sticky top-0 z-10">
      <div class="container mx-auto px-6 py-5 flex items-center gap-3">
        <div class="w-11 h-11 bg-gradient-to-br from-cyan-500 via-blue-500 to-indigo-500 rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>
          </svg>
        </div>
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Airfield Simulation Platform</h1>
          <p class="text-sm text-slate-500">DSL-based hangar bay modeling & validation</p>
        </div>
      </div>
    </div>
  `;
}

function createEditorPanel(): string {
  return `
    <div class="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
      <div class="px-6 py-4 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500">
        <h2 class="text-lg font-semibold text-white flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
          </svg>
          DSL Editor
        </h2>
      </div>
      <div class="p-6 space-y-4">
        ${createExampleSelector()}
        <textarea
          id="code-editor"
          class="w-full h-96 p-4 font-mono text-sm bg-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all resize-none text-slate-100 placeholder:text-slate-400"
          placeholder="Loading example model..."
        ></textarea>
        <div class="flex gap-3">
          <button
            id="parse-btn"
            class="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-cyan-500/30 hover:-translate-y-0.5 flex items-center justify-center gap-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
            </svg>
            Parse Model
          </button>
          <button
            id="analyze-btn"
            class="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-indigo-500/30 hover:-translate-y-0.5 flex items-center justify-center gap-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            Analyze & Schedule
          </button>
        </div>
        <div id="diagnostics"></div>
      </div>
    </div>
  `;
}

function createExampleSelector(): string {
  return `
    <div class="flex items-center gap-3">
      <label for="example-selector" class="text-sm font-medium text-slate-700">
        Load Example:
      </label>
      <select 
        id="example-selector"
        class="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:border-transparent bg-white text-slate-900"
      >
        <option value="">-- Select an example --</option>
        <optgroup label="Basic Examples">
          <option value="basic">Basic Model (Manual Inductions + Access Paths)</option>
        </optgroup>
        <optgroup label="Auto-Scheduling">
          <option value="auto-scheduling">Auto-Scheduling (Precedence & Time Windows)</option>
          <option value="auto-only-complex">Complex Auto-Only (10 aircraft, chains, constraints)</option>
        </optgroup>
        <optgroup label="Complex Scenarios">
          <option value="complex-access">Complex Access Paths (Large Aircraft)</option>
        </optgroup>
        <optgroup label="Validation Testing">
          <option value="violations">Validation Violations (Test SFR Rules)</option>
        </optgroup>
      </select>
    </div>
  `;
}

function createResultsPanel(): string {
  return `
    <div class="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
      <div class="px-6 py-4 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500">
        <h2 class="text-lg font-semibold text-white flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
          </svg>
          Analysis Results
        </h2>
      </div>
      <div class="p-6">
        <div id="results" class="space-y-4">
          <div class="text-center py-12 text-slate-400">
            <svg class="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <p class="font-medium">Load an example and analyze to see results</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function createTimelinePanel(): string {
  return `
    <div class="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
      <div class="px-6 py-4 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500">
        <h2 class="text-lg font-semibold text-white flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          Schedule Timeline
        </h2>
      </div>
      <div class="p-6">
        <div id="timeline" class="text-center py-12 text-slate-400">
          <svg class="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path>
          </svg>
          <p class="font-medium">Analyze model to see schedule timeline</p>
        </div>
      </div>
    </div>
  `;
}

export function renderLayout(): void {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="container">
      <header>
        <h1>Airfield DSL Validator</h1>
      </header>
      <main>
        <section class="editor-section">
          <h2>DSL Code</h2>
          <textarea id="dsl-editor" rows="20" placeholder="Enter your DSL code here..."></textarea>
          <div class="button-group">
            <button id="validate-btn">Validate</button>
            <button id="analyze-btn">Analyze & Schedule</button>
          </div>
        </section>
        <section class="results-section">
          <div id="diagnostics"></div>
          <div id="model-info"></div>
          <div id="schedule-info"></div>
        </section>
      </main>
    </div>
  `;
}