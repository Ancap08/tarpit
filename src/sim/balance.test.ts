// Archetype rules and the balance pins that are not cells of the matrix.
// The matrix (every archetype on every map and level, exact) and every
// balance target (T, E, H, R labels) are in balance.suite.ts, run by
// balance-meadow.test.ts and its two siblings. This file keeps what the
// matrix does not say: how the archetypes are built (trail order, the plan
// actions bought, the specials they fire, the anti-air sells), the
// per-wave clear ticks and peaks on Meadow, and that a replay is the same
// game (the boss's death tick is in boss-verifier.test.ts). Runs come from balanceRuns.ts, cached, so each
// game is recorded once in this file.
import { describe, expect, it } from 'vitest';
import { archetypeScript, balanceRun, MATRIX_ARCHETYPES, playWithStats } from './balanceRuns';
import { comboWithoutSpecialRun } from './balanceTargets';
import { ENEMY_STATS } from './enemies';
import { buildableCells, cellCenter, cellKey } from './grid';
import {
  ARCHETYPES,
  comboBuildNoBows,
  ENDLESS_ARCHETYPES,
  FIRST_HARPY_WAVE,
  INFORMATIONAL,
  playScripted,
  TRAIL_CELL_ORDER,
  TRAIL_REACH,
  TRAIL_STEP,
  trailCellOrder,
} from './headless';
import { MAPS, pathLength, positionAlongPath } from './map';

const combo = () => archetypeScript('comboBuild', 'meadow', 'normal');

describe('every archetype (Meadow, Normal)', () => {
  it('the matrix covers every archetype, informational and endless script but endlessGreedy', () => {
    const all = [...Object.keys(ARCHETYPES), ...Object.keys(INFORMATIONAL), ...Object.keys(ENDLESS_ARCHETYPES)].filter((n) => n !== 'endlessGreedy');
    expect([...MATRIX_ARCHETYPES].sort()).toEqual(all.sort());
  });

  for (const name of MATRIX_ARCHETYPES) {
    it(`${name}: a replay with playScripted is the game the matrix counted, twice`, () => {
      const script = archetypeScript(name, 'meadow', 'normal');
      const a = playScripted(script);
      const b = playScripted(script);
      expect(a.log.filter((l) => 'result' in l && !l.result.ok)).toEqual([]);
      expect(['won', 'lost']).toContain(a.state.phase);
      expect(b.state).toEqual(a.state);
      expect(b.log).toEqual(a.log);
      const run = balanceRun(name, 'meadow', 'normal');
      expect({ phase: run.phase, wave: run.wave, lives: run.lives, gold: run.gold, tick: run.tick }).toEqual({
        phase: a.state.phase,
        wave: a.state.wave,
        lives: a.state.lives,
        gold: a.state.gold,
        tick: a.state.tick,
      });
      expect(run.waves.map((w) => [w.wave, w.lives, w.gold, w.ticks])).toEqual(a.waves.map((w) => [w.wave, w.lives, w.gold, w.ticks]));
    });
  }
});

describe('comboBuild on Meadow, Normal', () => {
  it('buys 29 of the 31 COMBO_PLAN actions (the tail is a gold sink)', () => {
    expect(combo().flat()).toHaveLength(29);
  });

  it('fires the 28 specials the policy recorded (milestone 30), every one accepted', () => {
    const script = combo();
    const recorded = script.timed!.flat();
    expect(recorded).toHaveLength(28);
    const run = playScripted(script);
    const fired = run.log.filter((l) => l.action === 'special');
    expect(fired).toHaveLength(28);
    for (const f of fired) expect(f).toMatchObject({ result: { ok: true } });
  });

  // The 25c wave rules on these numbers are R5 in balance.suite.ts; the exact ticks are pinned here.
  it('clear ticks and the most enemies alive per wave, no early calls (R5 exact)', () => {
    const run = balanceRun('comboBuild', 'meadow', 'normal');
    expect(run.waves.map((w) => w.ticks)).toEqual([3105, 2081, 1722, 2601, 4924, 3156, 5939, 5665, 2951, 6446]);
    expect(run.waves.map((w) => w.peak)).toEqual([2, 9, 17, 16, 18, 21, 16, 22, 15, 14]);
  });
});

