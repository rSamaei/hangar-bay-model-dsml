// Simple client-side router
export type Route =
  | 'home'
  | 'login'
  | 'dashboard'
  | 'aircraft'
  | 'aircraft-form'
  | 'hangars'
  | 'hangar-form'
  | 'schedule'
  | 'timeline'
  | 'results';

export interface RouterState {
  currentRoute: Route;
  data?: any;
}

type RouteChangeCallback = (state: RouterState) => void;

class Router {
  private state: RouterState = { currentRoute: 'home' };
  private listeners: RouteChangeCallback[] = [];

  getCurrentRoute(): Route {
    return this.state.currentRoute;
  }

  getData(): any {
    return this.state.data;
  }

  navigate(route: Route, data?: any): void {
    this.state = { currentRoute: route, data };
    // Update URL hash for browser history
    window.location.hash = route === 'home' ? '' : route;
    this.notifyListeners();
  }

  onRouteChange(callback: RouteChangeCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  // Initialize from URL hash
  initFromHash(): void {
    const hash = window.location.hash.slice(1) || 'home';
    const validRoutes: Route[] = ['home', 'login', 'dashboard', 'aircraft', 'aircraft-form', 'hangars', 'hangar-form', 'schedule', 'timeline', 'results'];

    if (validRoutes.includes(hash as Route)) {
      this.state = { currentRoute: hash as Route };
    } else {
      this.state = { currentRoute: 'home' };
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export const router = new Router();

// Handle browser back/forward
window.addEventListener('hashchange', () => {
  router.initFromHash();
  // Trigger re-render by notifying with current state
  const state = { currentRoute: router.getCurrentRoute(), data: router.getData() };
  (router as any).listeners.forEach((l: RouteChangeCallback) => l(state));
});
