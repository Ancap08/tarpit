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
    'meadow easy': 'W 33, 709 gold',
    'meadow normal': 'L 8, 269 gold',
    'meadow hard': 'L 2, 43 gold',
    'switchback easy': 'W 37, 841 gold',
    'switchback normal': 'L 8, 241 gold',
    'switchback hard': 'L 2, 35 gold',
    'riverbend easy': 'W 31, 293 gold',
    'riverbend normal': 'L 8, 271 gold',
    'riverbend hard': 'L 2, 35 gold',
  },
  greedyMusket: {
    'meadow easy': 'L 19, 2715 gold',
    'meadow normal': 'L 8, 225 gold',
    'meadow hard': 'L 2, 54 gold',
    'switchback easy': 'L 19, 2613 gold',
    'switchback normal': 'L 12, 687 gold',
    'switchback hard': 'L 2, 48 gold',
    'riverbend easy': 'L 19, 2735 gold',
    'riverbend normal': 'L 8, 246 gold',
    'riverbend hard': 'L 2, 48 gold',
  },
  longbowSpam: {
    'meadow easy': 'L 10, 963 gold',
    'meadow normal': 'L 8, 525 gold',
    'meadow hard': 'L 7, 260 gold',
    'switchback easy': 'L 18, 2721 gold',
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
    'meadow easy': 'W 39, 257 gold',
    'meadow normal': 'W 10, 280 gold',
    'meadow hard': 'L 18, 395 gold',
    'switchback easy': 'W 39, 267 gold',
    'switchback normal': 'W 13, 259 gold',
    'switchback hard': 'L 18, 421 gold',
    'riverbend easy': 'W 39, 247 gold',
    'riverbend normal': 'W 13, 269 gold',
    'riverbend hard': 'L 18, 405 gold',
  },
  wideBuild: {
    'meadow easy': 'W 39, 257 gold',
    'meadow normal': 'W 7, 256 gold',
    'meadow hard': 'L 18, 361 gold',
    'switchback easy': 'W 39, 267 gold',
    'switchback normal': 'W 17, 261 gold',
    'switchback hard': 'L 18, 429 gold',
    'riverbend easy': 'W 39, 247 gold',
    'riverbend normal': 'W 11, 293 gold',
    'riverbend hard': 'L 18, 365 gold',
  },
  comboBuildNoFire: {
    'meadow easy': 'W 38, 559 gold',
    'meadow normal': 'W 8, 574 gold',
    'meadow hard': 'L 8, 443 gold',
    'switchback easy': 'W 39, 507 gold',
    'switchback normal': 'W 11, 483 gold',
    'switchback hard': 'L 10, 993 gold',
    'riverbend easy': 'W 37, 541 gold',
    'riverbend normal': 'W 14, 587 gold',
    'riverbend hard': 'L 7, 263 gold',
  },
  comboNoSpecials: {
    'meadow easy': 'W 39, 257 gold',
    'meadow normal': 'L 19, 347 gold',
    'meadow hard': 'L 7, 130 gold',
    'switchback easy': 'W 39, 267 gold',
    'switchback normal': 'L 18, 363 gold',
    'switchback hard': 'L 9, 580 gold',
    'riverbend easy': 'W 38, 289 gold',
    'riverbend normal': 'W 6, 273 gold',
    'riverbend hard': 'L 3, 90 gold',
  },
  hardBuild: {
    'meadow easy': 'W 39, 267 gold',
    'meadow normal': 'W 18, 249 gold',
    'meadow hard': 'W 4, 267 gold',
    'switchback easy': 'W 39, 267 gold',
    'switchback normal': 'W 24, 247 gold',
    'switchback hard': 'W 17, 251 gold',
    'riverbend easy': 'W 39, 247 gold',
    'riverbend normal': 'W 19, 247 gold',
    'riverbend hard': 'W 5, 255 gold',
  },
  artilleryBuild: {
    'meadow easy': 'W 39, 287 gold',
    'meadow normal': 'W 15, 245 gold',
    'meadow hard': 'L 18, 441 gold',
    'switchback easy': 'W 39, 287 gold',
    'switchback normal': 'W 24, 317 gold',
    'switchback hard': 'W 14, 257 gold',
    'riverbend easy': 'W 39, 287 gold',
    'riverbend normal': 'W 6, 288 gold',
    'riverbend hard': 'L 10, 301 gold',
  },
  burnBuild: {
    'meadow easy': 'W 39, 287 gold',
    'meadow normal': 'W 5, 275 gold',
    'meadow hard': 'L 18, 300 gold',
    'switchback easy': 'W 39, 287 gold',
    'switchback normal': 'W 18, 309 gold',
    'switchback hard': 'W 2, 271 gold',
    'riverbend easy': 'W 39, 287 gold',
    'riverbend normal': 'W 1, 293 gold',
    'riverbend hard': 'L 18, 313 gold',
  },
  musketBuild: {
    'meadow easy': 'W 39, 282 gold',
    'meadow normal': 'L 19, 311 gold',
    'meadow hard': 'L 18, 336 gold',
    'switchback easy': 'W 39, 282 gold',
    'switchback normal': 'W 16, 253 gold',
    'switchback hard': 'W 2, 246 gold',
    'riverbend easy': 'W 39, 282 gold',
    'riverbend normal': 'W 9, 282 gold',
    'riverbend hard': 'L 18, 342 gold',
  },
  endlessIdle: {
    'meadow easy': 'L 30, 3665 gold',
    'meadow normal': 'L 21, 595 gold',
    'meadow hard': 'L 18, 395 gold',
    'switchback easy': 'L 30, 3492 gold',
    'switchback normal': 'L 21, 504 gold',
    'switchback hard': 'L 18, 421 gold',
    'riverbend easy': 'L 30, 3772 gold',
    'riverbend normal': 'L 21, 571 gold',
    'riverbend hard': 'L 18, 405 gold',
  },
  endlessGreedy: {
    'meadow easy': 'L 31, 300 gold',
    'meadow normal': 'L 21, 315 gold',
    'meadow hard': 'L 18, 395 gold',
    'switchback easy': 'L 31, 268 gold',
    'switchback normal': 'L 21, 267 gold',
    'switchback hard': 'L 18, 421 gold',
    'riverbend easy': 'L 33, 296 gold',
    'riverbend normal': 'L 21, 357 gold',
    'riverbend hard': 'L 18, 405 gold',
  },
  soundBuild: {
    'meadow easy': 'L 18, 2542 gold',
    'meadow normal': 'L 7, 140 gold',
    'meadow hard': 'L 2, 45 gold',
  },
  soundBuildNoTar: {
    'meadow easy': 'L 10, 762 gold',
    'meadow normal': 'L 7, 217 gold',
    'meadow hard': 'L 2, 45 gold',
  },
  comboStrongest: {
    'meadow easy': 'W 7, 3020 gold',
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
