import './style.css';
import { parseModel, runSimulation, getExampleModel } from './services/api';
import { renderDiagnostics } from './components/diagnostics';
import { renderModelInfo } from './components/model-info';
import { renderSimulationResults } from './components/simulation-results';
import { renderTimeline } from './components/timeline';

function initializeApp(): void {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-50">
      <div class="border-b border-white/10 backdrop-blur bg-white/5 sticky top-0 z-10">
        <div class="container mx-auto px-6 py-5 flex items-center gap-3">
          <div class="w-11 h-11 bg-gradient-to-br from-cyan-500 via-blue-500 to-indigo-500 rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center">
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>
            </svg>
          </div>
          <div>
            <h1 class="text-2xl font-bold">Airfield Simulation Platform</h1>
            <p class="text-sm text-slate-300">Model, schedule, and optimize hangar bay operations</p>
          </div>
        </div>
      </div>

      <div class="container mx-auto px-6 py-8 space-y-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="rounded-2xl border border-white/10 bg-white/5 backdrop-blur shadow-2xl shadow-black/30 overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500">
              <h2 class="text-lg font-semibold flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
                </svg>
                DSL Editor
              </h2>
            </div>
            <div class="p-6 space-y-4">
              <textarea
                id="code-editor"
                class="w-full h-96 p-4 font-mono text-sm bg-slate-950/70 border border-white/10 rounded-xl focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all resize-none text-slate-100 placeholder:text-slate-500"
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
                  id="simulate-btn"
                  class="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-indigo-500/30 hover:-translate-y-0.5 flex items-center justify-center gap-2"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  Run Simulation
                </button>
              </div>
              <div id="diagnostics" class="mt-2"></div>
            </div>
          </div>

          <div class="rounded-2xl border border-white/10 bg-white/5 backdrop-blur shadow-2xl shadow-black/30 overflow-hidden">
            <div class="px-6 py-4 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500">
              <h2 class="text-lg font-semibold flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
                Results
              </h2>
            </div>
            <div class="p-6">
              <div id="results" class="space-y-4">
                <div class="text-center py-12 text-slate-400">
                  <svg class="w-16 h-16 mx-auto text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                  <p class="font-medium">Run a simulation to see results</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-white/10 bg-white/5 backdrop-blur shadow-2xl shadow-black/30 overflow-hidden">
          <div class="px-6 py-4 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500">
            <h2 class="text-lg font-semibold flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
              </svg>
              Timeline Visualization
            </h2>
          </div>
          <div class="p-6">
            <div id="timeline" class="overflow-x-auto"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  attachEventListeners();
  loadExampleModel();
}

function attachEventListeners(): void {
  const parseBtn = document.getElementById('parse-btn');
  const simulateBtn = document.getElementById('simulate-btn');
  
  parseBtn?.addEventListener('click', handleParse);
  simulateBtn?.addEventListener('click', handleSimulate);
}

async function handleParse(): Promise<void> {
  const codeEditor = document.getElementById('code-editor') as HTMLTextAreaElement;
  const diagnosticsDiv = document.getElementById('diagnostics');
  const resultsDiv = document.getElementById('results');
  
  if (!codeEditor || !diagnosticsDiv || !resultsDiv) return;
  
  try {
    const data = await parseModel(codeEditor.value);
    
    diagnosticsDiv.innerHTML = renderDiagnostics(data);
    resultsDiv.innerHTML = renderModelInfo(data);
    
  } catch (error) {
    diagnosticsDiv.innerHTML = `
      <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
        <p class="text-red-800 font-semibold">Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    `;
  }
}

async function handleSimulate(): Promise<void> {
  const codeEditor = document.getElementById('code-editor') as HTMLTextAreaElement;
  const resultsDiv = document.getElementById('results');
  
  if (!codeEditor || !resultsDiv) return;
  
  try {
    const data = await runSimulation(codeEditor.value);
    
    if (!data.simulation) {
      throw new Error(data.error || 'Simulation failed');
    }
    
    resultsDiv.innerHTML = renderSimulationResults(data);
    renderTimeline(data.simulation?.timeline);
    
  } catch (error) {
    resultsDiv.innerHTML = `
      <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
        <p class="text-red-800 font-semibold">Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    `;
  }
}

async function loadExampleModel(): Promise<void> {
  const codeEditor = document.getElementById('code-editor') as HTMLTextAreaElement;
  if (!codeEditor) return;

  codeEditor.value = '// Loading example...';
  try {
    const { code } = await getExampleModel();
    codeEditor.value = code;
  } catch (error) {
    codeEditor.value = '// Failed to load example model. Please enter your own model.';
    console.error(error);
  }
}

initializeApp();