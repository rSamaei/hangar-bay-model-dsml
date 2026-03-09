import { authFetch } from './auth';

// Schedule entry - just aircraft + time window
export interface ScheduleEntry {
  id: number;
  user_id: number;
  aircraft_id: number;
  start_time: string;
  end_time: string;
  created_at: string;
  aircraft_name: string;
  wingspan: number;
  length: number;
  height: number;
  tail_height: number;
}

// Computed placement for an entry
export interface ScheduledPlacement {
  entryId: number;
  aircraftName: string;
  hangar: string | null;
  bays: string[];
  start: string;
  end: string;
  status: 'scheduled' | 'failed';
  failureReason?: string;
}

// Full schedule result
export interface ScheduleResult {
  entries: ScheduleEntry[];
  placements: ScheduledPlacement[];
  validationErrors: string[];
  dslCode?: string;
}

// Data for creating a schedule entry
export interface CreateScheduleEntryData {
  aircraftId: number;
  startTime: string;
  endTime: string;
}

// Get the current schedule with computed placements
export async function getSchedule(): Promise<ScheduleResult> {
  const response = await authFetch('/api/schedule');
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch schedule');
  }
  return response.json();
}

// Add a single entry and get updated schedule with placements
export async function addScheduleEntry(data: CreateScheduleEntryData): Promise<ScheduleResult> {
  const response = await authFetch('/api/schedule/entry', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add schedule entry');
  }
  return response.json();
}

// Add multiple entries at once and get updated schedule with placements
export async function addScheduleEntries(entries: CreateScheduleEntryData[]): Promise<ScheduleResult> {
  const response = await authFetch('/api/schedule/entries', {
    method: 'POST',
    body: JSON.stringify({ entries })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add schedule entries');
  }
  return response.json();
}

// Delete an entry and get updated schedule
export async function deleteScheduleEntry(id: number): Promise<ScheduleResult> {
  const response = await authFetch(`/api/schedule/entry/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete entry');
  }
  return response.json();
}

// Clear all schedule entries
export async function clearSchedule(): Promise<ScheduleResult> {
  const response = await authFetch('/api/schedule/clear', {
    method: 'DELETE'
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to clear schedule');
  }
  return response.json();
}
