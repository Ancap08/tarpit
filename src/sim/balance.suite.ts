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
    'meadow easy': 'W 22, 3012 gold',
    'meadow normal': 'L 8, 269 gold',
    'meadow hard': 'L 2, 43 gold',
    'switchback easy': 'W 29, 2868 gold',
    'switchback normal': 'L 8, 241 gold',
    'switchback hard': 'L 2, 35 gold',
    'riverbend easy': 'W 19, 2988 gold',
    'riverbend normal': 'L 8, 271 gold',
    'riverbend hard': 'L 2, 35 gold',
  },
  greedyMusket: {
    'meadow easy': 'W 26, 3284 gold',
    'meadow normal': 'L 8, 225 gold',
    'meadow hard': 'L 2, 54 gold',
    'switchback easy': 'W 30, 3146 gold',
    'switchback normal': 'L 20, 2901 gold',
    'switchback hard': 'L 2, 48 gold',
    'riverbend easy': 'W 27, 3292 gold',
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
    'meadow normal': 'L 5, 191 gold',
    'meadow hard': 'L 5, 131 gold',
    'switchback easy': 'L 8, 538 gold',
    'switchback normal': 'L 5, 148 gold',
    'switchback hard': 'L 5, 128 gold',
    'riverbend easy': 'L 7, 359 gold',
    'riverbend normal': 'L 5, 88 gold',
    'riverbend hard': 'L 5, 124 gold',
  },
  comboBuild: {
    'meadow easy': 'W 38, 2544 gold',
    'meadow normal': 'W 17, 2451 gold',
    'meadow hard': 'L 20, 2047 gold',
    'switchback easy': 'W 38, 2854 gold',
    'switchback normal': 'W 17, 2646 gold',
    'switchback hard': 'L 20, 2237 gold',
    'riverbend easy': 'W 37, 2276 gold',
    'riverbend normal': 'W 16, 2178 gold',
    'riverbend hard': 'L 20, 1793 gold',
  },
  wideBuild: {
    'meadow easy': 'W 38, 2544 gold',
    'meadow normal': 'W 17, 2451 gold',
    'meadow hard': 'W 4, 2372 gold',
    'switchback easy': 'W 38, 2854 gold',
    'switchback normal': 'W 17, 2646 gold',
    'switchback hard': 'W 4, 2562 gold',
    'riverbend easy': 'W 37, 2276 gold',
    'riverbend normal': 'W 16, 2178 gold',
    'riverbend hard': 'L 20, 1793 gold',
  },
  comboBuildNoFire: {
    'meadow easy': 'W 37, 2846 gold',
    'meadow normal': 'W 9, 2445 gold',
    'meadow hard': 'L 7, 254 gold',
    'switchback easy': 'W 38, 3094 gold',
    'switchback normal': 'W 16, 2878 gold',
    'switchback hard': 'L 10, 993 gold',
    'riverbend easy': 'W 36, 2578 gold',
    'riverbend normal': 'W 14, 2472 gold',
    'riverbend hard': 'L 7, 235 gold',
  },
  comboNoSpecials: {
    'meadow easy': 'W 38, 2544 gold',
    'meadow normal': 'W 4, 2100 gold',
    'meadow hard': 'L 3, 60 gold',
    'switchback easy': 'W 38, 2854 gold',
    'switchback normal': 'W 9, 2582 gold',
    'switchback hard': 'L 9, 580 gold',
    'riverbend easy': 'W 37, 2276 gold',
    'riverbend normal': 'W 2, 1814 gold',
    'riverbend hard': 'L 3, 58 gold',
  },
  hardBuild: {
    'meadow easy': 'W 38, 2549 gold',
    'meadow normal': 'W 23, 2499 gold',
    'meadow hard': 'W 15, 2455 gold',
    'switchback easy': 'W 38, 2879 gold',
    'switchback normal': 'W 23, 2829 gold',
    'switchback hard': 'W 18, 2809 gold',
    'riverbend easy': 'W 38, 2229 gold',
    'riverbend normal': 'W 23, 2179 gold',
    'riverbend hard': 'W 14, 2127 gold',
  },
  artilleryBuild: {
    'meadow easy': 'W 38, 2964 gold',
    'meadow normal': 'W 13, 2582 gold',
    'meadow hard': 'W 2, 2519 gold',
    'switchback easy': 'W 38, 2964 gold',
    'switchback normal': 'W 23, 2914 gold',
    'switchback hard': 'W 13, 2854 gold',
    'riverbend easy': 'W 38, 2964 gold',
    'riverbend normal': 'W 13, 2566 gold',
    'riverbend hard': 'L 10, 301 gold',
  },
  burnBuild: {
    'meadow easy': 'W 32, 2964 gold',
    'meadow normal': 'W 15, 2898 gold',
    'meadow hard': 'W 2, 2803 gold',
    'switchback easy': 'W 38, 3264 gold',
    'switchback normal': 'W 17, 2914 gold',
    'switchback hard': 'W 9, 2870 gold',
    'riverbend easy': 'W 38, 3264 gold',
    'riverbend normal': 'W 14, 2890 gold',
    'riverbend hard': 'L 10, 401 gold',
  },
  musketBuild: {
    'meadow easy': 'W 38, 3214 gold',
    'meadow normal': 'W 15, 2848 gold',
    'meadow hard': 'W 2, 2753 gold',
    'switchback easy': 'W 38, 3214 gold',
    'switchback normal': 'W 23, 3164 gold',
    'switchback hard': 'W 9, 2820 gold',
    'riverbend easy': 'W 38, 3214 gold',
    'riverbend normal': 'W 14, 2824 gold',
    'riverbend hard': 'L 10, 401 gold',
  },
  endlessIdle: {
    'meadow easy': 'L 28, 5064 gold',
    'meadow normal': 'L 25, 4094 gold',
    'meadow hard': 'L 20, 2047 gold',
    'switchback easy': 'L 27, 5101 gold',
    'switchback normal': 'L 24, 3961 gold',
    'switchback hard': 'L 20, 2237 gold',
    'riverbend easy': 'L 28, 4819 gold',
    'riverbend normal': 'L 25, 3781 gold',
    'riverbend hard': 'L 20, 1793 gold',
  },
  endlessGreedy: {
    'meadow easy': 'L 30, 4788 gold',
    'meadow normal': 'L 28, 4031 gold',
    'meadow hard': 'L 20, 2047 gold',
    'switchback easy': 'L 30, 4998 gold',
    'switchback normal': 'L 27, 3837 gold',
    'switchback hard': 'L 20, 2237 gold',
    'riverbend easy': 'L 30, 4435 gold',
    'riverbend normal': 'L 27, 3472 gold',
    'riverbend hard': 'L 20, 1793 gold',
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
    'meadow easy': 'W 13, 3258 gold',
    'meadow normal': 'L 5, 95 gold',
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
