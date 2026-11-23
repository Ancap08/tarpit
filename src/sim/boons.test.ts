import { describe, expect, it } from 'vitest';
import { buildTower, pickBoon, upgradeTower, useSpecial } from './actions';
import { burnEnemies, fireTowers, findTarget } from './combat';
import { callNextWave, continueEndless, createGame, startWave, tick } from './game';
import { shotCooldown, TOWER_DEFS, towerStats } from './towers';
import type { Enemy, GameState, MapDef, TowerType } from './types';
import { waveDef } from './waves';

const LINE: MapDef = { id: 'line', width: 960, height: 480, path: [{ x: 0, y: 240 }, { x: 960, y: 240 }] };
const CELL = { col: 5, row: 5 };
const SECOND = { col: 6, row: 5 };

function field(): GameState {
  const state = createGame({ map: LINE });
  state.gold = 1000;
  return state;
}

function finish(state: GameState, wave: number, enemies: Enemy[] = []) {
  state.phase = 'wave';
  state.wave = wave;
  state.spawnedPerGroup = waveDef(wave).groups.map((group) => group.count);
  state.enemies = enemies;
}

function troll(id: number, distance: number): Enemy {
  return { id, distance, type: 'troll', hp: 1000, slow: 0, slowTicksLeft: 0 };
}

describe('boon offers and progression', () => {
  it.each([
    [5, ['longBarrels', 'keenArrows', 'warChest']],
    [10, ['stickyTar', 'hotCoals', 'quickHands']],
    [15, ['stoneWalls', 'veteranCrews', 'biggerBlasts']],
  ] as const)('clearing wave %i offers exactly one choice from %j before Start Wave', (wave, options) => {
    const state = field();
    finish(state, wave, [troll(0, 300)]);
    tick(state);
    expect(state.pendingBoon).toBeNull();
    state.enemies = [];
    tick(state);
    expect(state.pendingBoon).toEqual({ wave, options });
    const clearEvents = [
      { kind: 'waveClear', wave, bonus: 25 },
      { kind: 'boonOffered', wave, options },
    ];
    expect(state.events).toEqual(clearEvents);
    const before = structuredClone(state);
    expect(startWave(state)).toEqual({ ok: false, reason: 'boon-pending' });
    expect(pickBoon(state, 'invalid' as typeof options[number])).toEqual({ ok: false, reason: 'boon-not-offered' });
    expect(pickBoon(state, wave === 5 ? 'stickyTar' : 'warChest')).toEqual({ ok: false, reason: 'boon-not-offered' });
    expect(state).toEqual(before);
    expect(pickBoon(state, options[0]).ok).toBe(true);
    expect(state.boons).toEqual([options[0]]);
    expect(state.pendingBoon).toBeNull();
    const pickEvents = [...clearEvents, { kind: 'boonPicked', wave, id: options[0] }];
    expect(state.events).toEqual(pickEvents);
    const after = structuredClone(state);
    expect(pickBoon(state, options[1])).toEqual({ ok: false, reason: 'no-boon-pending' });
    expect(state).toEqual(after);
    expect(startWave(state)).toEqual({ ok: true, wave: wave + 1 });
    expect(state.events).toEqual([...pickEvents, { kind: 'waveStart', wave: wave + 1 }]);
  });

  it.each([4, 5, 9, 10, 14, 15])('refuses an early call at reward boundary wave %i', (wave) => {
    const state = field();
    finish(state, wave);
    const before = structuredClone(state);
    expect(callNextWave(state)).toEqual({ ok: false, reason: 'boon-wave' });
    expect(state).toEqual(before);
  });

  it('pays the immediate rewards once and retains all three picks through endless', () => {
    const state = field();
    for (const [wave, id] of [[5, 'warChest'], [10, 'stickyTar'], [15, 'stoneWalls']] as const) {
      finish(state, wave);
      tick(state);
      const { gold, lives } = state;
      expect(pickBoon(state, id).ok).toBe(true);
      expect(state.gold).toBe(gold + (wave === 5 ? 80 : 0));
      expect(state.lives).toBe(lives + (wave === 15 ? 4 : 0));
      expect(pickBoon(state, id)).toEqual({ ok: false, reason: 'no-boon-pending' });
    }
    finish(state, 20);
    tick(state);
    expect(state.phase).toBe('won');
    expect(state.pendingBoon).toBeNull();
    expect(continueEndless(state)).toEqual({ ok: true, wave: 20 });
    expect(startWave(state)).toEqual({ ok: true, wave: 21 });
    for (const wave of [21, 25, 30]) {
      finish(state, wave);
      tick(state);
      expect(state.phase).toBe('setup');
      expect(state.pendingBoon).toBeNull();
      expect(state.boons).toEqual(['warChest', 'stickyTar', 'stoneWalls']);
    }
  });

  it('a fatal exit on a reward wave grants no pick or clear bonus', () => {
    const state = field();
    state.lives = 1;
    const gold = state.gold;
    finish(state, 5, [troll(0, 959.9)]);
    tick(state);
    expect(state.phase).toBe('lost');
    expect(state.gold).toBe(gold);
    expect(state.pendingBoon).toBeNull();
  });
});

