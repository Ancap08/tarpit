// Milestone 26 verifier probes (independent of endless.test.ts): hand
// computed waves, exact hp rounding, the 10 to 11 boundary, call early in
// endless, accounting over a whole endless run, far waves and what the
// rule does at sizes nobody plays.
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTower, moveTower, sellTower, undoUpgrade, upgradeTower, useSpecial } from './actions';
import { DIFFICULTIES, DIFFICULTY_DEFS, enemyMaxHp, type Difficulty } from './difficulty';
import { ENEMY_STATS } from './enemies';
import type { GameEvent } from './events';
import { callEarlyStatus, callNextWave, continueEndless, createGame, lastSpawnTick, spawnTick, startWave, tick, wavesCleared } from './game';
import { applyAction, comboBuild, endlessGreedy, ENDLESS_CLUSTER_POLICY, ENDLESS_WAVE_CAP, playScripted, type WaveScript } from './headless';
import { MAPS, positionAlongPath } from './map';
import { TOWER_DEFS } from './towers';
import type { EnemyType, GameState } from './types';
import { nextWavePreview, waveDef, WAVES } from './waves';

const counts = (n: number) => waveDef(n).groups.map((g) => `${g.count} ${g.type} every ${g.interval} from ${g.delay}`);
const hpOf = (n: number, level: Difficulty) =>
  Object.fromEntries([...new Set(waveDef(n).groups.map((g) => g.type))].map((t) => [t, enemyMaxHp(t, level, waveDef(n).hpMultiplier)]));

