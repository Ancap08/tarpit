// Headless runner: plays a script of actions against a fresh game, with no
// rendering. Used by tests, `npm run sim`, and from milestone 6 balance work.
//
// A script is an ordered list of actions. Time only passes inside run
// actions; every other action happens on the current tick.

import { buildTower, sellTower, towerAt, upgradeTower, type BuildResult, type SellResult, type UpgradeResult } from './actions';
import { createGame, startWave, tick, type StartWaveResult } from './game';
import type { GameState, TowerType } from './types';
import { MAP } from './map';
import { TOWER_DEFS } from './towers';
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

// ---------------------------------------------------------------------------
// Balance archetypes (milestone 6a). Each returns a WaveScript, so the e2e
// runScript hook and playScripted replay them unchanged. The rule-based
// archetypes (lazy, greedy) decide by playing the game: before each wave they
// look at the gold they have and record what they buy. The sim is
// deterministic, so replaying the recorded script gives the same game.

/** Decide the next action before a wave, or undefined to start the wave. */
type Decide = (state: GameState) => BuildAction | undefined;

/** Play all waves, asking `decide` for actions before each one; return what it did. */
function recordScript(decide: Decide): WaveScript {
  const state = createGame();
  const script: BuildAction[][] = [];
  for (let i = 0; i < WAVES.length && state.phase === 'setup'; i++) {
    const actions: BuildAction[] = [];
    for (let action = decide(state); action; action = decide(state)) {
      const step = applyAction(state, action);
      if ('result' in step && !step.result.ok) throw new Error(`recordScript: ${JSON.stringify(step)}`);
      actions.push(action);
    }
    script.push(actions);
    applyAction(state, { type: 'startWave' });
    applyAction(state, { type: 'runUntilWaveEnds', maxTicks: 60 * 600 });
  }
  return script;
}

/**
 * The order a kid fills spots: nearest the path entrance (the spawn) first,
 * by straight-line distance; ties go to the lower spot id.
 */
export const KID_SPOT_ORDER: readonly number[] = MAP.buildSpots
  .map((spot, id) => ({ id, d: Math.hypot(spot.x - MAP.path[0].x, spot.y - MAP.path[0].y) }))
  .sort((a, b) => a.d - b.d || a.id - b.id)
  .map((s) => s.id);

function nextFreeKidSpot(state: GameState): number | undefined {
  return KID_SPOT_ORDER.find((id) => !towerAt(state, id));
}

/** Archetype 1: build nothing. Target: lost by wave 3. */
export function noTowers(): WaveScript {
  return [];
}

/**
 * Archetype 2, a kid's build: before each wave, buy base Musketeers while
 * affordable, on spots in KID_SPOT_ORDER. Never upgrades, never sells.
 * Target: lost on wave 6, 7 or 8.
 */
export function lazyBuild(): WaveScript {
  return recordScript((state) => {
    const spotId = nextFreeKidSpot(state);
    if (spotId === undefined || state.gold < TOWER_DEFS.musketeer.cost) return undefined;
    return { type: 'build', spotId, tower: 'musketeer' };
  });
}

/**
 * Archetype 3: like lazyBuild, but an unupgraded Musketeer is upgraded
 * (when affordable) before another is bought, so purchases alternate buy,
 * upgrade, buy. Target: lost on wave 8 to 10, or won with at most 5 lives.
 */
export function greedyMusket(): WaveScript {
  return recordScript((state) => {
    const plain = state.towers.find((tw) => tw.type === 'musketeer' && !tw.upgraded);
    if (plain) {
      return state.gold >= TOWER_DEFS.musketeer.upgradeCost ? { type: 'upgrade', spotId: plain.spotId } : undefined;
    }
    const spotId = nextFreeKidSpot(state);
    if (spotId === undefined || state.gold < TOWER_DEFS.musketeer.cost) return undefined;
    return { type: 'build', spotId, tower: 'musketeer' };
  });
}

const m = (spotId: number): BuildAction => ({ type: 'build', spotId, tower: 'musketeer' });
const c = (spotId: number): BuildAction => ({ type: 'build', spotId, tower: 'cannon' });
const t = (spotId: number): BuildAction => ({ type: 'build', spotId, tower: 'tarpit' });
const up = (spotId: number): BuildAction => ({ type: 'upgrade', spotId });

/** Gold the action costs in this state (0 if the sim would refuse it anyway). */
function actionCost(state: GameState, action: BuildAction): number {
  if (action.type === 'build') return TOWER_DEFS[action.tower].cost;
  if (action.type === 'upgrade') {
    const tower = towerAt(state, action.spotId);
    return tower ? TOWER_DEFS[tower.type].upgradeCost : 0;
  }
  return 0;
}

/** Take the plan's actions in order, each as soon as it is affordable. */
function followPlan(plan: readonly BuildAction[]): Decide {
  let next = 0;
  return (state) => {
    const action = plan[next];
    if (!action || state.gold < actionCost(state, action)) return undefined;
    next += 1;
    return action;
  };
}

/**
 * The sound build's plan, in purchase order. Musketeers on the first
 * corners (spots 0, 2), upgraded early. Then a Tar Pit at spot 4, where the
 * top run turns into the long middle run, with Cannons behind it at spots 5
 * and 6 on that run: slowed enemies bunch up inside the splash. Then more
 * Musketeers further on, each upgraded as soon as gold allows.
 */
export const SOUND_PLAN: readonly BuildAction[] = [
  m(0), m(2), up(0), up(2), t(4), c(5), up(4), up(5), c(6), up(6), m(7), up(7), m(9), up(9), m(3), up(3), m(1), up(1), m(8), up(8),
];

/**
 * Archetype 4, a thoughtful mixed build: SOUND_PLAN, each action bought as
 * soon as gold allows. Target: won with 5 to 15 lives, under 150 gold
 * after wave 9 (when wave 10 is about to start).
 */
export function soundBuild(): WaveScript {
  return recordScript(followPlan(SOUND_PLAN));
}

/**
 * soundBuild with every Tar Pit action removed: no Tar Pit builds and no
 * upgrades on the spots where soundBuild builds them. Must do strictly worse
 * than soundBuild, which shows Tar Pits matter.
 */
export function soundBuildNoTar(): WaveScript {
  const script = soundBuild();
  const tarSpots = new Set(script.flat().filter((a) => a.type === 'build' && a.tower === 'tarpit').map((a) => a.spotId));
  return script.map((wave) => wave.filter((a) => !tarSpots.has(a.spotId)));
}

/** Every archetype, in report order. */
export const ARCHETYPES: Readonly<Record<string, () => WaveScript>> = {
  noTowers,
  lazyBuild,
  greedyMusket,
  soundBuild,
  soundBuildNoTar,
};
