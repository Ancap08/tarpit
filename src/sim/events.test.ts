// Milestone 16: state.events, one test per event kind with exact fields.
// Arena tests call burnEnemies / fireTowers directly (no movement) or tick()
// on a mid-wave state; the full-game tests play wave 1 from createGame().
// Balance pins (balance.test.ts, headless tests) prove events change no
// outcome.
import { describe, expect, it } from 'vitest';
import { buildTower, sellTower, upgradeTower } from './actions';
import { burnEnemies, fireTowers } from './combat';
import type { GameEvent } from './events';
import { createGame, startWave, tick } from './game';
import type { Cell } from './grid';
import { MAP, pathLength } from './map';
import type { Enemy, EnemyType, GameState, TowerType } from './types';
import { WAVES } from './waves';

// P (208,240) is right of the first path segment (y = 240 from x 0 to 160):
// an enemy at distance d <= 160 is at (d,240).
const P: Cell = { col: 6, row: 7 };

function enemy(id: number, distance: number, over: Partial<Enemy> = {}, type: EnemyType = 'goblin'): Enemy {
  const fullHp = ({ goblin: 30, wolf: 28, troll: 700, harpy: 40, shieldbearer: 120, boss: 4000 } as const)[type];
  return { id, type, hp: fullHp, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0, ...over };
}

/** Mid-wave-1 state with every wave enemy spawned (ticks spawn nothing) and an empty event list. */
function arena(enemies: Enemy[], towers: [Cell, TowerType][] = []): GameState {
  const s = createGame();
  s.gold = 10_000;
  s.phase = 'wave';
  s.wave = 1;
  s.spawnedPerGroup = [20]; // wave 1 fully spawned (20 Goblins since milestone 25c)
  s.enemies = enemies;
  s.nextEnemyId = 100;
  for (const [cell, type] of towers) expect(buildTower(s, cell, type).ok).toBe(true);
  s.gold = 0;
  s.events = [];
  return s;
}

const kinds = (s: GameState) => s.events.map((e) => e.kind);
const ofKind = <K extends GameEvent['kind']>(s: GameState, kind: K) =>
  s.events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

