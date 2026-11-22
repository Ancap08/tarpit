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

/** The last wave of the table: winning it wins the game unless the player keeps going (milestone 26). */
export const LAST_WAVE = WAVES.length;

/**
 * Endless mode (milestone 26): enemy hp grows by this factor per cycle of
 * three waves. The scope's 1.15 let the idle combo build live to wave 25
 * on Normal (target 11 to 16): it lost no life before about 2x hp. 1.6
 * (about 1.17 per wave) puts it at wave 15 (DEVLOG).
 */
export const ENDLESS_HP_GROWTH = 1.6;
/** Endless mode: the waves 11, 12, 13, ... repeat these table waves (8, 9, 10) in turn. */
export const ENDLESS_BASE_WAVES: readonly number[] = [8, 9, 10];
/** Endless mode: the extra Harpy group has 8 + 2 x cycle Harpies ... */
export const ENDLESS_HARPY_BASE = 8;
export const ENDLESS_HARPY_PER_CYCLE = 2;
/** ... and never more than this. */
export const ENDLESS_HARPY_MAX = 16;
/** Endless mode: seconds between the extra group's Harpies. */
export const ENDLESS_HARPY_INTERVAL = 0.75;
/** Endless mode: the extra Harpy group starts this many seconds after the base wave's last spawn. */
export const ENDLESS_HARPY_GAP = 2;

/** The endless cycle of wave `n` (n >= 11): 1 for waves 11 to 13, 2 for 14 to 16, and so on. */
export function endlessCycle(n: number): number {
  return Math.floor((n - LAST_WAVE - 1) / ENDLESS_BASE_WAVES.length) + 1;
}

/** Seconds after the wave start of a group's last spawn. */
function lastSpawnSeconds(grp: GroupDef): number {
  return grp.delay + (grp.count - 1) * grp.interval;
}

const endlessCache = new Map<number, WaveDef>();

/**
 * The wave played as wave `n` (1-based, n >= 1; milestone 26). Waves 1 to
 * 10 are the table (WAVES[n - 1], the same object). From wave 11 the waves
 * are generated: with k = n - 11 and cycle = floor(k / 3) + 1, the groups
 * of table wave 8, 9 or 10 (k % 3 = 0, 1, 2) without the boss, plus one
 * Harpy group of min(16, 8 + 2 x cycle) Harpies, one every 0.75 s,
 * starting 2 s after the base wave's last spawn; `hpMultiplier` is
 * ENDLESS_HP_GROWTH ^ cycle (1.6 ^ cycle), applied at spawn on top of the level's multiplier.
 * Bounties, speeds and lives cost do not change. Pure and deterministic.
 */
export function waveDef(n: number): WaveDef {
  if (!Number.isInteger(n) || n < 1) throw new Error(`waveDef: no wave ${n}`);
  if (n <= LAST_WAVE) return WAVES[n - 1];
  const cached = endlessCache.get(n);
  if (cached) return cached;
  const k = n - LAST_WAVE - 1;
  const cycle = endlessCycle(n);
  const base = WAVES[ENDLESS_BASE_WAVES[k % ENDLESS_BASE_WAVES.length] - 1].groups.filter((grp) => grp.type !== 'boss');
  const last = Math.max(...base.map(lastSpawnSeconds));
  const harpies = Math.min(ENDLESS_HARPY_MAX, ENDLESS_HARPY_BASE + ENDLESS_HARPY_PER_CYCLE * cycle);
  const def: WaveDef = {
    groups: [...base, g('harpy', harpies, ENDLESS_HARPY_INTERVAL, last + ENDLESS_HARPY_GAP)],
    hpMultiplier: ENDLESS_HP_GROWTH ** cycle,
  };
  endlessCache.set(n, def);
  return def;
}

/**
 * Whether a wave follows the current one (milestone 26): always in an
 * endless game, otherwise until the last wave of the table.
 */
export function hasNextWave(state: Pick<GameState, 'wave' | 'endless'>): boolean {
  return state.endless || state.wave < LAST_WAVE;
}

/** Each group of the next wave as {type, count}; empty after the last wave unless the game is endless. */
export function nextWavePreview(state: GameState): WavePreviewEntry[] {
  if (!hasNextWave(state)) return [];
  return waveDef(state.wave + 1).groups.map((grp) => ({ type: grp.type, count: grp.count }));
}
