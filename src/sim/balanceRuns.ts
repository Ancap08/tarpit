// Balance runs (milestone 28): every archetype on every map and level,
// played once with the numbers the balance targets need, and cached per
// module instance so a test file that asks for the same game twice plays it
// once. Used by the balance tests (balance-*.test.ts) and `npm run sim`. Not
// part of the game bundle (src/sim/index.ts does not export it).

import type { Difficulty } from './difficulty';
import { createGame, startWave, tick } from './game';
import { applyAction, ARCHETYPES, ENDLESS_ARCHETYPES, INFORMATIONAL, type WaveScript } from './headless';
import { continueEndless } from './game';
import type { MapId } from './map';
import type { EnemyType, GameState } from './types';
import { ENDLESS_WAVE_CAP } from './headless';
import { LAST_WAVE } from './waves';

/** One wave as played. */
export interface WaveStats {
  wave: number;
  /** Gold at the start of the wave's setup, before its purchases (after the previous wave's clear). */
  goldEntering: number;
  /** Lives and gold after the wave. */
  lives: number;
  gold: number;
  /** Wave ticks the wave ran. */
  ticks: number;
  /** Enemies of each type that exited during the wave. */
  exits: Partial<Record<EnemyType, number>>;
  /** Enemies of each type that spawned during the wave. */
  spawns: Partial<Record<EnemyType, number>>;
  kills: number;
  /** Most enemies alive at once. */
  peak: number;
  phase: GameState['phase'];
}

export interface BalanceRun {
  phase: GameState['phase'];
  /** The wave the game ended on (won: 10; endless: the wave it was lost on, or the cap). */
  wave: number;
  lives: number;
  gold: number;
  /** state.tick at the end: the tick of the loss for a lost game. */
  tick: number;
  kills: number;
  /** Actions the game refused (0 for every archetype). */
  refused: number;
  waves: WaveStats[];
}

/**
 * Play a script like playScripted (pre-wave actions, startWave, the timed
 * actions at their wave ticks, Keep going after a win for an endless
 * script) and count what the balance targets read. An early call (not used
 * by the archetypes) throws.
 */
export function playWithStats(script: WaveScript, difficulty?: Difficulty): BalanceRun {
  const state = createGame({ difficulty, map: script.mapId });
  const waves: WaveStats[] = [];
  let refused = 0;
  let kills = 0;
  const limit = script.endless ? ENDLESS_WAVE_CAP : LAST_WAVE;
  for (let i = 0; i < limit && state.phase === 'setup'; i++) {
    const goldEntering = state.gold;
    for (const action of script[i] ?? []) {
      const step = applyAction(state, action);
      if ('result' in step && !step.result.ok) refused += 1;
    }
    startWave(state);
    const timed = script.timed?.[i] ?? [];
    const w: WaveStats = { wave: state.wave, goldEntering, lives: 0, gold: 0, ticks: 0, exits: {}, spawns: {}, kills: 0, peak: 0, phase: 'wave' };
    const types = new Map<number, EnemyType>();
    while ((state.phase as GameState['phase']) === 'wave') {
      for (const action of timed) {
        if (action.atWaveTick !== state.waveTick) continue;
        if (action.type === 'callEarly') throw new Error('playWithStats: callEarly is not supported');
        const step = applyAction(state, action);
        if ('result' in step && !step.result.ok) refused += 1;
        for (const e of state.events) if (e.kind === 'kill') w.kills += 1;
      }
      tick(state);
      w.ticks += 1;
      for (const e of state.events) {
        if (e.kind === 'spawn') {
          types.set(e.enemyId, e.enemyType);
          w.spawns[e.enemyType] = (w.spawns[e.enemyType] ?? 0) + 1;
        } else if (e.kind === 'exit') {
          const type = types.get(e.enemyId)!;
          w.exits[type] = (w.exits[type] ?? 0) + 1;
        } else if (e.kind === 'kill') w.kills += 1;
      }
      w.peak = Math.max(w.peak, state.enemies.length);
    }
    kills += w.kills;
    Object.assign(w, { lives: state.lives, gold: state.gold, phase: state.phase });
    waves.push(w);
    if (script.endless && (state.phase as GameState['phase']) === 'won') continueEndless(state);
  }
  return { phase: state.phase, wave: state.wave, lives: state.lives, gold: state.gold, tick: state.tick, kills, refused, waves };
}

/** "W 13" for a win with 13 lives, "L 8" for a loss on wave 8 (an endless run: the wave it was lost on). */
export function matrixCell(run: Pick<BalanceRun, 'phase' | 'wave' | 'lives'>): string {
  return run.phase === 'won' ? `W ${run.lives}` : run.phase === 'lost' ? `L ${run.wave}` : `? ${run.wave}`;
}

/** Archetypes that run on every map, in matrix order. */
export const ALL_MAP_ARCHETYPES = [
  'noTowers',
  'oneMusket',
  'lazyBuild',
  'greedyMusket',
  'longbowSpam',
  'noAntiAir',
  'comboBuild',
  'comboBuildNoFire',
  'comboNoSpecials',
  'hardBuild',
  'endlessIdle',
] as const;

/** Archetypes with a Meadow plan only. */
export const MEADOW_ONLY_ARCHETYPES = ['soundBuild', 'soundBuildNoTar', 'comboStrongest', 'comboWithKegs'] as const;

export type MatrixArchetype = (typeof ALL_MAP_ARCHETYPES)[number] | (typeof MEADOW_ONLY_ARCHETYPES)[number];

export const MATRIX_ARCHETYPES: readonly MatrixArchetype[] = [...ALL_MAP_ARCHETYPES, ...MEADOW_ONLY_ARCHETYPES];

/** Whether an archetype runs on a map. */
export function runsOn(name: MatrixArchetype, map: MapId): boolean {
  return map === 'meadow' || (ALL_MAP_ARCHETYPES as readonly string[]).includes(name);
}

const scripts = new Map<string, WaveScript>();
const runs = new Map<string, BalanceRun>();

/** The recorded script of an archetype on a map and level (cached). */
export function archetypeScript(name: MatrixArchetype, map: MapId, level: Difficulty): WaveScript {
  const key = `${name} ${map} ${level}`;
  let script = scripts.get(key);
  if (!script) {
    const archetype = ARCHETYPES[name] ?? INFORMATIONAL[name] ?? ENDLESS_ARCHETYPES[name];
    if (!archetype) throw new Error(`no archetype ${name}`);
    script = archetype(level, map);
    scripts.set(key, script);
  }
  return script;
}

/** The balance run of an archetype on a map and level (cached). */
export function balanceRun(name: MatrixArchetype, map: MapId, level: Difficulty): BalanceRun {
  const key = `${name} ${map} ${level}`;
  let run = runs.get(key);
  if (!run) {
    run = playWithStats(archetypeScript(name, map, level), level);
    runs.set(key, run);
  }
  return run;
}

/** A script's run, cached under `key` (for variants such as the combo without its Tar Barrels). */
export function cachedRun(key: string, script: () => WaveScript, level: Difficulty): BalanceRun {
  let run = runs.get(key);
  if (!run) {
    run = playWithStats(script(), level);
    runs.set(key, run);
  }
  return run;
}

/** Forget every cached script and run (for tools that change numbers between runs). */
export function clearBalanceCache(): void {
  scripts.clear();
  runs.clear();
}
