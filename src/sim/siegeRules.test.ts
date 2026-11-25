import { describe, expect, it } from 'vitest';
import { buildTower, moveTower, useSpecial } from './actions';
import { barricadePlacement, guardsPlacement } from './blockers';
import { botBeginner, botGood, botGoodFeat, botPerson, botPersonFeat, runBot } from './bots';
import { levelStars } from './campaignProgress';
import { applyBurn, applySpecialSlow, enemyPosition, findTarget, fireTowers } from './combat';
import { ENEMY_STATS } from './enemies';
import { featherEnemy } from './feathers';
import { createGame, startWave, tick } from './game';
import { repairGate } from './gate';
import { isBuildable } from './grid';
import { LEVELS } from './levels';
import { createKeep } from './oldKeep';
import { distanceOnRoad, roadLength } from './roads';
import { payQuartering, shakeWindow } from './siege';
import type { Enemy, EnemyType, GameState, MapDef } from './types';
import { nextWavePreview } from './waves';

const map: MapDef = {
  id: 'test-fork', width: 960, height: 480, mainRoad: 'east',
  path: [{ x: 0, y: 100 }, { x: 300, y: 100 }, { x: 960, y: 100 }],
  otherRoads: [{ id: 'west', approach: [{ x: 300, y: 0 }], joinIndex: 1 }],
};
const gate = { maxHp: 480, yardLength: 260, repairHp: 160, repairCost: 30 };
const firstWave = { groups: [
  { type: 'goblin', count: 1, interval: 0, delay: 0, road: 'east' },
  { type: 'goblin', count: 1, interval: 0, delay: 0, road: 'west' },
] } as const;
const walker = (id: number, road: string, distance: number, type: EnemyType = 'goblin'): Enemy =>
  ({ id, road, type, distance, hp: ENEMY_STATS[type].hp, slow: 0, slowTicksLeft: 0 });

function battle(enemies: Enemy[] = [], wave = 1): GameState {
  const state = createGame({ map, gate });
  state.fixedWaves = Array.from({ length: wave }, () => firstWave);
  state.wave = wave - 1;
  startWave(state);
  state.enemies = enemies;
  state.spawnedPerGroup = [1, 1];
  state.nextEnemyId = 50;
  return state;
}

