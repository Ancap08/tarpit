// Archetype rules and the balance pins that are not cells of the matrix.
// The matrix (every archetype on every map and level, exact) and every
// balance target (T, E, H, R labels) are in balance.suite.ts, run by
// balance-meadow.test.ts and its two siblings. This file keeps what the
// matrix does not say: how the archetypes are built (trail order, the plan
// actions bought, the special list they fire, the anti-air sells), the
// per-wave clear ticks and peaks on Meadow, and that a replay is the same
// game (the boss's death tick is in boss-verifier.test.ts). Runs come from balanceRuns.ts, cached, so each
// game is recorded once in this file.
import { describe, expect, it } from 'vitest';
import { archetypeScript, balanceRun, MATRIX_ARCHETYPES, playWithStats } from './balanceRuns';
import { ENEMY_STATS } from './enemies';
import { buildableCells, cellCenter, cellKey } from './grid';
import {
  ARCHETYPES,
  comboBuildNoBows,
  ENDLESS_ARCHETYPES,
  FIRST_HARPY_WAVE,
  INFORMATIONAL,
  playScripted,
  specialPolicy,
  TRAIL_CELL_ORDER,
  TRAIL_REACH,
  TRAIL_STEP,
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
  it('buys 28 of the 31 COMBO_PLAN actions (the tail is a gold sink)', () => {
    expect(combo().flat()).toHaveLength(28);
  });

  it("fires the stored special list (specialPolicy('combo')), every special accepted", () => {
    const script = combo();
    expect(script.timed).toEqual(specialPolicy('combo'));
    const run = playScripted(script);
    const fired = run.log.filter((l) => l.action === 'special');
    expect(fired).toHaveLength(specialPolicy('combo').filter((w) => w.length > 0).length);
    for (const f of fired) expect(f).toMatchObject({ result: { ok: true } });
  });

  // The 25c wave rules on these numbers are R5 in balance.suite.ts; the exact ticks are pinned here.
  it('clear ticks and the most enemies alive per wave, no early calls (R5 exact)', () => {
    const run = balanceRun('comboBuild', 'meadow', 'normal');
    expect(run.waves.map((w) => w.ticks)).toEqual([2941, 2185, 1732, 2368, 4385, 3058, 5819, 5617, 2748, 6259]);
    expect(run.waves.map((w) => w.peak)).toEqual([2, 12, 17, 16, 18, 19, 18, 22, 14, 16]);
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

  it('why noAntiAir sells instead: dropping the bows from wave 1 loses on wave 2, before any Harpy', () => {
    const run = playScripted(comboBuildNoBows());
    expect(`${run.state.phase} on wave ${run.state.wave}, ${run.state.lives} lives, ${run.state.gold} gold`).toBe('lost on wave 2, 0 lives, 71 gold');
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
      expect(script.flat(), map).toEqual([{ type: 'build', cell: map === 'meadow' ? TRAIL_CELL_ORDER[0] : script[0][0].cell, tower: 'musketeer' }]);
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
