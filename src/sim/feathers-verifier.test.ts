// Verifier (milestone 49, Claude Sonnet): probes written apart from
// feathers.test.ts. They cover targeting, a kill shot, a burning runner,
// flyers and shields, stacks of path B pits, determinism, and the honest
// version of R6 (the ordinary bots with their Tar Pit upgrades forced to
// path B). Real-time limits assume a CI machine about four times slower.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower } from './actions';
import { BotPolicy, botFeathers, botGood, botPerson, runBot } from './bots';
import { levelStars } from './campaignProgress';
import { findTarget, fireTowers } from './combat';
import { ENEMY_STATS, isBoss, isTarred } from './enemies';
import { FEATHERS } from './feathers';
import { createGame, startWave, tick } from './game';
import { trailCellOrder } from './headless';
import { LEVELS } from './levels';
import { MAPS } from './map';
import type { Enemy, EnemyType, GameState, MapDef, TargetingMode } from './types';
import { waveDef } from './waves';

const LINE: MapDef = { id: 'line', width: 960, height: 480, path: [{ x: 0, y: 240 }, { x: 960, y: 240 }] };

function enemy(id: number, type: EnemyType, distance: number, hp = ENEMY_STATS[type].hp): Enemy {
  return { id, type, distance, hp, slow: 0, slowTicksLeft: 0 };
}

function arena(enemies: Enemy[], path: 'A' | 'B' = 'B', col = 6): GameState {
  const state = createGame({ map: LINE });
  const cell = { col, row: 5 };
  state.gold = 1000;
  expect(buildTower(state, cell, 'tarpit').ok).toBe(true);
  expect(upgradeTower(state, cell).ok).toBe(true);
  expect(upgradeTower(state, cell, path).ok).toBe(true);
  state.wave = 5;
  expect(startWave(state).ok).toBe(true);
  state.spawnedPerGroup = waveDef(6).groups.map((g) => g.count);
  state.enemies = enemies;
  return state;
}

function tar(e: Enemy): Enemy {
  e.slow = 0.5;
  e.slowTicksLeft = 600;
  return e;
}

describe('Feathers targeting', () => {
  // Distances 205..235 are all inside the tower at column 6 (range 145).
  const setup = (mode: TargetingMode) => {
    const featheredFront = Object.assign(tar(enemy(0, 'goblin', 235)), { feathered: true as const, runTicksLeft: 0 });
    const rear = tar(enemy(1, 'goblin', 205, 10));
    const middle = tar(enemy(2, 'troll', 220, 500));
    const state = arena([featheredFront, rear, middle]);
    state.towers[0].targeting = mode;
    return { state, featheredFront, rear, middle };
  };

  it.each([
    ['first', 2], ['last', 1], ['strongest', 2],
  ] as const)('with the %s setting it skips a feathered front enemy and picks unfeathered enemy %i', (mode, id) => {
    const { state } = setup(mode);
    expect(findTarget(state, state.towers[0])?.id).toBe(id);
  });

  it('an unfeathered enemy behind beats a feathered one in front, and path A ignores feathers', () => {
    const front = Object.assign(tar(enemy(0, 'goblin', 235)), { feathered: true as const, runTicksLeft: 0 });
    const behind = enemy(1, 'goblin', 205);
    expect(findTarget(arena([front, behind], 'B'), arena([front, behind], 'B').towers[0])?.id).toBe(1);
    const a = arena([front, behind], 'A');
    expect(findTarget(a, a.towers[0])?.id).toBe(0);
  });

  it('when everything in reach is feathered the tower still shoots the usual target', () => {
    const one = Object.assign(tar(enemy(0, 'goblin', 235)), { feathered: true as const, runTicksLeft: 0 });
    const two = Object.assign(tar(enemy(1, 'goblin', 205)), { feathered: true as const, runTicksLeft: 0 });
    const state = arena([one, two]);
    expect(findTarget(state, state.towers[0])?.id).toBe(0);
  });

  it('a flying Royal Harpy is never a target, so Feathers cannot reach one', () => {
    const harpy = tar(enemy(0, 'harpy', 220));
    const state = arena([harpy]);
    expect(findTarget(state, state.towers[0])).toBeUndefined();
    fireTowers(state);
    expect(harpy.feathered).toBeUndefined();
    expect(state.events.some((e) => e.kind === 'feathered')).toBe(false);
  });
});

