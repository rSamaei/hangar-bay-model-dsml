export interface ParseResponse {
  success: boolean;
  model?: {
    name: string;
    aircraftTypes: Array<{ name: string; wingspan: number; length: number; height: number }>;
    hangars: Array<{ name: string; bays: number; bayWidth: number; bayDepth: number; height: number }>;
    inductions: Array<{ aircraft: string; hangar: string; fromBay: number; toBay: number; start: number; duration: number }>;
    autoInductions: Array<{ aircraft: string; duration: number; preferredHangar: string | null }>;
  };
  diagnostics?: Array<{ severity: number; message: string; line: number }>;
  error?: string;
}

export interface SimulationData {
  conflicts: Array<{ time: number; hangarName: string; fromBay: number; toBay: number; aircraft: string }>;
  maxOccupancy: Record<string, number>;
  timeline: Array<{ time: number; occupied: Record<string, Array<{ bay: number; occupied: boolean }>> }>;
}

export interface SchedulingData {
  scheduled: Array<{ aircraft: string; hangar: string; fromBay: number; toBay: number; start: number; duration: number }>;
  unscheduled: Array<{ aircraft: string; duration: number; wingspan?: number }>;
}

export interface SimulateResponse {
  success: boolean;
  simulation?: SimulationData;
  scheduling?: SchedulingData | null;
  error?: string;
}