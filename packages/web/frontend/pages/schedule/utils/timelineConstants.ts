import type { PlacementColor } from './placementCheck';

// ─── Layout constants ──────────────────────────────────────────────────────
export const LABEL_W  = 164;
export const BAY_H    = 48;
export const GROUP_H  = 28;
export const HEADER_H = 40;

// ─── View presets ──────────────────────────────────────────────────────────
export const PRESETS = [
  { label: '6h',     hours: 6,   pxH: 180, slotMin: 30  },
  { label: '12h',    hours: 12,  pxH: 100, slotMin: 30  },
  { label: '24h',    hours: 24,  pxH: 60,  slotMin: 60  },
  { label: '48h',    hours: 48,  pxH: 32,  slotMin: 60  },
  { label: '1 week', hours: 168, pxH: 12,  slotMin: 240 },
] as const;

export const BLOCK_COLS = [
  'bg-cyan-700/75   border-cyan-500/60   text-cyan-50',
  'bg-blue-700/75   border-blue-500/60   text-blue-50',
  'bg-violet-700/75 border-violet-500/60 text-violet-50',
  'bg-emerald-700/75 border-emerald-500/60 text-emerald-50',
  'bg-amber-700/75  border-amber-500/60  text-amber-50',
  'bg-rose-700/75   border-rose-500/60   text-rose-50',
] as const;

export const PREVIEW_COLS: Record<PlacementColor, string> = {
  green: 'bg-emerald-500/25 border-emerald-400/60',
  red:   'bg-red-500/25   border-red-400/60',
  amber: 'bg-amber-500/25  border-amber-400/60',
};
