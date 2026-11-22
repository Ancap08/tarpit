// The balance targets (milestone 28, docs/DESIGN.md "Balance targets"),
// each a check over the cached balance runs (balanceRuns.ts) or the wave
// tables. The balance tests (balance-*.test.ts) assert every one with its
// T, E, H or rule label; `npm run sim` prints them. Not part of the game
// bundle.

import { balanceRun, cachedRun, matrixCell, type BalanceRun } from './balanceRuns';
import { DIFFICULTY_DEFS, enemyMaxHp } from './difficulty';
import { ENEMY_STATS } from './enemies';
import { spawnTick } from './game';
import { comboBuild, comboWithoutSpecial } from './headless';
import { MAP_IDS, type MapId } from './map';
import type { EnemyType } from './types';
import { WAVES } from './waves';

export interface TargetResult {
  ok: boolean;
  /** What was measured, for the test message and the report. */
  info: string;
}

export interface Target {
  /** T1 .. T9, E1 .. E3, H1 .. H4, or R1 .. R6 for the 25c wave rules. */
  id: string;
  /** The map, or undefined for a rule over the tables. */
  map?: MapId;
  label: string;
  check: () => TargetResult;
}

const leaked = (run: BalanceRun, wave: number): number => Object.values(run.waves[wave - 1]?.exits ?? {}).reduce((a, b) => a + b, 0);
const spawned = (run: BalanceRun, wave: number): number => Object.values(run.waves[wave - 1]?.spawns ?? {}).reduce((a, b) => a + b, 0);
/** Strictly worse than `than`: lost while it won, or fewer lives. */
const worse = (run: BalanceRun, than: BalanceRun): boolean =>
  (run.phase === 'lost' && than.phase === 'won') || (run.phase === than.phase && run.phase === 'won' && run.lives < than.lives) || (run.phase === 'lost' && than.phase === 'lost' && run.tick < than.tick);
const lostOn = (run: BalanceRun, lo: number, hi: number): boolean => run.phase === 'lost' && run.wave >= lo && run.wave <= hi;

/** Per wave before milestone 25c: enemies and total bounty (no clear bonus), and comboBuild's clear ticks on Meadow, Normal. */
export const BEFORE_25C = {
  counts: [8, 12, 14, 14, 17, 35, 24, 45, 18, 30],
  bounty: [32, 48, 62, 78, 85, 169, 158, 249, 108, 357],
  clear: [951, 1447, 1162, 1321, 3101, 1705, 4199, 3788, 1992, 4640],
};

/** The most spawn ticks inside any half-open window [t, t + 180) (3 s). */
export function maxIn3s(ticks: readonly number[]): number {
  const a = [...ticks].sort((x, y) => x - y);
  let best = 0;
  for (let i = 0, j = 0; i < a.length; i++) {
    while (j < a.length && a[j] < a[i] + 180) j += 1;
    best = Math.max(best, j - i);
  }
  return best;
}

function waveSpawnTicks(wave: number, flying: boolean): number[] {
  return WAVES[wave].groups.filter((g) => ENEMY_STATS[g.type].flying === flying).flatMap((g) => Array.from({ length: g.count }, (_, i) => spawnTick(g, i)));
}

/** The combo build on Meadow, Normal, with every Tar Barrel use dropped from its special list (recorded by playing). */
export function comboNoTarBarrelRun(): BalanceRun {
  return cachedRun('comboBuild without Tar Barrel, meadow, normal', () => comboWithoutSpecial('tarBarrel'), 'normal');
}

