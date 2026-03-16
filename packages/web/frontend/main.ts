import './style.css';
import { router } from './router';
import { createHomePage } from './components/home-page';
import { createResultsPage, attachResultsPageListeners } from './components/results-page';
import { createLoginPage, attachLoginPageListeners } from './components/login-page';
import { createDashboardPage, attachDashboardPageListeners } from './components/dashboard-page';
import { createAircraftListPage, createAircraftFormPage, attachAircraftListListeners, attachAircraftFormListeners } from './components/aircraft-page';
import { createHangarsListPage, createHangarFormPage, attachHangarsListListeners, attachHangarFormListeners } from './components/hangars-page';
import { createSchedulePage, attachSchedulePageListeners } from './components/schedule-page';
import { createTimelinePage, attachTimelinePageListeners } from './components/timeline-page';
import { attachNavbarListeners } from './components/navbar';
import { isLoggedIn } from './services/auth';
import { renderEditorPage, disposeEditor, isEditorActive } from './pages/editor/editor-controller';
import type { AnalysisResult } from './services/api';

function initApp() {
  const app = document.getElementById('app');
  if (!app) return;

  router.initFromHash();

  router.onRouteChange((state) => {
    renderRoute(state.currentRoute, state.data);
  });

  renderRoute(router.getCurrentRoute(), router.getData());
}

function renderRoute(route: string, data?: any) {
  const app = document.getElementById('app');
  if (!app) return;

  // Dispose Monaco when navigating away from editor
  if (route !== 'editor' && isEditorActive()) {
    disposeEditor();
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
      attachNavbarListeners();
      attachDashboardPageListeners();
      break;
    case 'aircraft':
      app.innerHTML = createAircraftListPage();
      attachNavbarListeners();
      attachAircraftListListeners();
      break;
    case 'aircraft-form':
      app.innerHTML = createAircraftFormPage();
      attachNavbarListeners();
      attachAircraftFormListeners();
      break;
    case 'hangars':
      app.innerHTML = createHangarsListPage();
      attachNavbarListeners();
      attachHangarsListListeners();
      break;
    case 'hangar-form':
      app.innerHTML = createHangarFormPage();
      attachNavbarListeners();
      attachHangarFormListeners();
      break;
    case 'schedule':
      app.innerHTML = createSchedulePage();
      attachNavbarListeners();
      attachSchedulePageListeners();
      break;
    case 'timeline':
      app.innerHTML = createTimelinePage();
      attachNavbarListeners();
      attachTimelinePageListeners();
      break;
    case 'editor':
      renderEditorPage(data);
      break;
    case 'results':
      renderResultsPage(data as AnalysisResult);
      break;
    case 'home':
    default:
      app.innerHTML = createHomePage();
      attachNavbarListeners();
      break;
  }
}

function renderResultsPage(data: AnalysisResult) {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = createResultsPage(data);
  attachNavbarListeners();
  attachResultsPageListeners();

  document.getElementById('back-btn')?.addEventListener('click', () => {
    router.navigate('editor');
  });
}

initApp();