describe('state.events', () => {
  it('starts empty', () => {
    expect(createGame().events).toEqual([]);
  });

  it('waveStart is appended by startWave and survives until the next tick', () => {
    const s = createGame();
    startWave(s);
    expect(s.events).toEqual([{ kind: 'waveStart', wave: 1 }]);
    tick(s);
    expect(s.events).toEqual([{ kind: 'spawn', enemyId: 0, enemyType: 'goblin' }]);
  });

  it('spawn: one per enemy entering, with its id and type', () => {
    const s = createGame();
    s.wave = 2; // the next Start Wave plays wave 3: goblins, then wolves from 4 s
    startWave(s);
    const spawns: GameEvent[] = [];
    for (let i = 0; i < 300; i++) {
      tick(s);
      spawns.push(...ofKind(s, 'spawn'));
    }
    expect(spawns.slice(0, 2)).toEqual([
      { kind: 'spawn', enemyId: 0, enemyType: 'goblin' },
      { kind: 'spawn', enemyId: 1, enemyType: 'goblin' },
    ]);
    // Milestone 25c: Goblins every 60 ticks (0 .. 240 are ids 0 to 4), then
    // the first Wolf at waveTick 270.
    expect(spawns.find((e) => e.kind === 'spawn' && e.enemyType === 'wolf')).toEqual({ kind: 'spawn', enemyId: 5, enemyType: 'wolf' });
  });

  it('hit: one per shot on a single target, with the tower cell, type and damage', () => {
    const s = arena([enemy(0, 150)], [[P, 'musketeer']]);
    fireTowers(s);
    expect(s.events).toEqual([{ kind: 'hit', enemyId: 0, cell: { col: 6, row: 7 }, tower: 'musketeer', damage: 12 }]);
  });

  it('hit: a splash shot emits one per enemy it damages, in enemy order', () => {
    // Cannon targets d 200, at (160,200) after the first corner (furthest in
    // range); its 40 px splash reaches d 160 at (160,240) exactly (inclusive)
    // but not d 150 at (150,240), 41.2 px away.
    const s = arena([enemy(0, 150), enemy(1, 160), enemy(2, 200)], [[P, 'cannon']]);
    fireTowers(s);
    expect(s.events).toEqual([
      { kind: 'hit', enemyId: 1, cell: { col: 6, row: 7 }, tower: 'cannon', damage: 25 },
      { kind: 'hit', enemyId: 2, cell: { col: 6, row: 7 }, tower: 'cannon', damage: 25 },
    ]);
  });

  it('slowed: a Tar Pit hit applies its slow; a weaker slow on a stronger one emits nothing', () => {
    const s = arena([enemy(0, 150)], [[P, 'tarpit']]);
    fireTowers(s);
    expect(s.events).toEqual([
      { kind: 'hit', enemyId: 0, cell: { col: 6, row: 7 }, tower: 'tarpit', damage: 3 },
      { kind: 'slowed', enemyId: 0, slow: 0.4, ticks: 120 },
    ]);
    const t = arena([enemy(0, 150, { slow: 0.6, slowTicksLeft: 50 })], [[P, 'tarpit']]);
    fireTowers(t);
    expect(kinds(t)).toEqual(['hit']);
  });

  it('burn: one per burning enemy per step, damage doubled while tarred', () => {
    const s = arena([enemy(0, 10, { burnDps: 5, burnTicksLeft: 9 }), enemy(1, 20), enemy(2, 30, { burnDps: 6, burnTicksLeft: 9, slow: 0.4, slowTicksLeft: 9 })]);
    burnEnemies(s);
    expect(s.events).toEqual([
      { kind: 'burn', enemyId: 0, damage: 5 / 60 },
      { kind: 'burn', enemyId: 2, damage: (6 / 60) * 2 },
    ]);
  });

  it('kill by a shot: after the hit, with type, bounty and cause', () => {
    const s = arena([enemy(0, 150, { hp: 12 }, 'wolf')], [[P, 'musketeer']]);
    const gold = s.gold;
    fireTowers(s);
    expect(s.events).toEqual([
      { kind: 'hit', enemyId: 0, cell: { col: 6, row: 7 }, tower: 'musketeer', damage: 12 },
      { kind: 'kill', enemyId: 0, enemyType: 'wolf', bounty: 2, cause: 'shot' },
    ]);
    expect(s.gold).toBe(gold + 2); // 5 before milestone 25c
  });

  it('kill by burn: after the burn tick, cause burn', () => {
    const s = arena([enemy(7, 10, { hp: 0.05, burnDps: 5, burnTicksLeft: 9 }, 'troll')]);
    burnEnemies(s);
    expect(s.events).toEqual([
      { kind: 'burn', enemyId: 7, damage: 5 / 60 },
      { kind: 'kill', enemyId: 7, enemyType: 'troll', bounty: 8, cause: 'burn' },
    ]);
  });

  it('exit: an enemy reaching the exit costs a life and emits exit', () => {
    const end = pathLength(MAP);
    const s = arena([enemy(3, end - 0.5), enemy(4, 0)]);
    tick(s);
    expect(ofKind(s, 'exit')).toEqual([{ kind: 'exit', enemyId: 3 }]);
    expect(s.lives).toBe(19);
  });

  it('lost: the exit that takes the last life, then lost; the lost tick ends there', () => {
    const s = arena([enemy(3, pathLength(MAP) - 0.5)]);
    s.lives = 1;
    tick(s);
    expect(s.events).toEqual([{ kind: 'exit', enemyId: 3 }, { kind: 'lost' }]);
    expect(s.phase).toBe('lost');
    tick(s); // a lost game does nothing, so the list keeps the last tick's events
    expect(s.events).toEqual([{ kind: 'exit', enemyId: 3 }, { kind: 'lost' }]);
  });

  it('build, upgrade and sell: appended by the actions with cell, type and refund', () => {
    const s = createGame();
    s.gold = 1000;
    buildTower(s, P, 'cannon');
    upgradeTower(s, P);
    startWave(s); // locks it (milestone 25a): the sell pays 70%
    sellTower(s, P);
    expect(buildTower(s, { col: 0, row: 7 }, 'cannon').ok).toBe(false); // on the path: no event
    expect(s.events).toEqual([
      { kind: 'build', cell: { col: 6, row: 7 }, tower: 'cannon' },
      { kind: 'upgrade', cell: { col: 6, row: 7 }, tower: 'cannon' },
      { kind: 'waveStart', wave: 1 },
      { kind: 'sell', cell: { col: 6, row: 7 }, tower: 'cannon', refund: 98, full: false },
    ]);
  });

  it('waveClear: the bonus once the last enemy of a wave is gone', () => {
    const s = arena([]);
    tick(s);
    expect(s.events).toEqual([{ kind: 'waveClear', wave: 1, bonus: 25 }]);
    expect(s.phase).toBe('setup');
  });

  it('won: after the last wave clear', () => {
    const s = arena([]);
    s.wave = WAVES.length;
    s.spawnedPerGroup = WAVES[WAVES.length - 1].groups.map((g) => g.count);
    tick(s);
    expect(s.events).toEqual([{ kind: 'waveClear', wave: 10, bonus: 25 }, { kind: 'won' }]);
    expect(s.phase).toBe('won');
  });

  it('is cleared at the start of each tick, setup ticks included', () => {
    const s = createGame();
    s.gold = 1000;
    buildTower(s, P, 'musketeer');
    const before = s.events;
    tick(s);
    expect(s.events).toEqual([]);
    expect(s.events).not.toBe(before); // a fresh array each tick
  });

  it('wave 1 with a Musketeer at (7,5): every damaging shot has a hit, every removal a kill or exit', () => {
    const s = createGame();
    buildTower(s, { col: 7, row: 5 }, 'musketeer');
    startWave(s);
    const all: GameEvent[] = [];
    let shots = 0;
    while (s.phase === 'wave') {
      tick(s);
      shots += s.shots.length;
      all.push(...s.events);
    }
    const count = (k: GameEvent['kind']) => all.filter((e) => e.kind === k).length;
    expect(count('spawn')).toBe(20);
    expect(count('hit')).toBe(shots);
    expect(count('kill') + count('exit')).toBe(20);
    expect(20 - s.lives).toBe(count('exit'));
    expect(all.at(-1)).toEqual({ kind: 'waveClear', wave: 1, bonus: 25 });
  });
});
