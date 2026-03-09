import { mountScheduleApp, unmountScheduleApp } from '../pages/schedule/ScheduleApp';

export function createSchedulePage(): string {
  return `<div id="schedule-root" class="min-h-screen"></div>`;
}

export async function attachSchedulePageListeners(): Promise<void> {
  const root = document.getElementById('schedule-root');
  if (root) mountScheduleApp(root);
}

export function cleanupSchedulePage(): void {
  unmountScheduleApp();
}
