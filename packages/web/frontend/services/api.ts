import type { ParseResponse, SimulateResponse } from '../types/api';

export async function parseModel(code: string): Promise<ParseResponse> {
  const response = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  
  return response.json();
}

export async function runSimulation(code: string): Promise<SimulateResponse> {
  const response = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  
  return response.json();
}

export async function getExampleModel(): Promise<{ code: string }> {
  const res = await fetch('/api/example-model');
  if (!res.ok) throw new Error('Failed to load example model');
  return res.json();
}