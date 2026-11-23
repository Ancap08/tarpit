// The balance suite (milestone 28): the full archetype matrix (archetype by
// map by level) pinned as exact results, and every balance target from
// docs/DESIGN.md "Balance targets" as a band, labelled N, E, H, R or X in the
// test name. One module; balance-meadow.test.ts, balance-switchback.test.ts
// and balance-riverbend.test.ts each run it for one map so the whole-game
// runs spread over three test workers. Every game is played once per file
// (balanceRuns.ts caches recorded scripts and runs).
//
// When a game number changes, rerun `npm run sim` (its last table is this
// matrix) and update EXPECTED_MATRIX with a DECISIONS.md entry.

import { describe, expect, it } from 'vitest';
import { archetypeScript, balanceRun, matrixCell, MATRIX_ARCHETYPES, runsOn, type MatrixArchetype } from './balanceRuns';
import { boonBalancePicks, boonBalanceRun, TARGETS } from './balanceTargets';
import type { Difficulty } from './difficulty';
import type { MapId } from './map';
import { playScripted } from './headless';

export type MatrixColumn = `${MapId} ${Difficulty}`;

/** Every cell: "W lives" or "L wave", then the gold at the end. */
export const EXPECTED_MATRIX: Readonly<Record<MatrixArchetype, Readonly<Partial<Record<MatrixColumn, string>>>>> = {
  noTowers: {
    'meadow easy': 'L 2, 175 gold',
    'meadow normal': 'L 1, 100 gold',
    'meadow hard': 'L 1, 80 gold',
    'switchback easy': 'L 2, 175 gold',
    'switchback normal': 'L 1, 100 gold',
    'switchback hard': 'L 1, 80 gold',
    'riverbend easy': 'L 2, 175 gold',
    'riverbend normal': 'L 1, 100 gold',
    'riverbend hard': 'L 1, 80 gold',
  },
  oneMusket: {
    'meadow easy': 'L 3, 202 gold',
    'meadow normal': 'L 2, 121 gold',
    'meadow hard': 'L 2, 85 gold',
    'switchback easy': 'L 3, 196 gold',
    'switchback normal': 'L 2, 117 gold',
    'switchback hard': 'L 2, 79 gold',
    'riverbend easy': 'L 3, 196 gold',
    'riverbend normal': 'L 2, 117 gold',
    'riverbend hard': 'L 2, 79 gold',
  },
  lazyBuild: {
    'meadow easy': 'W 33, 577 gold',
    'meadow normal': 'L 8, 269 gold',
    'meadow hard': 'L 2, 43 gold',
    'switchback easy': 'W 37, 709 gold',
    'switchback normal': 'L 8, 241 gold',
    'switchback hard': 'L 2, 35 gold',
    'riverbend easy': 'W 31, 261 gold',
    'riverbend normal': 'L 8, 271 gold',
    'riverbend hard': 'L 2, 35 gold',
  },
  greedyMusket: {
    'meadow easy': 'L 18, 2419 gold',
    'meadow normal': 'L 8, 225 gold',
    'meadow hard': 'L 2, 54 gold',
    'switchback easy': 'W 22, 3009 gold',
    'switchback normal': 'L 12, 655 gold',
    'switchback hard': 'L 2, 48 gold',
    'riverbend easy': 'L 18, 2403 gold',
    'riverbend normal': 'L 8, 246 gold',
    'riverbend hard': 'L 2, 48 gold',
  },
  longbowSpam: {
    'meadow easy': 'L 10, 963 gold',
    'meadow normal': 'L 8, 525 gold',
    'meadow hard': 'L 7, 260 gold',
    'switchback easy': 'L 15, 2021 gold',
    'switchback normal': 'L 8, 495 gold',
    'switchback hard': 'L 8, 408 gold',
    'riverbend easy': 'L 10, 963 gold',
    'riverbend normal': 'L 8, 509 gold',
    'riverbend hard': 'L 7, 260 gold',
  },
  noAntiAir: {
    'meadow easy': 'L 8, 254 gold',
    'meadow normal': 'L 5, 191 gold',
    'meadow hard': 'L 5, 119 gold',
    'switchback easy': 'L 8, 538 gold',
    'switchback normal': 'L 5, 148 gold',
    'switchback hard': 'L 5, 128 gold',
    'riverbend easy': 'L 7, 363 gold',
    'riverbend normal': 'L 5, 92 gold',
    'riverbend hard': 'L 5, 126 gold',
  },
  comboBuild: {
    'meadow easy': 'W 39, 265 gold',
    'meadow normal': 'W 14, 250 gold',
    'meadow hard': 'W 3, 257 gold',
    'switchback easy': 'W 39, 275 gold',
    'switchback normal': 'W 11, 251 gold',
    'switchback hard': 'L 19, 1625 gold',
    'riverbend easy': 'W 39, 275 gold',
    'riverbend normal': 'W 14, 255 gold',
    'riverbend hard': 'W 1, 293 gold',
  },
  wideBuild: {
    'meadow easy': 'W 39, 265 gold',
    'meadow normal': 'W 13, 272 gold',
    'meadow hard': 'W 1, 271 gold',
    'switchback easy': 'W 39, 275 gold',
    'switchback normal': 'W 15, 253 gold',
    'switchback hard': 'L 19, 1687 gold',
    'riverbend easy': 'W 39, 255 gold',
    'riverbend normal': 'W 10, 293 gold',
    'riverbend hard': 'L 15, 269 gold',
  },
  comboBuildNoFire: {
    'meadow easy': 'W 38, 567 gold',
    'meadow normal': 'W 13, 552 gold',
    'meadow hard': 'L 8, 443 gold',
    'switchback easy': 'W 39, 515 gold',
    'switchback normal': 'W 11, 491 gold',
    'switchback hard': 'L 10, 993 gold',
    'riverbend easy': 'W 37, 569 gold',
    'riverbend normal': 'W 12, 549 gold',
    'riverbend hard': 'L 7, 263 gold',
  },
  comboNoSpecials: {
    'meadow easy': 'W 39, 265 gold',
    'meadow normal': 'W 8, 277 gold',
    'meadow hard': 'L 7, 130 gold',
    'switchback easy': 'W 39, 275 gold',
    'switchback normal': 'L 18, 989 gold',
    'switchback hard': 'L 9, 580 gold',
    'riverbend easy': 'W 38, 267 gold',
    'riverbend normal': 'W 3, 277 gold',
    'riverbend hard': 'L 3, 90 gold',
  },
  hardBuild: {
    'meadow easy': 'W 39, 255 gold',
    'meadow normal': 'W 20, 263 gold',
    'meadow hard': 'W 9, 265 gold',
    'switchback easy': 'W 39, 275 gold',
    'switchback normal': 'W 21, 271 gold',
    'switchback hard': 'W 15, 273 gold',
    'riverbend easy': 'W 39, 245 gold',
    'riverbend normal': 'W 21, 271 gold',
    'riverbend hard': 'W 8, 277 gold',
  },
  artilleryBuild: {
    'meadow easy': 'W 39, 345 gold',
    'meadow normal': 'W 20, 263 gold',
    'meadow hard': 'W 7, 264 gold',
    'switchback easy': 'W 39, 345 gold',
    'switchback normal': 'W 24, 295 gold',
    'switchback hard': 'W 14, 315 gold',
    'riverbend easy': 'W 39, 345 gold',
    'riverbend normal': 'W 6, 341 gold',
    'riverbend hard': 'L 10, 301 gold',
  },
  burnBuild: {
    'meadow easy': 'W 39, 275 gold',
    'meadow normal': 'W 15, 273 gold',
    'meadow hard': 'W 4, 260 gold',
    'switchback easy': 'W 39, 275 gold',
    'switchback normal': 'W 24, 275 gold',
    'switchback hard': 'W 14, 285 gold',
    'riverbend easy': 'W 39, 275 gold',
    'riverbend normal': 'W 9, 275 gold',
    'riverbend hard': 'L 15, 485 gold',
  },
  musketBuild: {
    'meadow easy': 'W 39, 270 gold',
    'meadow normal': 'L 19, 1205 gold',
    'meadow hard': 'L 16, 709 gold',
    'switchback easy': 'W 39, 270 gold',
    'switchback normal': 'W 24, 270 gold',
    'switchback hard': 'W 14, 245 gold',
    'riverbend easy': 'W 39, 270 gold',
    'riverbend normal': 'L 18, 1135 gold',
    'riverbend hard': 'L 15, 607 gold',
  },
  endlessIdle: {
    'meadow easy': 'L 37, 4617 gold',
    'meadow normal': 'L 25, 1547 gold',
    'meadow hard': 'L 24, 1292 gold',
    'switchback easy': 'L 36, 4405 gold',
    'switchback normal': 'L 24, 1254 gold',
    'switchback hard': 'L 19, 1625 gold',
    'riverbend easy': 'L 36, 4427 gold',
    'riverbend normal': 'L 25, 1577 gold',
    'riverbend hard': 'L 24, 1344 gold',
  },
  endlessGreedy: {
    'meadow easy': 'L 40, 126 gold',
    'meadow normal': 'L 28, 286 gold',
    'meadow hard': 'L 27, 298 gold',
    'switchback easy': 'L 40, 175 gold',
    'switchback normal': 'L 27, 283 gold',
    'switchback hard': 'L 19, 1625 gold',
    'riverbend easy': 'L 38, 103 gold',
    'riverbend normal': 'L 27, 274 gold',
    'riverbend hard': 'L 27, 211 gold',
  },
  soundBuild: {
    'meadow easy': 'L 15, 1742 gold',
    'meadow normal': 'L 7, 140 gold',
    'meadow hard': 'L 2, 45 gold',
  },
  soundBuildNoTar: {
    'meadow easy': 'L 10, 762 gold',
    'meadow normal': 'L 7, 217 gold',
    'meadow hard': 'L 2, 45 gold',
  },
  comboStrongest: {
    'meadow easy': 'W 14, 2909 gold',
    'meadow normal': 'L 5, 97 gold',
    'meadow hard': 'L 3, 76 gold',
  },
};


