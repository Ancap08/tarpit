// Headless runner: plays a script of actions against a fresh game, with no
// rendering. Used by tests, `npm run sim`, and from milestone 6 balance work.
//
// A script is an ordered list of actions. Time only passes inside run
// actions; every other action happens on the current tick.

import { buildTower, sellTower, upgradeTower, type BuildResult, type SellResult, type UpgradeResult } from './actions';
import { createGame, startWave, tick, type StartWaveResult } from './game';
import type { GameState, TowerType } from './types';
import { WAVES } from './waves';

export type BuildAction =
  | { type: 'build'; spotId: number; tower: TowerType }
  | { type: 'upgrade'; spotId: number }
  | { type: 'sell'; spotId: number };

export type HeadlessAction =
  | { type: 'startWave' }
  /** Tick until the current wave ends (phase leaves 'wave') or `maxTicks` pass. */
  | { type: 'runUntilWaveEnds'; maxTicks: number }
  | BuildAction;

export type HeadlessStepResult =
  | { action: 'startWave'; result: StartWaveResult }
  | { action: 'runUntilWaveEnds'; ticks: number }
  | { action: 'build'; spotId: number; result: BuildResult }
  | { action: 'upgrade'; spotId: number; result: UpgradeResult }
  | { action: 'sell'; spotId: number; result: SellResult };

export interface HeadlessRun {
  state: GameState;
  /** One entry per action, in script order. */
  log: HeadlessStepResult[];
}

/** Apply one action to `state` in place and describe what happened. */
export function applyAction(state: GameState, action: HeadlessAction): HeadlessStepResult {
  switch (action.type) {
    case 'startWave':
      return { action: 'startWave', result: startWave(state) };
    case 'runUntilWaveEnds': {
      let ticks = 0;
      while (state.phase === 'wave' && ticks < action.maxTicks) {
        tick(state);
        ticks += 1;
      }
      return { action: 'runUntilWaveEnds', ticks };
    }
    case 'build':
      return { action: 'build', spotId: action.spotId, result: buildTower(state, action.spotId, action.tower) };
    case 'upgrade':
      return { action: 'upgrade', spotId: action.spotId, result: upgradeTower(state, action.spotId) };
    case 'sell':
      return { action: 'sell', spotId: action.spotId, result: sellTower(state, action.spotId) };
  }
}

export function runHeadless(script: readonly HeadlessAction[]): HeadlessRun {
  const state = createGame();
  const log = script.map((action) => applyAction(state, action));
  return { state, log };
}

/**
 * A scripted game: entry i lists the build, upgrade and sell actions taken
 * in setup before wave i + 1. Missing entries mean no actions that wave.
 */
export type WaveScript = readonly (readonly BuildAction[])[];

export interface WaveReport {
  wave: number;
  lives: number;
  gold: number;
  ticks: number;
  phase: GameState['phase'];
}

export interface ScriptedRun extends HeadlessRun {
  /** One entry per wave played, with state after the wave ended. */
  waves: WaveReport[];
}

/**
 * Play all 10 waves: before each wave apply that wave's actions, then start
 * it and run until it ends or `maxTicksPerWave` pass. Stops once lost.
 */
export function playScripted(script: WaveScript, maxTicksPerWave = 60 * 600): ScriptedRun {
  const state = createGame();
  const log: HeadlessStepResult[] = [];
  const waves: WaveReport[] = [];
  for (let i = 0; i < WAVES.length && state.phase === 'setup'; i++) {
    for (const action of script[i] ?? []) log.push(applyAction(state, action));
    log.push(applyAction(state, { type: 'startWave' }));
    const run = applyAction(state, { type: 'runUntilWaveEnds', maxTicks: maxTicksPerWave });
    log.push(run);
    const ticks = run.action === 'runUntilWaveEnds' ? run.ticks : 0;
    waves.push({ wave: state.wave, lives: state.lives, gold: state.gold, ticks, phase: state.phase });
  }
  return { state, log, waves };
}

/**
 * Start each of the 10 waves and run it to its end, with no towers.
 * `maxTicksPerWave` caps each wave's run so a bug cannot loop forever.
 */
export function playAllWavesNoTowers(maxTicksPerWave = 60 * 600): GameState {
  const script: HeadlessAction[] = [];
  for (let i = 0; i < WAVES.length; i++) {
    script.push({ type: 'startWave' }, { type: 'runUntilWaveEnds', maxTicks: maxTicksPerWave });
  }
  return runHeadless(script).state;
}

/** One Musketeer on spot 0 and nothing else. Expected to lose. */
export function lazyBuild(): WaveScript {
  return [[{ type: 'build', spotId: 0, tower: 'musketeer' }]];
}

const m = (spotId: number): BuildAction => ({ type: 'build', spotId, tower: 'musketeer' });
const c = (spotId: number): BuildAction => ({ type: 'build', spotId, tower: 'cannon' });
const t = (spotId: number): BuildAction => ({ type: 'build', spotId, tower: 'tarpit' });
const up = (spotId: number): BuildAction => ({ type: 'upgrade', spotId });

/**
 * A sensible build that wins all 10 waves. Musketeers on the first corners
 * (spots 0, 2, 4), an upgraded Tar Pit at spot 6 ahead of Cannons at 7 and 9
 * on the long middle and late segments, then upgrades as gold allows. The
 * Tar Pit is upgraded at once: its base range (80) only grazes the path
 * from spot 6. Every action is affordable when it runs.
 */
export function soundBuild(): WaveScript {
  return [
    [m(0), m(2)], // before wave 1: 100 gold
    [up(0)],
    [up(2), m(4)],
    [t(6), up(6)],
    [c(7)],
    [up(4)],
    [c(9), up(7), m(5)],
    [up(9), up(5)],
  ];
}
