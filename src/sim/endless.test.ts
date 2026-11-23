// Milestone 26: endless mode (docs/SCOPE-v4.md "Endless mode and high
// score"). Waves past 20 come from waves.ts waveDef; game.ts
// continueEndless turns a won game into an endless one; the score is
// game.ts wavesCleared.
import { beforeAll, describe, expect, it } from 'vitest';
import { campaignHpFactor, enemyMaxHp } from './difficulty';
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
import { applyAction, applyScriptBoon, comboBuild, endlessGreedy, endlessIdle, ENDLESS_WAVE_CAP, playScripted, type WaveScript } from './headless';
import type { GameEvent } from './events';
import type { GameState, GroupDef } from './types';
import { ENDLESS_HP_GROWTH, ENDLESS_START_HP, hasNextWave, LAST_WAVE, nextWavePreview, waveDef, WAVES } from './waves';

const harpyGroup = (n: number): GroupDef => waveDef(n).groups[waveDef(n).groups.length - 1];
const withoutLast = (n: number) => waveDef(n).groups.slice(0, -1);
const noBoss = (w: number) => WAVES[w - 1].groups.filter((g) => !isBoss(g));

describe('waveDef (milestone 26)', () => {
  it('waves 1 to 20 are the original table objects', () => {
    expect(LAST_WAVE).toBe(20);
    for (let n = 1; n <= 20; n++) expect(waveDef(n)).toBe(WAVES[n - 1]);
  });

  it('refuses wave 0 and non-integers', () => {
    expect(() => waveDef(0)).toThrow();
    expect(() => waveDef(1.5)).toThrow();
  });

  it('adds Harpies to waves 18–20, excludes bosses, and grows hp by 1.8 after each cycle', () => {
    expect(ENDLESS_START_HP).toBe(1.05);
    expect(ENDLESS_HP_GROWTH).toBe(1.8);
    for (let n = 21; n <= 200; n++) {
      const tableWave = 18 + ((n - 21) % 3);
      const cycle = Math.floor((n - 21) / 3) + 1;
      expect(withoutLast(n)).toEqual(noBoss(tableWave));
      const harpies = harpyGroup(n);
      expect(harpies).toMatchObject({
        type: 'harpy',
        count: Math.min(16, 8 + 2 * cycle),
        interval: 0.75,
      });
      const lastBaseTick = Math.max(...noBoss(tableWave).map((group) => spawnTick(group, group.count - 1)));
      expect(spawnTick(harpies, 0)).toBe(lastBaseTick + 120);
      expect(waveDef(n).hpMultiplier).toBe(1.05 * 1.8 ** (cycle - 1));
    }
  });

  it('hp gain is applied once, after difficulty, campaign and endless multipliers', () => {
    const campaign = campaignHpFactor(20, 'normal');
    expect(enemyMaxHp('goblin', 'normal', campaign * waveDef(21).hpMultiplier!))
      .toBe(Math.round(23 * campaign * 1.05));
    expect(enemyMaxHp('goblin', 'easy', waveDef(21).hpMultiplier)).toBe(18);
  });

  it('bounties, speeds and lives cost come from the enemy table, unchanged', () => {
    expect(Object.keys(waveDef(21)).sort()).toEqual(['groups', 'hpMultiplier']);
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

  it('spawn rate (25c A1) holds on the merged schedule of waves 21 to 60', () => {
    for (let n = 21; n <= 60; n++) {
      expect(maxIn180(spawns(n, false)), `wave ${n} walkers`).toBeLessThanOrEqual(6);
      expect(maxIn180(spawns(n, true)), `wave ${n} flyers`).toBeLessThanOrEqual(4);
    }
  });

  it('preview: nothing after wave 20 in a normal game, wave 21 in an endless one', () => {
    const s = { ...createGame(), wave: 20 };
    expect(hasNextWave(s)).toBe(false);
    expect(nextWavePreview(s)).toEqual([]);
    s.endless = true;
    expect(hasNextWave(s)).toBe(true);
    expect(nextWavePreview(s)).toEqual(waveDef(21).groups.map((g) => ({ type: g.type, count: g.count })));
    expect(nextWavePreview(s).at(-1)).toEqual({ type: 'harpy', count: 10 });
  });
});

/** The comboBuild game on Normal, just won (phase 'won' after wave 20). */
let wonState: GameState;
beforeAll(() => {
  wonState = playScripted(comboBuild()).state;
});
const won = () => structuredClone(wonState);

describe('continueEndless (milestone 26)', () => {
  it('the combo build wins on Normal (the starting point)', () => {
    expect(wonState).toMatchObject({ phase: 'won', wave: 20, endless: false });
  });

  it('allowed when won: setup, endless, wave 20 cleared, everything kept', () => {
    const s = won();
    const before = structuredClone(s);
    const r = continueEndless(s);
    expect(r).toEqual({ ok: true, wave: 20 });
    expect(s.phase).toBe('setup');
    expect(s.endless).toBe(true);
    expect(s.events.at(-1)).toEqual({ kind: 'endlessStart' });
    expect(wavesCleared(s)).toBe(20);
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

  it('Start Wave then plays wave 21 with the scaled hp', () => {
    const s = won();
    continueEndless(s);
    expect(startWave(s)).toEqual({ ok: true, wave: 21 });
    tick(s);
    const first = s.enemies[0];
    expect(first.type).toBe('goblin');
    const hp = Math.round(23 * campaignHpFactor(20, 'normal') * 1.05);
    expect(first.hp).toBe(hp);
    expect(first.maxHp).toBe(hp);
    expect(s.specialCharges).toBe(1);
  });

  it('an unscaled campaign wave does not set maxHp', () => {
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
    applyScriptBoon(state, script);
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
  let idleScript: WaveScript;
  let idle: ReturnType<typeof replayEvents>;
  beforeAll(() => {
    idleScript = endlessIdle();
    idle = replayEvents(idleScript);
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

  it('endlessIdle on Normal loses after entering endless, with the preceding wave scored', () => {
    expect(idle.state).toMatchObject({ phase: 'lost', endless: true });
    expect(idle.state.wave).toBeGreaterThan(20);
    expect(wavesCleared(idle.state)).toBe(idle.state.wave - 1);
    // The replay here and playScripted agree (the replay drains the event list).
    expect({ ...playScripted(idleScript).state, events: [] }).toEqual(idle.state);
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

  let greedyScript: WaveScript;
  let greedyRun: ReturnType<typeof playScripted>;
  beforeAll(() => {
    greedyScript = endlessGreedy();
    greedyRun = playScripted(greedyScript);
  });

  it('the two scripts play the same campaign and only the greedy script purchases after victory', () => {
    expect(greedyScript.slice(0, LAST_WAVE)).toEqual(idleScript.slice(0, LAST_WAVE));
    expect(greedyScript.timed?.slice(0, LAST_WAVE)).toEqual(idleScript.timed?.slice(0, LAST_WAVE));
    expect(idleScript.slice(LAST_WAVE).flat()).toHaveLength(0);
    expect(greedyScript.slice(LAST_WAVE).flat()).toContainEqual(expect.objectContaining({ type: 'build', tower: 'mortar' }));
  });

  it('records the same endlessGreedy decisions twice', () => {
    expect(endlessGreedy()).toEqual(greedyScript);
  });

  it('two endlessGreedy replays give deep-equal final states and wave reports', () => {
    const again = playScripted(greedyScript);
    expect(again.state).toEqual(greedyRun.state);
    expect(again.waves).toEqual(greedyRun.waves);
  });

  it('gold is conserved across the wave 20 to 21 boundary', () => {
    const s = won();
    s.lives = 1000; // Let the fixture reach the clear even if the full endless wave leaks.
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
    expect(s.wave).toBe(21);
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
    for (let w = 5; w <= 20; w++) {
      applyScriptBoon(s);
      startWave(s);
      toClear(s);
    }
    expect([s.phase, wavesCleared(s)]).toEqual(['won', 20]);
    // Keep going; call early from wave 21 to 22 (no last-wave refusal in endless).
    continueEndless(s);
    expect(wavesCleared(s)).toBe(20);
    startWave(s);
    expect(callEarlyStatus(s)).toEqual({ ok: false, reason: 'still-spawning' });
    toLastSpawn(s);
    const gold = s.gold;
    const r = callNextWave(s);
    expect(r).toEqual({ ok: true, wave: 22, bonus: 20, gold: gold + WAVE_CLEAR_BONUS + 20 });
    expect([s.phase, s.wave, wavesCleared(s), s.specialCharges]).toEqual(['wave', 22, 21, 1]);
    // Wave 22 to 23 and 23 to 24 (wave 23 is wave 20's table without the boss) call too.
    toLastSpawn(s);
    expect(callNextWave(s).ok).toBe(true);
    toLastSpawn(s);
    expect(callNextWave(s).ok).toBe(true);
    expect([s.wave, wavesCleared(s)]).toEqual([24, 23]);
    toClear(s);
    expect([s.phase, s.wave, wavesCleared(s), s.endless]).toEqual(['setup', 24, 24, true]);
  });

  it('call early keeps its last-wave refusal in a normal game: waves 19 and 20', () => {
    for (const wave of [19, 20]) {
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
  it('stays won on wave 20 until explicitly continued', () => {
    const s = won();
    expect(s).toMatchObject({ endless: false, phase: 'won', wave: 20, pendingBoon: null, enemies: [] });
    expect(startWave(s)).toEqual({ ok: false, reason: 'not-in-setup' });
    expect(createGame().endless).toBe(false);
  });
});
