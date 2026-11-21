// Headless runner: plays a script of actions against a fresh game, with no
// rendering. Used by tests and, from milestone 6, by balance reports.
//
// A script is an ordered list of actions. Time only passes inside run
// actions; every other action happens on the current tick. Milestone 2 adds
// build/upgrade/sell as new members of the HeadlessAction union.

import { createGame, startWave, tick, type StartWaveResult } from './game';
import type { GameState } from './types';
import { WAVES } from './waves';

export type HeadlessAction =
  | { type: 'startWave' }
  /** Tick until the current wave ends (phase leaves 'wave') or `maxTicks` pass. */
  | { type: 'runUntilWaveEnds'; maxTicks: number };

export type HeadlessStepResult =
  | { action: 'startWave'; result: StartWaveResult }
  | { action: 'runUntilWaveEnds'; ticks: number };

export interface HeadlessRun {
  state: GameState;
  /** One entry per action, in script order. */
  log: HeadlessStepResult[];
}

export function runHeadless(script: readonly HeadlessAction[]): HeadlessRun {
  const state = createGame();
  const log: HeadlessStepResult[] = [];
  for (const action of script) {
    switch (action.type) {
      case 'startWave':
        log.push({ action: 'startWave', result: startWave(state) });
        break;
      case 'runUntilWaveEnds': {
        let ticks = 0;
        while (state.phase === 'wave' && ticks < action.maxTicks) {
          tick(state);
          ticks += 1;
        }
        log.push({ action: 'runUntilWaveEnds', ticks });
        break;
      }
    }
  }
  return { state, log };
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
