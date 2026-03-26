/**
 * Extended unit tests for backend/services/model-transformer.ts
 *
 * Covers the branches missed by the primary test file:
 *   - Lines 24–35: accessPaths mapping (nodes + links)
 *   - Line 69:     induction metadata tags branch (Object.fromEntries when tags exist)
 *   - Line 82:     auto-induction metadata tags branch
 */
import { describe, expect, test } from 'vitest';
import { transformToDomainModel } from '../../../backend/services/model-transformer.js';

// ---------------------------------------------------------------------------
// Minimal mock helpers (structural mocks — no Langium runtime)
// ---------------------------------------------------------------------------

function mkRef<T extends { name: string }>(node: T) {
  return { ref: node, $refText: node.name };
}

function mkModel(overrides: Partial<{
  name: string;
  clearanceEnvelopes: any[];
  aircraftTypes: any[];
  accessPaths: any[];
  hangars: any[];
  inductions: any[];
  autoInductions: any[];
}>): any {
  return {
    name: 'TestField',
    clearanceEnvelopes: [],
    aircraftTypes: [],
    accessPaths: [],
    hangars: [],
    inductions: [],
    autoInductions: [],
    ...overrides
  };
}

function mkAccessNode(name: string, width?: number, height?: number) {
  return { name, width, height };
}

function mkAccessPath(name: string, nodes: any[], links: any[]) {
  return { name, nodes, links };
}

function mkAccessLink(
  fromNode: { name: string },
  toNode: { name: string },
  bidirectional = false,
  type?: string
) {
  return {
    from: mkRef(fromNode),
    to: mkRef(toNode),
    bidirectional,
    type
  };
}

const CESSNA = {
  name: 'Cessna', wingspan: 11, length: 8.3, height: 2.7,
  tailHeight: 2.7, clearance: undefined, $type: 'AircraftType' as const
};
const MAIN_DOOR = { name: 'MainDoor', width: 15, height: 5, accessNode: undefined };
const BAY1 = {
  name: 'Bay1', width: 12, depth: 10, height: 5, row: 0, col: 0,
  adjacent: [], accessNode: undefined, $type: 'HangarBay' as const
};
const ALPHA_HANGAR = {
  name: 'Alpha', doors: [MAIN_DOOR],
  grid: { bays: [BAY1], rows: 1, cols: 1 },
  $type: 'Hangar' as const
};

// ---------------------------------------------------------------------------
// Tests: access paths (lines 24–35)
// ---------------------------------------------------------------------------

describe('transformToDomainModel — access paths', () => {
  const nodeA = mkAccessNode('DoorNode', 15, 5);
  const nodeB = mkAccessNode('BayNode', 12);
  const link = mkAccessLink(nodeA, nodeB, true, 'taxi');
  const ap = mkAccessPath('MainPath', [nodeA, nodeB], [link]);

  test('accessPaths array is populated', () => {
    const result = transformToDomainModel(mkModel({ accessPaths: [ap] }));
    expect(result.accessPaths).toHaveLength(1);
    expect(result.accessPaths[0].name).toBe('MainPath');
  });

  test('access path nodes are mapped with name and dimensions', () => {
    const result = transformToDomainModel(mkModel({ accessPaths: [ap] }));
    const nodes = result.accessPaths[0].nodes;
    expect(nodes).toHaveLength(2);
    expect(nodes[0].name).toBe('DoorNode');
    expect(nodes[0].width).toBe(15);
    expect(nodes[0].height).toBe(5);
    expect(nodes[1].name).toBe('BayNode');
  });

  test('access path links are mapped with from, to, bidirectional, type', () => {
    const result = transformToDomainModel(mkModel({ accessPaths: [ap] }));
    const links = result.accessPaths[0].links;
    expect(links).toHaveLength(1);
    expect(links[0].from).toBe('DoorNode');
    expect(links[0].to).toBe('BayNode');
    expect(links[0].bidirectional).toBe(true);
    expect(links[0].type).toBe('taxi');
  });

  test('link with missing type falls back to "taxi"', () => {
    const noTypeLink = mkAccessLink(nodeA, nodeB, false, undefined);
    const apNoType = mkAccessPath('P', [nodeA, nodeB], [noTypeLink]);
    const result = transformToDomainModel(mkModel({ accessPaths: [apNoType] }));
    expect(result.accessPaths[0].links[0].type).toBe('taxi');
  });
});

// ---------------------------------------------------------------------------
// Tests: induction metadata tags (line 69)
// ---------------------------------------------------------------------------

describe('transformToDomainModel — induction metadata tags', () => {
  function mkInductionWithTags(tags: Record<string, string>) {
    return {
      id: 'IND-TAG',
      aircraft: mkRef(CESSNA),
      hangar: mkRef(ALPHA_HANGAR),
      bays: [mkRef(BAY1)],
      door: mkRef(MAIN_DOOR),
      start: '2024-06-01T08:00',
      end: '2024-06-01T10:00',
      metadata: {
        tags: Object.entries(tags).map(([key, value]) => ({ key, value }))
      },
      $type: 'Induction' as const
    };
  }

  test('induction metadata tags are mapped to a plain object', () => {
    const ind = mkInductionWithTags({ priority: '"high"', team: '"maintenance"' });
    const result = transformToDomainModel(mkModel({ inductions: [ind] }));
    const meta = result.inductions[0].metadata;
    expect(meta).toBeDefined();
    expect(meta['priority']).toBe('high');
    expect(meta['team']).toBe('maintenance');
  });

  test('induction with no metadata produces an empty metadata object', () => {
    const ind = {
      id: 'IND-NOMETA',
      aircraft: mkRef(CESSNA),
      hangar: mkRef(ALPHA_HANGAR),
      bays: [mkRef(BAY1)],
      door: undefined,
      start: '2024-06-01T08:00',
      end: '2024-06-01T10:00',
      metadata: undefined,
      $type: 'Induction' as const
    };
    const result = transformToDomainModel(mkModel({ inductions: [ind] }));
    expect(result.inductions[0].metadata).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Tests: auto-induction metadata tags (line 82)
// ---------------------------------------------------------------------------

describe('transformToDomainModel — auto-induction metadata tags', () => {
  function mkAutoWithTags(tags: Record<string, string>) {
    return {
      id: 'AUTO-TAG',
      aircraft: mkRef(CESSNA),
      preferredHangar: mkRef(ALPHA_HANGAR),
      duration: 90,
      notBefore: undefined,
      notAfter: undefined,
      requires: undefined,
      precedingInductions: [],
      metadata: {
        tags: Object.entries(tags).map(([key, value]) => ({ key, value }))
      },
      $type: 'AutoInduction' as const
    };
  }

  test('auto-induction metadata tags are mapped to a plain object', () => {
    const ai = mkAutoWithTags({ origin: '"external"', sla: '"4h"' });
    const result = transformToDomainModel(mkModel({ autoInductions: [ai] }));
    const meta = result.autoInductions[0].metadata;
    expect(meta).toBeDefined();
    expect(meta['origin']).toBe('external');
    expect(meta['sla']).toBe('4h');
  });

  test('auto-induction with no metadata produces an empty metadata object', () => {
    const ai = {
      id: 'AUTO-NOMETA',
      aircraft: mkRef(CESSNA),
      preferredHangar: undefined,
      duration: 60,
      notBefore: undefined,
      notAfter: undefined,
      requires: undefined,
      precedingInductions: [],
      metadata: undefined,
      $type: 'AutoInduction' as const
    };
    const result = transformToDomainModel(mkModel({ autoInductions: [ai] }));
    expect(result.autoInductions[0].metadata).toEqual({});
  });
});
