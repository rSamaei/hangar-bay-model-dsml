/** Domain model types — the canonical in-memory representation of a parsed `.air` file. */

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
  /** Name of the associated `ClearanceEnvelope`, if declared. */
  clearance?: string;
}

export interface AccessNode {
  name: string;
  /** Corridor width in metres; used for corridor-fit checks. */
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
  /** Name of the linked `AccessNode`, if any. */
  accessNode?: string;
}

export interface HangarBay {
  name: string;
  width: number;
  depth: number;
  height: number;
  /** Grid row index (`at row N col M` in the DSL). */
  row?: number;
  /** Grid column index. */
  col?: number;
  /** Names of explicitly declared adjacent bays. */
  adjacent: string[];
  /** Name of the linked `AccessNode`, if any. */
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
  /** ISO-8601 start datetime. */
  start: string;
  /** ISO-8601 end datetime. */
  end: string;
  /** Span direction: `'lateral'` (default) or `'longitudinal'`. */
  span?: string;
  /** Explicit minimum bay count override (`requires N bays`). */
  requires?: number;
  metadata: Record<string, string>;
}

export interface AutoInduction {
  id: string;
  aircraft: string;
  /** Duration in hours. */
  duration: number;
  preferredHangar?: string;
  /** Explicit minimum bay count override. */
  requires?: number;
  /** IDs of inductions that must complete before this one can start. */
  precedingInductions: string[];
  /** ISO-8601 earliest permitted start. */
  notBefore?: string;
  /** ISO-8601 latest permitted start. */
  notAfter?: string;
  metadata: Record<string, string>;
}

export interface DomainModel {
  airfield: { name: string };
  clearances: ClearanceEnvelope[];
  aircraft: AircraftType[];
  accessPaths: AccessPath[];
  hangars: Hangar[];
  inductions: Induction[];
  autoInductions: AutoInduction[];
}
