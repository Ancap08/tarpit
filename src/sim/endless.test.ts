// Milestone 26: endless mode (docs/SCOPE-v4.md "Endless mode and high
// score"). Waves past 10 come from waves.ts waveDef; game.ts
// continueEndless turns a won game into an endless one; the score is
// game.ts wavesCleared.
import { beforeAll, describe, expect, it } from 'vitest';
import { enemyMaxHp } from './difficulty';
import { ENEMY_STATS, isBoss } from './enemies';
import {
  callEarlyStatus,
  callNextWave,
  continueEndless,
  createGame,
  lastSpawnTick,
  spawnTick,
  startWave,
  tick,
  WAVE_CLEAR_BONUS,
  wavesCleared,
} from './game';
import { applyAction, comboBuild, endlessGreedy, endlessIdle, ENDLESS_WAVE_CAP, playScripted, type WaveScript } from './headless';
import type { GameEvent } from './events';
import type { GameState, GroupDef } from './types';
import { ENDLESS_HP_GROWTH, hasNextWave, LAST_WAVE, nextWavePreview, waveDef, WAVES } from './waves';

const harpyGroup = (n: number): GroupDef => waveDef(n).groups[waveDef(n).groups.length - 1];
const withoutLast = (n: number) => waveDef(n).groups.slice(0, -1);
const noBoss = (w: number) => WAVES[w - 1].groups.filter((g) => g.type !== 'boss');

describe('waveDef (milestone 26)', () => {
  it('waves 1 to 10 are the table, the same objects', () => {
    for (let n = 1; n <= 10; n++) expect(waveDef(n)).toBe(WAVES[n - 1]);
    expect(LAST_WAVE).toBe(10);
  });

  it('refuses wave 0 and non-integers', () => {
    expect(() => waveDef(0)).toThrow();
    expect(() => waveDef(1.5)).toThrow();
  });

  it('the hp growth per cycle is 1.6 (the scope said 1.15; DEVLOG milestone 26)', () => {
    expect(ENDLESS_HP_GROWTH).toBe(1.6);
  });

  it('wave 11: wave 8 plus 10 Harpies every 0.75 s from 75.5 s, hp x 1.6', () => {
    expect(withoutLast(11)).toEqual(WAVES[7].groups);
    // Wave 8's last spawn is the 50th Goblin at 49 x 1.5 = 73.5 s.
    expect(harpyGroup(11)).toEqual({ type: 'harpy', count: 10, interval: 0.75, delay: 75.5 });
    expect(waveDef(11).hpMultiplier).toBe(1.6);
    expect(waveDef(11).groups.reduce((n, g) => n + g.count, 0)).toBe(118);
  });

  it('wave 12: wave 9 plus 10 Harpies from 31 s, hp x 1.6', () => {
    expect(withoutLast(12)).toEqual(WAVES[8].groups);
    // Wave 9's last spawn is the 30th Wolf at 29 s.
    expect(harpyGroup(12)).toEqual({ type: 'harpy', count: 10, interval: 0.75, delay: 31 });
    expect(waveDef(12).hpMultiplier).toBe(1.6);
  });

  it('wave 13: wave 10 without the boss plus 10 Harpies from 65 s, hp x 1.6', () => {
    expect(withoutLast(13)).toEqual(noBoss(10));
    // Wave 10's last other spawn is the 15th Troll at 14 x 4.5 = 63 s.
    expect(harpyGroup(13)).toEqual({ type: 'harpy', count: 10, interval: 0.75, delay: 65 });
    expect(waveDef(13).hpMultiplier).toBe(1.6);
  });

  it('wave 14: cycle 2, wave 8 again, 12 Harpies, hp x 2.56', () => {
    expect(withoutLast(14)).toEqual(WAVES[7].groups);
    expect(harpyGroup(14)).toEqual({ type: 'harpy', count: 12, interval: 0.75, delay: 75.5 });
    expect(waveDef(14).hpMultiplier).toBeCloseTo(2.56, 12);
  });

  it('wave 17: cycle 3, wave 8, 14 Harpies, hp x 4.096; the group stops growing at 16', () => {
    expect(withoutLast(17)).toEqual(WAVES[7].groups);
    expect(harpyGroup(17)).toEqual({ type: 'harpy', count: 14, interval: 0.75, delay: 75.5 });
    expect(waveDef(17).hpMultiplier).toBeCloseTo(4.096, 12);
    expect(harpyGroup(20).count).toBe(16);
    expect(harpyGroup(23).count).toBe(16);
    expect(harpyGroup(200).count).toBe(16);
  });

  it('hp at spawn: round(base x level x 1.6 ^ cycle), by hand', () => {
    expect(enemyMaxHp('goblin', 'normal', waveDef(11).hpMultiplier)).toBe(37); // 36.8
    expect(enemyMaxHp('troll', 'normal', waveDef(11).hpMultiplier)).toBe(1520);
    expect(enemyMaxHp('harpy', 'normal', waveDef(11).hpMultiplier)).toBe(58); // 57.6
    expect(enemyMaxHp('goblin', 'easy', waveDef(11).hpMultiplier)).toBe(28); // 27.6
    expect(enemyMaxHp('goblin', 'hard', waveDef(11).hpMultiplier)).toBe(44); // 44.16
    expect(enemyMaxHp('goblin', 'normal', waveDef(14).hpMultiplier)).toBe(59); // 58.88
    expect(enemyMaxHp('troll', 'normal', waveDef(17).hpMultiplier)).toBe(3891); // 3891.2
    expect(enemyMaxHp('goblin', 'normal', waveDef(17).hpMultiplier)).toBe(94); // 94.208
  });

  it('no boss after wave 10', () => {
    for (let n = 11; n <= 200; n++) expect(waveDef(n).groups.some((g) => isBoss(g)), `wave ${n}`).toBe(false);
  });

  it('bounties, speeds and lives cost come from the enemy table, unchanged', () => {
    // waveDef carries only types, counts and timing; the hp multiplier is the only scaling.
    expect(Object.keys(waveDef(11)).sort()).toEqual(['groups', 'hpMultiplier']);
  });

  /** The most spawn ticks inside any half-open window [t, t + 180). */
  const maxIn180 = (ticks: number[]) => {
    const a = [...ticks].sort((x, y) => x - y);
    let best = 0;
    for (let i = 0; i < a.length; i++) {
      let j = i;
      while (j < a.length && a[j] < a[i] + 180) j += 1;
      best = Math.max(best, j - i);
    }
    return best;
  };
  const spawns = (n: number, flying: boolean) =>
    waveDef(n)
      .groups.filter((g) => ENEMY_STATS[g.type].flying === flying)
      .flatMap((g) => Array.from({ length: g.count }, (_, i) => spawnTick(g, i)));

  it('spawn rate (25c A1) holds on the merged schedule of waves 11 to 40', () => {
    for (let n = 11; n <= 40; n++) {
      expect(maxIn180(spawns(n, false)), `wave ${n} walkers`).toBeLessThanOrEqual(6);
      expect(maxIn180(spawns(n, true)), `wave ${n} flyers`).toBeLessThanOrEqual(4);
    }
  });

  it('the longest endless spawn window is 86.75 s (wave 8 based, 16 Harpies)', () => {
    let longest = 0;
    for (let n = 11; n <= 200; n++) longest = Math.max(longest, lastSpawnTick(n));
    expect(longest).toBe(5205);
    expect(lastSpawnTick(20)).toBe(5205);
  });

  it('preview: nothing after wave 10 in a normal game, wave 11 in an endless one', () => {
    const s = { ...createGame(), wave: 10 };
    expect(hasNextWave(s)).toBe(false);
    expect(nextWavePreview(s)).toEqual([]);
    s.endless = true;
    expect(hasNextWave(s)).toBe(true);
    expect(nextWavePreview(s)).toEqual(waveDef(11).groups.map((g) => ({ type: g.type, count: g.count })));
    expect(nextWavePreview(s).at(-1)).toEqual({ type: 'harpy', count: 10 });
  });
});