describe('boon effects on existing and later towers', () => {
  it.each(['cannon', 'mortar'] as const)('Long Barrels extends %s targeting range without changing minimum range', (type) => {
    const state = field();
    expect(buildTower(state, CELL, type).ok).toBe(true);
    const target = troll(0, 176 + (type === 'cannon' ? 90 : 220));
    state.enemies = [target];
    expect(findTarget(state, state.towers[0])).toBeUndefined();
    finish(state, 5);
    tick(state);
    expect(pickBoon(state, 'longBarrels').ok).toBe(true);
    expect(buildTower(state, SECOND, type).ok).toBe(true);
    for (const tower of state.towers) {
      const x = tower.cell.col * 32 + 16;
      expect(upgradeTower(state, tower.cell).ok).toBe(true);
      state.enemies = [troll(0, x + (type === 'cannon' ? 90 : 220))];
      expect(findTarget(state, tower)).toBe(state.enemies[0]);
      expect(towerStats(tower, state.boons).range).toBeCloseTo(TOWER_DEFS[type].upgraded.range * 1.3);
      expect(towerStats(tower, state.boons).minRange).toBe(TOWER_DEFS[type].upgraded.minRange);
    }
  });

  it.each([
    [5, 'keenArrows', 'longbow', 'damage', 1.11],
    [10, 'stickyTar', 'tarpit', 'slowDuration', 2],
    [10, 'hotCoals', 'firepot', 'burnDps', 2.11],
    [15, 'biggerBlasts', 'cannon', 'splashRadius', 1.3],
    [15, 'biggerBlasts', 'mortar', 'splashRadius', 1.3],
  ] as const)('%s reward %s changes %s %s at both levels', (wave, id, type, key, scale) => {
    const state = field();
    expect(buildTower(state, CELL, type).ok).toBe(true);
    finish(state, wave);
    tick(state);
    expect(pickBoon(state, id).ok).toBe(true);
    expect(buildTower(state, SECOND, type).ok).toBe(true);
    for (const tower of state.towers) {
      expect(towerStats(tower, state.boons)).toEqual({ ...TOWER_DEFS[type].base, [key]: expect.closeTo(TOWER_DEFS[type].base[key] * scale, 12) });
      expect(upgradeTower(state, tower.cell).ok).toBe(true);
      expect(towerStats(tower, state.boons)).toEqual({ ...TOWER_DEFS[type].upgraded, [key]: expect.closeTo(TOWER_DEFS[type].upgraded[key] * scale, 12) });
    }
    // Measure the effect through the normal combat entry point as well.
    const baseline = TOWER_DEFS[type].upgraded;
    const secondDistance = key === 'splashRadius' ? 260 - baseline.splashRadius - 0.5 : 220;
    finish(state, wave + 1, [troll(0, 260), troll(1, secondDistance)]);
    fireTowers(state);
    if (key === 'damage') expect(state.enemies[0].hp).toBeCloseTo(1000 - 2 * baseline.damage * scale, 9);
    if (key === 'slowDuration') expect(state.enemies[0].slowTicksLeft).toBe(60 * baseline.slowDuration * scale);
    if (key === 'burnDps') {
      const target = state.enemies[0];
      expect(target.burnDps).toBe(baseline.burnDps * scale);
      const hp = target.hp;
      burnEnemies(state);
      expect(hp - target.hp).toBeCloseTo(baseline.burnDps * scale / 60);
    }
    if (key === 'splashRadius') {
      expect(state.shots.map((shot) => shot.splashRadius)).toEqual([baseline.splashRadius * scale, baseline.splashRadius * scale]);
      expect(state.enemies[1].hp).toBe(1000 - 2 * baseline.damage);
    }
  });

  it.each(Object.keys(TOWER_DEFS) as TowerType[])('Veteran Crews increases the fire rate of %s', (type) => {
    const state = field();
    expect(buildTower(state, CELL, type).ok).toBe(true);
    finish(state, 15);
    tick(state);
    expect(pickBoon(state, 'veteranCrews').ok).toBe(true);
    expect(buildTower(state, SECOND, type).ok).toBe(true);
    finish(state, 16, [troll(0, 238)]);
    fireTowers(state);
    for (const tower of state.towers) {
      const expected = 60 / (TOWER_DEFS[type].base.fireRate * 1.11);
      expect(tower.cooldownTicks).toBe(Math.round(expected));
      expect(shotCooldown(towerStats(tower, state.boons))).toBe(Math.round(expected));
    }
  });
});

