// Milestone 25c: tower kill counts (docs/SCOPE-v4.md 25c). A tower's kills
// go up when its shot (splash included) or its burn kills; special kills
// count for no tower. Reset on sell (a rebuild starts at 0); kept on move
// and upgrade. Static arena as in newTowers.test.ts: burnEnemies then
// fireTowers, no movement.
import { describe, expect, it } from 'vitest';
import { buildTower, moveTower, sellTower, upgradeTower, useSpecial } from './actions';
import { burnEnemies, fireTowers } from './combat';
import { createGame, startWave, tick } from './game';
import { type Cell } from './grid';
import { comboBuild, playScripted } from './headless';
import type { Enemy, EnemyType, GameState, TowerType } from './types';

// P (208,240) sits right of the first path segment (y = 240): an enemy at
// distance d is (d,240), 208 - d from P. FAR (28,13) reaches nothing there.
const P: Cell = { col: 6, row: 7 };
const FAR: Cell = { col: 28, row: 13 };

function enemy(id: number, distance: number, over: Partial<Enemy> = {}, type: EnemyType = 'goblin'): Enemy {
  return { id, type, hp: 30, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0, ...over };
}

function arena(enemies: Enemy[], towers: [Cell, TowerType][] = []): GameState {
  const s = createGame();
  s.gold = 10_000;
  s.phase = 'wave';
  s.wave = 1;
  s.specialCharges = 1;
  s.spawnedPerGroup = [8];
  s.enemies = enemies;
  s.nextEnemyId = 100;
  for (const [cell, type] of towers) expect(buildTower(s, cell, type).ok).toBe(true);
  return s;
}

function step(s: GameState): void {
  burnEnemies(s);
  fireTowers(s);
}

const kills = (s: GameState) => s.towers.map((t) => [t.type, t.kills]);

