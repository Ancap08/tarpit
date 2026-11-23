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
    'meadow easy': 'W 18, 3012 gold',
    'meadow normal': 'L 8, 269 gold',
    'meadow hard': 'L 2, 43 gold',
    'switchback easy': 'W 26, 2876 gold',
    'switchback normal': 'L 8, 241 gold',
    'switchback hard': 'L 2, 35 gold',
    'riverbend easy': 'W 15, 2988 gold',
    'riverbend normal': 'L 8, 271 gold',
    'riverbend hard': 'L 2, 35 gold',
  },
  greedyMusket: {
    'meadow easy': 'W 22, 3284 gold',
    'meadow normal': 'L 8, 225 gold',
    'meadow hard': 'L 2, 54 gold',
    'switchback easy': 'W 27, 3154 gold',
    'switchback normal': 'L 20, 2901 gold',
    'switchback hard': 'L 2, 48 gold',
    'riverbend easy': 'W 23, 3292 gold',
    'riverbend normal': 'L 8, 246 gold',
    'riverbend hard': 'L 2, 48 gold',
  },
  longbowSpam: {
    'meadow easy': 'L 10, 963 gold',
    'meadow normal': 'L 8, 525 gold',
    'meadow hard': 'L 7, 260 gold',
    'switchback easy': 'L 18, 2857 gold',
    'switchback normal': 'L 8, 495 gold',
    'switchback hard': 'L 8, 408 gold',
    'riverbend easy': 'L 10, 963 gold',
    'riverbend normal': 'L 8, 509 gold',
    'riverbend hard': 'L 7, 260 gold',
  },
  noAntiAir: {
    'meadow easy': 'L 8, 254 gold',
    'meadow normal': 'L 5, 149 gold',
    'meadow hard': 'L 5, 131 gold',
    'switchback easy': 'L 8, 337 gold',
    'switchback normal': 'L 5, 207 gold',
    'switchback hard': 'L 4, 220 gold',
    'riverbend easy': 'L 8, 253 gold',
    'riverbend normal': 'L 5, 98 gold',
    'riverbend hard': 'L 5, 134 gold',
  },
  comboBuild: {
    'meadow easy': 'W 38, 2929 gold',
    'meadow normal': 'W 19, 2847 gold',
    'meadow hard': 'L 20, 2467 gold',
    'switchback easy': 'W 38, 3054 gold',
    'switchback normal': 'W 19, 2972 gold',
    'switchback hard': 'L 20, 2577 gold',
    'riverbend easy': 'W 38, 2609 gold',
    'riverbend normal': 'W 19, 2527 gold',
    'riverbend hard': 'L 20, 2150 gold',
  },
  comboBuildNoFire: {
    'meadow easy': 'W 38, 3169 gold',
    'meadow normal': 'W 9, 2787 gold',
    'meadow hard': 'L 7, 254 gold',
    'switchback easy': 'W 37, 3286 gold',
    'switchback normal': 'W 14, 3184 gold',
    'switchback hard': 'L 7, 279 gold',
    'riverbend easy': 'W 36, 2833 gold',
    'riverbend normal': 'W 16, 2743 gold',
    'riverbend hard': 'L 7, 251 gold',
  },
  comboNoSpecials: {
    'meadow easy': 'W 38, 2929 gold',
    'meadow normal': 'W 3, 2504 gold',
    'meadow hard': 'L 3, 60 gold',
    'switchback easy': 'W 38, 3054 gold',
    'switchback normal': 'W 14, 2944 gold',
    'switchback hard': 'L 2, 67 gold',
    'riverbend easy': 'W 37, 2601 gold',
    'riverbend normal': 'W 5, 2195 gold',
    'riverbend hard': 'L 5, 112 gold',
  },
  hardBuild: {
    'meadow easy': 'W 38, 2739 gold',
    'meadow normal': 'W 23, 2689 gold',
    'meadow hard': 'W 15, 2645 gold',
    'switchback easy': 'W 38, 3069 gold',
    'switchback normal': 'W 23, 3019 gold',
    'switchback hard': 'W 18, 2999 gold',
    'riverbend easy': 'W 38, 2419 gold',
    'riverbend normal': 'W 23, 2369 gold',
    'riverbend hard': 'W 14, 2317 gold',
  },
  artilleryBuild: {
    'meadow easy': 'W 38, 2964 gold',
    'meadow normal': 'W 19, 2882 gold',
    'meadow hard': 'L 20, 2494 gold',
    'switchback easy': 'W 38, 2964 gold',
    'switchback normal': 'W 23, 2914 gold',
    'switchback hard': 'W 13, 2854 gold',
    'riverbend easy': 'W 38, 2964 gold',
    'riverbend normal': 'W 9, 2582 gold',
    'riverbend hard': 'L 10, 301 gold',
  },
  burnBuild: {
    'meadow easy': 'W 38, 3264 gold',
    'meadow normal': 'W 11, 2898 gold',
    'meadow hard': 'L 20, 2778 gold',
    'switchback easy': 'W 38, 3264 gold',
    'switchback normal': 'W 23, 3214 gold',
    'switchback hard': 'W 5, 2870 gold',
    'riverbend easy': 'W 38, 3264 gold',
    'riverbend normal': 'W 10, 2890 gold',
    'riverbend hard': 'L 10, 401 gold',
  },
  endlessIdle: {
    'meadow easy': 'L 28, 5388 gold',
    'meadow normal': 'L 24, 4151 gold',
    'meadow hard': 'L 20, 2467 gold',
    'switchback easy': 'L 28, 5520 gold',
    'switchback normal': 'L 25, 4540 gold',
    'switchback hard': 'L 20, 2577 gold',
    'riverbend easy': 'L 28, 5125 gold',
    'riverbend normal': 'L 25, 4136 gold',
    'riverbend hard': 'L 20, 2150 gold',
  },
  endlessGreedy: {
    'meadow easy': 'L 30, 5026 gold',
    'meadow normal': 'L 27, 4106 gold',
    'meadow hard': 'L 20, 2467 gold',
    'switchback easy': 'L 30, 5354 gold',
    'switchback normal': 'L 27, 4384 gold',
    'switchback hard': 'L 20, 2577 gold',
    'riverbend easy': 'L 30, 4735 gold',
    'riverbend normal': 'L 27, 3793 gold',
    'riverbend hard': 'L 20, 2150 gold',
  },
  soundBuild: {
    'meadow easy': 'L 20, 3238 gold',
    'meadow normal': 'L 7, 140 gold',
    'meadow hard': 'L 2, 45 gold',
  },
  soundBuildNoTar: {
    'meadow easy': 'L 10, 762 gold',
    'meadow normal': 'L 7, 217 gold',
    'meadow hard': 'L 2, 45 gold',
  },
  comboStrongest: {
    'meadow easy': 'W 10, 3253 gold',
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
      it(`N10a: combo wins with ${picks.join(' / ')}`, () => {
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
