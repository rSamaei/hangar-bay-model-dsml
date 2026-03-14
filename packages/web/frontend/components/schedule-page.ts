import { mountScheduleApp, unmountScheduleApp } from '../pages/schedule/ScheduleApp';
import { createNavbar } from './navbar';

export function createSchedulePage(): string {
  return `
    <div class="flex flex-col h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      ${createNavbar('schedule')}
      <div id="schedule-root" class="flex-1 min-h-0"></div>
    </div>
  `;
}

export async function attachSchedulePageListeners(): Promise<void> {
  const root = document.getElementById('schedule-root');
  if (root) mountScheduleApp(root);
}

export function cleanupSchedulePage(): void {
  unmountScheduleApp();
}