describe('horde shape (milestone 25c)', () => {
  it('Goblin, Wolf and Harpy have less hp than before 25c (30, 28, 40)', () => {
    expect(ENEMY_STATS.goblin.hp).toBeLessThan(30);
    expect(ENEMY_STATS.wolf.hp).toBeLessThan(28);
    expect(ENEMY_STATS.harpy.hp).toBeLessThan(40);
  });
});

describe('anti-air (milestone 22)', () => {
  it('Harpies first come in wave 4', () => {
    expect(FIRST_HARPY_WAVE).toBe(4);
  });

  it('noAntiAir sells its Longbows before wave 4 and builds no Musketeer or Longbow after', () => {
    const script = archetypeScript('noAntiAir', 'meadow', 'normal');
    expect(script[3].filter((a) => a.type === 'sell').map((a) => a.cell)).toEqual([
      { col: 9, row: 5 },
      { col: 9, row: 4 },
      { col: 17, row: 8 },
    ]);
    for (const wave of script.slice(3)) {
      expect(wave.some((a) => a.type === 'build' && (a.tower === 'musketeer' || a.tower === 'longbow'))).toBe(false);
    }
  });

  it('comboBuild with the same cells keeps some wave 4 Harpies from exiting (the bows matter)', () => {
    const w4 = balanceRun('comboBuild', 'meadow', 'normal').waves[3];
    expect(w4.spawns.harpy).toBe(10);
    expect(w4.exits.harpy ?? 0).toBeLessThan(10);
  });

  it('why noAntiAir sells instead: dropping the bows from wave 1 loses on wave 1, before any Harpy', () => {
    // Milestone 30: on wave 2 before, when a stored keg helped on wave 1.
    const run = playScripted(comboBuildNoBows());
    expect(`${run.state.phase} on wave ${run.state.wave}, ${run.state.lives} lives, ${run.state.gold} gold`).toBe('lost on wave 1, 0 lives, 100 gold');
  });
});

describe('archetype rules', () => {
  it('the trail order takes, for each 96 px step along the path, the nearest free buildable cell within 72 px', () => {
    expect(TRAIL_STEP).toBe(96);
    expect(TRAIL_REACH).toBe(72);
    const keys = TRAIL_CELL_ORDER.map(cellKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const cell of TRAIL_CELL_ORDER) expect(buildableCells(MAPS.meadow)[cellKey(cell)]).toBe(true);
    // Every one of the 16 step points (96 .. 1536 on the 1584 px path) finds a cell.
    expect(Math.floor(pathLength(MAPS.meadow) / TRAIL_STEP)).toBe(16);
    expect(TRAIL_CELL_ORDER).toHaveLength(16);
    TRAIL_CELL_ORDER.forEach((cell, i) => {
      const p = positionAlongPath(MAPS.meadow, TRAIL_STEP * (i + 1));
      const c = cellCenter(cell);
      expect(Math.hypot(c.x - p.x, c.y - p.y), `cell ${i}`).toBeLessThanOrEqual(TRAIL_REACH);
    });
    expect(TRAIL_CELL_ORDER.slice(0, 6)).toEqual([
      { col: 2, row: 5 },
      { col: 6, row: 6 },
      { col: 3, row: 3 },
      { col: 7, row: 1 },
      { col: 10, row: 1 },
      { col: 14, row: 3 },
    ]);
  });

  it('oneMusket builds one base Musketeer on the first trail cell, on every map, and nothing else', () => {
    for (const map of ['meadow', 'switchback', 'riverbend'] as const) {
      const script = archetypeScript('oneMusket', map, 'normal');
      // Verifier (milestone 28): the other maps compared the cell with itself; compare with the map's own trail order.
      expect(script.flat(), map).toEqual([{ type: 'build', cell: trailCellOrder(MAPS[map])[0], tower: 'musketeer' }]);
      expect(script.mapId, map).toBe(map);
    }
  });

  it('lazyBuild only builds base Musketeers, in trail order', () => {
    const actions = archetypeScript('lazyBuild', 'meadow', 'normal').flat();
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.type === 'build' && a.tower === 'musketeer')).toBe(true);
    expect(actions.map((a) => a.cell)).toEqual(TRAIL_CELL_ORDER.slice(0, actions.length));
  });

  it('greedyMusket alternates buy and upgrade, Musketeers only, in trail order', () => {
    const actions = archetypeScript('greedyMusket', 'meadow', 'normal').flat();
    expect(actions.length).toBeGreaterThan(0);
    actions.forEach((a, i) => {
      if (i % 2 === 0) expect(a).toEqual({ type: 'build', cell: TRAIL_CELL_ORDER[i / 2], tower: 'musketeer' });
      else expect(a).toEqual({ type: 'upgrade', cell: TRAIL_CELL_ORDER[(i - 1) / 2] });
    });
  });
});