function mapTargets(map: MapId): Target[] {
  const r = (name: Parameters<typeof balanceRun>[0], level: 'easy' | 'normal' | 'hard' = 'normal') => balanceRun(name, map, level);
  const t = (id: string, label: string, check: () => TargetResult): Target => ({ id, map, label, check });
  return [
    t('T1', 'Normal: noTowers loses by wave 3', () => {
      const x = r('noTowers');
      return { ok: x.phase === 'lost' && x.wave <= 3, info: matrixCell(x) };
    }),
    t('T2', 'Normal: lazyBuild loses on wave 6 to 9', () => {
      const x = r('lazyBuild');
      return { ok: lostOn(x, 6, 9), info: matrixCell(x) };
    }),
    t('T3', 'Normal: longbowSpam loses on wave 7 to 9', () => {
      const x = r('longbowSpam');
      return { ok: lostOn(x, 7, 9), info: matrixCell(x) };
    }),
    t('T4', 'Normal: comboBuild wins with 5 to 18 lives', () => {
      const x = r('comboBuild');
      return { ok: x.phase === 'won' && x.lives >= 5 && x.lives <= 18, info: matrixCell(x) };
    }),
    t('T5', 'Normal: comboBuildNoFire is strictly worse than comboBuild', () => {
      const x = r('comboBuildNoFire');
      const c = r('comboBuild');
      return { ok: worse(x, c), info: `${matrixCell(x)} against ${matrixCell(c)}` };
    }),
    t('T6', 'Normal: comboNoSpecials is strictly worse than comboBuild and reaches wave 8', () => {
      const x = r('comboNoSpecials');
      const c = r('comboBuild');
      return { ok: worse(x, c) && x.wave >= 8, info: `${matrixCell(x)} against ${matrixCell(c)}` };
    }),
    t('T7', "Normal: noAntiAir leaks at least 75% of wave 4's Harpies, survives wave 4, loses on wave 5 to 8", () => {
      const x = r('noAntiAir');
      const w4 = x.waves[3];
      const out = w4?.exits.harpy ?? 0;
      const all = w4?.spawns.harpy ?? 0;
      return {
        ok: all > 0 && out >= 0.75 * all && w4.phase === 'setup' && lostOn(x, 5, 8),
        info: `${out} of ${all} Harpies out, ${w4?.lives} lives after wave 4, ${matrixCell(x)}`,
      };
    }),
    t('T8', "Normal: oneMusket leaks at most 6 of wave 1's enemies", () => {
      const x = r('oneMusket');
      return { ok: leaked(x, 1) <= 6, info: `${leaked(x, 1)} of ${spawned(x, 1)} leak` };
    }),
    t('E1', 'Easy: lazyBuild wins', () => {
      const x = r('lazyBuild', 'easy');
      return { ok: x.phase === 'won', info: matrixCell(x) };
    }),
    t('E2', 'Easy: noTowers loses', () => {
      const x = r('noTowers', 'easy');
      return { ok: x.phase === 'lost', info: matrixCell(x) };
    }),
    t('E3', 'Easy: oneMusket leaks at most 3 on wave 1', () => {
      const x = r('oneMusket', 'easy');
      return { ok: leaked(x, 1) <= 3, info: `${leaked(x, 1)} of ${spawned(x, 1)} leak` };
    }),
    t('H1', 'Hard: hardBuild wins', () => {
      const x = r('hardBuild', 'hard');
      return { ok: x.phase === 'won', info: matrixCell(x) };
    }),
    t('H2', 'Hard: lazyBuild survives wave 1 and loses by wave 5', () => {
      const x = r('lazyBuild', 'hard');
      return { ok: x.waves[0]?.phase === 'setup' && x.phase === 'lost' && x.wave <= 5, info: `${x.waves[0]?.lives} lives after wave 1, ${matrixCell(x)}` };
    }),
    t('H3', 'Hard: comboBuild has at least 5 fewer lives than on Normal, or loses on wave 8 or later', () => {
      const x = r('comboBuild', 'hard');
      const n = r('comboBuild');
      const ok = (x.phase === 'lost' && x.wave >= 8) || (x.phase === 'won' && n.phase === 'won' && x.lives <= n.lives - 5);
      return { ok, info: `${matrixCell(x)} against ${matrixCell(n)} on Normal` };
    }),
  ];
}

const meadowExtras: Target[] = [
  {
    id: 'T9',
    map: 'meadow',
    label: 'Meadow, Normal: comboBuild has under 200 gold entering wave 10',
    check: () => {
      const g = balanceRun('comboBuild', 'meadow', 'normal').waves[9]?.goldEntering;
      return { ok: g !== undefined && g < 200, info: `${g} gold` };
    },
  },
  {
    id: 'T9',
    map: 'meadow',
    label: 'Meadow, Normal: soundBuild lasts strictly longer than soundBuildNoTar',
    check: () => {
      const s = balanceRun('soundBuild', 'meadow', 'normal');
      const n = balanceRun('soundBuildNoTar', 'meadow', 'normal');
      const ok = (s.phase === 'won' && n.phase === 'lost') || (s.phase === 'lost' && n.phase === 'lost' && s.tick > n.tick);
      return { ok, info: `${matrixCell(s)} at tick ${s.tick} against ${matrixCell(n)} at tick ${n.tick}` };
    },
  },
  {
    id: 'T9',
    map: 'meadow',
    label: "Meadow, Normal: dropping the Tar Barrel uses from the combo's special list is strictly worse (lives, then kills)",
    check: () => {
      const c = balanceRun('comboBuild', 'meadow', 'normal');
      const x = comboNoTarBarrelRun();
      const uses = comboBuild().timed!.flat().filter((a) => a.type === 'special' && a.special === 'tarBarrel').length;
      const ok = uses > 0 && (worse(x, c) || (x.phase === c.phase && x.lives === c.lives && x.kills < c.kills));
      return { ok, info: `${uses} barrels; without: ${matrixCell(x)}, ${x.kills} kills; with: ${matrixCell(c)}, ${c.kills} kills` };
    },
  },
];