describe('verifier: generated waves worked out by hand (section D)', () => {
  it('wave 11 Normal: wave 8 + 10 Harpies from 75.5 s, x1.6, last spawn tick 4935', () => {
    expect(counts(11)).toEqual([
      '50 goblin every 1.5 from 0',
      '25 wolf every 1.5 from 6.75',
      '13 troll every 5 from 3',
      '6 shieldbearer every 6 from 4',
      '14 harpy every 1.2 from 10',
      '10 harpy every 0.75 from 75.5',
    ]);
    // 19 x 1.6 = 30.4, 20 x 1.6 = 32, 900 x 1.6 = 1440, 70 x 1.6 = 112, 36 x 1.6 = 57.6.
    expect(hpOf(11, 'normal')).toEqual({ goblin: 30, wolf: 32, troll: 1440, shieldbearer: 112, harpy: 58 });
    expect(lastSpawnTick(11)).toBe(4935); // 75.5 + 9 x 0.75 = 82.25 s
  });

  it('wave 11 Hard: x1.2 x1.6 = x1.92 with one rounding', () => {
    // 36.48, 38.4, 1728, 134.4, 69.12.
    expect(hpOf(11, 'hard')).toEqual({ goblin: 36, wolf: 38, troll: 1728, shieldbearer: 134, harpy: 69 });
  });

  it('wave 13 Normal: wave 10 without the boss + 10 Harpies from 65 s, last spawn tick 4305', () => {
    expect(counts(13)).toEqual([
      '20 wolf every 1.5 from 4',
      '15 troll every 4.5 from 0',
      '12 harpy every 1.5 from 6',
      '8 shieldbearer every 5 from 2.5',
      '10 harpy every 0.75 from 65',
    ]);
    expect(hpOf(13, 'normal')).toEqual({ wolf: 32, troll: 1440, harpy: 58, shieldbearer: 112 });
    expect(lastSpawnTick(13)).toBe(4305); // 65 + 9 x 0.75 = 71.75 s
  });

  it('wave 14 Normal: cycle 2, wave 8, 12 Harpies, x2.56, last spawn tick 5025', () => {
    expect(counts(14).at(-1)).toBe('12 harpy every 0.75 from 75.5');
    // 48.64, 51.2, 2304, 179.2, 92.16.
    expect(hpOf(14, 'normal')).toEqual({ goblin: 49, wolf: 51, troll: 2304, shieldbearer: 179, harpy: 92 });
    expect(lastSpawnTick(14)).toBe(5025); // 75.5 + 11 x 0.75 = 83.75 s
  });

  it('wave 20 Normal: k 9, cycle 4, wave 8, 16 Harpies, x6.5536, last spawn tick 5205', () => {
    expect(counts(20).slice(0, -1)).toEqual(counts(11).slice(0, -1));
    expect(counts(20).at(-1)).toBe('16 harpy every 0.75 from 75.5');
    // 124.5184, 131.072, 5898.24, 458.752, 235.9296.
    expect(hpOf(20, 'normal')).toEqual({ goblin: 125, wolf: 131, troll: 5898, shieldbearer: 459, harpy: 236 });
    expect(lastSpawnTick(20)).toBe(5205); // 75.5 + 15 x 0.75 = 86.75 s
  });

  it('wave 40 Normal: k 29, cycle 10, wave 10 without the boss, 16 Harpies, x109.9511627776', () => {
    expect(counts(40).slice(0, -1)).toEqual(counts(13).slice(0, -1));
    expect(counts(40).at(-1)).toBe('16 harpy every 0.75 from 65');
    // 2199.02, 98956.05, 3958.24, 7696.58.
    expect(hpOf(40, 'normal')).toEqual({ wolf: 2199, troll: 98956, harpy: 3958, shieldbearer: 7697 });
    expect(lastSpawnTick(40)).toBe(4575); // 65 + 15 x 0.75 = 76.25 s
    expect(waveDef(40).groups.reduce((n, g) => n + g.count, 0)).toBe(71);
  });

  it('hp is round-half-up of the exact product (one rounding), every type and level, cycles 1 to 20', () => {
    // Exact: base x (num/den) x 8^c / 5^c, in integers.
    const level: Record<Difficulty, [bigint, bigint]> = { easy: [3n, 4n], normal: [1n, 1n], hard: [6n, 5n] };
    for (const d of DIFFICULTIES) expect(Number(level[d][0]) / Number(level[d][1])).toBe(DIFFICULTY_DEFS[d].hpMultiplier);
    const types: EnemyType[] = ['goblin', 'wolf', 'troll', 'harpy', 'shieldbearer'];
    const wrong: string[] = [];
    for (let c = 1; c <= 20; c++) {
      const n = 11 + 3 * (c - 1);
      for (const d of DIFFICULTIES) {
        for (const t of types) {
          const num = BigInt(ENEMY_STATS[t].hp) * level[d][0] * 8n ** BigInt(c);
          const den = level[d][1] * 5n ** BigInt(c);
          const exact = (2n * num + den) / (2n * den); // floor(x + 1/2)
          const got = enemyMaxHp(t, d, waveDef(n).hpMultiplier);
          if (BigInt(got) !== exact) wrong.push(`${t} ${d} cycle ${c}: ${got} vs exact ${exact}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('two roundings would differ from the code somewhere (so the single rounding is really tested)', () => {
    // Easy Goblin cycle 1: round(19 x 0.75) = 14, round(14 x 1.6) = 22; one rounding gives round(22.8) = 23.
    expect(enemyMaxHp('goblin', 'easy', 1.6)).toBe(23);
    expect(Math.round(enemyMaxHp('goblin', 'easy') * 1.6)).toBe(22);
  });
});

describe('verifier: spawn rate and shape, waves 11 to 60', () => {
  const maxInWindow = (ticks: number[]) => {
    const s = [...ticks].sort((a, b) => a - b);
    let best = 0;
    for (let i = 0, j = 0; i < s.length; i++) {
      while (s[i] - s[j] >= 180) j++;
      best = Math.max(best, i - j + 1);
    }
    return best;
  };
  it('at most 6 walkers and 4 flyers in any [t, t + 180) of the merged schedule', () => {
    for (let n = 11; n <= 60; n++) {
      const walkers: number[] = [];
      const flyers: number[] = [];
      for (const g of waveDef(n).groups) for (let i = 0; i < g.count; i++) (ENEMY_STATS[g.type].flying ? flyers : walkers).push(spawnTick(g, i));
      expect(maxInWindow(walkers), `wave ${n} walkers`).toBeLessThanOrEqual(6);
      expect(maxInWindow(flyers), `wave ${n} flyers`).toBeLessThanOrEqual(4);
    }
  });

  it('no boss, no two spawns of one group on one tick, and the same wave object each call', () => {
    for (let n = 11; n <= 60; n++) {
      expect(waveDef(n).groups.some((g) => g.type === 'boss')).toBe(false);
      expect(waveDef(n)).toBe(waveDef(n));
      for (const g of waveDef(n).groups) expect(spawnTick(g, 1) - spawnTick(g, 0)).toBeGreaterThan(0);
    }
  });

  it('the table is not changed by generating waves (the base groups are shared, not copied)', () => {
    const before = JSON.stringify(WAVES);
    for (let n = 11; n <= 200; n++) waveDef(n);
    expect(JSON.stringify(WAVES)).toBe(before);
    expect(Object.isFrozen(WAVES)).toBe(false); // informational: nothing freezes the table; nothing writes it either
  });
});

/** A fresh game moved to wave `wave - 1` cleared, in setup; lives raised so nothing is lost. */
function at(wave: number, endless: boolean, difficulty?: Difficulty): GameState {
  const s = createGame({ difficulty });
  s.wave = wave - 1;
  s.endless = endless;
  s.lives = 1e6;
  s.gold = 1e6;
  return s;
}
const toLastSpawn = (s: GameState) => {
  while (s.waveTick <= lastSpawnTick(s.wave)) tick(s);
};
const toClear = (s: GameState) => {
  while (s.phase === 'wave') tick(s);
};

describe('verifier: the win and the wave 10 to 11 boundary (section E)', () => {
  it('the boss dying with others alive is not yet a win; the win comes when the last enemy is gone', () => {
    const s = at(10, false);
    startWave(s);
    toLastSpawn(s);
    const boss = s.enemies.find((e) => e.type === 'boss')!;
    expect(s.enemies.length).toBeGreaterThan(1);
    boss.hp = 1;
    const p = positionAlongPath(MAPS.meadow, boss.distance);
    expect(useSpecial(s, 'keg', p)).toMatchObject({ ok: true });
    expect(s.events.some((e) => e.kind === 'bossDown' && e.cause === 'special')).toBe(true);
    expect(s.enemies.length).toBeGreaterThan(0);
    expect(s.phase).toBe('wave');
    expect(continueEndless(s)).toEqual({ ok: false, reason: 'not-won' });
    tick(s);
    expect(s.phase).toBe('wave');
    toClear(s);
    expect(s.phase).toBe('won');
    expect(s.enemies).toEqual([]);
  });

  it('the boss walking out is still a win when lives remain (rule: all gone and lives > 0), and Keep going starts clean', () => {
    const s = at(10, false);
    s.lives = 100;
    startWave(s);
    const events: GameEvent[] = [];
    while (s.phase === 'wave') {
      tick(s);
      events.push(...s.events);
    }
    expect(events.some((e) => e.kind === 'bossDown' && e.cause === 'exit')).toBe(true);
    expect(s.phase).toBe('won');
    expect(s.lives).toBe(100 - 55 - 5); // 55 others and the boss's 5
    expect(continueEndless(s).ok).toBe(true);
    expect(s).toMatchObject({ phase: 'setup', endless: true, wave: 10, enemies: [], specialCharges: 0 });
    expect(nextWavePreview(s).some((p) => p.type === 'boss')).toBe(false);
  });

  it('a boss exit that takes the last lives is a loss, never a win, and cannot be continued', () => {
    const s = at(10, false);
    s.lives = 60; // 55 others exit first... the boss is slowest: 5 left when he exits
    startWave(s);
    toClear(s);
    expect(s.phase).toBe('lost');
    expect(s.lives).toBeLessThanOrEqual(0);
    expect(continueEndless(s)).toEqual({ ok: false, reason: 'not-won' });
    expect(wavesCleared(s)).toBe(9);
  });

  it('nothing can be bought, sold or moved while won; after Keep going old towers are locked and new ones are planning-phase towers', () => {
    const s = playScripted(comboBuild()).state;
    expect(s.phase).toBe('won');
    const cell = s.towers[0].cell;
    const free = { col: 1, row: 1 };
    const before = structuredClone(s);
    expect(buildTower(s, free, 'longbow')).toMatchObject({ ok: false, reason: 'game-over' });
    expect(sellTower(s, cell)).toMatchObject({ ok: false, reason: 'game-over' });
    expect(upgradeTower(s, cell)).toMatchObject({ ok: false });
    expect(moveTower(s, cell, free)).toMatchObject({ ok: false, reason: 'game-over' });
    expect(undoUpgrade(s, cell)).toMatchObject({ ok: false, reason: 'game-over' });
    expect(s).toEqual(before);

    continueEndless(s);
    // Every tower from the ten waves is locked with nothing refundable.
    for (const t of s.towers) expect([t.locked, t.unlockedSpend, t.upgradedThisPhase]).toEqual([true, 0, false]);
    expect(moveTower(s, cell, free)).toMatchObject({ ok: false, reason: 'locked' });
    expect(undoUpgrade(s, cell)).toMatchObject({ ok: false, reason: 'nothing-to-undo' });
    // A new tower in the endless setup: free move, full refund, no profit.
    const gold = s.gold;
    expect(buildTower(s, free, 'longbow').ok).toBe(true);
    expect(moveTower(s, free, { col: 2, row: 1 }).ok).toBe(true);
    expect(sellTower(s, { col: 2, row: 1 })).toMatchObject({ ok: true, refund: TOWER_DEFS.longbow.cost });
    expect(s.gold).toBe(gold);
    // An old tower sells at 70% of what was spent.
    const old = s.towers[0];
    expect(sellTower(s, old.cell)).toMatchObject({ ok: true, refund: Math.floor(old.spent * 0.7) });
  });

  it('continueEndless twice: the second is refused and changes nothing; won is not reached again by clearing', () => {
    const s = at(10, false);
    startWave(s);
    toClear(s);
    expect(continueEndless(s).ok).toBe(true);
    const before = structuredClone(s);
    expect(continueEndless(s)).toEqual({ ok: false, reason: 'not-won' });
    expect(s).toEqual(before);
    let won = 0;
    for (let w = 11; w <= 16; w++) {
      startWave(s);
      while (s.phase === 'wave') {
        tick(s);
        won += s.events.filter((e) => e.kind === 'won').length;
      }
      expect([s.phase, s.wave, wavesCleared(s)]).toEqual(['setup', w, w]);
    }
    expect(won).toBe(0);
  });
});

describe('verifier: call early in endless', () => {
  it('waves 11 to 15 called one on top of the other: survivors keep their own hp, score counts each', () => {
    const s = at(11, true);
    startWave(s);
    for (let w = 11; w <= 14; w++) {
      expect(callEarlyStatus(s)).toEqual({ ok: false, reason: 'still-spawning' });
      toLastSpawn(s);
      expect(wavesCleared(s)).toBe(w - 1);
      const alive = s.enemies.length;
      expect(callNextWave(s)).toMatchObject({ ok: true, wave: w + 1 });
      expect(s.enemies.length).toBe(alive);
      expect([s.phase, s.wave, wavesCleared(s), s.specialCharges]).toEqual(['wave', w + 1, w, 1]);
      if (w === 13) {
        // Wave 13 (cycle 1) survivors next to wave 14 (cycle 2) spawns: each carries its own full hp.
        for (let i = 0; i < 300; i++) tick(s);
        expect(s.enemies.every((e) => e.maxHp !== undefined && e.hp <= e.maxHp)).toBe(true);
        const trollHp = new Set(s.enemies.filter((e) => e.type === 'troll').map((e) => e.maxHp));
        expect([...trollHp].sort((x, y) => x! - y!)).toEqual([1440, 2304]);
      }
    }
    toClear(s);
    expect([s.phase, s.wave, wavesCleared(s)]).toEqual(['setup', 15, 15]);
  });

  it('losing during a called wave scores the waves before it; lives may go below 0 and the game stays lost', () => {
    const s = at(11, true);
    startWave(s);
    toLastSpawn(s);
    callNextWave(s); // wave 12 on top of wave 11
    s.lives = 3;
    toClear(s);
    expect(s.phase).toBe('lost');
    expect(s.wave).toBe(12);
    expect(wavesCleared(s)).toBe(11);
    expect(s.lives).toBeLessThanOrEqual(0);
    const before = structuredClone(s);
    tick(s);
    expect(callNextWave(s)).toMatchObject({ ok: false, reason: 'game-over' });
    expect(startWave(s).ok).toBe(false);
    expect(s).toEqual(before);
  });

  it('wave 10 of a normal game still cannot be called to 11, and wave 9 cannot call the boss', () => {
    for (const w of [9, 10]) {
      const s = at(w, false);
      startWave(s);
      toLastSpawn(s);
      expect(callEarlyStatus(s)).toEqual({ ok: false, reason: 'last-wave' });
    }
  });
});

describe('verifier: a whole endlessGreedy run', () => {
  let script: WaveScript;
  let state: GameState;
  const all: GameEvent[] = [];
  const problems: string[] = [];
  const scoreTrail: number[] = [];
  beforeAll(() => {
    script = endlessGreedy();
    state = createGame();
    let expected = state.gold;
    const take = (where: string) => {
      for (const e of state.events) {
        if (e.kind === 'kill') expected += e.bounty;
        else if (e.kind === 'waveClear' || e.kind === 'earlyCall') expected += e.bonus;
        else if (e.kind === 'build') expected -= TOWER_DEFS[e.tower].cost;
        else if (e.kind === 'upgrade') expected -= TOWER_DEFS[e.tower].upgradeCost;
        else if (e.kind === 'sell') expected += e.refund;
      }
      all.push(...state.events);
      state.events = [];
      if (state.gold !== expected && problems.length < 5) problems.push(`gold ${state.gold} != ${expected} ${where}`);
      if (!Number.isInteger(state.gold) || !Number.isInteger(state.lives)) problems.push(`non-integer ${where}`);
      const sc = wavesCleared(state);
      if (scoreTrail.length && sc < scoreTrail[scoreTrail.length - 1]) problems.push(`score went down ${where}`);
      if (scoreTrail[scoreTrail.length - 1] !== sc) scoreTrail.push(sc);
    };
    const phase = (): GameState['phase'] => state.phase;
    for (let i = 0; i < ENDLESS_WAVE_CAP && phase() === 'setup'; i++) {
      for (const a of script[i] ?? []) {
        applyAction(state, a);
        take(`action wave ${i + 1}`);
      }
      startWave(state);
      take('start');
      const timed = script.timed?.[i] ?? [];
      while (phase() === 'wave') {
        for (const a of timed) if (a.atWaveTick === state.waveTick) applyAction(state, a);
        take(`timed wave ${i + 1}`);
        tick(state);
        take(`tick wave ${i + 1}`);
      }
      if (phase() === 'won') {
        continueEndless(state);
        take('continue');
      }
    }
  });

  it('gold is conserved on every tick and action from wave 1 to the loss', () => {
    expect(problems).toEqual([]);
    expect(state.phase).toBe('lost');
    expect(state.wave).toBe(18);
  });

  it('the score climbs 0, 1, 2, ... 17 one at a time and never falls', () => {
    expect(scoreTrail).toEqual(Array.from({ length: 18 }, (_, i) => i));
  });

  it('kill accounting: spawned = killed + exited + alive; tower kills + special kills + unowned burns = kills', () => {
    const n = (k: GameEvent['kind']) => all.filter((e) => e.kind === k).length;
    expect(n('spawn')).toBe(n('kill') + n('exit') + state.enemies.length);
    const kills = all.filter((e) => e.kind === 'kill');
    const special = kills.filter((e) => e.kind === 'kill' && e.cause === 'special').length;
    const burn = kills.filter((e) => e.kind === 'kill' && e.cause === 'burn').length;
    const towerKills = state.towers.reduce((sum, t) => sum + t.kills, 0);
    // The script never sells, so every shot kill is on a tower; burn kills may belong to Fire Arrows (no tower).
    expect(towerKills).toBeGreaterThanOrEqual(kills.length - special - burn);
    expect(towerKills).toBeLessThanOrEqual(kills.length - special);
    // Ids are handed out once each, in order.
    expect(state.nextEnemyId - createGame().nextEnemyId).toBe(n('spawn'));
    // One won, one endlessStart, one lost, a waveStart and (but the last) a waveClear per wave.
    expect([n('won'), n('endlessStart'), n('lost'), n('waveStart'), n('waveClear')]).toEqual([1, 1, 1, 18, 17]);
    // Lives lost = exits (no boss exit in this run).
    expect(20 - state.lives).toBe(n('exit'));
  });

  it('the run is the one playScripted gives, twice over', () => {
    const a = playScripted(script);
    const b = playScripted(endlessGreedy());
    expect(a.state).toEqual(b.state);
    expect(a.log).toEqual(b.log);
    expect({ ...a.state, events: [] }).toEqual(state);
  });
});

describe('verifier: far waves', () => {
  it('wave 150 (hp x 1.6^47): hp is a finite safe integer, towers still hurt, a wave takes the usual time', () => {
    const s = at(150, true);
    for (const [col, row] of [[9, 5], [9, 4], [9, 6], [16, 8], [17, 8]]) buildTower(s, { col, row }, 'longbow');
    buildTower(s, { col: 14, row: 10 }, 'tarpit');
    buildTower(s, { col: 14, row: 9 }, 'firepot');
    expect(waveDef(150).hpMultiplier).toBe(1.6 ** 47);
    startWave(s);
    const t0 = performance.now();
    let ticks = 0;
    const bad: string[] = [];
    let hurt = false;
    while (s.phase === 'wave' && ticks < 60 * 600) {
      tick(s);
      ticks += 1;
      for (const e of s.enemies) {
        if (!Number.isSafeInteger(e.maxHp) || !Number.isFinite(e.hp) || !Number.isFinite(e.distance)) bad.push(`${e.type} ${e.hp}`);
        if (e.hp < (e.maxHp ?? 0)) hurt = true;
      }
    }
    expect(bad).toEqual([]);
    expect(hurt).toBe(true);
    expect(s.phase).toBe('setup');
    expect(wavesCleared(s)).toBe(150);
    expect(Number.isInteger(s.gold) && Number.isInteger(s.lives)).toBe(true);
    expect(enemyMaxHp('troll', 'normal', waveDef(150).hpMultiplier)).toBeGreaterThan(3e12);
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it('informational: from wave 200 (cycle 64) a Troll has more hp than 2^53, so small hits stop registering', () => {
    const at197 = enemyMaxHp('troll', 'normal', waveDef(197).hpMultiplier);
    const at200 = enemyMaxHp('troll', 'normal', waveDef(200).hpMultiplier);
    expect(Number.isSafeInteger(at197)).toBe(true);
    expect(Number.isSafeInteger(at200)).toBe(false);
    expect(at200 - (at200 - 1)).not.toBe(1); // a 1-damage hit is not 1 damage any more
    expect(Number.isFinite(at200)).toBe(true);
  });

  it('the cluster policy covers every wave up to the cap, at the repeated table wave’s tick', () => {
    expect(ENDLESS_CLUSTER_POLICY).toHaveLength(ENDLESS_WAVE_CAP);
    expect(ENDLESS_WAVE_CAP).toBe(200);
    const tickOf = (wave: number) => (ENDLESS_CLUSTER_POLICY[wave - 1][0] as { atWaveTick: number }).atWaveTick;
    expect([tickOf(11), tickOf(12), tickOf(13), tickOf(14), tickOf(200)]).toEqual([1241, 1194, 713, 1241, 1241]);
  });
});