describe('boss (milestone 23)', () => {
  it('lazyBuild and longbowSpam are lost before wave 10 and never meet the boss', () => {
    for (const name of ['lazyBuild', 'longbowSpam'] as const) {
      const run = balanceRun(name, 'meadow', 'normal');
      expect(run.phase).toBe('lost');
      expect(run.wave).toBeLessThan(10);
      expect(run.waves.every((w) => !w.spawns.boss)).toBe(true);
    }
  });

  it('playWithStats counts the boss as an enemy of wave 10 (one spawn, no exit for the combo)', () => {
    const w10 = playWithStats(combo()).waves[9];
    expect(w10.spawns.boss).toBe(1);
    expect(w10.exits.boss).toBeUndefined();
  });
});

// Verifier (milestone 28). Findings and exact measures the matrix does not hold.
describe('verifier (milestone 28)', () => {
  const sum = (o: Partial<Record<string, number>>) => Object.values(o).reduce((a: number, b) => a + (b ?? 0), 0);

  // Was a BUG (balanceRuns.ts playWithStats): after a timed special it
  // counted every 'kill' event in state.events, the previous tick's
  // included, so hardBuild on Meadow, Normal reported 525 kills of 524
  // enemies. Fixed in the milestone 28 follow-up (only the events the
  // action appends are counted); this was an it.fails pin.
  it('playWithStats: kills plus exits equal the enemies spawned in a won game (hardBuild, Meadow, Normal)', () => {
    const run = balanceRun('hardBuild', 'meadow', 'normal');
    expect(run.phase).toBe('won');
    const spawned = run.waves.reduce((n, w) => n + sum(w.spawns), 0);
    const exits = run.waves.reduce((n, w) => n + sum(w.exits), 0);
    expect(spawned).toBe(524);
    expect(run.kills + exits).toBe(spawned);
  });

  // S2 is a band (strictly worse by lives, then kills); the measured values
  // (milestone 30): the combo on Meadow, Normal wins with 16 lives; with the
  // policy forbidden the keg 12, the Tar Barrel 13, the Fire Arrows 12.
  it('S2 measured: without the keg, the Tar Barrel or the Fire Arrows the combo wins with 12, 13 and 12 lives, with all three 16', () => {
    const combo = balanceRun('comboBuild', 'meadow', 'normal');
    expect([combo.phase, combo.lives]).toEqual(['won', 16]);
    for (const [type, lives] of [
      ['keg', 12],
      ['tarBarrel', 13],
      ['fireArrows', 12],
    ] as const) {
      const without = comboWithoutSpecialRun(type);
      expect([without.phase, without.lives], type).toEqual(['won', lives]);
      const spawned = without.waves.reduce((n, w) => n + sum(w.spawns), 0);
      expect(without.kills + without.waves.reduce((n, w) => n + sum(w.exits), 0)).toBe(spawned);
    }
  });

  // The targets assert bands; these are the exact measures behind T7, T8,
  // E3, H2 and T9, which the matrix cells (result and gold) do not hold.
  it('exact measures behind the bands: wave 1 leaks, wave 4 Harpies, lives after wave 1 on Hard, gold entering wave 10', () => {
    const maps = ['meadow', 'switchback', 'riverbend'] as const;
    const leak1 = (level: 'easy' | 'normal') => maps.map((m) => sum(balanceRun('oneMusket', m, level).waves[0].exits));
    expect([leak1('easy'), leak1('normal')]).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(maps.map((m) => balanceRun('noAntiAir', m, 'normal').waves[3]).map((w) => [w.exits.harpy, w.spawns.harpy, w.lives])).toEqual([
      [10, 10, 7],
      [9, 10, 8],
      [10, 10, 6],
    ]);
    expect(maps.map((m) => balanceRun('lazyBuild', m, 'hard').waves[0].lives)).toEqual([8, 6, 6]);
    expect(balanceRun('comboBuild', 'meadow', 'normal').waves[9].goldEntering).toBe(199);
  });

  it('comboNoSpecials has no timed actions on any map', () => {
    for (const map of ['meadow', 'switchback', 'riverbend'] as const) expect(archetypeScript('comboNoSpecials', map, 'normal').timed, map).toBeUndefined();
  });
});
