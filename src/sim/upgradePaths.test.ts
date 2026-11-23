import { describe, expect, it } from 'vitest';
import { buildTower, moveTower, sellTower, setTargeting, undoUpgrade, upgradeTower } from './actions';
import type { BoonId } from './boons';
import { burnEnemies, findTarget, fireTowers } from './combat';
import { createGame, startWave } from './game';
import { towerLevel, towerSellValue, towerUndoValue } from './towers';
import type { Enemy, TowerType, UpgradePath } from './types';

const CELL = { col: 2, row: 5 };
const OTHER = { col: 7, row: 5 };

function build(type: TowerType = 'musketeer') {
  const state = createGame();
  state.gold = 1000;
  const built = buildTower(state, CELL, type);
  if (!built.ok) throw new Error(built.reason);
  expect(towerLevel(built.tower)).toBe(1);
  return { state, tower: built.tower };
}

describe('level 3 purchasing and refunds', () => {
  it('only commits a valid, affordable path once, keeping cooldown and emitting one upgrade event', () => {
    const { state, tower } = build();
    const unchanged = (path: UpgradePath | undefined, reason: string) => {
      const before = structuredClone(state);
      expect(upgradeTower(state, CELL, path)).toEqual({ ok: false, reason });
      expect(state).toEqual(before);
    };
    unchanged('A', 'not-level-2');
    expect(upgradeTower(state, CELL)).toMatchObject({ ok: true, tower: { spent: 85 } });
    expect(towerLevel(tower)).toBe(2);
    unchanged(undefined, 'already-upgraded');
    unchanged('C' as UpgradePath, 'invalid-path');
    state.gold = 84;
    unchanged('A', 'not-enough-gold');
    state.gold = 85;
    tower.cooldownTicks = 39;
    const events = state.events.length;
    expect(upgradeTower(state, CELL, 'A')).toMatchObject({
      ok: true, gold: 0, tower: { path: 'A', spent: 170, cooldownTicks: 39 },
    });
    expect(towerLevel(tower)).toBe(3);
    expect(state.events.slice(events)).toEqual([
      { kind: 'upgrade', cell: CELL, tower: 'musketeer', level: 3, path: 'A' },
    ]);
    unchanged('B', 'max-level');
    unchanged(undefined, 'max-level');
    state.phase = 'lost';
    unchanged('A', 'game-over');
  });

  it('updates each setup refund newest first on an unlocked tower and preserves its other state', () => {
    const { state, tower } = build();
    upgradeTower(state, CELL);
    upgradeTower(state, CELL, 'A');
    setTargeting(state, CELL, 'strongest');
    tower.kills = 7;
    expect(moveTower(state, CELL, OTHER)).toMatchObject({
      ok: true, tower: { path: 'A', targeting: 'strongest', kills: 7, spent: 170 },
    });
    expect(towerSellValue(tower)).toBe(170);
    expect(towerUndoValue(tower)).toBe(85);
    expect(undoUpgrade(state, OTHER)).toMatchObject({ ok: true, refund: 85, gold: 915 });
    expect(tower.path).toBeUndefined();
    expect(upgradeTower(state, OTHER, 'B')).toMatchObject({ ok: true, tower: { path: 'B' } });
    expect(undoUpgrade(state, OTHER)).toMatchObject({ ok: true, refund: 85 });
    expect(towerLevel(tower)).toBe(2);
    expect(tower).toMatchObject({ spent: 85, unlockedSpend: 85 });
    expect(towerUndoValue(tower)).toBe(35);
    expect(undoUpgrade(state, OTHER)).toMatchObject({ ok: true, refund: 35, gold: 950 });
    expect(towerLevel(tower)).toBe(1);
    expect(tower).toMatchObject({ spent: 50, unlockedSpend: 50, targeting: 'strongest', kills: 7 });
    expect(towerUndoValue(tower)).toBe(0);
    expect(sellTower(state, OTHER)).toEqual({ ok: true, refund: 50, gold: 1000 });
  });

  it('sells a locked tower for both setup upgrades plus 70% of build, unchanged by undoing both first', () => {
    const { state, tower } = build();
    tower.locked = true;
    tower.unlockedSpend = 0;
    upgradeTower(state, CELL);
    upgradeTower(state, CELL, 'B');
    expect(towerSellValue(tower)).toBe(155); // 85 + 35 + 35
    const directSale = structuredClone(state);
    expect(sellTower(directSale, CELL)).toEqual({ ok: true, refund: 155, gold: 985 });
    expect(undoUpgrade(state, CELL)).toMatchObject({ ok: true, refund: 85 });
    expect(undoUpgrade(state, CELL)).toMatchObject({ ok: true, refund: 35 });
    expect(sellTower(state, CELL)).toEqual({ ok: true, refund: 35, gold: 985 });
  });

  it('only undoes the path when the first upgrade locked in a previous wave', () => {
    const { state, tower } = build();
    upgradeTower(state, CELL);
    startWave(state);
    state.phase = 'setup';
    upgradeTower(state, CELL, 'A');
    expect(towerSellValue(tower)).toBe(144); // 85 + floor(85 * 0.7)
    expect(undoUpgrade(state, CELL)).toMatchObject({ ok: true, refund: 85 });
    expect(towerLevel(tower)).toBe(2);
    expect(tower).toMatchObject({ spent: 85, locked: true, unlockedSpend: 0 });
    expect(undoUpgrade(state, CELL)).toEqual({ ok: false, reason: 'nothing-to-undo' });
  });

  it.each(['setup', 'wave'] as const)('locks a path bought in %s once it has entered combat', (phase) => {
    const { state, tower } = build();
    upgradeTower(state, CELL);
    if (phase === 'wave') startWave(state);
    upgradeTower(state, CELL, 'A');
    if (phase === 'setup') startWave(state);
    expect(undoUpgrade(state, CELL)).toEqual({ ok: false, reason: 'not-in-setup' });
    state.phase = 'setup';
    expect(undoUpgrade(state, CELL)).toEqual({ ok: false, reason: 'nothing-to-undo' });
    expect(tower).toMatchObject({ path: 'A', spent: 170, locked: true, unlockedSpend: 0 });
    expect(sellTower(state, CELL)).toEqual({ ok: true, refund: 119, gold: 949 });
  });
});