/** H4 and the milestone 25c wave rules (R1 to R5), over the tables. */
export const RULE_TARGETS: Target[] = [
  {
    id: 'H4',
    label: 'no Hard hp is 1 or 2 above a multiple of 12, 4, 25 or 45',
    check: () => {
      const bad: string[] = [];
      for (const type of Object.keys(ENEMY_STATS) as EnemyType[]) {
        const hp = enemyMaxHp(type, 'hard');
        for (const d of [12, 4, 25, 45]) if (hp % d === 1 || hp % d === 2) bad.push(`${type} ${hp} (${d})`);
      }
      return { ok: bad.length === 0, info: bad.join(', ') || `Hard x${DIFFICULTY_DEFS.hard.hpMultiplier}` };
    },
  },
  {
    id: 'R1',
    label: 'at most 6 walkers and 4 flyers spawn in any 3 s of any wave',
    check: () => {
      const got = WAVES.map((_, w) => [maxIn3s(waveSpawnTicks(w, false)), maxIn3s(waveSpawnTicks(w, true))]);
      return { ok: got.every(([g, f]) => g <= 6 && f <= 4), info: got.map(([g, f]) => `${g}/${f}`).join(' ') };
    },
  },
  {
    id: 'R2',
    label: 'every wave has at least as many enemies and more bounty than before milestone 25c',
    check: () => {
      const count = WAVES.map((w) => w.groups.reduce((n, g) => n + g.count, 0));
      const bounty = WAVES.map((w) => w.groups.reduce((n, g) => n + g.count * ENEMY_STATS[g.type].bounty, 0));
      const ok = count.every((n, i) => n >= BEFORE_25C.counts[i]) && bounty.every((b, i) => b > BEFORE_25C.bounty[i]);
      return { ok, info: `enemies ${count.join(' ')}; bounty ${bounty.join(' ')}` };
    },
  },
  {
    id: 'R3',
    label: 'the ten waves hold 434 to 651 enemies (2 to 3 times the 217 before 25c)',
    check: () => {
      const n = WAVES.reduce((s, w) => s + w.groups.reduce((a, g) => a + g.count, 0), 0);
      return { ok: n >= 434 && n <= 651, info: `${n} enemies` };
    },
  },
  {
    id: 'R4',
    label: "every wave's last spawn is within 90 s",
    check: () => {
      const last = WAVES.map((w) => Math.max(...w.groups.map((g) => spawnTick(g, g.count - 1))));
      return { ok: last.every((t) => t <= 90 * 60), info: `longest ${Math.max(...last) / 60} s` };
    },
  },
  {
    id: 'R5',
    label: 'Meadow, Normal, comboBuild: every wave clears at least 15% later than before 25c, 540 to 800 s in all, at most 35 alive',
    map: 'meadow',
    check: () => {
      const c = balanceRun('comboBuild', 'meadow', 'normal');
      const clear = c.waves.map((w) => w.ticks);
      const total = clear.reduce((a, b) => a + b, 0) / 60;
      const peak = Math.max(...c.waves.map((w) => w.peak));
      const ok = clear.length === 10 && clear.every((t, i) => t >= 1.15 * BEFORE_25C.clear[i]) && total >= 540 && total <= 800 && peak <= 35;
      return { ok, info: `clear ${clear.join(' ')}; ${total.toFixed(1)} s; peak ${peak}` };
    },
  },
];

/** Every target, map by map (Meadow's extras after its own), then the rules. */
export const TARGETS: Target[] = [...MAP_IDS.flatMap((map) => [...mapTargets(map), ...(map === 'meadow' ? meadowExtras : [])]), ...RULE_TARGETS];
