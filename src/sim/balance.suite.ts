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
    'meadow easy': 'L 2, 149 gold',
    'meadow normal': 'L 2, 99 gold',
    'meadow hard': 'L 2, 79 gold',
    'switchback easy': 'L 2, 141 gold',
    'switchback normal': 'L 2, 91 gold',
    'switchback hard': 'L 2, 71 gold',
    'riverbend easy': 'L 2, 141 gold',
    'riverbend normal': 'L 2, 91 gold',
    'riverbend hard': 'L 2, 71 gold',
  },
  lazyBuild: {
    'meadow easy': 'W 9, 964 gold',
    'meadow normal': 'L 8, 369 gold',
    'meadow hard': 'L 5, 128 gold',
    'switchback easy': 'W 16, 920 gold',
    'switchback normal': 'L 9, 448 gold',
    'switchback hard': 'L 2, 77 gold',
    'riverbend easy': 'W 9, 964 gold',
    'riverbend normal': 'L 8, 369 gold',
    'riverbend hard': 'L 2, 77 gold',
  },
  greedyMusket: {
    'meadow easy': 'W 30, 682 gold',
    'meadow normal': 'L 10, 313 gold',
    'meadow hard': 'L 2, 44 gold',
    'switchback easy': 'W 29, 504 gold',
    'switchback normal': 'W 9, 459 gold',
    'switchback hard': 'L 2, 38 gold',
    'riverbend easy': 'W 30, 682 gold',
    'riverbend normal': 'L 10, 321 gold',
    'riverbend hard': 'L 2, 38 gold',
  },
  longbowSpam: {
    'meadow easy': 'W 2, 1068 gold',
    'meadow normal': 'L 8, 525 gold',
    'meadow hard': 'L 7, 260 gold',
    'switchback easy': 'W 20, 1132 gold',
    'switchback normal': 'L 8, 511 gold',
    'switchback hard': 'L 8, 408 gold',
    'riverbend easy': 'W 2, 1068 gold',
    'riverbend normal': 'L 8, 525 gold',
    'riverbend hard': 'L 7, 260 gold',
  },
  noAntiAir: {
    'meadow easy': 'L 7, 294 gold',
    'meadow normal': 'L 5, 86 gold',
    'meadow hard': 'L 4, 222 gold',
    'switchback easy': 'L 7, 282 gold',
    'switchback normal': 'L 5, 82 gold',
    'switchback hard': 'L 4, 215 gold',
    'riverbend easy': 'L 7, 256 gold',
    'riverbend normal': 'L 5, 78 gold',
    'riverbend hard': 'L 4, 217 gold',
  },
  comboBuild: {
    'meadow easy': 'W 30, 422 gold',
    'meadow normal': 'W 15, 412 gold',
    'meadow hard': 'W 1, 510 gold',
    'switchback easy': 'W 30, 422 gold',
    'switchback normal': 'W 20, 452 gold',
    'switchback hard': 'W 10, 472 gold',
    'riverbend easy': 'W 30, 422 gold',
    'riverbend normal': 'W 18, 436 gold',
    'riverbend hard': 'L 8, 297 gold',
  },
  comboBuildNoFire: {
    'meadow easy': 'W 29, 604 gold',
    'meadow normal': 'W 9, 554 gold',
    'meadow hard': 'L 7, 216 gold',
    'switchback easy': 'W 30, 612 gold',
    'switchback normal': 'W 17, 618 gold',
    'switchback hard': 'W 3, 612 gold',
    'riverbend easy': 'W 29, 604 gold',
    'riverbend normal': 'W 6, 530 gold',
    'riverbend hard': 'L 5, 139 gold',
  },
  comboNoSpecials: {
    'meadow easy': 'W 30, 422 gold',
    'meadow normal': 'W 12, 468 gold',
    'meadow hard': 'L 7, 148 gold',
    'switchback easy': 'W 30, 422 gold',
    'switchback normal': 'W 18, 436 gold',
    'switchback hard': 'W 3, 416 gold',
    'riverbend easy': 'W 29, 414 gold',
    'riverbend normal': 'W 14, 484 gold',
    'riverbend hard': 'L 7, 144 gold',
  },
  hardBuild: {
    'meadow easy': 'W 30, 422 gold',
    'meadow normal': 'W 20, 452 gold',
    'meadow hard': 'W 13, 416 gold',
    'switchback easy': 'W 30, 422 gold',
    'switchback normal': 'W 20, 452 gold',
    'switchback hard': 'W 14, 424 gold',
    'riverbend easy': 'W 30, 422 gold',
    'riverbend normal': 'W 20, 452 gold',
    'riverbend hard': 'W 8, 456 gold',
  },
  endlessIdle: {
    'meadow easy': 'L 18, 2546 gold',
    'meadow normal': 'L 15, 1736 gold',
    'meadow hard': 'L 11, 760 gold',
    'switchback easy': 'L 19, 2848 gold',
    'switchback normal': 'L 16, 2051 gold',
    'switchback hard': 'L 15, 1790 gold',
    'riverbend easy': 'L 18, 2512 gold',
    'riverbend normal': 'L 15, 1697 gold',
    'riverbend hard': 'L 8, 297 gold',
  },
  soundBuild: {
    'meadow easy': 'W 9, 789 gold',
    'meadow normal': 'L 8, 257 gold',
    'meadow hard': 'L 3, 82 gold',
  },
  soundBuildNoTar: {
    'meadow easy': 'L 10, 794 gold',
    'meadow normal': 'L 8, 345 gold',
    'meadow hard': 'L 3, 82 gold',
  },
  comboStrongest: {
    'meadow easy': 'W 11, 453 gold',
    'meadow normal': 'L 7, 63 gold',
    'meadow hard': 'L 4, 108 gold',
  },
  comboWithKegs: {
    'meadow easy': 'W 30, 422 gold',
    'meadow normal': 'W 12, 468 gold',
    'meadow hard': 'L 7, 148 gold',
  },
};


const LEVELS: readonly Difficulty[] = ['easy', 'normal', 'hard'];

/**
 * Targets not met yet, as "id map": pinned with it.fails so the suite says
 * exactly which are open. Part 1 of milestone 28 (the script side) leaves
 * these; the game numbers in part 3 close them.
 */
const OPEN = new Set(['T8 meadow', 'E3 meadow', 'T4 switchback', 'T8 switchback', 'E3 switchback', 'T8 riverbend', 'E3 riverbend']);

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
        });
      }
    }
  });

  describe(`balance targets on ${map}`, () => {
    for (const target of TARGETS) {
      const mine = map === 'meadow' ? target.map === undefined || target.map === 'meadow' : target.map === map;
      if (!mine) continue;
      const test = OPEN.has(`${target.id} ${target.map}`) ? it.fails : it;
      test(`${target.id}: ${target.label}${OPEN.has(`${target.id} ${target.map}`) ? ' (open)' : ''}`, () => {
        const result = target.check();
        expect(result.ok, result.info).toBe(true);
      });
    }
  });
}