/** The comboBuild game on Normal, just won (phase 'won' after wave 10). */
let wonState: GameState;
beforeAll(() => {
  wonState = playScripted(comboBuild()).state;
});
const won = () => structuredClone(wonState);

describe('continueEndless (milestone 26)', () => {
  it('the combo build wins on Normal (the starting point)', () => {
    expect(wonState).toMatchObject({ phase: 'won', wave: 10, lives: 16, gold: 420, endless: false });
  });

  it('allowed when won: setup, endless, wave 10 cleared, everything kept', () => {
    const s = won();
    const before = structuredClone(s);
    const r = continueEndless(s);
    expect(r).toEqual({ ok: true, wave: 10 });
    expect(s.phase).toBe('setup');
    expect(s.endless).toBe(true);
    expect(s.events.at(-1)).toEqual({ kind: 'endlessStart' });
    expect(wavesCleared(s)).toBe(10);
    // Gold, lives, towers (kill counts included), wave and charge are kept.
    expect({ ...s, phase: before.phase, endless: false, events: before.events }).toEqual(before);
    expect(s.towers.reduce((n, t) => n + t.kills, 0)).toBeGreaterThan(0);
  });

  it.each([
    ['setup', () => createGame()],
    [
      'wave',
      () => {
        const s = createGame();
        startWave(s);
        tick(s);
        return s;
      },
    ],
    ['lost', () => playScripted([]).state],
    [
      'endless already (setup after Keep going)',
      () => {
        const s = won();
        continueEndless(s);
        return s;
      },
    ],
  ])('refused with not-won in %s, and the refusal changes nothing', (_name, make) => {
    const s = make();
    const before = structuredClone(s);
    expect(continueEndless(s)).toEqual({ ok: false, reason: 'not-won' });
    expect(s).toEqual(before);
  });

  it('Start Wave then plays wave 11 with the scaled hp', () => {
    const s = won();
    continueEndless(s);
    expect(startWave(s)).toEqual({ ok: true, wave: 11 });
    tick(s);
    const first = s.enemies[0];
    expect(first.type).toBe('goblin');
    expect(first.hp).toBe(37);
    expect(first.maxHp).toBe(37);
    expect(s.specialCharges).toBe(1);
  });

  it('table waves never set maxHp', () => {
    const s = createGame();
    startWave(s);
    tick(s);
    expect(s.enemies[0]).not.toHaveProperty('maxHp');
  });
});

