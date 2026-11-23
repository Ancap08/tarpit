// The balance targets (milestone 28, docs/DESIGN.md "Balance targets"),
// each a check over the cached balance runs (balanceRuns.ts) or the wave
// tables. The balance tests (balance-*.test.ts) assert every one with its
// T, E, H or rule label; `npm run sim` prints them. Not part of the game
// bundle.

import { boonOptions, type BoonId } from './boons';
import { archetypeScript, balanceRun, cachedRun, matrixCell, type BalanceRun } from './balanceRuns';
import { DIFFICULTY_DEFS, enemyMaxHp } from './difficulty';
import { ENEMY_STATS, isBoss } from './enemies';
import { spawnTick } from './game';
import { comboChoiceRun, comboWithoutSpecial, ENDLESS_WAVE_CAP, type BoonChoices, type RecordedOutcome, type WaveScript } from './headless';
import { SPECIAL_DEFS, SPECIAL_TYPES, type SpecialType } from './specials';
import { MAP_IDS, type MapId } from './map';
import type { EnemyType, TowerType } from './types';
import { TOWER_DEFS, TOWER_PATHS } from './towers';
import { cellKey } from './grid';
import { ACT_ONE_LAST_WAVE, LAST_WAVE, WAVES } from './waves';

export interface TargetResult {
  ok: boolean;
  /** What was measured, for the test message and the report. */
  info: string;
}