describe('converging roads', () => {
  it('preserves preview group roads and spawns each group at its named entrance', () => {
    const state = createGame({ map, gate });
    state.fixedWaves = [firstWave];
    expect(nextWavePreview(state)).toEqual([
      { type: 'goblin', count: 1, road: 'east' }, { type: 'goblin', count: 1, road: 'west' },
    ]);
    startWave(state);
    tick(state);
    expect(state.enemies.map(e => [e.id, e.road, enemyPosition(e, map)])).toEqual([
      [0, 'east', { x: 0, y: 100 }], [1, 'west', { x: 300, y: 0 }],
    ]);
  });

  it('holds and charges both queues against one gate, then leaks at each road’s end', () => {
    const east = walker(1, 'east', 699);
    const west = walker(2, 'west', 499);
    const state = battle([east, west]);
    state.gate!.hp = 0.4;
    tick(state);
    expect([east.distance, west.distance, state.gate!.hp, state.lives, state.phase]).toEqual([700, 500, 0.2, 20, 'wave']);
    expect(enemyPosition(west, map)).toEqual(enemyPosition(east, map));
    tick(state);
    expect([east.distance, west.distance, state.gate!.hp, state.lives]).toEqual([700, 500, 0, 20]);
    east.distance = 958;
    west.distance = 759;
    tick(state);
    expect([state.lives, state.phase, state.enemies.map(e => e.id)]).toEqual([19, 'wave', [1]]);
    tick(state);
    expect([state.lives, state.phase, state.gold]).toEqual([18, 'won', 125]);
  });

  it('waits for a pending spawn on either road after the field empties', () => {
    const state = battle();
    state.fixedWaves = [{ groups: [firstWave.groups[0], { ...firstWave.groups[1], delay: 1 }] }];
    state.spawnedPerGroup[1] = 0;
    for (let i = 0; i < 60; i++) tick(state);
    expect([state.phase, state.enemies.length]).toEqual(['wave', 0]);
    tick(state);
    expect(state.enemies.map(e => e.road)).toEqual(['west']);
  });

  it('orders First, Last and Strongest by remaining distance with stable ties', () => {
    const east = walker(1, 'east', 295);
    const west = walker(2, 'west', 96);
    const state = battle([east, west]);
    expect(buildTower(state, { col: 7, row: 1 }, 'musketeer').ok).toBe(true);
    const tower = state.towers[0];
    expect(findTarget(state, tower)?.id).toBe(2);
    tower.targeting = 'last';
    expect(findTarget(state, tower)?.id).toBe(1);
    tower.targeting = 'strongest';
    expect(findTarget(state, tower)?.id).toBe(2);
    east.hp++;
    expect(findTarget(state, tower)?.id).toBe(1);
    west.hp = east.hp;
    east.distance = 310;
    west.distance = 110;
    for (const mode of ['first', 'last', 'strongest'] as const) {
      tower.targeting = mode;
      expect(findTarget(state, tower)?.id).toBe(1);
    }
  });

  it('checks tower clearance and real shot reach on the branch', () => {
    const west = walker(2, 'west', 10);
    const state = battle([west]);
    expect(isBuildable(state, { col: 9, row: 0 })).toBe(false);
    expect(buildTower(state, { col: 8, row: 0 }, 'musketeer')).toEqual({ ok: false, reason: 'not-buildable' });
    expect(buildTower(state, { col: 7, row: 0 }, 'musketeer').ok).toBe(true);
    fireTowers(state);
    expect(state.shots).toEqual([expect.objectContaining({ targetId: west.id, to: { x: 300, y: 10 } })]);
  });

  it('snaps a wall to the western approach and holds only its traffic there', () => {
    expect(barricadePlacement(map, { x: 300, y: 63 })).toMatchObject({ ok: false, reason: 'near-spawn' });
    expect(barricadePlacement(map, { x: 300, y: 64 })).toMatchObject({ ok: true, point: { road: 'west', distance: 64 } });
    const east = walker(1, 'east', 263);
    const west = walker(2, 'west', 63);
    const state = battle([east, west], 3);
    expect(useSpecial(state, 'barricade', { x: 300, y: 64 })).toMatchObject({ ok: true });
    tick(state);
    tick(state);
    expect([east.distance, west.distance, state.blockers[0].hp]).toEqual([265, 64, 323.79999999999995]);
  });

  it('makes the join shared, while guards trailing back onto the east approach hold east only', () => {
    const preview = guardsPlacement(map, { x: 310, y: 100 });
    expect(preview).toMatchObject({ ok: true, points: [
      { road: 'east', distance: 310 }, { road: 'east', distance: 298 },
      { road: 'east', distance: 286 }, { road: 'east', distance: 274 },
    ] });
    const east = walker(1, 'east', 297);
    const west = walker(2, 'west', 109);
    const state = battle([east, west], 6);
    expect(useSpecial(state, 'guards', { x: 310, y: 100 }).ok).toBe(true);
    tick(state);
    expect([east.guardContact?.guardId, west.guardContact?.guardId]).toEqual([1, 0]);
    expect([east.distance, west.distance]).toEqual([298, 110]);
    expect(barricadePlacement(map, { x: 300, y: 100 })).toMatchObject({ point: { road: 'east', distance: 300 } });
    const wall = battle([walker(1, 'east', 299), walker(2, 'west', 99)], 3);
    useSpecial(wall, 'barricade', { x: 300, y: 100 });
    tick(wall);
    tick(wall);
    expect(wall.enemies.map(e => e.distance)).toEqual([300, 100]);
  });

  it('returns a runner across the join on its own road and flinches traffic only where paths meet', () => {
    const runner = walker(1, 'west', 102);
    runner.specialSlowTicksLeft = 10;
    const shared = walker(2, 'east', 300);
    const east = walker(3, 'east', 294);
    const state = battle([runner, shared, east]);
    expect(featherEnemy(state, runner)).toBe(true);
    for (let i = 0; i < 4; i++) tick(state);
    expect([runner.distance, runner.road, runner.runTicksLeft]).toEqual([98, 'west', 84]);
    expect(enemyPosition(runner, map)).toEqual({ x: 300, y: 98 });
    expect(shared.flinchTicksLeft).toBe(13);
    expect(east.flinchTicksLeft).toBeUndefined();
  });

  it('uses actual positions for specials at the join and counts every enemy once', () => {
    const state = battle([walker(1, 'east', 300), walker(2, 'west', 100), walker(3, 'east', 100)]);
    const cast = useSpecial(state, 'keg', { x: 300, y: 100 });
    expect(cast).toMatchObject({ ok: true, hits: 2, kills: 2 });
    expect(state.enemies.map(e => e.id)).toEqual([3]);
  });
});

