// The balance targets (milestone 28, docs/DESIGN.md "Balance targets"),
// each a check over the cached balance runs (balanceRuns.ts) or the wave
// tables. The balance tests (balance-*.test.ts) assert every one with its
// T, E, H or rule label; `npm run sim` prints them. Not part of the game
// bundle.

import { boonOptions, type BoonId } from './boons';
import { archetypeScript, balanceRun, cachedRun, comboOutcome, matrixCell, type BalanceRun } from './balanceRuns';
import type { BoonOutcome } from './boonBalance';
import { DIFFICULTY_DEFS, enemyMaxHp, type Difficulty } from './difficulty';
import { ENEMY_STATS, isBoss } from './enemies';
import { spawnTick } from './game';
import { comboBuild, comboWithoutSpecial, referenceBuild, ENDLESS_WAVE_CAP, type BoonChoices, type RecordedOutcome } from './headless';
import { SPECIAL_DEFS, SPECIAL_TYPES, type SpecialType } from './specials';
import { MAP_IDS, type MapId } from './map';
import type { EnemyType } from './types';
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

/** Record the Normal combo with one special forbidden on the measured map. */
export function comboWithoutSpecialRun(type: SpecialType, map: MapId = 'meadow'): BalanceRun {
  return cachedRun(`comboBuild without ${type}, ${map}, normal`, () => comboWithoutSpecial(type, 'normal', map), 'normal');
}

/** Minimum benefit of the full special policy on Normal. */
export const SPECIALS_LIVES_MARGIN = 3;
/** N9: the Meadow Normal combo must cast at least this many specials ... */
export const MIN_POLICY_CASTS = 30;
/** ... and at least this share of them catch MIN_CROWD_SIZE or more enemies. */
export const MIN_CROWD_SHARE = 0.8;
export const MIN_CROWD_SIZE = 3;

/** Exercise the real purchasing and firing policies with perturbed spawn HP.
 * Only this synchronous balance run sees the temporary wave definitions.
 * The ordinary spawn rule applies the multiplier before rounding, including boss packs.
 */
