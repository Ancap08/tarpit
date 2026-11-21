import type { GameState, GroupDef, WaveDef, WavePreviewEntry } from './types';

function g(type: GroupDef['type'], count: number, interval: number, delay = 0): GroupDef {
  return { type, count, interval, delay };
}

/**
 * The 10 waves from docs/DESIGN.md, in seconds as written. Index 0 is wave 1.
 * Milestone 22 added the Harpy groups (waves 4, 5, 7, 8, 10) and the
 * Shieldbearer groups (waves 6, 8, 10) as each wave's last groups; the older
 * groups are unchanged. Milestone 23 adds the boss as wave 10's last group.
 * Wave 9 has none so the combo build's gold after
 * wave 9 stays under 150 (balance.test.ts).
 */
export const WAVES: readonly WaveDef[] = [
  { groups: [g('goblin', 8, 1.0)] },
  { groups: [g('goblin', 12, 0.8)] },
  { groups: [g('goblin', 8, 1.0), g('wolf', 6, 0.6, 4)] },
  { groups: [g('wolf', 10, 0.6), g('harpy', 4, 1.2, 2)] },
  { groups: [g('goblin', 12, 0.7), g('troll', 2, 3, 2), g('harpy', 3, 1.0, 6)] },
  { groups: [g('goblin', 18, 0.5), g('wolf', 14, 0.5, 5), g('shieldbearer', 3, 2.0, 3)] },
  { groups: [g('wolf', 10, 0.5), g('troll', 10, 2.5, 1), g('harpy', 4, 1.0, 8)] },
  {
    groups: [g('goblin', 20, 0.5), g('wolf', 10, 0.6, 6), g('troll', 8, 3, 3), g('shieldbearer', 3, 2.5, 4), g('harpy', 4, 1.0, 10)],
  },
  { groups: [g('wolf', 12, 0.5), g('troll', 6, 2)] },
  {
    groups: [
      g('wolf', 8, 0.5, 4),
      g('troll', 12, 2),
      g('harpy', 5, 0.8, 6),
      g('shieldbearer', 4, 2.0, 2),
      // Milestone 23: Grumblefoot, the Troll King, last. The latest spawn of
      // the groups above is the 12th Troll at 11 * 2 = 22 s (Wolves end at
      // 7.5 s, Harpies at 9.2 s, Shieldbearers at 8 s); he comes 4 s later,
      // at 26 s (waveTick 1560).
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