describe('siege actions', () => {
  it('shakes once per window during a wave and hits only eligible enemies on its inclusive stretch', () => {
    const state = battle([
      walker(1, 'west', 90), walker(2, 'east', 310), walker(3, 'west', 89),
      walker(4, 'west', 111), walker(5, 'east', 292),
      walker(6, 'west', 100), walker(7, 'west', 100), walker(8, 'west', 100, 'boss'),
      walker(9, 'west', 100, 'ram'),
    ]);
    state.windows = [{ position: { x: 10, y: 10 }, road: 'west', from: 90, to: 110, used: false }];
    for (const enemy of state.enemies) if (enemy.id !== 6) enemy.slowTicksLeft = 20;
    state.enemies[6].feathered = true;
    state.phase = 'setup';
    expect(shakeWindow(state, 0)).toEqual({ ok: false, reason: 'not-in-wave' });
    expect(state.windows[0].used).toBe(false);
    state.phase = 'wave';
    expect(shakeWindow(state, 0)).toEqual({ ok: true, hits: 3 });
    expect(state.enemies.filter(e => e.runTicksLeft).map(e => [e.id, e.runTicksLeft])).toEqual([[1, 63], [2, 63], [9, 63]]);
    expect(state.windows[0].used).toBe(true);
    expect(shakeWindow(state, 0)).toEqual({ ok: false, reason: 'spent-window' });
    expect([state.gold, state.specialCharges]).toEqual([100, 1]);
  });

  it('spends an empty window independently and lights both windows on replay', () => {
    const keep = createKeep();
    startWave(keep);
    expect(shakeWindow(keep, 0)).toEqual({ ok: true, hits: 0 });
    expect(keep.windows?.map(w => w.used)).toEqual([true, false]);
    expect(createKeep().windows?.map(w => w.used)).toEqual([false, false]);
  });

  it('gives a Ram three gate HP per tick, normal tar and burn, a 31.5 px retreat, and a one-life leak', () => {
    const ram = walker(0, 'west', 500, 'ram');
    const state = battle([ram]);
    tick(state);
    expect(state.gate!.hp).toBe(477);
    applySpecialSlow(ram, 0.5, 100);
    applyBurn(ram, 30, 100, 'special');
    state.windows = [{ road: 'west', position: { x: 0, y: 0 }, from: 490, to: 510, used: false }];
    expect(shakeWindow(state, 0)).toEqual({ ok: true, hits: 1 });
    tick(state);
    expect([ram.distance, ram.hp, ram.runTicksLeft, state.gate!.hp]).toEqual([499.5, 359, 62, 477]);
    for (let i = 0; i < 62; i++) tick(state);
    expect([ram.distance, ram.runTicksLeft]).toEqual([468.5, 0]);
    state.gate!.hp = 3;
    ram.distance = 500;
    tick(state);
    expect(state.gate!.fallen).toBe(true);
    expect(state.lives).toBe(20);
    ram.distance = roadLength(map, 'west') - 0.25;
    tick(state);
    expect([state.lives, state.phase]).toEqual([19, 'won']);
    const ramAtWall = battle([walker(0, 'west', 100, 'ram')], 3);
    useSpecial(ramAtWall, 'barricade', { x: 300, y: 100 });
    tick(ramAtWall);
    expect(ramAtWall.blockers[0].hp).toBeCloseTo(324 - 4 / 60, 10);
  });

  it('Quartering blocks construction and moves until a single exact payment during setup', () => {
    const state = createKeep();
    const site = { col: 13, row: 7 };
    const other = { col: 15, row: 13 };
    expect(isBuildable(state, site)).toBe(false);
    expect(buildTower(state, site, 'musketeer')).toEqual({ ok: false, reason: 'not-buildable' });
    expect(buildTower(state, other, 'musketeer').ok).toBe(true);
    expect(moveTower(state, other, site)).toEqual({ ok: false, reason: 'not-buildable' });
    state.gold = 34;
    expect(payQuartering(state)).toEqual({ ok: false, reason: 'not-enough-gold' });
    expect(state.gold).toBe(34);
    state.phase = 'wave';
    expect(payQuartering(state)).toEqual({ ok: false, reason: 'not-in-setup' });
    state.phase = 'setup';
    state.gold = 100;
    expect(payQuartering(state)).toEqual({ ok: true, cost: 35, gold: 65 });
    expect(payQuartering(state)).toEqual({ ok: false, reason: 'no-quartering' });
    expect(buildTower(state, site, 'musketeer')).toMatchObject({ ok: true, gold: 15 });
  });

  it('Royal Survey stays closed across payment attempts and wave transitions', () => {
    const state = createKeep(true);
    const site = { col: 13, row: 7 };
    expect(payQuartering(state)).toEqual({ ok: false, reason: 'no-quartering' });
    expect(buildTower(state, site, 'musketeer').ok).toBe(false);
    startWave(state);
    expect(buildTower(state, site, 'musketeer').ok).toBe(false);
    state.phase = 'setup';
    expect(buildTower(state, site, 'musketeer').ok).toBe(false);
    expect([state.gold, state.wallSiteTax?.kind]).toEqual([240, 'royalSurvey']);
  });

  it('Not a nail counts exactly one successful purchase, even a one-gold repair', () => {
    const level = { ...LEVELS[0], gate, feat: { kind: 'noRepairs' as const } };
    const state = createGame({ level });
    state.phase = 'won';
    state.lives = 12;
    expect(levelStars(state)).toBe(3);
    state.phase = 'setup';
    expect(repairGate(state)).toEqual({ ok: false, reason: 'gate-full' });
    expect(state.boughtRepair).toBeUndefined();
    state.gate!.hp--;
    expect(repairGate(state)).toMatchObject({ ok: true, cost: 1 });
    state.phase = 'won';
    expect(levelStars(state)).toBe(2);
  });
});

