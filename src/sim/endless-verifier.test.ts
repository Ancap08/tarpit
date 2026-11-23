// Milestone 26 verifier probes (independent of endless.test.ts): hand
// computed waves, exact hp rounding, the 10 to 11 boundary, call early in
// endless, accounting over a whole endless run, far waves and what the
// rule does at sizes nobody plays.
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTower, moveTower, sellTower, undoUpgrade, upgradeTower, useSpecial } from './actions';
import { ACT_TWO_HP_GROWTH, DIFFICULTIES, DIFFICULTY_DEFS, campaignHpFactor, enemyMaxHp, type Difficulty } from './difficulty';
import { ENEMY_STATS } from './enemies';
import type { GameEvent } from './events';
import { callEarlyStatus, callNextWave, continueEndless, createGame, lastSpawnTick, spawnTick, startWave, tick, wavesCleared } from './game';
import { applyAction, applyScriptBoon, comboBuild, endlessGreedy, ENDLESS_WAVE_CAP, playScripted, type WaveScript } from './headless';
import { MAPS, positionAlongPath } from './map';
import { TOWER_DEFS, TOWER_PATHS } from './towers';
import type { EnemyType, GameState } from './types';
import { nextWavePreview, waveDef, WAVES } from './waves';

describe('verifier: generated wave rounding', () => {
  it('hp is round-half-up of the exact product (one rounding), every type and level, cycles 1 to 20', () => {
    // Exact: base x (num/den) x campaign^10 x 9^c / 5^c, in integers.
    const level: Record<Difficulty, [bigint, bigint]> = { easy: [3n, 4n], normal: [1n, 1n], hard: [6n, 5n] };
    for (const d of DIFFICULTIES) expect(Number(level[d][0]) / Number(level[d][1])).toBe(DIFFICULTY_DEFS[d].hpMultiplier);
    const growth = (difficulty: Difficulty): [bigint, bigint] => {
      const factor = ACT_TWO_HP_GROWTH[difficulty].toString();
      const decimals = factor.split('.')[1]?.length ?? 0;
      return [BigInt(factor.replace('.', '')), 10n ** BigInt(decimals)];
    };
    const types: EnemyType[] = ['goblin', 'wolf', 'troll', 'harpy', 'shieldbearer'];
    const wrong: string[] = [];
    for (let c = 1; c <= 20; c++) {
      const n = 21 + 3 * (c - 1);
      for (const d of DIFFICULTIES) {
        for (const t of types) {
          const [growthNumerator, growthDenominator] = growth(d);
          const num = BigInt(ENEMY_STATS[t].hp) * level[d][0] * growthNumerator ** 10n * 9n ** BigInt(c);
          const den = level[d][1] * growthDenominator ** 10n * 5n ** BigInt(c);
          const exact = (2n * num + den) / (2n * den); // floor(x + 1/2)
          const got = enemyMaxHp(t, d, campaignHpFactor(n, d) * waveDef(n).hpMultiplier!);
          if (BigInt(got) !== exact) wrong.push(`${t} ${d} cycle ${c}: ${got} vs exact ${exact}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('two roundings would differ from the code somewhere (so the single rounding is really tested)', () => {
    // Easy Goblin base: round(23 x 0.75) = 17. In cycle 2, using that rounded value gives 55 instead of 56.
    expect(enemyMaxHp('goblin', 'easy', 3.24)).toBe(56);
    expect(Math.round(enemyMaxHp('goblin', 'easy') * 3.24)).toBe(55);
  });
});

describe('verifier: spawn rate and shape, waves 21 to 60', () => {
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
    for (let n = 21; n <= 60; n++) {
      const walkers: number[] = [];
      const flyers: number[] = [];
      for (const g of waveDef(n).groups) for (let i = 0; i < g.count; i++) (ENEMY_STATS[g.type].flying ? flyers : walkers).push(spawnTick(g, i));
      expect(maxInWindow(walkers), `wave ${n} walkers`).toBeLessThanOrEqual(6);
      expect(maxInWindow(flyers), `wave ${n} flyers`).toBeLessThanOrEqual(4);
    }
  });

  it('no boss, no two spawns of one group on one tick, and the same wave object each call', () => {
    for (let n = 21; n <= 60; n++) {
      expect(waveDef(n).groups.some((g) => g.type === 'boss' || g.type === 'grumblemaw')).toBe(false);
      expect(waveDef(n)).toBe(waveDef(n));
      for (const g of waveDef(n).groups) expect(spawnTick(g, 1) - spawnTick(g, 0)).toBeGreaterThan(0);
    }
  });

  it('the table is not changed by generating waves (the base groups are shared, not copied)', () => {
    const before = JSON.stringify(WAVES);
    for (let n = 21; n <= 200; n++) waveDef(n);
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

describe('verifier: the win and the wave 20 to 21 boundary (section E)', () => {
  it('Grumblefoot dying with others alive cannot clear the wave early', () => {
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
    expect(s.phase).toBe('setup');
    expect(s.pendingBoon?.wave).toBe(10);
    expect(s.enemies).toEqual([]);
  });

  it('the boss walking out is still a win when lives remain (rule: all gone and lives > 0), and Keep going starts clean', () => {
    const s = at(20, false);
    s.lives = 1000;
    startWave(s);
    const events: GameEvent[] = [];
    while (s.phase === 'wave') {
      tick(s);
      events.push(...s.events);
    }
    expect(events.some((e) => e.kind === 'bossDown' && e.cause === 'exit')).toBe(true);
    expect(s.phase).toBe('won');
    const scheduled = WAVES[19].groups.reduce((n, group) => n + group.count, 0);
    expect(s.lives).toBe(1000 - (scheduled - 1) - 10);
    expect(continueEndless(s).ok).toBe(true);
    expect(s).toMatchObject({ phase: 'setup', endless: true, wave: 20, enemies: [], specialCharges: 0 });
    expect(nextWavePreview(s).some((p) => p.type === 'boss' || p.type === 'grumblemaw')).toBe(false);
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
    // Every tower from the twenty waves is locked with nothing refundable.
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
    const s = at(20, false);
    startWave(s);
    toClear(s);
    expect(continueEndless(s).ok).toBe(true);
    const before = structuredClone(s);
    expect(continueEndless(s)).toEqual({ ok: false, reason: 'not-won' });
    expect(s).toEqual(before);
    let won = 0;
    for (let w = 21; w <= 26; w++) {
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
  it('waves 21 to 25 called one on top of the other: survivors keep their own hp, score counts each', () => {
    const s = at(21, true);
    startWave(s);
    for (let w = 21; w <= 24; w++) {
      expect(callEarlyStatus(s)).toEqual({ ok: false, reason: 'still-spawning' });
      toLastSpawn(s);
      expect(wavesCleared(s)).toBe(w - 1);
      const alive = s.enemies.length;
      expect(callNextWave(s)).toMatchObject({ ok: true, wave: w + 1 });
      expect(s.enemies.length).toBe(alive);
      expect([s.phase, s.wave, wavesCleared(s), s.specialCharges]).toEqual(['wave', w + 1, w, 1]);
      if (w === 23) {
        // Wave 23 (cycle 1) survivors next to wave 24 (cycle 2) spawns: each carries its own full hp.
        for (let i = 0; i < 301; i++) tick(s);
        expect(s.enemies.every((e) => e.maxHp !== undefined && e.hp <= e.maxHp)).toBe(true);
        const trollHp = new Set(s.enemies.filter((e) => e.type === 'troll').map((e) => e.maxHp));
        const campaign = ACT_TWO_HP_GROWTH.normal ** 10;
        expect([...trollHp].sort((x, y) => x! - y!)).toEqual([1.8, 3.24].map((endless) => Math.round(950 * campaign * endless)));
      }
    }
    toClear(s);
    expect([s.phase, s.wave, wavesCleared(s)]).toEqual(['setup', 25, 25]);
  });

  it('losing during a called wave scores the waves before it; lives may go below 0 and the game stays lost', () => {
    const s = at(21, true);
    startWave(s);
    toLastSpawn(s);
    callNextWave(s); // wave 22 on top of wave 21
    s.lives = 3;
    toClear(s);
    expect(s.phase).toBe('lost');
    expect(s.wave).toBe(22);
    expect(wavesCleared(s)).toBe(21);
    expect(s.lives).toBeLessThanOrEqual(0);
    const before = structuredClone(s);
    tick(s);
    expect(callNextWave(s)).toMatchObject({ ok: false, reason: 'game-over' });
    expect(startWave(s).ok).toBe(false);
    expect(s).toEqual(before);
  });

  it('wave 20 of a normal game cannot be called to 21, and wave 19 cannot call the boss', () => {
    for (const w of [19, 20]) {
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
        else if (e.kind === 'boonPicked' && e.id === 'warChest') expected += 80;
        else if (e.kind === 'waveClear' || e.kind === 'earlyCall') expected += e.bonus;
        else if (e.kind === 'build') expected -= TOWER_DEFS[e.tower].cost;
        else if (e.kind === 'upgrade') expected -= e.level === 3 ? TOWER_PATHS[e.tower].cost : TOWER_DEFS[e.tower].upgradeCost;
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
      applyScriptBoon(state, script);
      take('boon');
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
    expect(state.wave).toBeGreaterThan(20);
  });

  it('the score climbs from zero one at a time and never falls', () => {
    expect(scoreTrail).toEqual(Array.from({ length: state.wave }, (_, i) => i));
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
    expect([n('won'), n('endlessStart'), n('lost'), n('waveStart'), n('waveClear')]).toEqual([1, 1, 1, state.wave, state.wave - 1]);
    const enemyTypes = new Map(all.filter((e) => e.kind === 'spawn').map((e) => [e.enemyId, e.enemyType]));
    const losses = all.filter((e) => e.kind === 'exit').reduce((sum, e) => sum + ENEMY_STATS[enemyTypes.get(e.enemyId)!].livesCost, 0);
    expect(20 + (state.boons.includes('stoneWalls') ? 4 : 0) - state.lives).toBe(losses);
  });

  let reference: ReturnType<typeof playScripted>;
  beforeAll(() => {
    reference = playScripted(script);
  });

  it('the independent event replay matches playScripted', () => {
    expect({ ...reference.state, events: [] }).toEqual(state);
  });

  it('replaying the script again produces the same state and log', () => {
    const again = playScripted(script);
    expect(reference.state).toEqual(again.state);
    expect(reference.log).toEqual(again.log);
  });
});

describe('verifier: far waves', () => {
  it('wave 150 (hp x 1.8^44): hp is a finite safe integer, towers still hurt, a wave takes the usual time', () => {
    const s = at(150, true);
    for (const [col, row] of [[9, 5], [9, 4], [9, 6], [16, 8], [17, 8]]) buildTower(s, { col, row }, 'longbow');
    buildTower(s, { col: 14, row: 10 }, 'tarpit');
    buildTower(s, { col: 14, row: 9 }, 'firepot');
    expect(waveDef(150).hpMultiplier).toBe(1.8 ** 44);
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
    expect(enemyMaxHp('troll', 'normal', campaignHpFactor(150, 'normal') * waveDef(150).hpMultiplier!)).toBeGreaterThan(3e12);
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it('informational: by wave 200 (cycle 60) a Troll has more hp than 2^53, so small hits stop registering', () => {
    const at150 = enemyMaxHp('troll', 'normal', campaignHpFactor(150, 'normal') * waveDef(150).hpMultiplier!);
    const at200 = enemyMaxHp('troll', 'normal', campaignHpFactor(200, 'normal') * waveDef(200).hpMultiplier!);
    expect(Number.isSafeInteger(at150)).toBe(true);
    expect(Number.isSafeInteger(at200)).toBe(false);
    expect(at200 - (at200 - 1)).not.toBe(1); // a 1-damage hit is not 1 damage any more
    expect(Number.isFinite(at200)).toBe(true);
  });

  it('the special policy fires in the endless waves too (milestone 30: the cluster ticks are gone)', () => {
    expect(ENDLESS_WAVE_CAP).toBe(200);
    const script = endlessGreedy();
    const endlessSpecials = (script.timed ?? []).slice(20).flat().filter((a) => a.type === 'special');
    expect(endlessSpecials.length).toBeGreaterThan(0);
  });

});