/**
 * Replay `script` (no early calls) tick by tick, as playScripted does, and
 * collect every event: after each action and each tick.
 */
function replayEvents(script: WaveScript, difficulty?: GameState['difficulty']): { state: GameState; events: GameEvent[]; phases: string[] } {
  const state = createGame({ difficulty });
  const events: GameEvent[] = [];
  const phases: string[] = [];
  const take = () => {
    events.push(...state.events);
    state.events = [];
  };
  const phase = (): GameState['phase'] => state.phase;
  for (let i = 0; i < ENDLESS_WAVE_CAP && phase() === 'setup'; i++) {
    for (const a of script[i] ?? []) applyAction(state, a);
    startWave(state);
    take();
    const timed = script.timed?.[i] ?? [];
    for (let t = 0; phase() === 'wave' && t < 60 * 600; t++) {
      for (const a of timed) if (a.atWaveTick === state.waveTick) applyAction(state, a);
      take();
      tick(state);
      take();
    }
    phases.push(phase());
    if (script.endless && phase() === 'won') {
      continueEndless(state);
      take();
    }
  }
  return { state, events, phases };
}

describe('an endless run (milestone 26)', () => {
  let idle: ReturnType<typeof replayEvents>;
  beforeAll(() => {
    idle = replayEvents(endlessIdle());
  });

  it('won fires exactly once, then endlessStart once; the game ends by losing', () => {
    const kinds = idle.events.map((e) => e.kind);
    expect(kinds.filter((k) => k === 'won')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'endlessStart')).toHaveLength(1);
    expect(kinds.indexOf('endlessStart')).toBeGreaterThan(kinds.indexOf('won'));
    expect(kinds.at(-1)).toBe('lost');
    expect(idle.phases.filter((p) => p === 'won')).toHaveLength(1);
    expect(idle.phases.at(-1)).toBe('lost');
  });

  it('endlessIdle on Normal loses on wave 16 with 15 waves cleared (target: wave 11 to 16)', () => {
    expect(idle.state).toMatchObject({ phase: 'lost', wave: 16, endless: true });
    expect(wavesCleared(idle.state)).toBe(15);
    // The replay here and playScripted agree (the replay drains the event list).
    expect({ ...playScripted(endlessIdle()).state, events: [] }).toEqual(idle.state);
  });

  it('losing in endless: lost is final and ticks do nothing', () => {
    const s = structuredClone(idle.state);
    const before = structuredClone(s);
    tick(s);
    expect(s).toEqual(before);
    expect(startWave(s)).toEqual({ ok: false, reason: 'not-in-setup' });
    expect(continueEndless(s)).toEqual({ ok: false, reason: 'not-won' });
    expect(callEarlyStatus(s)).toEqual({ ok: false, reason: 'game-over' });
  });

  it('endlessGreedy on Normal goes further than endlessIdle, reaches wave 14 and loses by wave 40', () => {
    const greedy = playScripted(endlessGreedy()).state;
    expect(greedy.phase).toBe('lost');
    expect(greedy.wave).toBeGreaterThan(idle.state.wave);
    expect(greedy.wave).toBeGreaterThanOrEqual(14);
    expect(greedy.wave).toBeLessThanOrEqual(40);
    expect(greedy.wave).toBe(19);
  });

  it('determinism: two endlessGreedy runs to the end give deep-equal final states', () => {
    const a = playScripted(endlessGreedy());
    const b = playScripted(endlessGreedy());
    expect(a.state).toEqual(b.state);
    expect(a.waves).toEqual(b.waves);
    // Verifier: about 3.8 s locally, too close to vitest's 5 s default for CI (now 30 s for all, vitest.config.ts).
  });

  it('gold is conserved across the wave 10 to 11 boundary', () => {
    const s = won();
    const gold = s.gold;
    continueEndless(s);
    expect(s.gold).toBe(gold);
    startWave(s);
    let earned = 0;
    while (s.phase === 'wave') {
      tick(s);
      for (const e of s.events) {
        if (e.kind === 'kill') earned += e.bounty;
        if (e.kind === 'waveClear') earned += e.bonus;
      }
    }
    expect(s.phase).toBe('setup');
    expect(s.wave).toBe(11);
    expect(s.gold).toBe(gold + earned);
    expect(earned).toBeGreaterThan(WAVE_CLEAR_BONUS);
  });
});

