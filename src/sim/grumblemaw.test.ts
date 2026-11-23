import { describe, expect, it } from 'vitest';
import { buildTower, useSpecial } from './actions';
import { enemyMaxHp } from './difficulty';
import { cappedSlow, ENEMY_STATS, isBoss } from './enemies';
import type { GameEvent } from './events';
import { createGame, lastSpawnTick, spawnTick, startWave, tick, WAVE_CLEAR_BONUS } from './game';
import { MAPS, pathLength } from './map';
import type { GameState } from './types';
import { WAVES } from './waves';

function arena(difficulty: GameState['difficulty'] = 'normal'): GameState {
  const state = createGame({ difficulty });
  state.wave = 19;
  startWave(state);
  state.spawnedPerGroup = WAVES[19].groups.map((group) => group.count);
  state.enemies = [{
    id: 0,
    type: 'grumblemaw',
    hp: enemyMaxHp('grumblemaw', difficulty),
    distance: 80,
    slow: 0,
    slowTicksLeft: 0,
  }];
  state.nextEnemyId = 1;
  state.events = [];
  return state;
}

const packCalls = (state: GameState) => state.events.filter((event) => event.kind === 'packCall');
const wolfSpawns = (events: GameEvent[]) => events.filter((event): event is Extract<GameEvent, { kind: 'spawn' }> => event.kind === 'spawn' && event.enemyType === 'wolf');

