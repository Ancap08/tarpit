// Verifier (Claude Sonnet) for milestone 52b: gaps found after reading the
// implementer's tests. Real-time runs carry explicit limits for a slow CI.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildTower, useSpecial } from './actions';
import { botGood, botPerson, runBot, type BotPolicy } from './bots';
import { levelStars, parseProgress, serializeProgress, unlockedLevel, type CampaignProgress } from './campaignProgress';
import { enemyPosition } from './combat';
import { ENEMY_STATS, isBoss } from './enemies';
import { createGame, startWave, tick } from './game';
import { isBuildable } from './grid';
import { KEEP_LEVELS } from './keepLevels';
import { LEVELS } from './levels';
import { pathLength } from './map';
import { roadLength } from './roads';
import { payQuartering, shakeWindow, windowTargets } from './siege';
import type { Enemy, EnemyType, GameState } from './types';

const [rent, beds, roads, quartering] = KEEP_LEVELS;
const walker = (id: number, road: string, distance: number, type: EnemyType = 'goblin'): Enemy =>
  ({ id, road, type, distance, hp: ENEMY_STATS[type].hp, slow: 0, slowTicksLeft: 0 });

/** A level in mid-wave with only the enemies given, and nothing left to spawn. */
function inWave(level: (typeof KEEP_LEVELS)[number], enemies: Enemy[]): GameState {
  const state = createGame({ level });
  startWave(state);
  state.enemies = enemies;
  state.spawnedPerGroup = level.waves[0].groups.map(group => group.count);
  state.nextEnemyId = 100;
  return state;
}

describe('pillow windows and the feather barrel on one crowd (Feather Beds)', () => {
  it('a window then a barrel feathers each enemy once and keeps the run it was given', () => {
    const state = inWave(beds, [walker(1, 'west', 580), walker(2, 'west', 600)]);
    expect(shakeWindow(state, 0)).toEqual({ ok: true, hits: 2 });
    for (const enemy of state.enemies) enemy.runTicksLeft = 40;
    const { x, y } = enemyPosition(state.enemies[0], state.map);
    expect(useSpecial(state, 'tarBarrel', { x, y })).toMatchObject({ ok: true });
    expect(state.enemies.map(enemy => enemy.runTicksLeft)).toEqual([40, 40]);
    expect(state.events.filter(event => event.kind === 'feathered')).toHaveLength(2);
  });

  it('a barrel then a window leaves nothing for the window, which is still spent', () => {
    const state = inWave(beds, [walker(1, 'west', 580), walker(2, 'west', 600)]);
    const { x, y } = enemyPosition(state.enemies[0], state.map);
    expect(useSpecial(state, 'tarBarrel', { x, y })).toMatchObject({ ok: true, hits: 2 });
    expect(windowTargets(state, 0)).toEqual([]);
    expect(shakeWindow(state, 0)).toEqual({ ok: true, hits: 0 });
    expect(state.windows![0].used).toBe(true);
    expect(shakeWindow(state, 0)).toEqual({ ok: false, reason: 'spent-window' });
  });

  it('feathers a flyer on its stretch exactly as a barrel does, and never the King', () => {
    const state = inWave(beds, [walker(1, 'west', 590, 'harpy'), walker(2, 'west', 590, 'grumblemaw'), walker(3, 'west', 590, 'boss')]);
    expect(shakeWindow(state, 0)).toEqual({ ok: true, hits: 1 });
    expect(state.enemies.map(enemy => enemy.feathered === true)).toEqual([true, false, false]);
    const barrel = inWave(beds, [walker(1, 'west', 590, 'harpy')]);
    expect(useSpecial(barrel, 'tarBarrel', enemyPosition(barrel.enemies[0], barrel.map))).toMatchObject({ ok: true });
    expect(barrel.enemies[0].feathered).toBe(true);
  });

  it('does nothing in setup, between waves, or for enemies not yet on the road', () => {
    const state = createGame({ level: beds });
    expect(shakeWindow(state, 0)).toEqual({ ok: false, reason: 'not-in-wave' });
    expect(shakeWindow(state, 5)).toEqual({ ok: false, reason: 'not-in-wave' });
    startWave(state);
    expect(shakeWindow(state, 5)).toEqual({ ok: false, reason: 'no-window' });
    expect(shakeWindow(state, 0)).toEqual({ ok: true, hits: 0 });
    expect(state.windows!.map(window => window.used)).toEqual([true, false]);
  });
});

