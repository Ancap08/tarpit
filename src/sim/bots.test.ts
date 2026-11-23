import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower, useSpecial } from './actions';
import { botBeginner, botGood, runBot } from './bots';
import { createGame, startWave } from './game';
import { trailCellOrder } from './headless';
import type { LevelDef } from './levelTypes';
import type { EnemyType, MapDef } from './types';

const level: LevelDef = {
  id: 1, map: 'meadow', startGold: 85, hpScale: 1, hpGrowthStart: null,
  allowedTowers: ['longbow', 'musketeer'], maxTowerLevel: 2,
  allowedSpecials: ['keg'], rewardWaves: [],
  waves: [{ groups: [{ type: 'goblin', count: 10, interval: 2, delay: 0 }] }],
};
const lane: MapDef = {
  id: 'meadow', width: 960, height: 480,
  path: [{ x: 0, y: 240 }, { x: 960, y: 240 }],
};

describe('beginner policy', () => {
  it('builds the cheapest allowed type at each next trail cell', () => {
    const state = createGame({ level });
    const [first, second] = trailCellOrder(state.map);
    expect(botBeginner.purchase(state)).toEqual({ type: 'build', tower: 'longbow', cell: first });
    expect(buildTower(state, first, 'longbow').ok).toBe(true);
    expect(botBeginner.purchase(state)).toEqual({ type: 'build', tower: 'longbow', cell: second });
    expect(buildTower(state, second, 'longbow').ok).toBe(true);
    expect(botBeginner.purchase(state)).toBeUndefined();
  });

  it('upgrades at most once per setup when the trail order is occupied', () => {
    const state = createGame({ level: { ...level, allowedTowers: ['longbow'], startGold: 10_000 } });
    const trail = trailCellOrder(state.map);
    for (const cell of trail) expect(buildTower(state, cell, 'longbow').ok).toBe(true);
    expect(botBeginner.purchase(state)).toEqual({ type: 'upgrade', cell: { col: 7, row: 1 } });
    const run = runBot(state, botBeginner, 1);
    expect(run.refused).toBe(0);
    expect(run.log.filter((step) => step.action === 'upgrade')).toHaveLength(1);
  });

  it('takes the first offered reward and never spends a special charge', () => {
    const state = createGame({ level });
    state.pendingBoon = { wave: 5, options: ['longBarrels', 'keenArrows', 'warChest'] };
    expect(botBeginner.reward(state)).toBe('longBarrels');
    expect(botBeginner.purchase(state)).toBeUndefined();
    state.pendingBoon = null;
    expect(startWave(state).ok).toBe(true);
    expect(state.specialCharges).toBe(1);
    expect(botBeginner.special(state)).toBeUndefined();
  });
});

