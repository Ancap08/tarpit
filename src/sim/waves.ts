import type { GameState, GroupDef, WaveDef, WavePreviewEntry } from './types';

function g(type: GroupDef['type'], count: number, interval: number, delay = 0): GroupDef {
  return { type, count, interval, delay };
}

/** The 10 waves from docs/DESIGN.md, in seconds as written. Index 0 is wave 1. */
export const WAVES: readonly WaveDef[] = [
  { groups: [g('goblin', 8, 1.0)] },
  { groups: [g('goblin', 12, 0.8)] },
  { groups: [g('goblin', 8, 1.0), g('wolf', 6, 0.6, 4)] },
  { groups: [g('wolf', 10, 0.6)] },
  { groups: [g('goblin', 12, 0.7), g('troll', 2, 3, 2)] },
  { groups: [g('goblin', 18, 0.5), g('wolf', 14, 0.5, 5)] },
  { groups: [g('wolf', 10, 0.5), g('troll', 10, 2.5, 1)] },
  { groups: [g('goblin', 20, 0.5), g('wolf', 10, 0.6, 6), g('troll', 8, 3, 3)] },
  { groups: [g('wolf', 12, 0.5), g('troll', 6, 2)] },
  { groups: [g('wolf', 8, 0.5, 4), g('troll', 12, 2)] },
];

/** Each group of the next wave as {type, count}; empty after the last wave. */
export function nextWavePreview(state: GameState): WavePreviewEntry[] {
  const next = WAVES[state.wave];
  if (!next) return [];
  return next.groups.map((grp) => ({ type: grp.type, count: grp.count }));
}
