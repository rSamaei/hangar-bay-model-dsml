/**
 * Centralized Domain Model Types
 * Single source of truth for the entire application
 */

export interface ClearanceEnvelope {
  name: string;
  lateralMargin: number;
  longitudinalMargin: number;
  verticalMargin: number;
}

export interface AircraftType {
  name: string;
  wingspan: number;
  length: number;
  height: number;
  tailHeight: number;
  clearance?: string;
}

export interface AccessNode {
  name: string;
  width?: number;
  height?: number;
}

export interface AccessLink {
  from: string;
  to: string;
  bidirectional: boolean;
  type: string;
}

export interface AccessPath {
  name: string;
  nodes: AccessNode[];
  links: AccessLink[];
}

export interface HangarDoor {
  name: string;
  width: number;
  height: number;
  accessNode?: string;
}

export interface HangarBay {
  name: string;
  width: number;
  depth: number;
  height: number;
  row?: number;
  col?: number;
  adjacent: string[];
  accessNode?: string;
}

export interface Hangar {
  name: string;
  doors: HangarDoor[];
  bays: HangarBay[];
  gridRows?: number;
  gridCols?: number;
}

export interface Induction {
  id: string;
  aircraft: string;
  hangar: string;
  bays: string[];
  door?: string;
  start: string;
  end: string;
  metadata: Record<string, string>;
}

export interface AutoInduction {
  id: string;
  aircraft: string;
  duration: number;
  preferredHangar?: string;
  precedingInductions: string[];
  notBefore?: string;
  notAfter?: string;
  metadata: Record<string, string>;
}

export interface DomainModel {
  airfield: {
    name: string;
  };
  clearances: ClearanceEnvelope[];
  aircraft: AircraftType[];
  accessPaths: AccessPath[];
  hangars: Hangar[];
  inductions: Induction[];
  autoInductions: AutoInduction[];
}