describe('the Quartering pay-off and the Royal Survey on the real levels', () => {
  const site = { col: 22, row: 10 };

  it('Quartering takes exactly its price: one gold short is refused, the price itself is accepted', () => {
    const state = createGame({ level: quartering });
    expect(isBuildable(state, site)).toBe(false);
    state.gold = 79;
    expect(payQuartering(state)).toEqual({ ok: false, reason: 'not-enough-gold' });
    expect([state.gold, state.wallSiteTax?.kind]).toEqual([79, 'quartering']);
    state.gold = 80;
    expect(payQuartering(state)).toEqual({ ok: true, cost: 80, gold: 0 });
    expect(isBuildable(state, site)).toBe(true);
    expect(state.wallSiteTax).toBeUndefined();
    state.gold = 500;
    expect(payQuartering(state)).toEqual({ ok: false, reason: 'no-quartering' });
    expect(state.gold).toBe(500);
    expect(buildTower(state, site, 'musketeer').ok).toBe(true);
    // The level definition is untouched, so a second game starts quartered again.
    expect(quartering.wallSiteTax).toMatchObject({ kind: 'quartering', price: 80 });
    expect(isBuildable(createGame({ level: quartering }), site)).toBe(false);
  });

  it('Quartering cannot be paid in a wave', () => {
    const state = createGame({ level: quartering });
    state.gold = 500;
    startWave(state);
    expect(payQuartering(state)).toEqual({ ok: false, reason: 'not-in-setup' });
    expect(state.gold).toBe(500);
  });

  it('the Royal Survey closes both of its sites for every tower, however rich the player is', () => {
    const state = createGame({ level: roads });
    state.gold = 5000;
    const tax = roads.wallSiteTax;
    expect(tax?.kind).toBe('royalSurvey');
    for (const closed of tax!.kind === 'royalSurvey' ? tax!.sites : []) {
      expect(isBuildable(state, closed)).toBe(false);
      for (const tower of ['musketeer', 'longbow', 'cannon', 'mortar'] as const) {
        expect(buildTower(state, closed, tower)).toEqual({ ok: false, reason: 'not-buildable' });
      }
    }
    expect(payQuartering(state)).toEqual({ ok: false, reason: 'no-quartering' });
    expect(state.gold).toBe(5000);
  });
});

describe('a feathered enemy running back over the real join', () => {
  it('moves smoothly from the shared stretch onto its own approach', () => {
    const state = inWave(roads, []);
    const east = state.map;
    const eastJoin = pathLength({ ...east, path: east.path.slice(0, east.otherRoads![0].joinIndex + 1) });
    const westLocalJoin = roadLength(east, 'west') - (pathLength(east) - eastJoin);
    const runner = walker(1, 'west', westLocalJoin + 6);
    runner.slowTicksLeft = 10;
    state.enemies = [runner];
    state.nextEnemyId = 2;
    tick(state);
    runner.feathered = true;
    runner.runTicksLeft = 40;
    let previous = enemyPosition(runner, state.map);
    const start = runner.distance;
    for (let i = 0; i < 30; i++) {
      tick(state);
      const here = enemyPosition(runner, state.map);
      expect(Math.hypot(here.x - previous.x, here.y - previous.y)).toBeLessThanOrEqual(ENEMY_STATS.goblin.speed / 60 + 1e-6);
      previous = here;
    }
    expect(runner.road).toBe('west');
    expect(runner.distance).toBeLessThan(westLocalJoin);
    expect(runner.distance).toBeCloseTo(start - 31 + 1, 0);
  });
});

describe('the ram, the King and the other rules', () => {
  it('a ram is not a boss, and a window feathers it while the King is skipped', () => {
    expect(isBoss({ type: 'ram' })).toBe(false);
    expect(isBoss({ type: 'grumblemaw' })).toBe(true);
    const state = inWave(KEEP_LEVELS[4], [walker(1, 'west', 200, 'ram'), walker(2, 'west', 200, 'grumblemaw')]);
    expect(windowTargets(state, 0).map(enemy => enemy.id)).toEqual([1]);
  });

  it('Act Three never reaches the saved campaign or the next-level rule', () => {
    expect(LEVELS).toHaveLength(20);
    expect(LEVELS.map(level => level.map as string)).not.toContain('keep');
    expect(KEEP_LEVELS.map(level => level.id)).toEqual([21, 22, 23, 24, 25]);
    const everything: CampaignProgress = Object.fromEntries(LEVELS.map(level => [level.id, 3]));
    for (const level of KEEP_LEVELS) expect(unlockedLevel(everything, level.id)).toBe(false);
    expect(parseProgress(serializeProgress(everything))).toEqual(everything);
    expect(levelStars({ ...createGame({ level: rent }), phase: 'won', lives: 20 })).toBe(3);
  });
});

/** Every level and bot repeats exactly, and a bot that does nothing still ends the level. */
describe('Act Three runs end and repeat', () => {
  const digest = (state: GameState) =>
    createHash('sha256').update(JSON.stringify({ ...state, level: undefined, map: undefined })).digest('hex');
  const idle: BotPolicy = { purchase: () => undefined, reward: () => undefined, special: () => undefined };

  it.each(KEEP_LEVELS.map(level => [level.id, level] as const))('level %i repeats for Good and Person', (_, level) => {
    for (const bot of [botGood, botPerson]) {
      const first = runBot(createGame({ level }), bot);
      const second = runBot(createGame({ level }), bot);
      expect(digest(second.state)).toBe(digest(first.state));
      expect(JSON.stringify(second.log)).toBe(JSON.stringify(first.log));
      expect(first.refused).toBe(0);
    }
  }, 180_000);

  it.each(KEEP_LEVELS.map(level => [level.id, level] as const))('level %i ends with no defence and no action', (_, level) => {
    const run = runBot(createGame({ level }), idle);
    expect(['won', 'lost']).toContain(run.state.phase);
    expect(run.state.tick).toBeLessThan(18 * 60 * 60);
  }, 120_000);
});
