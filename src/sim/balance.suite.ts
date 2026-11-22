// The balance suite (milestone 28): the full archetype matrix (archetype by
// map by level) pinned as exact results, and every balance target from
// docs/DESIGN.md "Balance targets" as a band, labelled T, E, H or R in the
// test name. One module; balance-meadow.test.ts, balance-switchback.test.ts
// and balance-riverbend.test.ts each run it for one map so the whole-game
// runs spread over three test workers. Every game is played once per file
// (balanceRuns.ts caches recorded scripts and runs).
//
// When a game number changes, rerun `npm run sim` (its last table is this
// matrix) and update EXPECTED_MATRIX with a DECISIONS.md entry.

import { describe, expect, it } from 'vitest';
import { balanceRun, matrixCell, MATRIX_ARCHETYPES, runsOn, type MatrixArchetype } from './balanceRuns';
import { TARGETS } from './balanceTargets';
import type { Difficulty } from './difficulty';
import type { MapId } from './map';

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
    'meadow easy': 'W 10, 932 gold',
    'meadow normal': 'L 8, 355 gold',
    'meadow hard': 'L 2, 43 gold',
    'switchback easy': 'W 20, 912 gold',
    'switchback normal': 'L 8, 291 gold',
    'switchback hard': 'L 2, 35 gold',
    'riverbend easy': 'W 9, 924 gold',
    'riverbend normal': 'L 8, 353 gold',
    'riverbend hard': 'L 2, 35 gold',
  },
  greedyMusket: {
    'meadow easy': 'W 34, 674 gold',
    'meadow normal': 'L 8, 227 gold',
    'meadow hard': 'L 2, 54 gold',
    'switchback easy': 'W 33, 496 gold',
    'switchback normal': 'W 1, 436 gold',
    'switchback hard': 'L 2, 48 gold',
    'riverbend easy': 'W 35, 682 gold',
    'riverbend normal': 'L 8, 246 gold',
    'riverbend hard': 'L 2, 48 gold',
  },
  longbowSpam: {
    'meadow easy': 'W 2, 1028 gold',
    'meadow normal': 'L 8, 525 gold',
    'meadow hard': 'L 7, 260 gold',
    'switchback easy': 'W 24, 1124 gold',
    'switchback normal': 'L 8, 495 gold',
    'switchback hard': 'L 8, 408 gold',
    'riverbend easy': 'W 2, 1028 gold',
    'riverbend normal': 'L 8, 509 gold',
    'riverbend hard': 'L 7, 260 gold',
  },
  noAntiAir: {
    'meadow easy': 'L 7, 300 gold',
    'meadow normal': 'L 5, 76 gold',
    'meadow hard': 'L 4, 223 gold',
    'switchback easy': 'L 7, 286 gold',
    'switchback normal': 'L 5, 76 gold',
    'switchback hard': 'L 4, 205 gold',
    'riverbend easy': 'L 7, 264 gold',
    'riverbend normal': 'L 5, 76 gold',
    'riverbend hard': 'L 4, 224 gold',
  },
  comboBuild: {
    'meadow easy': 'W 35, 422 gold',
    'meadow normal': 'W 14, 484 gold',
    'meadow hard': 'L 8, 321 gold',
    'switchback easy': 'W 35, 422 gold',
    'switchback normal': 'W 18, 436 gold',
    'switchback hard': 'W 6, 440 gold',
    'riverbend easy': 'W 35, 422 gold',
    'riverbend normal': 'W 16, 420 gold',
    'riverbend hard': 'L 8, 251 gold',
  },
  comboBuildNoFire: {
    'meadow easy': 'W 34, 604 gold',
    'meadow normal': 'W 4, 599 gold',
    'meadow hard': 'L 7, 217 gold',
    'switchback easy': 'W 35, 612 gold',
    'switchback normal': 'W 13, 586 gold',
    'switchback hard': 'L 8, 409 gold',
    'riverbend easy': 'W 30, 572 gold',
    'riverbend normal': 'W 5, 522 gold',
    'riverbend hard': 'L 5, 180 gold',
  },
  comboNoSpecials: {
    'meadow easy': 'W 34, 414 gold',
    'meadow normal': 'W 11, 460 gold',
    'meadow hard': 'L 3, 60 gold',
    'switchback easy': 'W 35, 422 gold',
    'switchback normal': 'W 16, 420 gold',
    'switchback hard': 'W 1, 510 gold',
    'riverbend easy': 'W 34, 414 gold',
    'riverbend normal': 'W 7, 428 gold',
    'riverbend hard': 'L 7, 127 gold',
  },
  hardBuild: {
    'meadow easy': 'W 35, 422 gold',
    'meadow normal': 'W 20, 452 gold',
    'meadow hard': 'W 9, 464 gold',
    'switchback easy': 'W 35, 422 gold',
    'switchback normal': 'W 20, 452 gold',
    'switchback hard': 'W 13, 416 gold',
    'riverbend easy': 'W 35, 422 gold',
    'riverbend normal': 'W 19, 444 gold',
    'riverbend hard': 'W 5, 432 gold',
  },
  endlessIdle: {
    'meadow easy': 'L 18, 2519 gold',
    'meadow normal': 'L 14, 1621 gold',
    'meadow hard': 'L 8, 321 gold',
    'switchback easy': 'L 20, 3078 gold',
    'switchback normal': 'L 16, 2004 gold',
    'switchback hard': 'L 14, 1586 gold',
    'riverbend easy': 'L 18, 2447 gold',
    'riverbend normal': 'L 15, 1668 gold',
    'riverbend hard': 'L 8, 251 gold',
  },
  soundBuild: {
    'meadow easy': 'W 11, 765 gold',
    'meadow normal': 'L 7, 116 gold',
    'meadow hard': 'L 2, 45 gold',
  },
  soundBuildNoTar: {
    'meadow easy': 'L 10, 746 gold',
    'meadow normal': 'L 7, 207 gold',
    'meadow hard': 'L 2, 45 gold',
  },
  comboStrongest: {
    'meadow easy': 'W 9, 415 gold',
    'meadow normal': 'L 7, 60 gold',
    'meadow hard': 'L 2, 27 gold',
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