describe('Feathers shots', () => {
  it('a Redcoat shield halves the shot but the shot still tars, then feathers', () => {
    const redcoat = enemy(0, 'shieldbearer', 220);
    const state = arena([redcoat]);
    fireTowers(state);
    expect(isTarred(redcoat)).toBe(true);
    expect(redcoat.hp).toBeCloseTo(ENEMY_STATS.shieldbearer.hp - 1.5, 9);
    expect(redcoat.feathered).toBeUndefined();
    state.towers[0].cooldownTicks = 0;
    fireTowers(state);
    expect(redcoat.feathered).toBe(true);
  });

  it('a shot that kills a tarred enemy neither slows nor feathers it', () => {
    const doomed = tar(enemy(0, 'goblin', 220, 2));
    const state = arena([doomed]);
    fireTowers(state);
    expect(state.enemies).toHaveLength(0);
    expect(state.events.some((e) => e.kind === 'feathered')).toBe(false);
    expect(doomed.feathered).toBeUndefined();
  });

  it('a burning runner that dies mid-run pays once, counts once and sets nothing else running', () => {
    const runner = tar(enemy(0, 'troll', 300));
    runner.burnDps = 30;
    runner.burnTicksLeft = 600;
    const bystander = enemy(1, 'goblin', 280);
    const state = arena([runner, bystander]);
    state.spawnedPerGroup = waveDef(6).groups.map((g) => g.count);
    fireTowers(state);
    expect(runner.feathered).toBe(true);
    runner.hp = 20; // Burn alone finishes it a few ticks into the run.
    const gold = state.gold;
    const kills: number[] = [];
    const feathered: number[] = [];
    for (let i = 0; i < 40 && state.enemies.includes(runner); i++) {
      state.towers.length = 0;
      tick(state);
      for (const e of state.events) {
        if (e.kind === 'kill') kills.push(e.enemyId);
        if (e.kind === 'feathered') feathered.push(e.enemyId);
      }
    }
    expect(state.enemies.includes(runner)).toBe(false);
    expect(kills).toEqual([0]);
    expect(feathered).toEqual([]);
    expect(state.gold - gold).toBe(ENEMY_STATS.troll.bounty);
    for (let i = 0; i < 200 && (state.phase as GameState['phase']) === 'wave'; i++) tick(state);
    expect(state.enemies.find((e) => e.id === 0)).toBeUndefined();
  });
});

/** Watch every tick of a bot's game for the milestone's invariants without changing what it does. */
function watched(bot: BotPolicy, seen: { feathered: Map<number, number>; problems: string[] }): BotPolicy {
  return {
    ...bot,
    special(state, lastZone) {
      for (const event of state.events) {
        if (event.kind === 'feathered') seen.feathered.set(event.enemyId, (seen.feathered.get(event.enemyId) ?? 0) + 1);
      }
      for (const e of state.enemies) {
        const where = `tick ${state.tick} enemy ${e.id} ${e.type}`;
        if (e.distance < 0) seen.problems.push(`${where} negative distance`);
        if (isBoss(e) && (e.feathered || e.runTicksLeft !== undefined || e.flinchTicksLeft !== undefined)) seen.problems.push(`${where} boss marked`);
        if ((e.runTicksLeft ?? 0) > FEATHERS.runTicks || (e.flinchTicksLeft ?? 0) > FEATHERS.flinchTicks) seen.problems.push(`${where} timer too long`);
        if (e.feathered === undefined && e.runTicksLeft !== undefined) seen.problems.push(`${where} runs unfeathered`);
        if (e.distance === 0 && (e.runTicksLeft ?? 0) > 0 && e.flinchTicksLeft === undefined) seen.problems.push(`${where} waits at the entrance with time left`);
      }
      return bot.special(state, lastZone);
    },
  };
}

function forcePathB(bot: BotPolicy): BotPolicy {
  return {
    ...bot,
    purchase(state) {
      const action = bot.purchase(state);
      if (action?.type === 'upgrade' && action.path
        && state.towers.some((t) => t.type === 'tarpit' && t.cell.col === action.cell.col && t.cell.row === action.cell.row)) {
        return { ...action, path: 'B' };
      }
      return action;
    },
  };
}