function scaledCampaign(map: MapId, difficulty: Difficulty, scale: number): RecordedOutcome {
  const waves = WAVES.slice(ACT_ONE_LAST_WAVE);
  const originals = waves.map(wave => wave.hpMultiplier);
  let outcome: RecordedOutcome | undefined;
  try {
    for (const wave of waves) wave.hpMultiplier = (wave.hpMultiplier ?? 1) * scale;
    referenceBuild(difficulty === 'hard' ? 'hardBuild' : 'comboBuild', difficulty, map,
      undefined, undefined, value => { outcome = value; });
  } finally {
    waves.forEach((wave, i) => {
      if (originals[i] === undefined) delete wave.hpMultiplier;
      else wave.hpMultiplier = originals[i];
    });
  }
  if (!outcome) throw new Error(`No scaled campaign outcome for ${map}/${difficulty}`);
  return outcome;
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
    t('N4', 'the reinvesting combo wins Normal', () => {
      const run = r('comboBuild');
      return { ok: run.phase === 'won', info: matrixCell(run) };
    }),
    t('S1', 'reinvesting Normal combo wins with 9–15 lives', () => {
      const combo = r('comboBuild');
      return { ok: combo.phase === 'won' && combo.lives >= 9 && combo.lives <= 15, info: matrixCell(combo) };
    }),
    ...(['normal', 'hard'] as const).flatMap(level => {
      const name = level === 'hard' ? 'hardBuild' : 'comboBuild';
      const limit = level === 'hard' ? 5 : 4;
      return [
        t('S2', `${level} ${name} loses lives on three or more act-2 waves, at most ${limit} each`, () => {
          const run = r(name, level);
          const losses = run.waves.slice(ACT_ONE_LAST_WAVE).map(wave => wave.livesLost);
          return { ok: run.phase === 'won' && losses.filter(n => n > 0).length >= 3 && Math.max(...losses) <= limit,
            info: `${matrixCell(run)}, losses ${losses.join('/')}` };
        }),
        t('S3', `${level} ${name} wins within ${limit} lives of baseline at ±5% act-2 HP`, () => {
          const base = r(name, level);
          const variants = [0.95, 1.05].map(scale => scaledCampaign(map, level, scale));
          return { ok: base.phase === 'won' && variants.every(v => v.phase === 'won' && Math.abs(base.lives - v.lives) <= limit),
            info: [variants[0], base, variants[1]].map(matrixCell).join(' / ') };
        }),
      ];
    }),
    t('V2', 'stopping after the fixed plan costs the game in act 2 or at least five lives', () => {
      const combo = r('comboBuild');
      const fixed = cachedRun(`fixed combo ${map}`, () => comboBuild('normal', map, undefined, undefined, { fixedOnly: true }), 'normal');
      return { ok: combo.phase === 'won' && fixed.refused === 0 &&
        (lostOn(fixed, ACT_ONE_LAST_WAVE + 1, LAST_WAVE) || (fixed.phase === 'won' && combo.lives - fixed.lives >= 5)),
        info: `reinvest ${matrixCell(combo)}, fixed ${matrixCell(fixed)}` };
    }),
    t('S4', 'wideBuild wins within five lives without buying a second upgrade', () => {
      const wide = r('wideBuild');
      const combo = r('comboBuild');
      const wideOnly = archetypeScript('wideBuild', map, 'normal').flat().every((a) => a.type !== 'upgrade' || !a.path);
      return { ok: wideOnly && combo.phase === 'won' && wide.phase === 'won' && Math.abs(combo.lives - wide.lives) <= 5,
        info: `wide ${matrixCell(wide)}, combo ${matrixCell(combo)}` };
    }),
    t('V4', 'lazy wins Easy with eight lives, loses Normal on 7–14 and Hard by 8, hardBuild wins Hard with three', () => {
      const hard = r('hardBuild', 'hard');
      const easy = r('lazyBuild', 'easy');
      const normal = r('lazyBuild', 'normal');
      const lazyHard = r('lazyBuild', 'hard');
      return { ok: hard.phase === 'won' && hard.lives >= 3 && easy.phase === 'won' && easy.lives >= 8 &&
        lostOn(normal, 7, 14) && lostOn(lazyHard, 1, 8),
        info: `hardBuild ${matrixCell(hard)}, lazy E/N/H ${[easy, normal, lazyHard].map(matrixCell).join('/')}` };
    }),
    t('S5', 'all specials save three lives, forbidding any one gains at most one', () => {
      const combo = r('comboBuild');
      const none = r('comboNoSpecials');
      const singles = SPECIAL_TYPES.map(type => comboWithoutSpecialRun(type, map));
      return { ok: combo.phase === 'won' && (none.phase === 'won' || lostOn(none, 17, LAST_WAVE)) &&
        combo.lives >= Math.max(0, none.lives) + SPECIALS_LIVES_MARGIN &&
        singles.every(run => Math.max(0, run.lives) <= combo.lives + 1 && run.refused === 0),
        info: `all ${matrixCell(combo)}, none ${matrixCell(none)}, without ${SPECIAL_TYPES.join('/')} ${singles.map(matrixCell).join('/')}` };
    }),
    t('S6', 'removing Fire Pots gains at most one life', () => {
      const combo = r('comboBuild');
      const noFire = r('comboBuildNoFire');
      return { ok: combo.phase === 'won' && Math.max(0, noFire.lives) <= combo.lives + 1,
        info: `combo ${matrixCell(combo)}, no Fire Pots ${matrixCell(noFire)}` };
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
    t('V5', 'default combo kills Grumblemaw on Normal and hardBuild kills him on Hard', () => {
      const normal = bossOutcome(r('comboBuild'));
      const hard = bossOutcome(r('hardBuild', 'hard'));
      return { ok: normal === 'kill' && hard === 'kill' && ENEMY_STATS.grumblemaw.livesCost === 10, info: `Normal ${normal}, Hard ${hard}` };
    }),
    t('B3', 'Easy lazyBuild wins with at least eight lives; record the boss outcome', () => {
      const run = r('lazyBuild', 'easy');
      return { ok: run.phase === 'won' && run.lives >= 8, info: `${matrixCell(run)}, boss ${bossOutcome(run)}` };
    }),
    t('S7', 'all 27 reward combinations win and each offer spans at most six lives', () => rewardSpread(map)),
    t('S8', 'idle loses on endless waves 2–6, reinvesting lasts at least two further, through wave 14', () => {
      const idle = r('endlessIdle');
      const greedy = r('endlessGreedy');
      return { ok: lostOn(idle, LAST_WAVE + 2, LAST_WAVE + 6) && lostOn(greedy, idle.wave + 2, LAST_WAVE + 14),
        info: `idle ${matrixCell(idle)}, reinvesting ${matrixCell(greedy)}` };
    }),
    t('S8', 'all six measured endless runs end in loss below the headless cap', () => {
      const runs = (['easy', 'normal', 'hard'] as const).flatMap((level) => [r('endlessIdle', level), r('endlessGreedy', level)]);
      const ok = runs.every((run) => run.phase === 'lost' && run.wave < ENDLESS_WAVE_CAP);
      return { ok, info: `maximum wave ${Math.max(...runs.map((run) => run.wave))}, cap ${ENDLESS_WAVE_CAP}` };
    }),
  ];
}

const meadowExtras: Target[] = [
  {
    id: 'S9',
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
    id: 'N9',
    map: 'meadow',
    label: 'Meadow, Normal: the policy fires at least 30 specials in comboBuild and at least 80% catch 3 or more enemies',
    check: () => {
      const hits = balanceRun('comboBuild', 'meadow', 'normal').specialHits;
      const good = hits.filter((h) => h >= MIN_CROWD_SIZE).length;
      const ok = hits.length >= MIN_POLICY_CASTS && good >= MIN_CROWD_SHARE * hits.length;
      return { ok, info: `${hits.length} specials, ${good} caught ${MIN_CROWD_SIZE} or more (hits ${hits.join(' ')})` };
    },
  },
];

const OFFER_WAVES = [5, 10, 15] as const;
type Picks = readonly [BoonId, BoonId, BoonId];

export interface BoonBalanceRun {
  picks: Picks;
  run: BoonOutcome;
}

export function boonBalancePicks(): Picks[] {
  const [first, second, third] = OFFER_WAVES.map(boonOptions);
  return first.flatMap((a) => second.flatMap((b) => third.map((c): Picks => [a, b, c])));
}

/** Record the combo and its policy for the named picks, sharing the default run when applicable. */
export function boonBalanceRun(map: MapId, picks: Picks): BoonOutcome {
  if (OFFER_WAVES.every((wave, i) => picks[i] === boonOptions(wave)[0])) return balanceRun('comboBuild', map, 'normal');
  const boons: BoonChoices = { 5: picks[0], 10: picks[1], 15: picks[2] };
  return comboOutcome(map, boons);
}

export function boonBalanceRuns(map: MapId): BoonBalanceRun[] {
  return boonBalancePicks().map((picks) => ({ picks, run: boonBalanceRun(map, picks) }));
}

/** Compare each offer with both other picks held fixed, for all nine contexts. */
export function rewardSpread(map: MapId): TargetResult {
  const rows = boonBalanceRuns(map);
  const wins = rows.filter(({ run }) => run.phase === 'won' && run.refused === 0).length;
  const spreads = OFFER_WAVES.map((_, index) => {
    const contexts = new Map<string, number[]>();
    for (const { picks, run } of rows) {
      const key = picks.filter((_, i) => i !== index).join('/');
      const values = contexts.get(key) ?? [];
      values.push(run.lives);
      contexts.set(key, values);
    }
    return Math.max(...[...contexts.values()].map((lives) => Math.max(...lives) - Math.min(...lives)));
  });
  return { ok: wins === 27 && spreads.every((span) => span <= 6),
    info: `${wins}/27 wins, largest spreads by offer ${spreads.join('/')}` };
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
    id: 'S6',
    label: 'Fire Pots save lives on at least two maps',
    check: () => {
      const gains = MAP_IDS.map(map => balanceRun('comboBuild', map, 'normal').lives -
        Math.max(0, balanceRun('comboBuildNoFire', map, 'normal').lives));
      return { ok: gains.filter(gain => gain > 0).length >= 2, info: `lives gained ${gains.join('/')}` };
    },
  },
  {
    id: 'H4',
    label: 'in waves 1–10 no ordinary Hard enemy hp is 1 or 2 above a multiple of 12, 4, 25 or 45',
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
  id: 'V7',
  label: 'campaign length and wave shape satisfy R1 through R4',
  check: () => {
    const shape = RULE_TARGETS.filter((t) => ['R1', 'R2', 'R3', 'R4'].includes(t.id)).map((t) => t.check());
    return { ok: shape.length === 4 && shape.every((r) => r.ok), info: shape.map((r, i) => `R${i + 1} ${r.ok ? 'pass' : 'miss'}`).join(', ') };
  },
});

export const TARGETS: Target[] = [...MAP_IDS.flatMap((map) => [...mapTargets(map), ...(map === 'meadow' ? meadowExtras : [])]), ...RULE_TARGETS];
