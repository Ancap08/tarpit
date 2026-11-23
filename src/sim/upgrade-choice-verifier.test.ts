// Milestone 37 verifier: independent hand-computed checks of the level 3 rules.
import { describe, expect, it } from 'vitest';
import { buildTower, moveTower, sellTower, setTargeting, undoUpgrade, upgradeTower } from './actions';
import { burnEnemies, fireTowers } from './combat';
import { createGame, startWave } from './game';
import { towerLevel } from './towers';
import type { BoonId } from './boons';
import type { Enemy, GameState, TowerType, UpgradePath } from './types';

const C = { col: 2, row: 5 };
const D = { col: 9, row: 5 };

function fresh(type: TowerType, gold = 2000) {
  const s = createGame();
  s.gold = gold;
  expect(buildTower(s, C, type).ok).toBe(true);
  return s;
}
function walk(s: GameState) {
  // Straight path through the tower centre (80,176) so distance == enemy x - 80.
  s.map = { id: 'v', width: 960, height: 480, path: [{ x: 80, y: 176 }, { x: 960, y: 176 }] };
}
const troll = (id: number, distance: number): Enemy => ({ id, distance, type: 'troll', hp: 1000, slow: 0, slowTicksLeft: 0 });

describe('state and refusals', () => {
  it('walks level 1 to 2 to 3 and refuses everything else without any change', () => {
    const s = fresh('cannon');
    const same = (p: UpgradePath | undefined, reason: string) => {
      const before = JSON.stringify(s);
      expect(upgradeTower(s, C, p)).toEqual({ ok: false, reason });
      expect(JSON.stringify(s)).toBe(before);
    };
    same('A', 'not-level-2');
    upgradeTower(s, C);
    expect(towerLevel(s.towers[0])).toBe(2);
    same(undefined, 'already-upgraded');
    same('a' as UpgradePath, 'invalid-path');
    same(undefined as unknown as UpgradePath, 'already-upgraded');
    s.gold = 139;
    same('B', 'not-enough-gold');
    s.gold = 140;
    expect(upgradeTower(s, C, 'B')).toMatchObject({ ok: true, gold: 0 });
    expect(towerLevel(s.towers[0])).toBe(3);
    expect(s.towers[0].path).toBe('B');
    same('A', 'max-level');
    same(undefined, 'max-level');
    expect(upgradeTower(s, { col: 0, row: 0 }, 'A')).toEqual({ ok: false, reason: 'no-tower' });
  });
});

describe('undo order and sell values', () => {
  it('undoes level 3 before level 2 in setup, gold exact', () => {
    const s = fresh('mortar', 1000); // 110 spent
    upgradeTower(s, C);
    upgradeTower(s, C, 'A'); // 80 + 190
    expect(s.gold).toBe(1000 - 110 - 80 - 190);
    expect(undoUpgrade(s, C)).toMatchObject({ ok: true, refund: 190 });
    expect(s.towers[0].path).toBeUndefined();
    expect(towerLevel(s.towers[0])).toBe(2);
    expect(undoUpgrade(s, C)).toMatchObject({ ok: true, refund: 80 });
    expect(s.gold).toBe(890);
    expect(towerLevel(s.towers[0])).toBe(1);
    expect(undoUpgrade(s, C)).toEqual({ ok: false, reason: 'nothing-to-undo' });
  });
  it('sell value once locked: 70% of all spent, rounded down, at each level', () => {
    const cases: [number, number][] = [[1, 35], [2, 59], [3, 119]];
    for (const [lvl, refund] of cases) {
      const s = fresh('musketeer');
      if (lvl >= 2) upgradeTower(s, C);
      if (lvl === 3) upgradeTower(s, C, 'B');
      startWave(s);
      s.phase = 'setup';
      const gold = s.gold;
      expect(sellTower(s, C)).toMatchObject({ ok: true, refund });
      expect(s.gold).toBe(gold + refund);
    }
  });
  it('conserves gold across setup operations (unlocked)', () => {
    const s = fresh('firepot', 1000);
    const total = () => s.gold + s.towers.reduce((a, t) => a + t.spent, 0);
    expect(total()).toBe(1000);
    upgradeTower(s, C); upgradeTower(s, C, 'A');
    expect(total()).toBe(1000);
    moveTower(s, C, D);
    expect(total()).toBe(1000);
    undoUpgrade(s, D);
    expect(total()).toBe(1000);
    sellTower(s, D);
    expect(s.gold).toBe(1000);
  });
});

describe('state kept', () => {
  it('kills, targeting and path survive the upgrade and a setup move; events are right', () => {
    const s = fresh('longbow');
    s.towers[0].kills = 9;
    setTargeting(s, C, 'strongest');
    upgradeTower(s, C);
    const from = s.events.length;
    upgradeTower(s, C, 'B');
    expect(s.events.slice(from)).toEqual([{ kind: 'upgrade', cell: C, tower: 'longbow', level: 3, path: 'B' }]);
    expect(moveTower(s, C, D).ok).toBe(true);
    expect(s.towers[0]).toMatchObject({ kills: 9, targeting: 'strongest', path: 'B', cell: D });
  });
});

