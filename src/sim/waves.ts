import type { GameState, GroupDef, WaveDef, WavePreviewEntry } from './types';

function g(type: GroupDef['type'], count: number, interval: number, delay = 0): GroupDef {
  return { type, count, interval, delay };
}

/**
 * The 10 waves from docs/DESIGN.md, in seconds as written. Index 0 is wave 1.
 * Milestone 22 added the Harpy and Shieldbearer groups; milestone 23 the
 * boss as wave 10's last group. Milestone 25c (horde retune, second pass):
 * many more enemies than before 25c, spread out so that in any 3 s of a
 * wave at most 6 walkers and 4 flyers spawn (waves.test.ts), and waves
 * last longer: wave 4 sends its Harpies first, then Goblins.
 */
export const WAVES: readonly WaveDef[] = [
  { groups: [g('goblin', 20, 1.2)] },
  { groups: [g('goblin', 32, 0.9)] },
  { groups: [g('goblin', 22, 1.0), g('wolf', 12, 1.5, 4.5)] },
  { groups: [g('harpy', 10, 1.5), g('goblin', 30, 1.0, 3)] },
  { groups: [g('goblin', 40, 1.0), g('troll', 3, 8, 10), g('harpy', 10, 1.2, 8)] },
  { groups: [g('goblin', 45, 1.0), g('wolf', 35, 1.0, 9), g('shieldbearer', 6, 1.5, 0.5)] },
  { groups: [g('wolf', 26, 1.5), g('troll', 13, 4.5, 1), g('harpy', 16, 1.0, 8)] },
  {
    groups: [g('goblin', 50, 1.5), g('wolf', 25, 1.5, 6.75), g('troll', 13, 5, 3), g('shieldbearer', 6, 6, 4), g('harpy', 14, 1.2, 10)],
  },
  { groups: [g('wolf', 30, 1.0), g('troll', 10, 2, 2)] },
  {
    groups: [
      g('wolf', 20, 1.5, 4),
      g('troll', 15, 4.5),
      g('harpy', 12, 1.5, 6),
      g('shieldbearer', 8, 5, 2.5),
      // Milestone 23: Grumblefoot, the Troll King, last. The latest spawn of
      // the groups above is the 15th Troll at 14 * 4.5 = 63 s; he comes 2 s
      // later, at 65 s (waveTick 3900).
      g('boss', 1, 0, 65),
    ],
  },
];

/** Each group of the next wave as {type, count}; empty after the last wave. */
export function nextWavePreview(state: GameState): WavePreviewEntry[] {
  const next = WAVES[state.wave];
  if (!next) return [];
  return next.groups.map((grp) => ({ type: grp.type, count: grp.count }));
}