export interface Target {
  /** The target ID from the design spec. */
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
  (run.phase === 'lost' && than.phase === 'won') || (run.phase === 'won' && than.phase === 'won' && run.lives < than.lives);
const lostOn = (run: BalanceRun, lo: number, hi: number): boolean => run.phase === 'lost' && run.wave >= lo && run.wave <= hi;

/** Per-wave Meadow Normal combo clear ticks before milestone 25c. */
export const BEFORE_25C = {
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

/** The combo build on Meadow, Normal, with the special policy forbidden one special (milestone 30, recorded by playing). */
export function comboWithoutSpecialRun(type: SpecialType): BalanceRun {
  return cachedRun(`comboBuild without ${type}, meadow, normal`, () => comboWithoutSpecial(type), 'normal');
}

/** Target T6's margin (milestone 30): comboBuild has at least this many more lives than comboNoSpecials on Normal. */
export const SPECIALS_LIVES_MARGIN = 3;
/** Target S3 (milestone 30): in comboBuild on Meadow, Normal, at least this many specials ... */
export const S3_MIN_SPECIALS = 30;
/** ... and at least this share of them catch S3_MIN_CATCH or more enemies. */
export const S3_MIN_SHARE = 0.8;
export const S3_MIN_CATCH = 3;

/** Gold committed by a scripted player to building and upgrading towers. */
function purchaseBudget(script: WaveScript): number {
  const homes = new Map<number, TowerType>();
  let gold = 0;
  for (const action of script.flat()) {
    const key = cellKey(action.cell);
    if (action.type === 'build') {
      homes.set(key, action.tower);
      gold += TOWER_DEFS[action.tower].cost;
    } else if (action.type === 'upgrade') {
      const type = homes.get(key)!;
      gold += action.path ? TOWER_PATHS[type].cost : TOWER_DEFS[type].upgradeCost;
    }
  }
  return gold;
}

function mapTargets(map: MapId): Target[] {
  const r = (name: Parameters<typeof balanceRun>[0], level: 'easy' | 'normal' | 'hard' = 'normal') => balanceRun(name, map, level);
  const t = (id: string, label: string, check: () => TargetResult): Target => ({ id, map, label, check });
  return [
    t('N1', 'Normal: noTowers loses by wave 3', () => {
      const x = r('noTowers');
      return { ok: x.phase === 'lost' && x.wave <= 3, info: matrixCell(x) };
    }),
    t('N2', 'Normal: lazyBuild loses on wave 7 to 14', () => {
      const x = r('lazyBuild');
      return { ok: lostOn(x, 7, 14), info: matrixCell(x) };
    }),
    t('N3', 'Normal: longbowSpam loses on wave 8 to 16', () => {
      const x = r('longbowSpam');
      return { ok: lostOn(x, 8, 16), info: matrixCell(x) };
    }),
    t('U1', 'Normal: comboBuild wins with 8 to 17 lives', () => {
      const x = r('comboBuild');
      return { ok: x.phase === 'won' && x.lives >= 8 && x.lives <= 17, info: matrixCell(x) };
    }),
    t('U2', 'removing all second upgrades costs five lives or the game', () => {
      const combo = r('comboBuild');
      const plain = cachedRun(`no second upgrades on ${map}`, () => comboChoiceRun(map, 'skip'), 'normal');
      const bought = archetypeScript('comboBuild', map, 'normal').flat().filter((a) => a.type === 'upgrade' && a.path).length;
      return { ok: bought > 0 && plain.refused === 0 && combo.phase === 'won' && (plain.phase === 'lost' || combo.lives - plain.lives >= 5),
        info: `${bought} branches: ${matrixCell(combo)} against ${matrixCell(plain)}` };
    }),
    t('U3', 'wideBuild spends the branch budget on level-two towers and stays within six lives', () => {
      const wide = r('wideBuild');
      const easy = r('wideBuild', 'easy');
      const combo = r('comboBuild');
      const wideScript = archetypeScript('wideBuild', map, 'normal');
      const tallScript = archetypeScript('comboBuild', map, 'normal');
      const budget = purchaseBudget(wideScript);
      const equal = budget === purchaseBudget(tallScript);
      const wideOnly = wideScript.flat().every((a) => a.type !== 'upgrade' || !a.path);
      const copies = wideScript.flat().filter((a) => a.type === 'build').length - tallScript.flat().filter((a) => a.type === 'build').length;
      return { ok: equal && wideOnly && copies > 0 && easy.phase === 'won' && Math.abs(combo.lives - wide.lives) <= 6 && wide.refused === 0,
        info: `${copies} extra towers, ${budget} gold; Easy ${matrixCell(easy)}, Normal ${matrixCell(wide)} against ${matrixCell(combo)}` };
    }),
    ...(Object.keys(TOWER_DEFS) as TowerType[]).map((tower) =>
      t('U5', `swapping ${tower} paths keeps the win within five lives`, () => {
        const base = archetypeScript('comboBuild', map, 'normal').flat();
        const homes = new Set(base.flatMap((a) => a.type === 'build' && a.tower === tower ? [cellKey(a.cell)] : []));
        const branches = base.filter((a) => a.type === 'upgrade' && a.path && homes.has(cellKey(a.cell)));
        let outcome: RecordedOutcome | undefined;
        const variant = comboChoiceRun(map, tower, 'normal', undefined, (value) => { outcome = value; });
        if (!outcome) throw new Error('Missing branch comparison result');
        const flipped = variant.flat().filter((a) => a.type === 'upgrade' && a.path && homes.has(cellKey(a.cell)));
        const changed = branches.length > 0 && flipped.length === branches.length && branches.every((a, i) => {
          const b = flipped[i];
          return a.type === 'upgrade' && b.type === 'upgrade' && cellKey(a.cell) === cellKey(b.cell) && b.path !== a.path;
        });
        const x = outcome;
        const c = r('comboBuild');
        return { ok: changed && c.phase === 'won' && x.phase === 'won' && Math.abs(c.lives - x.lives) <= 5,
          info: `${flipped.length} changed, ${matrixCell(c)} against ${matrixCell(x)}` };
      })),
    t('U7', 'Hard specialists win with three lives, while lazy loses by wave eight and wins Easy with eight', () => {
      const hard = r('hardBuild', 'hard');
      const lazyHard = r('lazyBuild', 'hard');
      const lazyEasy = r('lazyBuild', 'easy');
      return { ok: hard.phase === 'won' && hard.lives >= 3 && lostOn(lazyHard, 2, 8) && lazyEasy.phase === 'won' && lazyEasy.lives >= 8,
        info: `Hard ${matrixCell(hard)}, lazy Hard ${matrixCell(lazyHard)}, lazy Easy ${matrixCell(lazyEasy)}` };
    }),
    t('N5', 'Normal: comboBuildNoFire is strictly worse than comboBuild', () => {
      const x = r('comboBuildNoFire');
      const c = r('comboBuild');
      return { ok: worse(x, c), info: `${matrixCell(x)} against ${matrixCell(c)}` };
    }),
    t('N6', 'Normal: comboBuild has at least 3 more lives than comboNoSpecials, which wins', () => {
      const x = r('comboNoSpecials');
      const c = r('comboBuild');
      const ok = x.phase === 'won' && c.phase === 'won' && c.lives >= x.lives + SPECIALS_LIVES_MARGIN;
      return { ok, info: `${matrixCell(c)} against ${matrixCell(x)} without specials` };
    }),
    t('N7', "Normal: noAntiAir leaks at least half of wave 4's Harpies and loses by wave 12", () => {
      const x = r('noAntiAir');
      const w4 = x.waves[3];
      const out = w4?.exits.harpy ?? 0;
      const all = w4?.spawns.harpy ?? 0;
      return {
        ok: all > 0 && out >= 0.5 * all && lostOn(x, 4, 12),
        info: `${out} of ${all} Harpies out, ${w4?.lives} lives after wave 4, ${matrixCell(x)}`,
      };
    }),
    t('N8', "Normal: oneMusket leaks at most 6 of wave 1's enemies", () => {
      const x = r('oneMusket');
      return { ok: leaked(x, 1) <= 6, info: `${leaked(x, 1)} of ${spawned(x, 1)} leak` };
    }),
    t('E1', 'Easy: lazyBuild wins with at least 8 lives', () => {
      const x = r('lazyBuild', 'easy');
      return { ok: x.phase === 'won' && x.lives >= 8, info: matrixCell(x) };
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
    t('H2', 'Hard: lazyBuild loses on wave 2 to 8', () => {
      const x = r('lazyBuild', 'hard');
      return { ok: lostOn(x, 2, 8), info: `${x.waves[0]?.lives} lives after wave 1, ${matrixCell(x)}` };
    }),
    t('H3', 'Hard: comboBuild has at least 5 fewer lives than on Normal, or loses on wave 12 or later', () => {
      const x = r('comboBuild', 'hard');
      const n = r('comboBuild');
      const ok = (x.phase === 'lost' && x.wave >= 12) || (x.phase === 'won' && n.phase === 'won' && x.lives <= n.lives - 5);
      return { ok, info: `${matrixCell(x)} against ${matrixCell(n)} on Normal` };
    }),
    t('B1', 'default combo kills Grumblemaw on Normal and hardBuild kills him on Hard', () => {
      const normal = bossOutcome(r('comboBuild'));
      const hard = bossOutcome(r('hardBuild', 'hard'));
      return { ok: normal === 'kill' && hard === 'kill', info: `Normal ${normal}, Hard ${hard}` };
    }),
    t('B3', 'Easy lazyBuild wins with at least eight lives; record the boss outcome', () => {
      const run = r('lazyBuild', 'easy');
      return { ok: run.phase === 'won' && run.lives >= 8, info: `${matrixCell(run)}, boss ${bossOutcome(run)}` };
    }),
    t('N10a', 'every measured three-boon combination wins', () => checkBoonBalance(map, 'representative')),
    t('N10b', 'at default other picks each offer spans at most four lives', () => checkDefaultSpread(map)),
    t('X1', 'Normal: endlessIdle loses on the second through fifth endless wave', () => {
      const x = r('endlessIdle');
      return { ok: lostOn(x, LAST_WAVE + 2, LAST_WAVE + 5), info: matrixCell(x) };
    }),
    t('X2', 'Normal: endlessGreedy loses later than endlessIdle, by the twelfth endless wave', () => {
      const idle = r('endlessIdle');
      const greedy = r('endlessGreedy');
      return { ok: idle.phase === 'lost' && lostOn(greedy, idle.wave + 1, LAST_WAVE + 12), info: `greedy ${matrixCell(greedy)}, idle ${matrixCell(idle)}` };
    }),
    t('X3', 'all six measured endless runs end in loss below the headless cap', () => {
      const runs = (['easy', 'normal', 'hard'] as const).flatMap((level) => [r('endlessIdle', level), r('endlessGreedy', level)]);
      const ok = runs.every((run) => run.phase === 'lost' && run.wave < ENDLESS_WAVE_CAP);
      return { ok, info: `maximum wave ${Math.max(...runs.map((run) => run.wave))}, cap ${ENDLESS_WAVE_CAP}` };
    }),
  ];
}

const meadowExtras: Target[] = [
  {
    id: 'N9',
    map: 'meadow',
    label: 'Meadow, Normal: soundBuild lasts strictly longer than soundBuildNoTar',
    check: () => {
      const s = balanceRun('soundBuild', 'meadow', 'normal');
      const n = balanceRun('soundBuildNoTar', 'meadow', 'normal');
      const ok = (s.phase === 'won' && n.phase === 'lost') || (s.phase === 'lost' && n.phase === 'lost' && s.tick > n.tick);
      return { ok, info: `${matrixCell(s)} at tick ${s.tick} against ${matrixCell(n)} at tick ${n.tick}` };
    },
  },
  ...SPECIAL_TYPES.map(
    (type): Target => ({
      id: 'N9',
      map: 'meadow',
      label: `Meadow, Normal: forbidding the policy the ${type} makes the combo strictly worse (lives, then kills)`,
      check: () => {
        const c = balanceRun('comboBuild', 'meadow', 'normal');
        const x = comboWithoutSpecialRun(type);
        // Strictly worse by lives, then kills: lost while the combo won, or
        // fewer lives in the same result, or the same lives and fewer kills.
        const lostWhereWon = x.phase === 'lost' && c.phase === 'won';
        const fewerLives = x.phase === c.phase && x.lives < c.lives;
        const sameLivesFewerKills = x.phase === c.phase && x.lives === c.lives && x.kills < c.kills;
        const ok = lostWhereWon || fewerLives || sameLivesFewerKills;
        return { ok, info: `without: ${matrixCell(x)}, ${x.kills} kills; with: ${matrixCell(c)}, ${c.kills} kills` };
      },
    }),
  ),
  {
    id: 'N9',
    map: 'meadow',
    label: 'Meadow, Normal: the policy fires at least 30 specials in comboBuild and at least 80% catch 3 or more enemies',
    check: () => {
      const hits = balanceRun('comboBuild', 'meadow', 'normal').specialHits;
      const good = hits.filter((h) => h >= S3_MIN_CATCH).length;
      const ok = hits.length >= S3_MIN_SPECIALS && good >= S3_MIN_SHARE * hits.length;
      return { ok, info: `${hits.length} specials, ${good} caught ${S3_MIN_CATCH} or more (hits ${hits.join(' ')})` };
    },
  },
];

const OFFER_WAVES = [5, 10, 15] as const;
type Picks = readonly [BoonId, BoonId, BoonId];

export interface BoonBalanceRun {
  picks: Picks;
  run: BalanceRun;
}

/** Seven single-choice comparisons plus the two all-alternative diagonals. */
export function boonBalancePicks(_map: MapId, coverage: 'all' | 'representative'): Picks[] {
  const [first, second, third] = OFFER_WAVES.map(boonOptions);
  const picks: Picks[] = [];
  for (const [i, a] of first.entries()) {
    for (const [j, b] of second.entries()) {
      for (const [k, c] of third.entries()) {
        const substitutions = Number(i !== 0) + Number(j !== 0) + Number(k !== 0);
        if (coverage === 'all' || substitutions <= 1 || (i === j && j === k)) picks.push([a, b, c]);
      }
    }
  }
  return picks;
}

/** Replay the combo and its policy for the named picks, sharing the default run when applicable. */
export function boonBalanceRun(map: MapId, picks: Picks): BalanceRun {
  if (OFFER_WAVES.every((wave, i) => picks[i] === boonOptions(wave)[0])) return balanceRun('comboBuild', map, 'normal');
  const boons: BoonChoices = { 5: picks[0], 10: picks[1], 15: picks[2] };
  return balanceRun('comboBuild', map, 'normal', boons);
}

export function boonBalanceRuns(map: MapId, coverage: 'all' | 'representative'): BoonBalanceRun[] {
  return boonBalancePicks(map, coverage).map((picks) => ({ picks, run: boonBalanceRun(map, picks) }));
}

export function checkBoonBalance(map: MapId, coverage: 'all' | 'representative'): TargetResult {
  const results = boonBalanceRuns(map, coverage);
  const wins = results.filter(({ run }) => run.phase === 'won' && run.refused === 0).length;
  const expected = coverage === 'all' ? 27 : 9;
  return { ok: results.length === expected && wins === expected, info: `${wins}/${expected} wins` };
}

function checkDefaultSpread(map: MapId): TargetResult {
  const defaults = OFFER_WAVES.map((wave) => boonOptions(wave)[0]);
  const spreads = OFFER_WAVES.map((wave, index) => {
    const lives = boonOptions(wave).map((id) => {
      const picks: [BoonId, BoonId, BoonId] = [defaults[0], defaults[1], defaults[2]];
      picks[index] = id;
      return boonBalanceRun(map, picks).lives;
    });
    return Math.max(...lives) - Math.min(...lives);
  });
  return { ok: spreads.every((n) => n <= 4), info: `best minus worst lives by offer: ${spreads.join('/')}` };
}

export function bossOutcome(run: BalanceRun): string {
  return run.bossFight.find((e) => e.event === 'kill' || e.event === 'exit')?.event ?? 'unresolved';
}

function campaignTiming() {
  const waves = balanceRun('comboBuild', 'meadow', 'normal').waves;
  return [waves.slice(0, ACT_ONE_LAST_WAVE), waves.slice(ACT_ONE_LAST_WAVE)].map((act) => ({
    clear: act.map((wave) => wave.ticks),
    seconds: act.reduce((sum, wave) => sum + wave.ticks, 0) / 60,
    peak: Math.max(0, ...act.map((wave) => wave.peak)),
  }));
}

export const RULE_TARGETS: Target[] = [
  {
    id: 'B2',
    label: 'without specials the combo still wins and Grumblemaw exits on at least two maps',
    check: () => {
      const runs = MAP_IDS.map((map) => balanceRun('comboNoSpecials', map, 'normal'));
      const outcomes = runs.map(bossOutcome);
      return { ok: runs.every((r) => r.phase === 'won') && outcomes.filter((s) => s === 'exit').length >= 2, info: outcomes.join('/') };
    },
  },
  {
    id: 'H4',
    label: 'no ordinary Hard enemy hp is 1 or 2 above a multiple of 12, 4, 25 or 45',
    check: () => {
      const bad: string[] = [];
      for (const type of Object.keys(ENEMY_STATS) as EnemyType[]) {
        if (isBoss({ type })) continue;
        const hp = enemyMaxHp(type, 'hard');
        for (const d of [12, 4, 25, 45]) if (hp % d === 1 || hp % d === 2) bad.push(`${type} ${hp} (${d})`);
      }
      return { ok: bad.length === 0, info: bad.join(', ') || `Hard x${DIFFICULTY_DEFS.hard.hpMultiplier}` };
    },
  },
  {
    id: 'N11',
    label: 'a Powder Keg kills a Harpy or Wolf in one hit and strips at least 5% of a Troll’s hp',
    check: () => {
      const damage = SPECIAL_DEFS.keg.damage;
      const ok = damage >= Math.max(ENEMY_STATS.harpy.hp, ENEMY_STATS.wolf.hp, 0.05 * ENEMY_STATS.troll.hp);
      return { ok, info: `${damage} damage; Harpy ${ENEMY_STATS.harpy.hp}, Wolf ${ENEMY_STATS.wolf.hp}, Troll ${(100 * damage / ENEMY_STATS.troll.hp).toFixed(1)}%` };
    },
  },
  {
    id: 'R1',
    label: 'every campaign wave spawns at most 6 walkers and 4 flyers in any 3 s and ends spawning within 90 s',
    check: () => {
      const got = WAVES.map((wave, i) => [
        maxIn3s(waveSpawnTicks(i, false)),
        maxIn3s(waveSpawnTicks(i, true)),
        Math.max(...wave.groups.map((g) => spawnTick(g, g.count - 1))) / 60,
      ]);
      return { ok: got.every(([ground, air, last]) => ground <= 6 && air <= 4 && last <= 90), info: got.map(([g, f, last]) => `${g}/${f} at ${last}s`).join(' ') };
    },
  },
  {
    id: 'R2',
    label: 'act 2 schedules 1.2 to 2 times as many enemies as act 1',
    check: () => {
      const counts = WAVES.map((wave) => wave.groups.reduce((sum, group) => sum + group.count, 0));
      const first = counts.slice(0, ACT_ONE_LAST_WAVE).reduce((a, b) => a + b, 0);
      const second = counts.slice(ACT_ONE_LAST_WAVE).reduce((a, b) => a + b, 0);
      const ratio = second / first;
      return { ok: ratio >= 1.2 && ratio <= 2, info: `${second}/${first} = ${ratio.toFixed(2)}` };
    },
  },
  {
    id: 'R3',
    map: 'meadow',
    label: 'Meadow, Normal, comboBuild: act 2 takes 560 to 720 s, each wave at most 100 s, at most 40 alive and the campaign at most 22 minutes',
    check: () => {
      const [first, { clear, seconds, peak }] = campaignTiming();
      const longest = Math.max(...clear) / 60;
      const whole = first.seconds + seconds;
      const ok = clear.length === LAST_WAVE - ACT_ONE_LAST_WAVE && seconds >= 560 && seconds <= 720 && longest <= 100 && peak <= 40 && whole <= 1320;
      return { ok, info: `act 2 ${seconds.toFixed(1)} s, longest wave ${longest.toFixed(1)} s, peak ${peak}, campaign ${whole.toFixed(1)} s` };
    },
  },
  {
    id: 'R4',
    map: 'meadow',
    label: 'Meadow, Normal, comboBuild: act 1 still meets the milestone 28 timing rules',
    check: () => {
      const { clear, seconds, peak } = campaignTiming()[0];
      const ok = clear.length === ACT_ONE_LAST_WAVE && clear.every((t, i) => t >= 1.15 * BEFORE_25C.clear[i]) && seconds >= 540 && seconds <= 800 && peak <= 35;
      return { ok, info: `clear ${clear.join(' ')}; ${seconds.toFixed(1)} s; peak ${peak}` };
    },
  },

];

RULE_TARGETS.push({
  id: 'U8',
  label: 'campaign length and wave shape satisfy R1 through R4',
  check: () => {
    const shape = RULE_TARGETS.filter((t) => ['R1', 'R2', 'R3', 'R4'].includes(t.id)).map((t) => t.check());
    return { ok: shape.length === 4 && shape.every((r) => r.ok), info: shape.map((r, i) => `R${i + 1} ${r.ok ? 'pass' : 'miss'}`).join(', ') };
  },
});

export const TARGETS: Target[] = [...MAP_IDS.flatMap((map) => [...mapTargets(map), ...(map === 'meadow' ? meadowExtras : [])]), ...RULE_TARGETS];