describe('wavesCleared and call early (milestone 26)', () => {
  /** Run the current wave until every enemy has spawned. */
  const toLastSpawn = (s: GameState) => {
    while (s.waveTick <= lastSpawnTick(s.wave)) tick(s);
  };
  const toClear = (s: GameState) => {
    while (s.phase === 'wave') tick(s);
  };

  it('counts every clear from wave 1, early calls included, through the win and into endless', () => {
    const s = createGame();
    s.lives = 1e6; // every enemy leaks; nothing is lost
    expect(wavesCleared(s)).toBe(0);
    startWave(s);
    expect(wavesCleared(s)).toBe(0);
    toClear(s);
    expect([s.phase, wavesCleared(s)]).toEqual(['setup', 1]);
    startWave(s); // wave 2
    toLastSpawn(s);
    expect(callNextWave(s).ok).toBe(true); // wave 2 clears early, wave 3 runs
    expect([s.wave, wavesCleared(s)]).toEqual([3, 2]);
    toLastSpawn(s);
    callNextWave(s); // wave 4 runs
    expect(wavesCleared(s)).toBe(3);
    toClear(s);
    expect([s.phase, s.wave, wavesCleared(s)]).toEqual(['setup', 4, 4]);
    for (let w = 5; w <= 10; w++) {
      startWave(s);
      toClear(s);
    }
    expect([s.phase, wavesCleared(s)]).toEqual(['won', 10]);
    // Keep going; call early from wave 11 to 12 (no last-wave refusal in endless).
    continueEndless(s);
    expect(wavesCleared(s)).toBe(10);
    startWave(s);
    expect(callEarlyStatus(s)).toEqual({ ok: false, reason: 'still-spawning' });
    toLastSpawn(s);
    const gold = s.gold;
    const r = callNextWave(s);
    expect(r).toEqual({ ok: true, wave: 12, bonus: 20, gold: gold + WAVE_CLEAR_BONUS + 20 });
    expect([s.phase, s.wave, wavesCleared(s), s.specialCharges]).toEqual(['wave', 12, 11, 1]);
    // Wave 12 to 13 and 13 to 14 (wave 13 is wave 10's table without the boss) call too.
    toLastSpawn(s);
    expect(callNextWave(s).ok).toBe(true);
    toLastSpawn(s);
    expect(callNextWave(s).ok).toBe(true);
    expect([s.wave, wavesCleared(s)]).toEqual([14, 13]);
    toClear(s);
    expect([s.phase, s.wave, wavesCleared(s), s.endless]).toEqual(['setup', 14, 14, true]);
  });

  it('call early keeps its last-wave refusal in a normal game: wave 9 and wave 10', () => {
    for (const wave of [9, 10]) {
      const s = createGame();
      s.lives = 1e6;
      s.wave = wave - 1;
      startWave(s);
      toLastSpawn(s);
      expect(callEarlyStatus(s), `wave ${wave}`).toEqual({ ok: false, reason: 'last-wave' });
    }
  });

  it('a loss scores the waves before it: lost on wave 1 with no towers scores 0', () => {
    const s = playScripted([]).state;
    expect([s.phase, s.wave, wavesCleared(s)]).toEqual(['lost', 1, 0]);
  });
});

describe('a game that is not continued (milestone 26)', () => {
  it('is the game before milestone 26: won on wave 10, endless false, no maxHp anywhere', () => {
    const s = won();
    expect(s.endless).toBe(false);
    expect(s.phase).toBe('won');
    expect(startWave(s)).toEqual({ ok: false, reason: 'not-in-setup' });
    expect(Object.keys(s).sort()).toEqual(
      [
        'difficulty',
        'endless',
        'enemies',
        'events',
        'gold',
        'lives',
        // Milestone 27: the game's map.
        'map',
        'nextEnemyId',
        'phase',
        'shots',
        'spawnedPerGroup',
        'specialCharges',
        // Milestone 30: the recharge, the zones and the cheat mark.
        'specialRechargeTicks',
        'zones',
        'nextZoneId',
        'cheated',
        'tick',
        'towers',
        'wave',
        'waveTick',
      ].sort(),
    );
    expect(createGame().endless).toBe(false);
  });
});