describe('many path B pits', () => {
  it('a long row of pits feathers each enemy at most once and cannot stall a wave', () => {
    const state = createGame({ map: 'meadow' });
    state.gold = 100_000;
    state.lives = 1000;
    const cells = trailCellOrder(MAPS.meadow).slice(0, 14);
    for (const cell of cells) {
      expect(buildTower(state, cell, 'tarpit').ok).toBe(true);
      expect(upgradeTower(state, cell).ok).toBe(true);
      expect(upgradeTower(state, cell, 'B').ok).toBe(true);
    }
    const feathered = new Map<number, number>();
    for (let wave = 0; wave < 4 && state.phase === 'setup'; wave++) {
      expect(startWave(state).ok).toBe(true);
      let ticks = 0;
      while ((state.phase as GameState['phase']) === 'wave') {
        tick(state);
        ticks++;
        for (const e of state.events) if (e.kind === 'feathered') feathered.set(e.enemyId, (feathered.get(e.enemyId) ?? 0) + 1);
        expect(ticks, `wave ${wave + 1} is still running`).toBeLessThan(60 * 600);
      }
    }
    expect(feathered.size).toBeGreaterThan(20);
    expect([...feathered.values()].every((n) => n === 1)).toBe(true);
    expect(state.phase === 'setup' || state.phase === 'won' || state.phase === 'lost').toBe(true);
  }, 60_000);
});

describe('determinism', () => {
  it('the feather bot plays the same bytes twice', () => {
    const hash = () => createHash('sha256').update(JSON.stringify(runBot(createGame({ level: LEVELS[8] }), botFeathers))).digest('hex');
    expect(hash()).toBe(hash());
  }, 60_000);
});

describe('R6, the honest version: the ordinary bots with every Tar Pit upgrade forced to path B', () => {
  const campaign = LEVELS.map((level) => {
    const run = (bot: BotPolicy) => {
      const seen = { feathered: new Map<number, number>(), problems: [] as string[] };
      const { state } = runBot(createGame({ level }), watched(bot, seen), Infinity, 2 * 60 * 60 * 3600);
      return { lives: Math.max(0, state.lives), stars: levelStars(state), phase: state.phase, seen };
    };
    return { id: level.id, good: run(botGood), goodB: run(forcePathB(botGood)), person: run(botPerson), personB: run(forcePathB(botPerson)), feathers: run(botFeathers) };
  });

  it('every game finishes and obeys the invariants', () => {
    for (const row of campaign) {
      for (const key of ['good', 'goodB', 'person', 'personB', 'feathers'] as const) {
        const { seen, phase } = row[key];
        expect(['won', 'lost'], `level ${row.id} ${key}`).toContain(phase);
        expect(seen.problems.slice(0, 3), `level ${row.id} ${key}`).toEqual([]);
        expect([...seen.feathered.values()].every((n) => n === 1), `level ${row.id} ${key} feathered an enemy twice`).toBe(true);
      }
    }
  }, 240_000);

  it('Good with path B gains no life and no star on any level', () => {
    for (const row of campaign) {
      expect(row.goodB.lives - row.good.lives, `level ${row.id}`).toBeLessThanOrEqual(0);
      expect(row.goodB.stars, `level ${row.id}`).toBeLessThanOrEqual(row.good.stars);
    }
  });

  it('Person with path B gains no star on any level', () => {
    for (const row of campaign) expect(row.personB.stars, `level ${row.id}`).toBeLessThanOrEqual(row.person.stars);
  });

  // Known gap in the shipped R6 guard: the gate only runs the feather bot, which loses outright on
  // levels 7, 10, 11, 19 and 20. Person bought with path B on level 16 finishes four lives above
  // Good. This pins that number so a larger lead is noticed. It is not a claim that four is fine.
  it('Person with path B stays within four lives of Good', () => {
    const leads = campaign.map((row) => ({ id: row.id, lead: row.personB.lives - row.good.lives }));
    expect(Math.max(...leads.map((l) => l.lead)), JSON.stringify(leads)).toBeLessThanOrEqual(4);
  });
});
