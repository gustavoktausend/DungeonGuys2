// mutators.ts — MUTATORS, ported verbatim from ORIG/ui.js:116-122.
// Rotating modifiers on non-boss waves.

import type { MutatorKey } from '../types';

export const MUTATORS: Record<MutatorKey, { name: string; desc: string }> = {
  swarm:  { name: 'SWARM',      desc: 'MORE BUT WEAKER FOES' },
  frenzy: { name: 'FRENZY',     desc: 'FASTER ENEMIES' },
  bounty: { name: 'BOUNTY',     desc: 'DOUBLE GOLD' },
  elite:  { name: 'ELITE HUNT', desc: 'MANY CHAMPIONS' },
  fog:    { name: 'FOG',        desc: 'LIMITED VISION' },
};
