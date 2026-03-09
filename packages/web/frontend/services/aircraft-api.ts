import { authFetch } from './auth';

export interface Aircraft {
  id: number;
  user_id: number;
  name: string;
  wingspan: number;
  length: number;
  height: number;
  tail_height: number;
  created_at: string;
}

export interface CreateAircraftData {
  name: string;
  wingspan: number;
  length: number;
  height: number;
  tailHeight: number;
}

export async function getAircraft(): Promise<Aircraft[]> {
  const response = await authFetch('/api/aircraft');
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch aircraft');
  }
  const data = await response.json();
  return data.aircraft;
}

export async function getAircraftById(id: number): Promise<Aircraft> {
  const response = await authFetch(`/api/aircraft/${id}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch aircraft');
  }
  const data = await response.json();
  return data.aircraft;
}

export async function createAircraft(data: CreateAircraftData): Promise<Aircraft> {
  const response = await authFetch('/api/aircraft', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create aircraft');
  }
  const result = await response.json();
  return result.aircraft;
}

export async function updateAircraft(id: number, data: Partial<CreateAircraftData>): Promise<Aircraft> {
  const response = await authFetch(`/api/aircraft/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update aircraft');
  }
  const result = await response.json();
  return result.aircraft;
}

export async function deleteAircraft(id: number): Promise<void> {
  const response = await authFetch(`/api/aircraft/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete aircraft');
  }
}