const LEVELS: readonly Difficulty[] = ['easy', 'normal', 'hard'];


/** The matrix and the targets for one map; the rules over the tables go with Meadow. */
export function describeBalance(map: MapId): void {
  describe(`balance matrix on ${map} (exact results)`, () => {
    for (const name of MATRIX_ARCHETYPES) {
      if (!runsOn(name, map)) continue;
      for (const level of LEVELS) {
        const expected = EXPECTED_MATRIX[name][`${map} ${level}`];
        it(`${name} on ${level}: ${expected}`, () => {
          const run = balanceRun(name, map, level);
          expect(`${matrixCell(run)}, ${run.gold} gold`).toBe(expected);
          expect(run.refused, 'refused actions').toBe(0);
          // The counter itself (milestone 28 follow-up): kills, and kills
          // plus exits, never exceed the enemies spawned.
          const spawned = run.waves.reduce((n, w) => n + Object.values(w.spawns).reduce((a, b) => a + (b ?? 0), 0), 0);
          const exits = run.waves.reduce((n, w) => n + Object.values(w.exits).reduce((a, b) => a + (b ?? 0), 0), 0);
          expect(run.kills, 'kills against spawned').toBeLessThanOrEqual(spawned);
          expect(run.kills + exits, 'kills + exits against spawned').toBeLessThanOrEqual(spawned);
        });
      }
    }
  });

  if (map === 'meadow') {
    it('records and replays named boon picks through an ordinary purchasing archetype', () => {
      const defaults = archetypeScript('lazyBuild', map, 'easy');
      const named = archetypeScript('lazyBuild', map, 'easy', { 5: 'warChest', 10: 'quickHands', 15: 'veteranCrews' });
      expect(named[5].length).toBeGreaterThan(defaults[5].length);
      const run = playScripted(named, undefined, 'easy');
      expect(run.state.boons).toEqual(['warChest', 'quickHands', 'veteranCrews']);
      expect(run.log.filter((step) => 'result' in step && !step.result.ok)).toEqual([]);
    });
  }

  describe(`all 27 reward combinations on ${map}`, () => {
    for (const picks of boonBalancePicks()) {
      it(`S7: combo wins with ${picks.join(' / ')}`, () => {
        const run = boonBalanceRun(map, picks);
        expect(run.phase).toBe('won');
        expect(run.refused).toBe(0);
      });
    }
  });

  describe(`balance targets on ${map}`, () => {
    for (const target of TARGETS) {
      const mine = map === 'meadow' ? target.map === undefined || target.map === 'meadow' : target.map === map;
      if (!mine) continue;
      it(`${target.id}: ${target.label}`, () => {
        const result = target.check();
        expect(result.ok, result.info).toBe(true);
      });
    }
  });
}
