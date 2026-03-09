import './style.css';
import { router } from './router';
import { createHomePage } from './components/home-page';
import { createResultsPage } from './components/results-page';
import { createLoginPage, attachLoginPageListeners } from './components/login-page';
import { createDashboardPage, attachDashboardPageListeners } from './components/dashboard-page';
import { createAircraftListPage, createAircraftFormPage, attachAircraftListListeners, attachAircraftFormListeners } from './components/aircraft-page';
import { createHangarsListPage, createHangarFormPage, attachHangarsListListeners, attachHangarFormListeners } from './components/hangars-page';
import { createSchedulePage, attachSchedulePageListeners, cleanupSchedulePage } from './components/schedule-page';
import { createTimelinePage, attachTimelinePageListeners } from './components/timeline-page';
import { parseModel, analyzeModel, ApiError, type AnalysisResult } from './services/api';
import { examples, loadExample } from './services/examples';
import { isLoggedIn, authFetch } from './services/auth';
import { initMonacoEditor, type MonacoEditorInstance } from './editor/monaco-editor';
import { setupLiveValidation } from './editor/diagnostics';
import { setupProblemsPanel, type PanelController } from './editor/problems-panel';

// Module-level Monaco editor instance — shared across all home-page listener closures.
// Disposed and recreated each time the home page is rendered.
let monacoEditor: MonacoEditorInstance | null = null;
// Live-validation subscription — disposed alongside the editor.
let validationDisposable: { dispose(): void } | null = null;
// Problems panel controller — disposed alongside the editor.
let panelController: PanelController | null = null;

// Initialize the application
function initApp() {
  const app = document.getElementById('app');
  if (!app) return;

  // Initialize router from URL hash
  router.initFromHash();

  // Set up router
  router.onRouteChange((state) => {
    renderRoute(state.currentRoute, state.data);
  });

  // Initial render based on current route
  renderRoute(router.getCurrentRoute(), router.getData());
}

function renderRoute(route: string, data?: any) {
  const app = document.getElementById('app');
  if (!app) return;

  // Dispose Monaco and its subscriptions when navigating away from home
  if (route !== 'home' && monacoEditor) {
    validationDisposable?.dispose();
    validationDisposable = null;
    panelController?.dispose();
    panelController = null;
    monacoEditor.dispose();
    monacoEditor = null;
  }

  // Unmount the React schedule app when navigating away from schedule
  if (route !== 'schedule') {
    cleanupSchedulePage();
  }

  // Protected routes check
  const protectedRoutes = ['dashboard', 'aircraft', 'aircraft-form', 'hangars', 'hangar-form', 'schedule', 'timeline'];
  if (protectedRoutes.includes(route) && !isLoggedIn()) {
    router.navigate('login');
    return;
  }

  switch (route) {
    case 'login':
      app.innerHTML = createLoginPage();
      attachLoginPageListeners();
      break;
    case 'dashboard':
      app.innerHTML = createDashboardPage();
      attachDashboardPageListeners();
      break;
    case 'aircraft':
      app.innerHTML = createAircraftListPage();
      attachAircraftListListeners();
      break;
    case 'aircraft-form':
      app.innerHTML = createAircraftFormPage();
      attachAircraftFormListeners();
      break;
    case 'hangars':
      app.innerHTML = createHangarsListPage();
      attachHangarsListListeners();
      break;
    case 'hangar-form':
      app.innerHTML = createHangarFormPage();
      attachHangarFormListeners();
      break;
    case 'schedule':
      app.innerHTML = createSchedulePage();
      attachSchedulePageListeners();
      break;
    case 'timeline':
      app.innerHTML = createTimelinePage();
      attachTimelinePageListeners();
      break;
    case 'results':
      renderResultsPage(data as AnalysisResult);
      break;
    case 'home':
    default:
      renderHomePage(data);
      break;
  }
}

function renderHomePage(data?: any) {
  const app = document.getElementById('app');
  if (!app) return;

  // Pick up DSL stashed by the schedule page's "View as DSL" button.
  // sessionStorage survives the double router.navigate() / hashchange cycle.
  const storedPrefill = sessionStorage.getItem('schedule_dsl_prefill');
  if (storedPrefill) {
    sessionStorage.removeItem('schedule_dsl_prefill');
    data = { prefillCode: storedPrefill };
  }

  // Dispose any existing Monaco instance (and subscriptions) before replacing the DOM
  if (monacoEditor) {
    validationDisposable?.dispose();
    validationDisposable = null;
    panelController?.dispose();
    panelController = null;
    monacoEditor.dispose();
    monacoEditor = null;
  }

  app.innerHTML = createHomePage();
  attachHomePageListeners();

  // Handle prefilled code (e.g. from scheduler)
  if (data?.prefillCode) {
    monacoEditor?.setValue(data.prefillCode);
    updateLineCount(data.prefillCode);

    if (data.autoAnalyze) {
      setTimeout(() => {
        document.getElementById('analyze-btn')?.click();
      }, 500);
    }
  } else {
    loadDefaultExample();
  }
}