describe('boon effects on specials', () => {
  it.each([
    ['stickyTar', 'tarBarrel'],
    ['hotCoals', 'fireArrows'],
    ['quickHands', 'keg'],
  ] as const)('%s affects %s', (id, special) => {
    const state = field();
    finish(state, 10);
    tick(state);
    expect(pickBoon(state, id).ok).toBe(true);
    expect(startWave(state).ok).toBe(true);
    finish(state, 11, [troll(0, 300)]);
    expect(useSpecial(state, special, { x: 300, y: 240 })).toMatchObject({ ok: true, hits: 1 });
    if (id === 'stickyTar') {
      expect(state.enemies[0].specialSlowTicksLeft).toBe(120);
      tick(state);
      expect(state.enemies[0].specialSlowTicksLeft).toBe(120);
    }
    if (id === 'hotCoals') {
      expect(state.enemies[0].burnDps).toBeCloseTo(54.86);
      tick(state);
      expect(state.enemies[0].hp).toBeCloseTo(1000 - 54.86 / 60);
    }
    if (id === 'quickHands') {
      expect(state.specialRechargeTicks).toBe(684);
      for (let i = 0; i < 683; i++) tick(state);
      expect(state.specialCharges).toBe(0);
      tick(state);
      expect(state.specialCharges).toBe(1);
    }
  });

  it('Bigger Blasts still catches an enemy 117 px away with the Powder Keg in endless', () => {
    const state = field();
    finish(state, 15);
    tick(state);
    expect(pickBoon(state, 'biggerBlasts').ok).toBe(true);
    finish(state, 20);
    tick(state);
    expect(continueEndless(state).ok).toBe(true);
    expect(startWave(state)).toEqual({ ok: true, wave: 21 });
    finish(state, 21, [troll(0, 417), troll(1, 417.01)]);
    expect(useSpecial(state, 'keg', { x: 300, y: 240 })).toMatchObject({ ok: true, hits: 1 });
    expect(state.enemies.map((enemy) => enemy.hp)).toEqual([940, 1000]);
  });
});