describe('kill counts', () => {
  it('a tower is built with 0 kills', () => {
    const s = createGame();
    expect(buildTower(s, P, 'musketeer')).toMatchObject({ ok: true, tower: { kills: 0 } });
  });

  it('a shot kill counts for the tower that fired', () => {
    const s = arena([enemy(0, 150, { hp: 12 })], [[P, 'musketeer']]);
    step(s);
    expect(s.enemies).toEqual([]);
    expect(kills(s)).toEqual([['musketeer', 1]]);
  });

  it('a shot that does not kill counts nothing', () => {
    const s = arena([enemy(0, 150)], [[P, 'musketeer']]);
    step(s);
    expect(kills(s)).toEqual([['musketeer', 0]]);
  });

  it('a splash kill counts each enemy it kills', () => {
    // Cannon 25 splash 40: three Goblins at 10 hp within 40 px of the first.
    const s = arena([enemy(0, 150, { hp: 10 }), enemy(1, 140, { hp: 10 }), enemy(2, 120, { hp: 10 })], [[P, 'cannon']]);
    step(s);
    expect(s.enemies).toEqual([]);
    expect(kills(s)).toEqual([['cannon', 3]]);
  });

  it('a Fire Pot burn remembers its tower; the burn kill counts for that tower, even out of range', () => {
    const s = arena([enemy(0, 150, { hp: 8 })], [[P, 'firepot']]);
    step(s); // impact 4, burn 5/s set
    expect(s.enemies[0].burnOwner).toEqual(P);
    s.enemies[0].distance = 0; // (0,240): 208 px from P, outside the pot's 100 px range
    s.towers[0].cooldownTicks = 10_000; // and the pot never fires again
    for (let i = 0; i < 60 && s.enemies.length; i++) step(s);
    expect(s.enemies).toEqual([]);
    expect(kills(s)).toEqual([['firepot', 1]]);
  });

  it('a burn kill counts for the owner cell\'s tower, not for the tower that happens to fire that tick', () => {
    const s = arena([enemy(0, 150, { hp: 0.05, burnDps: 5, burnTicksLeft: 60, burnOwner: FAR })], [[P, 'musketeer'], [FAR, 'longbow']]);
    step(s);
    expect(s.enemies).toEqual([]);
    expect(kills(s)).toEqual([
      ['musketeer', 0],
      ['longbow', 1],
    ]);
  });

  it('special kills count for no tower; Fire Arrows over a tower burn take the ownership away', () => {
    const s = arena([enemy(0, 80, { hp: 5 }), enemy(1, 80, { hp: 0.05, burnDps: 5, burnTicksLeft: 60, burnOwner: P })], [[P, 'firepot']]);
    s.towers[0].cooldownTicks = 10_000;
    s.wave = 7;
    s.spawnedPerGroup = [10, 10, 4];
    expect(useSpecial(s, 'fireArrows', { x: 80, y: 240 })).toMatchObject({ ok: true, hits: 2, kills: 0 });
    expect(s.enemies.map((e) => e.burnOwner)).toEqual([undefined, undefined]);
    for (let i = 0; i < 60 && s.enemies.length; i++) step(s);
    expect(s.enemies).toEqual([]);
    expect(kills(s)).toEqual([['firepot', 0]]);
    const k = arena([enemy(0, 80, { hp: 5 })], [[P, 'musketeer']]);
    k.towers[0].cooldownTicks = 10_000;
    expect(useSpecial(k, 'keg', { x: 80, y: 240 })).toMatchObject({ ok: true, kills: 1 });
    expect(kills(k)).toEqual([['musketeer', 0]]);
  });

  it('a weaker burn that is ignored does not take the ownership', () => {
    const s = arena([enemy(0, 150, { hp: 500, burnDps: 8, burnTicksLeft: 200, burnOwner: FAR })], [[P, 'firepot']]);
    step(s); // base pot: 5/s is weaker than the active 8/s
    expect(s.enemies[0].burnOwner).toEqual(FAR);
  });

  it('kept on upgrade; reset on sell and rebuild; the sold tower\'s burns count for nobody', () => {
    const s = arena([enemy(0, 150, { hp: 12 }), enemy(1, 150, { hp: 0.05, burnDps: 5, burnTicksLeft: 60, burnOwner: P })], [[P, 'musketeer']]);
    s.enemies[1].hp = 1000; // keep enemy 1 alive for now
    step(s);
    expect(kills(s)).toEqual([['musketeer', 1]]);
    expect(upgradeTower(s, P).ok).toBe(true);
    expect(kills(s)).toEqual([['musketeer', 1]]);
    expect(sellTower(s, P).ok).toBe(true);
    expect(s.enemies[0].burnOwner).toBeUndefined();
    expect(buildTower(s, P, 'musketeer')).toMatchObject({ ok: true, tower: { kills: 0 } });
    s.towers[0].cooldownTicks = 10_000;
    s.enemies[0].hp = 0.05;
    step(s);
    expect(s.enemies).toEqual([]);
    expect(kills(s)).toEqual([['musketeer', 0]]);
  });

  it('kept on move (setup only, so set by hand)', () => {
    const s = createGame();
    buildTower(s, P, 'musketeer');
    s.towers[0].kills = 5;
    expect(moveTower(s, P, { col: 7, row: 7 }).ok).toBe(true);
    expect(s.towers[0]).toMatchObject({ cell: { col: 7, row: 7 }, kills: 5 });
  });

  it('over a whole comboBuild game (no sells), the towers\' kills add up to every shot and burn kill', () => {
    const run = playScripted(comboBuild());
    // Replay tick by tick to count kill events by cause.
    const s = createGame();
    let shotOrBurn = 0;
    let special = 0;
    const script = comboBuild();
    const running = () => s.phase === 'wave';
    for (let i = 0; i < 10 && s.phase === 'setup'; i++) {
      for (const a of script[i] ?? []) {
        if (a.type === 'build') buildTower(s, a.cell, a.tower);
        else if (a.type === 'upgrade') upgradeTower(s, a.cell);
      }
      startWave(s);
      while (running()) {
        tick(s);
        for (const e of s.events) {
          if (e.kind === 'kill' && e.cause !== 'special') shotOrBurn += 1;
          if (e.kind === 'kill' && e.cause === 'special') special += 1;
        }
      }
    }
    expect(s).toEqual(run.state);
    expect(special).toBe(0);
    expect(shotOrBurn).toBeGreaterThan(100);
    expect(s.towers.reduce((n, t) => n + t.kills, 0)).toBe(shotOrBurn);
    expect(s.towers.every((t) => t.kills > 0)).toBe(true);
  });
});
