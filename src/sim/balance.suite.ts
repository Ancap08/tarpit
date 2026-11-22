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
    'meadow easy': 'W 8, 3407 gold',
    'meadow normal': 'L 8, 353 gold',
    'meadow hard': 'L 2, 43 gold',
    'switchback easy': 'W 19, 3311 gold',
    'switchback normal': 'L 8, 291 gold',
    'switchback hard': 'L 2, 35 gold',
    'riverbend easy': 'W 8, 3407 gold',
    'riverbend normal': 'L 8, 369 gold',
    'riverbend hard': 'L 2, 35 gold',
  },
  greedyMusket: {
    'meadow easy': 'W 33, 3973 gold',
    'meadow normal': 'L 8, 225 gold',
    'meadow hard': 'L 2, 54 gold',
    'switchback easy': 'W 33, 3803 gold',
    'switchback normal': 'W 1, 3607 gold',
    'switchback hard': 'L 2, 48 gold',
    'riverbend easy': 'W 34, 3965 gold',
    'riverbend normal': 'L 8, 246 gold',
    'riverbend hard': 'L 2, 48 gold',
  },
  longbowSpam: {
    'meadow easy': 'L 10, 963 gold',
    'meadow normal': 'L 8, 525 gold',
    'meadow hard': 'L 7, 260 gold',
    'switchback easy': 'L 17, 2946 gold',
    'switchback normal': 'L 8, 495 gold',
    'switchback hard': 'L 8, 408 gold',
    'riverbend easy': 'L 10, 963 gold',
    'riverbend normal': 'L 8, 509 gold',
    'riverbend hard': 'L 7, 260 gold',
  },
  noAntiAir: {
    'meadow easy': 'L 7, 369 gold',
    'meadow normal': 'L 5, 149 gold',
    'meadow hard': 'L 5, 131 gold',
    'switchback easy': 'L 8, 253 gold',
    'switchback normal': 'L 5, 148 gold',
    'switchback hard': 'L 5, 128 gold',
    'riverbend easy': 'L 7, 359 gold',
    'riverbend normal': 'L 5, 98 gold',
    'riverbend hard': 'L 5, 134 gold',
  },
  comboBuild: {
    'meadow easy': 'W 40, 3562 gold',
    'meadow normal': 'W 17, 3196 gold',
    'meadow hard': 'W 3, 3093 gold',
    'switchback easy': 'W 40, 3702 gold',
    'switchback normal': 'W 19, 3352 gold',
    'switchback hard': 'W 9, 3292 gold',
    'riverbend easy': 'W 40, 3142 gold',
    'riverbend normal': 'W 16, 2768 gold',
    'riverbend hard': 'L 20, 2635 gold',
  },
  comboBuildNoFire: {
    'meadow easy': 'W 40, 3802 gold',
    'meadow normal': 'W 15, 3420 gold',
    'meadow hard': 'L 7, 254 gold',
    'switchback easy': 'W 40, 3942 gold',
    'switchback normal': 'W 17, 3576 gold',
    'switchback hard': 'W 7, 3516 gold',
    'riverbend easy': 'W 38, 3366 gold',
    'riverbend normal': 'W 12, 2976 gold',
    'riverbend hard': 'L 7, 234 gold',
  },
  comboNoSpecials: {
    'meadow easy': 'W 40, 3562 gold',
    'meadow normal': 'W 9, 3137 gold',
    'meadow hard': 'L 3, 60 gold',
    'switchback easy': 'W 40, 3702 gold',
    'switchback normal': 'W 16, 3328 gold',
    'switchback hard': 'W 2, 3236 gold',
    'riverbend easy': 'W 39, 3134 gold',
    'riverbend normal': 'W 6, 2688 gold',
    'riverbend hard': 'L 7, 126 gold',
  },
  hardBuild: {
    'meadow easy': 'W 40, 3562 gold',
    'meadow normal': 'W 19, 3212 gold',
    'meadow hard': 'W 12, 3160 gold',
    'switchback easy': 'W 40, 3702 gold',
    'switchback normal': 'W 19, 3352 gold',
    'switchback hard': 'W 14, 3332 gold',
    'riverbend easy': 'W 40, 3142 gold',
    'riverbend normal': 'W 18, 2784 gold',
    'riverbend hard': 'W 1, 2668 gold',
  },
  endlessIdle: {
    'meadow easy': 'L 28, 6485 gold',
    'meadow normal': 'L 25, 5071 gold',
    'meadow hard': 'L 23, 4338 gold',
    'switchback easy': 'L 27, 6446 gold',
    'switchback normal': 'L 25, 5233 gold',
    'switchback hard': 'L 24, 4760 gold',
    'riverbend easy': 'L 28, 6253 gold',
    'riverbend normal': 'L 25, 4726 gold',
    'riverbend hard': 'L 20, 2635 gold',
  },
  endlessGreedy: {
    'meadow easy': 'L 30, 6426 gold',
    'meadow normal': 'L 27, 4996 gold',
    'meadow hard': 'L 24, 3695 gold',
    'switchback easy': 'L 30, 6665 gold',
    'switchback normal': 'L 27, 5281 gold',
    'switchback hard': 'L 25, 4379 gold',
    'riverbend easy': 'L 31, 6226 gold',
    'riverbend normal': 'L 28, 4737 gold',
    'riverbend hard': 'L 20, 2635 gold',
  },
  soundBuild: {
    'meadow easy': 'L 19, 3460 gold',
    'meadow normal': 'L 7, 140 gold',
    'meadow hard': 'L 2, 45 gold',
  },
  soundBuildNoTar: {
    'meadow easy': 'L 12, 1256 gold',
    'meadow normal': 'L 7, 217 gold',
    'meadow hard': 'L 2, 45 gold',
  },
  comboStrongest: {
    'meadow easy': 'W 7, 3863 gold',
    'meadow normal': 'L 5, 115 gold',
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

  describe(`representative boon picks on ${map}`, () => {
    for (const picks of boonBalancePicks(map, 'representative')) {
      it(`N10: combo wins with ${picks.join(' / ')}`, () => {
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