describe('Grumblemaw', () => {
  it('is bigger than Grumblefoot and shares its 30% slow cap', () => {
    expect(isBoss({ type: 'grumblemaw' })).toBe(true);
    expect(cappedSlow({ type: 'grumblemaw' }, 0.5)).toBe(0.3);
    expect(ENEMY_STATS.grumblemaw).toEqual({ hp: 5600, speed: 38, bounty: 300, flying: false, shield: false, livesCost: 6, slowCap: 0.3 });
  });

  it('spawns once as wave 20’s last enemy, 120 ticks after the last normal enemy', () => {
    const groups = WAVES[19].groups;
    const last = groups.at(-1)!;
    expect(last).toMatchObject({ type: 'grumblemaw', count: 1 });
    expect(lastSpawnTick(20)).toBe(Math.max(...groups.slice(0, -1).map((g) => spawnTick(g, g.count - 1))) + 120);
    for (const wave of WAVES.slice(0, 19)) expect(wave.groups.some((g) => g.type === 'grumblemaw')).toBe(false);

    const state = createGame();
    state.wave = 19;
    state.lives = 1000;
    startWave(state);
    while (state.waveTick <= lastSpawnTick(20)) tick(state);
    const spawn = state.events.find((e): e is Extract<GameEvent, { kind: 'spawn' }> => e.kind === 'spawn' && e.enemyType === 'grumblemaw')!;
    expect(state.events.at(-1)).toEqual({ kind: 'bossSpawn', enemyId: spawn.enemyId, enemyType: 'grumblemaw' });
    expect(state.enemies.at(-1)?.hp).toBe(5600);
  });

  it.each([[7, 'won'], [6, 'lost']] as const)('an exit costs six lives with %i left, ending %s', (lives, phase) => {
    const state = arena();
    state.lives = lives;
    state.enemies[0].distance = pathLength(MAPS.meadow) - 0.1;
    const gold = state.gold;
    tick(state);
    expect(state.lives).toBe(lives - 6);
    expect(state.phase).toBe(phase);
    expect(state.events.slice(0, 2)).toEqual([
      { kind: 'exit', enemyId: 0 },
      { kind: 'bossDown', enemyId: 0, enemyType: 'grumblemaw', cause: 'exit' },
    ]);
    expect(packCalls(state)).toEqual([]);
    expect(state.gold).toBe(gold + (phase === 'won' ? WAVE_CLEAR_BONUS : 0));
  });

  it('uses difficulty-scaled max HP for both thresholds and emits each only once', () => {
    const state = arena('hard');
    const boss = state.enemies[0];
    const hardMaxHp = boss.hp;
    expect(hardMaxHp).toBe(6720);
    // A base Musketeer hits for 12. Its first shot lands exactly at two thirds.
    buildTower(state, { col: 2, row: 5 }, 'musketeer');
    const tower = state.towers[0];
    boss.hp = 2 * hardMaxHp / 3 + 12;
    tick(state);
    expect(packCalls(state)).toEqual([{ kind: 'packCall', enemyId: 0, threshold: 2 }]);
    tower.cooldownTicks = 0;
    tick(state);
    expect(packCalls(state)).toEqual([]);
    expect(state.enemies.filter((enemy) => enemy.type === 'wolf')).toEqual([
      expect.objectContaining({ hp: 24 }),
    ]);

    boss.hp = hardMaxHp / 3 + 1;
    tower.cooldownTicks = 0;
    tick(state);
    expect(packCalls(state)).toEqual([{ kind: 'packCall', enemyId: 0, threshold: 1 }]);
    tower.cooldownTicks = 0;
    tick(state);
    expect(packCalls(state)).toEqual([]);
  });

  it.each(['special', 'burn', 'shot'] as const)('a lethal %s crossing both thresholds calls no pack', (cause) => {
    const state = arena();
    const boss = state.enemies[0];
    const gold = state.gold;
    if (cause === 'special') {
      boss.hp = 60;
      boss.maxHp = 84;
      expect(useSpecial(state, 'keg', { x: 80, y: 240 })).toMatchObject({ ok: true, hits: 1, kills: 1 });
      expect(packCalls(state)).toEqual([]);
      expect(state.events.at(-1)).toEqual({ kind: 'bossDown', enemyId: 0, enemyType: 'grumblemaw', cause });
    } else if (cause === 'burn') {
      boss.hp = 1;
      boss.maxHp = 1;
      boss.burnDps = 60;
      boss.burnTicksLeft = 1;
    } else {
      boss.hp = 12;
      boss.maxHp = 15;
      expect(buildTower(state, { col: 2, row: 5 }, 'musketeer').ok).toBe(true);
    }
    tick(state);
    expect(packCalls(state)).toEqual([]);
    expect(wolfSpawns(state.events)).toEqual([]);
    expect(state.packs).toEqual([]);
    expect(state.enemies).toEqual([]);
    if (cause !== 'special') {
      expect(state.events.filter((e) => e.kind === 'bossDown')).toEqual([
        { kind: 'bossDown', enemyId: 0, enemyType: 'grumblemaw', cause },
      ]);
    }
    expect(state.events.slice(-2)).toEqual([{ kind: 'waveClear', wave: 20, bonus: 25 }, { kind: 'won' }]);
    expect(state.phase).toBe('won');
    expect(state.gold).toBe(gold + 300 + 25 - (cause === 'shot' ? 50 : 0));
  });

  it('a lethal hit crossing the lower threshold leaves only the pack called earlier', () => {
    const state = arena();
    const boss = state.enemies[0];
    boss.hp = 75;
    boss.maxHp = 90;
    expect(buildTower(state, { col: 2, row: 5 }, 'musketeer').ok).toBe(true);
    tick(state);
    expect(boss.hp).toBe(63);
    expect(packCalls(state)).toEqual([]);
    state.towers[0].cooldownTicks = 0;
    tick(state);
    expect(boss.hp).toBe(51);
    expect(packCalls(state)).toEqual([{ kind: 'packCall', enemyId: 0, threshold: 2 }]);
    expect(wolfSpawns(state.events)).toHaveLength(1);
    const beforeKill = state.events.length;
    expect(useSpecial(state, 'keg', { x: 80, y: 240 })).toMatchObject({ ok: true, hits: 2, kills: 2 });
    expect(state.events.slice(beforeKill).filter((e) => e.kind === 'packCall')).toEqual([]);
    expect(state.enemies).toEqual([]);
    expect(state.packs).toEqual([{ nextTick: 31, remaining: 7 }]);
    tick(state);
    expect(state.phase).toBe('wave');
  });

  it('a surviving hit can call both packs, which finish spawning after a later lethal hit', () => {
    function play() {
      const state = arena();
      const boss = state.enemies[0];
      boss.hp = 75;
      boss.maxHp = 90; // Thresholds 60 and 30. The first keg leaves 15.
      const gold = state.gold;
      expect(useSpecial(state, 'keg', { x: 80, y: 240 })).toMatchObject({ hits: 1, kills: 0 });
      expect(boss.hp).toBe(15);
      expect(packCalls(state)).toEqual([
        { kind: 'packCall', enemyId: 0, threshold: 2 },
        { kind: 'packCall', enemyId: 0, threshold: 1 },
      ]);
      // This kills the boss before either queued pack has spawned.
      state.specialCharges = 1;
      expect(useSpecial(state, 'keg', { x: 80, y: 240 })).toMatchObject({ hits: 1, kills: 1 });
      expect(packCalls(state)).toHaveLength(2);
      expect(state.enemies).toEqual([]);
      expect(state.phase).toBe('wave');
      const events = [...state.events];
      const spawnTimes: number[] = [];
      for (let frame = 0; frame < 2000 && state.phase === 'wave'; frame++) {
        tick(state);
        events.push(...state.events);
        for (const spawn of wolfSpawns(state.events)) {
          expect(state.enemies.find((e) => e.id === spawn.enemyId)?.distance).toBe(0);
          spawnTimes.push(frame);
        }
      }
      expect(spawnTimes).toEqual([0, 0, 30, 30, 60, 60, 90, 90, 120, 120, 150, 150, 180, 180, 210, 210]);
      expect(events.filter((e) => e.kind === 'exit')).toHaveLength(16);
      expect(new Set(wolfSpawns(events).map((e) => e.enemyId)).size).toBe(16);
      expect(events.filter((e) => e.kind === 'packCall')).toHaveLength(2);
      expect(events.at(-1)).toEqual({ kind: 'won' });
      expect(state.gold).toBe(gold + 300 + 25);
      expect(state.lives).toBe(4);
      return { state, events };
    }
    expect(play()).toEqual(play());
  });
});
