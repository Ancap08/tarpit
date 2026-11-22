import type { GameState, GroupDef, WaveDef, WavePreviewEntry } from './types';

function g(type: GroupDef['type'], count: number, interval: number, delay = 0): GroupDef {
  return { type, count, interval, delay };
}

/**
 * The 10 waves from docs/DESIGN.md, in seconds as written. Index 0 is wave 1.
 * Milestone 22 added the Harpy and Shieldbearer groups; milestone 23 the
 * boss as wave 10's last group. Milestone 25c (horde retune): about 2.4
 * times the enemies, each weaker, waves a little longer; wave 4 sends its
 * Harpies first (the anti-air test), then the Wolves.
 */
export const WAVES: readonly WaveDef[] = [
  { groups: [g('goblin', 20, 0.8)] },
  { groups: [g('goblin', 30, 0.6)] },
  { groups: [g('goblin', 20, 0.7), g('wolf', 15, 0.5, 4)] },
  { groups: [g('harpy', 10, 0.8), g('wolf', 25, 0.5, 3)] },
  { groups: [g('goblin', 30, 0.5), g('troll', 2, 3, 2), g('harpy', 10, 0.6, 6)] },
  { groups: [g('goblin', 45, 0.5), g('wolf', 35, 0.5, 5), g('shieldbearer', 6, 1.5, 3)] },
  { groups: [g('wolf', 25, 0.4), g('troll', 14, 1.9, 1), g('harpy', 16, 0.6, 8)] },
  {
    groups: [g('goblin', 50, 0.5), g('wolf', 25, 0.5, 6), g('troll', 11, 2.4, 3), g('shieldbearer', 6, 1.8, 4), g('harpy', 14, 0.6, 10)],
  },
  { groups: [g('wolf', 30, 0.35), g('troll', 7, 2)] },
  {
    groups: [
      g('wolf', 20, 0.35, 4),
      g('troll', 13, 2),
      g('harpy', 12, 0.6, 6),
      g('shieldbearer', 8, 1.4, 2),
      // Milestone 23: Grumblefoot, the Troll King, last. The latest spawn of
      // the groups above is the 13th Troll at 12 * 2 = 24 s (Wolves end at
      // 10.65 s, Harpies at 12.6 s, Shieldbearers at 11.8 s); he comes 2 s
      // later, at 26 s (waveTick 1560).
      g('boss', 1, 0, 26),
    ],
  },
];

/** Each group of the next wave as {type, count}; empty after the last wave. */
export function nextWavePreview(state: GameState): WavePreviewEntry[] {
  const next = WAVES[state.wave];
  if (!next) return [];
  return next.groups.map((grp) => ({ type: grp.type, count: grp.count }));
}