// type, path, range, minRange, damage, cooldown ticks (round(60/rate)), splash, slow, burn dps, burn ticks
const ROWS = [
  ['musketeer', 'A', 200, 0, 45, 60, 0, 0, 0, 0], ['musketeer', 'B', 125, 0, 22, 21, 0, 0, 0, 0],
  ['cannon', 'A', 105, 0, 40, 120, 105, 0, 0, 0], ['cannon', 'B', 105, 0, 40, 60, 55, 0, 0, 0],
  ['tarpit', 'A', 105, 0, 3, 30, 0, 0.78, 0, 0], ['tarpit', 'B', 145, 0, 3, 30, 0, 0.64, 0, 0],
  ['longbow', 'A', 170, 0, 16, 24, 0, 0, 0, 0], ['longbow', 'B', 170, 0, 9, 13, 0, 0, 0, 0],
  ['mortar', 'A', 220, 70, 140, 180, 70, 0, 0, 0], ['mortar', 'B', 220, 70, 80, 180, 150, 0, 0, 0],
  ['firepot', 'A', 125, 0, 4, 60, 0, 0, 17, 60], ['firepot', 'B', 100, 0, 4, 60, 0, 0, 8, 480],
] as const;

describe('twelve rows in combat', () => {
  it.each(ROWS)('%s %s', (type, path, range, min, dmg, cd, splash, slow, dps, bticks) => {
    const s = fresh(type);
    upgradeTower(s, C); upgradeTower(s, C, path); walk(s);
    const t = s.towers[0];
    s.enemies = [troll(1, range + 1)];
    fireTowers(s);
    expect(s.shots).toHaveLength(0); // one pixel out of range
    if (min) {
      s.enemies = [troll(1, min - 1)];
      fireTowers(s);
      expect(s.shots).toHaveLength(0);
    }
    const target = troll(2, min || range);
    s.enemies = [target];
    fireTowers(s);
    expect(s.shots).toHaveLength(1);
    expect(target.hp).toBe(1000 - dmg);
    expect(t.cooldownTicks).toBe(cd);
    expect(target.slow).toBe(slow);
    expect(target.burnDps ?? 0).toBe(dps);
    expect(target.burnTicksLeft ?? 0).toBe(bticks);
    // cooldown: no second shot until cd ticks have passed, then exactly one
    s.shots = []; s.enemies = [troll(5, range)];
    for (let i = 0; i < cd - 1; i++) fireTowers(s);
    expect(s.shots).toHaveLength(0);
    fireTowers(s);
    expect(s.shots).toHaveLength(1);
    if (splash) {
      s.shots = []; t.cooldownTicks = 0;
      const near = troll(3, range + splash), far = troll(4, range + splash + 1);
      s.enemies = [troll(2, range), near, far];
      fireTowers(s);
      expect(s.enemies[1].hp).toBe(1000 - dmg);
      expect(s.enemies[2].hp).toBe(1000);
    }
    if (dps) {
      s.enemies = [target]; const hp = target.hp;
      for (let i = 0; i < bticks; i++) burnEnemies(s);
      expect(target.hp).toBeCloseTo(hp - (dps * bticks) / 60, 6);
    }
  });
});

describe('rewards on top of level 3', () => {
  function shot(type: TowerType, path: UpgradePath, boons: BoonId[], at: number) {
    const s = fresh(type);
    upgradeTower(s, C); upgradeTower(s, C, path); walk(s);
    s.boons = boons;
    const e = troll(1, at);
    s.enemies = [e];
    fireTowers(s);
    return { s, e, t: s.towers[0] };
  }
  it('Keen Arrows on War Bow: 16 x 1.11 = 17.76', () => expect(shot('longbow', 'A', ['keenArrows'], 170).e.hp).toBeCloseTo(982.24));
  it('Veteran Crews on Quick Draw: 4.5 x 1.11 rate gives round(60/4.995) = 12 ticks', () => expect(shot('longbow', 'B', ['veteranCrews'], 170).t.cooldownTicks).toBe(12));
  it('Veteran Crews on Siege Shell: round(60 / (1/3 x 1.11)) = 162', () => expect(shot('mortar', 'A', ['veteranCrews'], 220).t.cooldownTicks).toBe(162));
  it('Long Barrels on Sharpshooter does nothing (artillery only), on Mortar 220 x 1.3 = 286', () => {
    expect(shot('musketeer', 'A', ['longBarrels'], 201).s.shots).toHaveLength(0);
    expect(shot('mortar', 'B', ['longBarrels'], 286).s.shots).toHaveLength(1);
    expect(shot('mortar', 'B', ['longBarrels'], 287).s.shots).toHaveLength(0);
  });
  it('Bigger Blasts: Heavy Shot 105 x 1.3 = 136.5, Wide Burst 150 x 1.3 = 195', () => {
    expect(shot('cannon', 'A', ['biggerBlasts'], 105).s.shots[0].splashRadius).toBe(136.5);
    expect(shot('mortar', 'B', ['biggerBlasts'], 220).s.shots[0].splashRadius).toBe(195);
  });
  it('Hot Coals on Inferno 17 x 2.11 = 35.87; Sticky Tar on Deep Tar 2 s x 2 = 240 ticks', () => {
    expect(shot('firepot', 'A', ['hotCoals'], 125).e.burnDps).toBeCloseTo(35.87);
    expect(shot('tarpit', 'A', ['stickyTar'], 105).e.slowTicksLeft).toBe(240);
  });
});

describe('determinism', () => {
  it('two identical games with level 3 towers end identically', () => {
    const run = () => {
      const s = fresh('musketeer');
      upgradeTower(s, C); upgradeTower(s, C, 'B');
      startWave(s);
      return s;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
