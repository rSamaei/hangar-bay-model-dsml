import { authFetch } from './auth';

export interface HangarBay {
  id: number;
  hangar_id: number;
  name: string;
  width: number;
  depth: number;
  height: number;
}

export interface Hangar {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
  bays: HangarBay[];
}

export interface CreateBayData {
  name: string;
  width: number;
  depth: number;
  height: number;
}

export interface CreateHangarData {
  name: string;
  bays: CreateBayData[];
}

export async function getHangars(): Promise<Hangar[]> {
  const response = await authFetch('/api/hangars');
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch hangars');
  }
  const data = await response.json();
  return data.hangars;
}

export async function getHangarById(id: number): Promise<Hangar> {
  const response = await authFetch(`/api/hangars/${id}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch hangar');
  }
  const data = await response.json();
  return data.hangar;
}

export async function createHangar(data: CreateHangarData): Promise<Hangar> {
  const response = await authFetch('/api/hangars', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create hangar');
  }
  const result = await response.json();
  return result.hangar;
}

export async function updateHangar(id: number, data: CreateHangarData): Promise<Hangar> {
  const response = await authFetch(`/api/hangars/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update hangar');
  }
  const result = await response.json();
  return result.hangar;
}

export async function deleteHangar(id: number): Promise<void> {
  const response = await authFetch(`/api/hangars/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete hangar');
  }
}
