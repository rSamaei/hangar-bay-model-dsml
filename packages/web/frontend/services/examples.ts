export interface Example {
  id: string;
  name: string;
  description: string;
  file: string;
  category: 'basic' | 'auto-scheduling' | 'complex' | 'validation';
}

export const examples: Example[] = [
  {
    id: 'raf-valley',
    name: 'RAF Valley Base',
    description: 'Full-featured scenario: access paths, traversable bays, multi-bay C130, span direction, time windows',
    file: '/examples/01-raf-valley-base.air',
    category: 'complex'
  },
  {
    id: 'access-paths',
    name: 'Access Paths & Reachability',
    description: 'Corridor width bottleneck, SFR22_CORRIDOR_FIT, SFR21_DYNAMIC_REACHABILITY, traversable through-bay',
    file: '/examples/02-access-paths-and-reachability.air',
    category: 'complex'
  },
  {
    id: 'multi-bay',
    name: 'Large Aircraft Multi-Bay',
    description: 'A400M and C17 requiring 4 bays, adjacency 8 diagonal contiguity, combined bay-set fit checks',
    file: '/examples/03-large-aircraft-multi-bay.air',
    category: 'validation'
  },
  {
    id: 'quick-fixes',
    name: 'Quick Fixes Showcase',
    description: 'Three fixable errors (wingspan fit, contiguity gap, bay count) — press Ctrl+. on any squiggle to auto-fix',
    file: '/examples/04-quick-fixes-showcase.air',
    category: 'validation'
  },
  {
    id: 'simulation',
    name: 'Simulation Showcase',
    description: 'Discrete-event simulation: bay contention, deadline expiry, hangar fallback, dependency chains',
    file: '/examples/05-simulation-showcase.air',
    category: 'auto-scheduling'
  }
];

export async function loadExample(file: string): Promise<string> {
  const response = await fetch(file);
  if (!response.ok) {
    throw new Error(`Failed to load example: ${response.statusText}`);
  }
  return await response.text();
}

export function getExamplesByCategory(category: string): Example[] {
  return examples.filter(ex => ex.category === category);
}