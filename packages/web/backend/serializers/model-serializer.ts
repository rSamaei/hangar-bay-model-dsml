import type { Model } from '../../../language/out/generated/ast.js';

export interface SerializedModel {
  name: string;
  aircraftTypes: Array<{
    name: string;
    wingspan: number;
    length: number;
    height: number;
  }>;
  hangars: Array<{
    name: string;
    bays: number;
    bayWidth: number;
    bayDepth: number;
    height: number;
  }>;
  inductions: Array<{
    aircraft: string;
    hangar: string;
    fromBay: number;
    toBay: number;
    start: number;
    duration: number;
  }>;
  autoInductions: Array<{
    aircraft: string;
    duration: number;
    preferredHangar: string | null;
  }>;
}

export function serializeModel(model: Model): SerializedModel {
  return {
    name: model.name || 'Unknown',
    aircraftTypes: (model.aircraftTypes || []).map(ac => ({
      name: ac.name,
      wingspan: ac.wingspan,
      length: ac.length,
      height: ac.height
    })),
    hangars: (model.hangars || []).map(h => ({
      name: h.name,
      bays: h.bays,
      bayWidth: h.bayWidth,
      bayDepth: h.bayDepth,
      height: h.height
    })),
    inductions: (model.inductions || []).map(ind => ({
      aircraft: ind.aircraft?.ref?.name || 'unknown',
      hangar: ind.hangar?.ref?.name || 'unknown',
      fromBay: ind.fromBay,
      toBay: ind.toBay,
      start: ind.start,
      duration: ind.duration
    })),
    autoInductions: (model.autoInductions || []).map(auto => ({
      aircraft: auto.aircraft?.ref?.name || 'unknown',
      duration: auto.duration,
      preferredHangar: auto.preferredHangar?.ref?.name || null
    }))
  };
}