const eastSite = { col: 8, row: 1 };
const westSite = { col: 8, row: 10 };
const shoppingMap: MapDef = {
  ...map, path: [{ x: 0, y: 100 }, { x: 750, y: 100 }, { x: 960, y: 100 }],
  otherRoads: [{ id: 'west', approach: [{ x: 0, y: 400 }, { x: 650, y: 400 }], joinIndex: 1 }],
  buildSites: [eastSite, westSite], highSites: [westSite],
};

function shopping(westOnly = false): GameState {
  const state = createGame({ map: shoppingMap });
  state.fixedWaves = [westOnly ? { groups: [firstWave.groups[1]] } : firstWave];
  state.gold = 250;
  return state;
}

describe('siege bot choices', () => {
  it.each([['Good', botGood], ['Person', botPerson]] as const)('%s covers western traffic even with no eastern group', (_, bot) => {
    const state = shopping(true);
    expect(bot.purchase(state)).toMatchObject({ type: 'build', cell: westSite });
    buildTower(state, eastSite, 'musketeer');
    state.fixedWaves = [firstWave];
    expect(bot.purchase(state)).toMatchObject({ type: 'build', cell: westSite });
  });

  it('Beginner walks and builds on both approaches and skips a closed site', () => {
    const state = shopping();
    expect(botBeginner.purchase(state)).toMatchObject({ type: 'build', cell: eastSite });
    buildTower(state, eastSite, 'musketeer');
    expect(botBeginner.purchase(state)).toMatchObject({ type: 'build', cell: westSite });
    state.wallSiteTax = { kind: 'royalSurvey', site: westSite };
    expect(botBeginner.purchase(state)?.type).toBe('upgrade');
  });

  it('pays to enable useful coverage if Good can afford a tower, while Person waits for an existing tower and reserve', () => {
    const state = shopping(true);
    state.wallSiteTax = { kind: 'quartering', site: westSite, price: 35 };
    state.gold = 74;
    expect(botGood.quartering!(state)).toBe(false);
    state.gold = 200;
    expect(botPerson.quartering!(state)).toBe(false);
    expect(botGood.quartering!(state)).toBe(true);
    buildTower(state, eastSite, 'musketeer');
    state.gold = 104;
    expect(botPerson.quartering!(state)).toBe(false);
    state.gold = 180;
    expect(botPerson.quartering!(state)).toBe(true);
    expect(botBeginner.quartering).toBeUndefined();
    const run = runBot(state, botPerson, 1, 1);
    expect(run.log[0]).toEqual({ action: 'payQuartering', result: { ok: true, cost: 35, gold: 145 } });
    expect(run.state.towers.some(t => t.cell.col === westSite.col && t.cell.row === westSite.row)).toBe(true);
  });

  it('Good uses a window for a Ram alone, Person waits for enough and a reaction tick, Beginner leaves it lit', () => {
    const ram = walker(0, 'west', 90, 'ram');
    const state = battle([ram]);
    ram.slowTicksLeft = 10;
    state.windows = [{ position: { x: 0, y: 0 }, road: 'west', from: 64, to: 100, used: false }];
    expect(botGood.window!(state)).toBe(0);
    expect(botPerson.window!(state)).toBeUndefined();
    const crowd = [walker(1, 'west', 80), walker(2, 'west', 84)];
    for (const enemy of crowd) enemy.slowTicksLeft = 10;
    state.enemies.push(...crowd);
    state.waveTick = 89;
    expect(botGood.window!(state)).toBeUndefined();
    expect(botPerson.window!(state)).toBeUndefined();
    state.waveTick = 90;
    expect(botPerson.window!(state)).toBe(0);
    expect(botBeginner.window).toBeUndefined();
    expect(runBot(state, botPerson, 1, 1).log[0]).toEqual({ action: 'shakeWindow', index: 0, result: { ok: true, hits: 3 } });
  });

  it('both bots can repair ordinarily and forgo repairs when pursuing Not a nail', () => {
    const state = createGame({ level: { ...LEVELS[0], gate, feat: { kind: 'noRepairs' } } });
    state.gate!.hp = 100;
    state.gold = 200;
    expect(botGood.repair!(state)).toBe(true);
    expect(botPerson.repair!(state)).toBe(true);
    expect(botGoodFeat.repair!(state)).toBe(false);
    expect(botPersonFeat.repair!(state)).toBe(false);
  });

  it('repeats identical state, action log, and counters for both Keep variants', () => {
    for (const surveyed of [false, true]) for (const bot of [botGood, botPerson, botBeginner]) {
      const trace = () => JSON.stringify(runBot(createKeep(surveyed), bot));
      expect(trace()).toBe(trace());
    }
  });
});

it('maps both Old Keep approaches to the same gate point', () => {
  const state = createKeep();
  const gate = state.gate!;
  const west = distanceOnRoad(state.map, 'west', gate)!;
  expect(west).toBeLessThan(gate.distance);
  const position = enemyPosition(walker(0, 'west', west), state.map);
  expect(position.x).toBeCloseTo(gate.x, 10);
  expect(position.y).toBeCloseTo(gate.y, 10);
});
