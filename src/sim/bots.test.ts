import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower, useSpecial } from './actions';
import { botBeginner, botGood, botGoodFeat, botPerson, runBot } from './bots';
import { callNextWave, createGame, startWave, tick } from './game';
import { BARREL_RECHARGE_TICKS } from './specials';
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

  it('remembers a simultaneous pack after all its members have left the field', () => {
    const game = createGame({ level: { ...level, startGold: 0, waves: [
      { groups: [{ type: 'goblin', count: 6, interval: 0, delay: 0 }] },
    ] } });
    const run = runBot(game, botBeginner);
    expect(run.state).toMatchObject({ phase: 'won', lives: 14, enemies: [] });
    expect(run.peakAlive).toBe(6);
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

describe('person policy', () => {
  it('rotates through three placement ranks, then takes the best cell again', () => {
    const state = createGame({ level: { ...level, startGold: 1000, maxTowerLevel: 1, allowedTowers: ['longbow'] } });
    for (const [col, row] of [[9, 4], [8, 5], [9, 6], [9, 5]]) {
      const choice = botPerson.purchase(state);
      expect(choice).toEqual({ type: 'build', tower: 'longbow', cell: { col, row } });
      if (choice?.type !== 'build') throw new Error('expected a placement');
      expect(buildTower(state, choice.cell, choice.tower).ok).toBe(true);
    }
  });

  it('uses its previous opening aim when the next wave starts too soon for another look', () => {
    const state = createGame({ level });
    expect(startWave(state).ok).toBe(true);
    state.waveTick = state.tick = 90;
    const first = botPerson.special(state);
    expect(first).toBeDefined();
    state.wave = 2;
    state.tick += 110;
    state.waveTick = 90;
    state.enemies = [600, 601, 602].map((distance, id) => ({
      id, distance, type: 'goblin', hp: 10, slow: 0, slowTicksLeft: 0,
    }));
    expect(botPerson.special(state)).toEqual(first);
    expect(botPerson.special({ ...state })).not.toEqual(first);
  });

  it('C2: an unused barrel spends the same turn and wait without placing tar or feathering', () => {
    const state = createGame({ level: { ...level, featherBarrels: true, allowedSpecials: ['tarBarrel', 'keg'] } });
    startWave(state);
    state.enemies.push({ id: 42, type: 'troll', distance: 80, hp: 950, slow: 0, slowTicksLeft: 0 });
    let nextZone;
    const run = runBot(state, {
      ...botGood, leaveBarrelUnused: true,
      special(s, lastZone) {
        nextZone = lastZone;
        if (!s.specialCharges) return undefined;
        return { type: 'special', special: 'tarBarrel', x: 80, y: 240, atWaveTick: s.waveTick };
      },
    }, 1, 2);
    expect(nextZone).toBe('tarBarrel');
    expect(state.zones).toEqual([]);
    expect(state.enemies[0].feathered).toBeUndefined();
    expect(state.enemies[0].specialSlowTicksLeft).toBeUndefined();
    expect([state.specialCharges, state.specialRechargeTicks]).toEqual([0, BARREL_RECHARGE_TICKS - 2]);
    expect(run.log.some(step => step.action === 'special')).toBe(false);
  });

  it('reacts 90 ticks after a barrel wait ends across an early call', () => {
    const groups = [{ type: 'goblin' as const, count: 2, interval: 3000, delay: 0 }];
    const state = createGame({ level: { ...level, featherBarrels: true, allowedSpecials: ['tarBarrel', 'keg'],
      waves: [{ groups }, { groups }, { groups }] } });
    expect(startWave(state).ok).toBe(true);
    tick(state);
    expect(useSpecial(state, 'tarBarrel', { x: 300, y: 240 }).ok).toBe(true);
    state.spawnedPerGroup = [2];
    expect(callNextWave(state).ok).toBe(true);
    const wait = BARREL_RECHARGE_TICKS;
    for (let elapsed = 0; elapsed < wait + 90; elapsed++) {
      expect(botPerson.special(state)).toBeUndefined();
      tick(state);
    }
    expect(botPerson.special(state)).toMatchObject({ type: 'special', atWaveTick: wait + 90 });
  });

  it('spends each charge within 90 ticks on a cell centre and spaces fight decisions by at least 180 ticks', () => {
    const state = createGame({ level: { ...level, waves: [{ groups: [
      { type: 'goblin', count: 2, interval: 3000, delay: 0 },
    ] }] } });
    expect(startWave(state).ok).toBe(true);
    let readyAt = 0;
    const fired: number[] = [];
    while (state.waveTick < 1500) {
      const action = botPerson.special(state);
      if (action) {
        expect(botPerson.special(state)).toEqual(action);
        expect(action.x % 48).toBe(24);
        expect(action.y % 48).toBe(24);
        expect(state.tick - readyAt).toBe(90);
        expect(useSpecial(state, action.special, action).ok).toBe(true);
        fired.push(state.tick);
      }
      const charging = state.specialCharges === 0;
      tick(state);
      if (charging && state.specialCharges > 0) readyAt = state.tick;
    }
    expect(fired).toHaveLength(2);
    expect(fired[1] - fired[0]).toBeGreaterThanOrEqual(180);
  });
});

describe('taxed setup and deliberate feats', () => {
  it('prices the next build and prefers an upgrade once the standing cap is full', () => {
    for (const bot of [botBeginner, botPerson, botGood]) {
      const state = createGame({ level: { ...level, startGold: 80, allowedTowers: ['longbow'],
        taxes: { windowTax: 0.1 }, maxTowerLevel: 1 } });
      expect(buildTower(state, trailCellOrder(state.map)[0], 'longbow').ok).toBe(true);
      expect(bot.purchase(state)).toBeUndefined(); // 40 left, next Longbow costs 44.
      const capped = createGame({ level: { ...level, startGold: 200, allowedTowers: ['longbow'], taxes: { rationing: 1 } } });
      const cell = trailCellOrder(capped.map)[0];
      expect(buildTower(capped, cell, 'longbow').ok).toBe(true);
      expect(bot.purchase(capped)).toEqual({ type: 'upgrade', cell });
    }
  });

  it('spends the last affordable wave-clear gold with Frozen Purse', () => {
    for (const bot of [botGood, botPerson]) {
      const state = createGame({ level: { ...level, startGold: 40, allowedTowers: ['longbow'], taxes: { frozenPurse: 40 } } });
      state.wave = 1;
      expect(bot.purchase(state)).toMatchObject({ type: 'build', tower: 'longbow' });
    }
  });

  it('completes only purchases whose planning time fits before automatic dispatch', () => {
    const base: LevelDef = { ...level, startGold: 200, waves: [...level.waves, ...level.waves, ...level.waves],
      feat: { kind: 'noSpecials' }, maxTowerLevel: 1, allowedTowers: ['longbow'] };
    function fromFirstClear(timed: boolean) {
      const state = createGame({ level: timed ? { ...base, taxes: { noLoitering: 8 } } : base });
      state.wave = 1;
      if (timed) state.autoWaveTicks = 480;
      return runBot(state, botPerson, 2);
    }
    const automatic = fromFirstClear(true);
    const control = fromFirstClear(false);
    expect(automatic.setupTicks).toBe(480);
    expect(control.setupTicks).toBe(720);
    expect(automatic.state.towers).toHaveLength(2);
    expect(control.state.towers).toHaveLength(4);
    expect(automatic.log.some(step => step.action === 'startWave')).toBe(false);
    expect(automatic.refused).toBe(0);
    expect(automatic.state.phase).toBe('setup');
    expect(automatic.state.autoWaveTicks).toBeUndefined(); // The final wave waits for the player.
  });

  it('keeps feat-mode buying and casting separate from normal Good', () => {
    const capped = createGame({ level: { ...level, startGold: 300, maxTowerLevel: 1, feat: { kind: 'maxTowers', limit: 1 } } });
    const cell = trailCellOrder(capped.map)[0];
    expect(buildTower(capped, cell, 'longbow').ok).toBe(true);
    expect(botGoodFeat.purchase(capped)).toBeUndefined();
    expect(botGood.purchase(capped)).toMatchObject({ type: 'build' });
    const hands = createGame({ level: { ...level, feat: { kind: 'noSpecials' } } });
    expect(startWave(hands).ok).toBe(true);
    hands.enemies = [120, 121, 122].map((distance, id) => ({ id, distance, type: 'goblin', hp: 10, slow: 0, slowTicksLeft: 0 }));
    expect(botGood.special(hands)).toMatchObject({ special: 'keg' });
    expect(botGoodFeat.special(hands)).toBeUndefined();
  });
});