function renderResultsPage(data: AnalysisResult) {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = createResultsPage(data);
  attachResultsPageListeners();
}

function attachHomePageListeners() {
  // Create Monaco editor in the container div
  const container = document.getElementById('code-editor-container');
  if (container) {
    monacoEditor = initMonacoEditor(container, '');

    // Keep the line-count badge in sync with Monaco content changes
    monacoEditor.onDidChangeModelContent(() => {
      updateLineCount(monacoEditor?.getValue() ?? '');
    });

    // Set up the problems panel (drag/resize, tabs, diagnostics list)
    panelController = setupProblemsPanel(monacoEditor);

    // Attach live Langium validation → inline squiggles + problems panel list
    validationDisposable = setupLiveValidation(
      monacoEditor,
      (items) => panelController?.updateDiagnostics(items),
    );
  }

  // "Load from Schedule" button — fetches the current schedule's DSL and loads it
  const loadFromScheduleBtn = document.getElementById('load-from-schedule-btn') as HTMLButtonElement | null;
  loadFromScheduleBtn?.addEventListener('click', async () => {
    if (loadFromScheduleBtn.disabled) return;
    loadFromScheduleBtn.disabled = true;
    const originalText = loadFromScheduleBtn.textContent ?? '';
    loadFromScheduleBtn.textContent = 'Loading…';
    try {
      const resp = await authFetch('/api/schedule');
      if (!resp.ok) {
        showNotification('Failed to load schedule', 'error');
        return;
      }
      const data = await resp.json();
      const dsl: string | undefined = data?.dslCode;
      if (!dsl?.trim()) {
        showNotification('Schedule is empty — add entries first', 'warning');
        return;
      }
      monacoEditor?.setValue(dsl);
      updateLineCount(dsl);
      showNotification('Schedule DSL loaded', 'success');
    } catch {
      showNotification('Failed to load schedule', 'error');
    } finally {
      loadFromScheduleBtn.disabled = false;
      loadFromScheduleBtn.textContent = originalText;
    }
  });

  // Panel "Analyze" button — inline results in the Schedule Results tab
  const panelAnalyzeBtn = document.getElementById('panel-analyze-btn') as HTMLButtonElement | null;
  panelAnalyzeBtn?.addEventListener('click', async () => {
    const code = monacoEditor?.getValue();
    if (!code?.trim()) {
      showNotification('Please enter DSL code', 'warning');
      return;
    }

    const originalHTML = panelAnalyzeBtn.innerHTML;
    panelAnalyzeBtn.innerHTML = `
      <svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
      Analyzing...`;
    panelAnalyzeBtn.disabled = true;

    try {
      const result = await analyzeModel(code);
      panelController?.updateScheduleResults(result);
    } catch (error) {
      showNotification(
        error instanceof Error ? error.message : 'Analysis failed',
        'error',
      );
    } finally {
      panelAnalyzeBtn.innerHTML = originalHTML;
      panelAnalyzeBtn.disabled  = false;
    }
  });

  const parseBtn = document.getElementById('parse-btn');
  const analyzeBtn = document.getElementById('analyze-btn');

  // Example card click handlers
  const exampleCards = document.querySelectorAll('.example-card');
  exampleCards.forEach(card => {
    card.addEventListener('click', async () => {
      const exampleId = card.getAttribute('data-example-id');
      if (!exampleId) return;

      const example = examples.find(ex => ex.id === exampleId);
      if (!example) return;

      // Update active state visually
      exampleCards.forEach(c => c.classList.remove('ring-2', 'ring-cyan-500'));
      card.classList.add('ring-2', 'ring-cyan-500');

      try {
        const code = await loadExample(example.file);
        monacoEditor?.setValue(code);
        updateLineCount(code);

        // Update selected example name
        const nameSpan = document.getElementById('selected-example-name');
        if (nameSpan) {
          nameSpan.textContent = `Loaded: ${example.name}`;
        }
      } catch (error) {
        console.error('Failed to load example:', error);
        showNotification('Failed to load example. Please try again.', 'error');
      }
    });
  });

  // Parse button
  parseBtn?.addEventListener('click', async () => {
    const code = monacoEditor?.getValue();
    if (!code) {
      showNotification('Please enter DSL code', 'warning');
      return;
    }

    try {
      parseBtn.textContent = 'Parsing...';
      parseBtn.setAttribute('disabled', 'true');

      const result = await parseModel(code);

      const parseResultsDiv = document.getElementById('parse-results');
      if (parseResultsDiv) {
        if (result.errors && result.errors.length > 0) {
          parseResultsDiv.innerHTML = `
            <div class="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <h4 class="font-medium text-red-400 mb-2">Parse Errors</h4>
              <ul class="text-sm text-red-300 space-y-1">
                ${result.errors.map((e: any) => `<li>${e.message || JSON.stringify(e)}</li>`).join('')}
              </ul>
            </div>
          `;
        } else if (result.model) {
          parseResultsDiv.innerHTML = `
            <div class="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <div class="flex items-center gap-2 text-emerald-400">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span class="font-medium">Parse successful!</span>
              </div>
              <p class="text-sm text-slate-400 mt-1">Click "Analyze & Schedule" to run full analysis.</p>
            </div>
          `;
        }
      }
    } catch (error) {
      console.error('Parse error:', error);
      const parseResultsDiv = document.getElementById('parse-results');
      if (error instanceof ApiError && error.parseErrors.length > 0) {
        if (parseResultsDiv) {
          parseResultsDiv.innerHTML = `
            <div class="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <h4 class="font-medium text-red-400 mb-2">Parse Errors</h4>
              <ul class="text-sm text-red-300 space-y-2">
                ${error.parseErrors.map(e => `
                  <li class="flex items-start gap-2">
                    <span class="text-red-500 mt-0.5">&#x2717;</span>
                    <div>
                      <span>${e.message}</span>
                      ${e.line ? `<span class="text-slate-500 ml-2">(line ${e.line}${e.column ? `:${e.column}` : ''})</span>` : ''}
                    </div>
                  </li>
                `).join('')}
              </ul>
            </div>
          `;
        }
        showNotification(`Parse failed: ${error.parseErrors.length} error(s)`, 'error');
      } else {
        showNotification('Parse failed. Check console for details.', 'error');
      }
    } finally {
      parseBtn.textContent = 'Parse Only';
      parseBtn.removeAttribute('disabled');
    }
  });

  // Analyze button
  analyzeBtn?.addEventListener('click', async () => {
    const code = monacoEditor?.getValue();
    if (!code) {
      showNotification('Please enter DSL code', 'warning');
      return;
    }

    try {
      // Show loading state
      analyzeBtn.innerHTML = `
        <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
        Analyzing...
      `;
      analyzeBtn.setAttribute('disabled', 'true');

      const result = await analyzeModel(code);

      // Debug log
      console.log('[Frontend] Analysis result:', result);

      // Navigate to results page
      router.navigate('results', result);

    } catch (error) {
      console.error('Analysis error:', error);

      // Display detailed errors if available
      const parseResultsDiv = document.getElementById('parse-results');
      if (error instanceof ApiError && error.parseErrors.length > 0) {
        if (parseResultsDiv) {
          parseResultsDiv.innerHTML = `
            <div class="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <h4 class="font-medium text-red-400 mb-2">Validation Errors</h4>
              <ul class="text-sm text-red-300 space-y-2">
                ${error.parseErrors.map(e => `
                  <li class="flex items-start gap-2">
                    <span class="text-red-500 mt-0.5">&#x2717;</span>
                    <div>
                      <span>${e.message}</span>
                      ${e.line ? `<span class="text-slate-500 ml-2">(line ${e.line}${e.column ? `:${e.column}` : ''})</span>` : ''}
                    </div>
                  </li>
                `).join('')}
              </ul>
            </div>
          `;
        }
        showNotification(`Analysis failed: ${error.parseErrors.length} validation error(s)`, 'error');
      } else {
        if (parseResultsDiv) {
          parseResultsDiv.innerHTML = `
            <div class="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <h4 class="font-medium text-red-400 mb-2">Error</h4>
              <p class="text-sm text-red-300">${error instanceof Error ? error.message : 'Unknown error occurred'}</p>
            </div>
          `;
        }
        showNotification('Analysis failed. Check console for details.', 'error');
      }

      // Reset button
      analyzeBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        Analyze & Schedule
      `;
      analyzeBtn.removeAttribute('disabled');
    }
  });
}

function attachResultsPageListeners() {
  const backBtn = document.getElementById('back-btn');

  backBtn?.addEventListener('click', () => {
    router.navigate('home');
  });
}

async function loadDefaultExample() {
  if (!monacoEditor) return;

  try {
    const defaultExample = examples[0];
    const code = await loadExample(defaultExample.file);
    monacoEditor.setValue(code);
    updateLineCount(code);

    // Highlight the first example card
    const firstCard = document.querySelector(`[data-example-id="${defaultExample.id}"]`);
    if (firstCard) {
      firstCard.classList.add('ring-2', 'ring-cyan-500');
    }

    // Update selected example name
    const nameSpan = document.getElementById('selected-example-name');
    if (nameSpan) {
      nameSpan.textContent = `Loaded: ${defaultExample.name}`;
    }
  } catch (error) {
    console.error('Failed to load default example:', error);
  }
}

function updateLineCount(code: string) {
  const lineCountSpan = document.getElementById('editor-line-count');
  if (lineCountSpan) {
    const lines = code.split('\n').length;
    lineCountSpan.textContent = `${lines} line${lines !== 1 ? 's' : ''}`;
  }
}

function showNotification(message: string, type: 'success' | 'error' | 'warning' = 'error') {
  const colors = {
    success: 'bg-emerald-500/90 text-white',
    error: 'bg-red-500/90 text-white',
    warning: 'bg-amber-500/90 text-white'
  };

  const notification = document.createElement('div');
  notification.className = `fixed bottom-4 right-4 px-4 py-3 rounded-lg ${colors[type]} shadow-lg z-50 animate-fade-in`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('opacity-0', 'transition-opacity');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Start the app
initApp();