describe('capable policy', () => {
  it('places along a good firing lane, then upgrades where the larger range and damage are useful', () => {
    const state = createGame({ map: lane });
    const buy = botGood.purchase(state);
    expect(buy).toEqual({ type: 'build', tower: 'longbow', cell: { col: 3, row: 5 } });
    if (buy?.type !== 'build') throw new Error('expected a placement');
    expect(buildTower(state, buy.cell, buy.tower).ok).toBe(true);
    expect(botGood.purchase(state)).toEqual({ type: 'upgrade', cell: buy.cell });
  });

  it('uses the flyer preview and the level allowlist when buying', () => {
    const state = createGame({ level: {
      ...level, startGold: 120, allowedTowers: ['cannon', 'longbow'],
      waves: [{ groups: [{ type: 'harpy', count: 20, interval: 1, delay: 0 }] }],
    } });
    expect(botGood.purchase(state)).toMatchObject({ type: 'build', tower: 'longbow' });
    const restricted = createGame({ level: { ...state.level!, allowedTowers: ['cannon'] } });
    expect(botGood.purchase(restricted)).toMatchObject({ type: 'build', tower: 'cannon' });
  });

  it('keeps thirty gold after the first wave and respects the upgrade ceiling', () => {
    const state = createGame({ level: { ...level, startGold: 120, allowedTowers: ['longbow'] } });
    const cell = trailCellOrder(state.map)[0];
    expect(buildTower(state, cell, 'longbow').ok).toBe(true);
    state.wave = 1;
    state.gold = 59;
    expect(botGood.purchase(state)).toBeUndefined();
    state.gold = 60;
    expect(botGood.purchase(state)).toEqual({ type: 'upgrade', cell });
    expect(upgradeTower(state, cell).ok).toBe(true);
    state.gold = 100;
    expect(botGood.purchase(state)).toMatchObject({ type: 'build', tower: 'longbow' });
  });

  it('can choose the long-range second upgrade over another base tower', () => {
    const state = createGame({ level: { ...level, maxTowerLevel: 3, startGold: 170, allowedTowers: ['musketeer'] } });
    const cell = { col: 7, row: 4 };
    expect(buildTower(state, cell, 'musketeer').ok).toBe(true);
    expect(upgradeTower(state, cell).ok).toBe(true);
    expect(botGood.purchase(state)).toEqual({ type: 'upgrade', cell, path: 'A' });
  });

  it('adds crowd splash once it has opening towers', () => {
    const state = createGame({ level: {
      ...level, startGold: 220, allowedTowers: ['cannon', 'longbow'],
      waves: [{ groups: [{ type: 'goblin', count: 50, interval: 1, delay: 0 }] }],
    } });
    for (const cell of [{ col: 3, row: 5 }, { col: 7, row: 4 }]) {
      expect(buildTower(state, cell, 'longbow').ok).toBe(true);
      expect(upgradeTower(state, cell).ok).toBe(true);
    }
    expect(botGood.purchase(state)).toMatchObject({ type: 'build', tower: 'cannon' });
  });

  it.each([
    ['tarpit', 'goblin', 'longbow', 'longbow'],
    ['firepot', 'goblin', 'longbow', 'tarpit'],
    ['mortar', 'troll', 'longbow', 'longbow'],
  ] as const)('adds %s to an established opening against %s', (choice, enemy, first, second) => {
    const state = createGame({ level: {
      ...level, startGold: 300, allowedTowers: [...new Set([first, second, choice])],
      waves: [{ groups: [{ type: enemy, count: 10, interval: 2, delay: 0 }] }],
    } });
    const opening = [{ col: 3, row: 5 }, { col: 7, row: 4 }];
    for (const [index, tower] of [first, second].entries()) {
      expect(buildTower(state, opening[index], tower).ok).toBe(true);
      expect(upgradeTower(state, opening[index]).ok).toBe(true);
    }
    expect(botGood.purchase(state)).toMatchObject({ type: 'build', tower: choice });
  });

  it('prefers matching artillery range to the gold reward when it has enough artillery', () => {
    const state = createGame({ level: { ...level, startGold: 500, allowedTowers: ['cannon'] } });
    state.pendingBoon = { wave: 5, options: ['longBarrels', 'keenArrows', 'warChest'] };
    expect(botGood.reward(state)).toBe('warChest');
    for (const cell of trailCellOrder(state.map).slice(0, 3)) expect(buildTower(state, cell, 'cannon').ok).toBe(true);
    expect(botGood.reward(state)).toBe('longBarrels');
  });

  it('takes faster recharges with an ordinary special and Hot Coals with Fire Pots and Fire Arrows', () => {
    const state = createGame({ level: {
      ...level, startGold: 150, allowedTowers: ['firepot'], allowedSpecials: ['keg', 'fireArrows'],
    } });
    state.pendingBoon = { wave: 10, options: ['stickyTar', 'hotCoals', 'quickHands'] };
    expect(botGood.reward(state)).toBe('quickHands');
    expect(buildTower(state, { col: 7, row: 4 }, 'firepot').ok).toBe(true);
    expect(botGood.reward(state)).toBe('hotCoals');
  });

  it('takes the first reward on a tie and prioritizes Stone Walls when lives are low', () => {
    const state = createGame({ level: {
      ...level, startGold: 320, allowedTowers: ['cannon'],
    } });
    state.pendingBoon = { wave: 15, options: ['stoneWalls', 'veteranCrews', 'biggerBlasts'] };
    for (const cell of trailCellOrder(state.map).slice(0, 4)) expect(buildTower(state, cell, 'cannon').ok).toBe(true);
    expect(botGood.reward(state)).toBe('stoneWalls');
    state.pendingBoon.options.reverse();
    expect(botGood.reward(state)).toBe('biggerBlasts');
    state.lives = 4;
    expect(botGood.reward(state)).toBe('stoneWalls');
    state.pendingBoon = null;
    expect(botGood.reward(state)).toBeUndefined();
  });

  function withCrowd(allowedSpecials: LevelDef['allowedSpecials'], type: EnemyType = 'goblin') {
    const state = createGame({ level: { ...level, startGold: 100, allowedTowers: ['cannon'], allowedSpecials } });
    expect(buildTower(state, { col: 7, row: 4 }, 'cannon').ok).toBe(true);
    expect(startWave(state).ok).toBe(true);
    state.enemies = [145, 150, 155].map((distance, id) => ({ id, distance, type, hp: 20, slow: 0, slowTicksLeft: 0 }));
    return state;
  }

  it('waits for a real crowd and uses only allowed specials, including custom wave-one zones', () => {
    const state = withCrowd(['keg', 'tarBarrel', 'fireArrows']);
    expect(botGood.special(state)).toMatchObject({ special: 'keg', x: 160, y: 160 });
    state.enemies[0].type = 'troll';
    expect(botGood.special(state)).toMatchObject({ special: 'tarBarrel' });
    expect(botGood.special(state, 'tarBarrel')).toMatchObject({ special: 'fireArrows' });
    state.enemies.pop();
    expect(botGood.special(state)).toBeUndefined();
  });

  it.each(['barricade', 'guards'] as const)('puts %s in the way of a crowd in cannon range', (special) => {
    const state = withCrowd([special]);
    expect(botGood.special(state)).toMatchObject({ special, x: 160, y: 130 });
    expect(useSpecial(state, special, { x: 160, y: 130 }).ok).toBe(true);
    state.specialCharges = 1;
    state.tick = state.waveTick = 30;
    expect(botGood.special(state)).toBeUndefined();

    const uncovered = withCrowd([special]);
    uncovered.towers.length = 0;
    expect(botGood.special(uncovered)).toBeUndefined();
    const flying = withCrowd([special], 'harpy');
    expect(botGood.special(flying)).toBeUndefined();
  });

  it('repeats the same action log and full state, with no refusals', () => {
    const first = runBot(createGame({ level }), botGood);
    const second = runBot(createGame({ level }), botGood);
    expect(first).toEqual(second);
    expect(first.refused).toBe(0);
    expect(first.state.phase).toBe('won');
  });

  it('stops at a finished-wave cap or an elapsed-tick cap', () => {
    const twoWaves = { ...level, waves: [...level.waves, ...level.waves] };
    const afterFirst = runBot(createGame({ level: twoWaves }), botGood, 1);
    expect(afterFirst.state).toMatchObject({ phase: 'setup', wave: 1 });
    expect(runBot(afterFirst.state, botGood).state).toMatchObject({ phase: 'won', wave: 2 });
    const timedOut = runBot(createGame({ level: twoWaves }), botGood, Infinity, 1);
    expect(timedOut.state).toMatchObject({ phase: 'wave', tick: 1 });
  });
});