function dummy(id: number, distance: number): Enemy {
  return { id, distance, type: 'troll', hp: 500, slow: 0, slowTicksLeft: 0 };
}

function combat(towerType: TowerType, path: UpgradePath) {
  const { state, tower } = build(towerType);
  expect(upgradeTower(state, CELL).ok).toBe(true);
  expect(upgradeTower(state, CELL, path).ok).toBe(true);
  // A straight path through the tower centre (80,176) for integer range,
  // minimum range and splash boundaries. Placement happened on Meadow.
  state.map = { id: 'upgrade-test', width: 960, height: 480, path: [{ x: 80, y: 176 }, { x: 960, y: 176 }] };
  return { state, tower };
}

describe('level 3 combat on each of the twelve paths', () => {
  it.each([
    // Type, path, range, minimum, damage, cooldown ticks, splash, slow, burn.
    ['musketeer', 'A', 155, 0, 35, 60, 0, 0, 0, 0],
    ['musketeer', 'B', 125, 0, 22, 30, 0, 0, 0, 0],
    ['cannon',    'A', 105, 0, 40, 120, 85, 0, 0, 0],
    ['cannon',    'B', 105, 0, 40, 60, 55, 0, 0, 0],
    ['tarpit',    'A', 105, 0, 3, 30, 0, 0.8, 0, 0],
    ['tarpit',    'B', 155, 0, 3, 30, 0, 0.6, 0, 0],
    ['longbow',   'A', 170, 0, 16, 24, 0, 0, 0, 0],
    ['longbow',   'B', 170, 0, 9, 13, 0, 0, 0, 0],
    ['mortar',    'A', 220, 70, 120, 180, 70, 0, 0, 0],
    ['mortar',    'B', 220, 70, 70, 180, 140, 0, 0, 0],
    ['firepot',   'A', 100, 0, 4, 75, 0, 0, 15, 240],
    ['firepot',   'B', 100, 0, 4, 75, 0, 0, 8, 480],
  ] as const)('%s path %s uses its full stat row', (type, path, range, minimum, damage, cooldown, splash, slow, dps, duration) => {
    const { state, tower } = combat(type, path);
    if (minimum > 0) {
      const edge = dummy(0, minimum);
      state.enemies = [dummy(1, minimum - 1)];
      expect(findTarget(state, tower)).toBeUndefined();
      state.enemies.push(edge);
      expect(findTarget(state, tower)).toBe(edge);
    }

    const target = dummy(1, range);
    const outside = dummy(2, range + splash + 1);
    state.enemies = [target, outside];
    if (splash > 0) {
      const edge = dummy(3, range + splash);
      state.enemies.push(edge, { ...dummy(4, range + splash), type: 'harpy' });
    }
    fireTowers(state);
    expect(target.hp).toBe(500 - damage);
    expect(outside.hp).toBe(500);
    expect(tower.cooldownTicks).toBe(cooldown);
    expect(state.shots[0]).toMatchObject({ targetId: target.id });
    expect(state.shots[0].splashRadius ?? 0).toBe(splash);
    if (splash > 0) {
      expect(state.enemies[2].hp).toBe(500 - damage);
      expect(state.enemies[3].hp).toBe(500);
    }
    expect(target.slow).toBe(slow);
    expect(target.slowTicksLeft).toBe(slow ? 120 : 0);
    expect(target.burnDps ?? 0).toBe(dps);
    expect(target.burnTicksLeft ?? 0).toBe(duration);
    if (dps) {
      burnEnemies(state);
      expect(target.hp).toBeCloseTo(496 - dps / 60, 10);
      expect(target.burnTicksLeft).toBe(duration - 1);
    }

    for (let i = 1; i < cooldown; i++) fireTowers(state);
    expect(state.shots).toHaveLength(1);
    fireTowers(state);
    expect(state.shots).toHaveLength(2);
    if (dps) {
      // The second shot refreshes the burn. Assume the target has left range:
      // no more shots, but damage continues for the path's full duration.
      const hpAfterShot = target.hp;
      for (let i = 0; i < duration; i++) burnEnemies(state);
      expect(target.burnTicksLeft).toBe(0);
      expect(target.hp).toBeCloseTo(hpAfterShot - dps * duration / 60, 9);
      const hpAfterBurn = target.hp;
      burnEnemies(state);
      expect(target.hp).toBe(hpAfterBurn);
    }
  });

  it.each([
    // The chosen path row gets its own range, radius, shot ticks and damage
    // after applying the existing boon multipliers.
    ['musketeer', 'B', ['veteranCrews'], 125, 0, 22, 27, 0, 0],
    ['cannon', 'A', ['longBarrels', 'biggerBlasts'], 136.5, 119, 40, 120, 0, 0],
    ['tarpit', 'A', ['stickyTar'], 105, 0, 3, 30, 240, 0],
    ['longbow', 'A', ['keenArrows', 'veteranCrews'], 170, 0, 20, 22, 0, 0],
    ['mortar', 'B', ['longBarrels', 'biggerBlasts'], 286, 196, 70, 180, 0, 0],
    ['firepot', 'A', ['hotCoals'], 100, 0, 4, 75, 0, 27],
  ] as const)('%s %s applies rewards after selecting the path row', (type, path, boons, range, radius, damage, cooldown, slowTicks, dps) => {
    const { state, tower } = combat(type, path);
    state.boons = [...boons] satisfies BoonId[];
    const target = dummy(0, range);
    state.enemies = [target, dummy(1, range + 1 + radius)];
    fireTowers(state);
    expect(state.shots[0].splashRadius ?? 0).toBe(radius);
    expect(target.hp).toBe(500 - damage);
    expect(state.enemies[1].hp).toBe(500);
    expect(tower.cooldownTicks).toBe(cooldown);
    expect(target.slowTicksLeft).toBe(slowTicks);
    expect(target.burnDps ?? 0).toBe(dps);
  });
});
