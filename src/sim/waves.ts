import { isBoss } from './enemies';
import type { GameState, GroupDef, WaveDef, WavePreviewEntry } from './types';

function g(type: GroupDef['type'], count: number, interval: number, delay = 0): GroupDef {
  return { type, count, interval, delay };
}

/**
 * The 20 waves from docs/DESIGN.md, in seconds as written. Index 0 is wave 1.
 * Milestone 22 added the Harpy and Shieldbearer groups; milestone 23 the
 * boss as wave 10's last group. Milestone 25c (horde retune, second pass):
 * many more enemies than before 25c, spread out so that in any 3 s of a
 * wave at most 6 walkers and 4 flyers spawn (waves.test.ts), and waves
 * last longer: wave 4 sends its Harpies first, then Goblins. Milestone 28:
 * wave 1's Goblins come every 2.5 s (1.2 before), so one Musketeer stops
 * them all on Easy and Normal (balance targets N8, E3).
 */
export const WAVES: readonly WaveDef[] = [
  { groups: [g('goblin', 20, 2.5)] },
  { groups: [g('goblin', 32, 0.9)] },
  { groups: [g('goblin', 22, 1.0), g('wolf', 12, 1.5, 4.5)] },
  { groups: [g('harpy', 10, 1.0), g('goblin', 30, 1.0, 3)] },
  { groups: [g('goblin', 40, 1.0), g('troll', 3, 10, 10), g('harpy', 10, 1.2, 8)] },
  { groups: [g('goblin', 45, 1.0), g('wolf', 35, 1.0, 9), g('shieldbearer', 6, 1.5, 0.5)] },
  { groups: [g('wolf', 26, 1.5), g('troll', 13, 4.4, 1), g('harpy', 16, 1.0, 8)] },
  {
    groups: [g('goblin', 50, 1.5), g('wolf', 25, 1.5, 6.75), g('troll', 13, 4.9, 3), g('shieldbearer', 6, 6, 4), g('harpy', 14, 1.2, 10)],
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
  { groups: [g('goblin', 33, 0.85), g('shieldbearer', 14, 1.5, 5.76), g('harpy', 14, 1.1, 11.52)] },
  { groups: [g('wolf', 35, 0.75), g('troll', 11, 1.5, 0.375), g('harpy', 14, 1, 5)] },
  { groups: [g('goblin', 39, 0.75), g('shieldbearer', 14, 1.5, 0.375), g('harpy', 16, 0.75, 4)] },
  { groups: [g('wolf', 29, 1.48), g('troll', 14, 2.6, 0.375), g('harpy', 17, 2, 12)] },
  { groups: [g('goblin', 14, 1.5, 3), g('wolf', 19, 1.7, 3), g('troll', 19, 2, 8), g('harpy', 16, 0.75, 9.36)] },
  { groups: [g('goblin', 33, 2), g('shieldbearer', 20, 2.36, 2.304), g('harpy', 19, 2.2), g('troll', 15, 2.25, 12)] },
  { groups: [g('wolf', 31, 1.44), g('troll', 15, 1.1, 2), g('harpy', 20, 2.16)] },
  { groups: [g('goblin', 23, 1.7), g('troll', 15, 1.25, 8), g('shieldbearer', 9, 5, 3), g('harpy', 19, 2.8, 8)] },
  { groups: [g('wolf', 33, 1.85), g('troll', 15, 2.25), g('harpy', 21, 2.75, 4)] },
  {
    groups: [
      g('wolf', 8, 1.55),
      g('shieldbearer', 5, 2, 4),
      g('harpy', 8, 1.65, 5),
      g('troll', 6, 1.7, 9),
      g('grumblemaw', 1, 0, 19.5),
    ],
  },
];

/** Grumblefoot closes the first act. */
export const ACT_ONE_LAST_WAVE = 10;

/** The last wave of the table: winning it wins the game unless the player keeps going (milestone 26). */
export const LAST_WAVE = WAVES.length;

/** Enemy hp multiplier per three-wave cycle after the first endless cycle. */
export const ENDLESS_HP_GROWTH = 1.8;
/** Enemy hp multiplier in the first endless cycle. */
export const ENDLESS_START_HP = 1.05;
/** The campaign waves repeated in endless mode, with bosses excluded. */
export const ENDLESS_BASE_WAVES: readonly number[] = [18, 19, 20];
/** Endless mode: the extra Harpy group has 8 + 2 x cycle Harpies ... */
export const ENDLESS_HARPY_BASE = 8;
export const ENDLESS_HARPY_PER_CYCLE = 2;
/** ... and never more than this. */
export const ENDLESS_HARPY_MAX = 16;
/** Endless mode: seconds between the extra group's Harpies. */
export const ENDLESS_HARPY_INTERVAL = 0.75;
/** Endless mode: the extra Harpy group starts this many seconds after the base wave's last spawn. */
export const ENDLESS_HARPY_GAP = 2;

/** The endless cycle of wave `n` (n >= 21): 1 for waves 21 to 23, 2 for 24 to 26, and so on. */
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
 * 20 are the table (WAVES[n - 1], the same object). From wave 21 the waves
 * are generated: with k = n - 21 and cycle = floor(k / 3) + 1, the groups
 * of table wave 18, 19 or 20 (k % 3 = 0, 1, 2) without either boss, plus one
 * Harpy group of min(16, 8 + 2 x cycle) Harpies, one every 0.75 s,
 * starting 2 s after the base wave's last spawn; `hpMultiplier` is
 * ENDLESS_START_HP x ENDLESS_HP_GROWTH ^ (cycle - 1), applied on top of the
 * difficulty and wave 20 campaign factors.
 * Bounties, speeds and lives cost do not change. Pure and deterministic.
 */
export function waveDef(n: number): WaveDef {
  if (!Number.isInteger(n) || n < 1) throw new Error(`waveDef: no wave ${n}`);
  if (n <= LAST_WAVE) return WAVES[n - 1];
  const cached = endlessCache.get(n);
  if (cached) return cached;
  const k = n - LAST_WAVE - 1;
  const cycle = endlessCycle(n);
  const base = WAVES[ENDLESS_BASE_WAVES[k % ENDLESS_BASE_WAVES.length] - 1].groups.filter((grp) => !isBoss(grp));
  const last = Math.max(...base.map(lastSpawnSeconds));
  const harpies = Math.min(ENDLESS_HARPY_MAX, ENDLESS_HARPY_BASE + ENDLESS_HARPY_PER_CYCLE * cycle);
  const def: WaveDef = {
    groups: [...base, g('harpy', harpies, ENDLESS_HARPY_INTERVAL, last + ENDLESS_HARPY_GAP)],
    hpMultiplier: ENDLESS_START_HP * ENDLESS_HP_GROWTH ** (cycle - 1),
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
