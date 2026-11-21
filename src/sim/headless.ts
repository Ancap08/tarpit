// Headless runner: plays a script of actions against a fresh game, with no
// rendering. Used by tests, `npm run sim`, and from milestone 6 balance work.
//
// A script is an ordered list of actions. Time only passes inside run
// actions; every other action happens on the current tick.

import { buildTower, sellTower, towerAt, upgradeTower, type BuildResult, type SellResult, type UpgradeResult } from './actions';
import { createGame, startWave, tick, type StartWaveResult } from './game';
import type { GameState, TowerType } from './types';
import { buildableCells, cellCenter, cellFromKey, cellKey, CELL, MIN_PATH_CLEARANCE, nearestPathPoint, type Cell } from './grid';
import { TOWER_DEFS } from './towers';
import { WAVES } from './waves';

export type BuildAction =
  | { type: 'build'; cell: Cell; tower: TowerType }
  | { type: 'upgrade'; cell: Cell }
  | { type: 'sell'; cell: Cell };

export type HeadlessAction =
  | { type: 'startWave' }
  /** Tick until the current wave ends (phase leaves 'wave') or `maxTicks` pass. */
  | { type: 'runUntilWaveEnds'; maxTicks: number }
  | BuildAction;

export type HeadlessStepResult =
  | { action: 'startWave'; result: StartWaveResult }
  | { action: 'runUntilWaveEnds'; ticks: number }
  | { action: 'build'; cell: Cell; result: BuildResult }
  | { action: 'upgrade'; cell: Cell; result: UpgradeResult }
  | { action: 'sell'; cell: Cell; result: SellResult };

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
      return { action: 'build', cell: action.cell, result: buildTower(state, action.cell, action.tower) };
    case 'upgrade':
      return { action: 'upgrade', cell: action.cell, result: upgradeTower(state, action.cell) };
    case 'sell':
      return { action: 'sell', cell: action.cell, result: sellTower(state, action.cell) };
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
 * Cells a kid builds on hug the path: buildable cells in the first ring
 * beside the path strip, whose centre is less than one cell further out than
 * the minimum clearance (36 + 32 = 68 px from the centreline).
 */
export const KID_BAND = MIN_PATH_CLEARANCE + CELL;

/**
 * The order a kid fills cells, hugging the path from the entrance: buildable
 * cells in KID_BAND, sorted by how far along the path their nearest path
 * point lies (spawn first), then by distance to the path, then by cellKey.
 */
export const KID_CELL_ORDER: readonly Cell[] = buildableCells()
  .map((ok, key) => ({ ok, key, cell: cellFromKey(key) }))
  .filter((c) => c.ok)
  .map((c) => ({ ...c, near: nearestPathPoint(cellCenter(c.cell)) }))
  .filter((c) => c.near.distance < KID_BAND)
  .sort((a, b) => a.near.along - b.near.along || a.near.distance - b.near.distance || a.key - b.key)
  .map((c) => c.cell);

function nextFreeKidCell(state: GameState): Cell | undefined {
  return KID_CELL_ORDER.find((cell) => !towerAt(state, cell));
}

/** Archetype 1: build nothing. Target: lost by wave 3. */
export function noTowers(): WaveScript {
  return [];
}

/**
 * Archetype 2, a kid's build: before each wave, buy base Musketeers while
 * affordable, on cells in KID_CELL_ORDER. Never upgrades, never sells.
 * v1 target (suspended until milestone 12): lost on wave 6, 7 or 8.
 */
export function lazyBuild(): WaveScript {
  return recordScript((state) => {
    const cell = nextFreeKidCell(state);
    if (cell === undefined || state.gold < TOWER_DEFS.musketeer.cost) return undefined;
    return { type: 'build', cell, tower: 'musketeer' };
  });
}

/**
 * Archetype 3: like lazyBuild, but an unupgraded Musketeer is upgraded
 * (when affordable) before another is bought, so purchases alternate buy,
 * upgrade, buy. v1 target (suspended until milestone 12): lost on wave 8 to
 * 10, or won with at most 5 lives.
 */
export function greedyMusket(): WaveScript {
  return recordScript((state) => {
    const plain = state.towers.find((tw) => tw.type === 'musketeer' && !tw.upgraded);
    if (plain) {
      return state.gold >= TOWER_DEFS.musketeer.upgradeCost ? { type: 'upgrade', cell: plain.cell } : undefined;
    }
    const cell = nextFreeKidCell(state);
    if (cell === undefined || state.gold < TOWER_DEFS.musketeer.cost) return undefined;
    return { type: 'build', cell, tower: 'musketeer' };
  });
}

/**
 * Cheap spam (milestone 10): before each wave, buy base Longbows while
 * affordable, on cells in KID_CELL_ORDER. Never upgrades, never sells.
 * v2 target (milestone 12): lost on wave 7 to 9.
 */
export function longbowSpam(): WaveScript {
  return recordScript((state) => {
    const cell = nextFreeKidCell(state);
    if (cell === undefined || state.gold < TOWER_DEFS.longbow.cost) return undefined;
    return { type: 'build', cell, tower: 'longbow' };
  });
}

const m = (col: number, row: number): BuildAction => ({ type: 'build', cell: { col, row }, tower: 'musketeer' });
const c = (col: number, row: number): BuildAction => ({ type: 'build', cell: { col, row }, tower: 'cannon' });
const t = (col: number, row: number): BuildAction => ({ type: 'build', cell: { col, row }, tower: 'tarpit' });
const lb = (col: number, row: number): BuildAction => ({ type: 'build', cell: { col, row }, tower: 'longbow' });
const mo = (col: number, row: number): BuildAction => ({ type: 'build', cell: { col, row }, tower: 'mortar' });
const fp = (col: number, row: number): BuildAction => ({ type: 'build', cell: { col, row }, tower: 'firepot' });
const up = (col: number, row: number): BuildAction => ({ type: 'upgrade', cell: { col, row } });

/** Gold the action costs in this state (0 if the sim would refuse it anyway). */
function actionCost(state: GameState, action: BuildAction): number {
  if (action.type === 'build') return TOWER_DEFS[action.tower].cost;
  if (action.type === 'upgrade') {
    const tower = towerAt(state, action.cell);
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
 * The sound build's plan, in purchase order (cells as col, row). Musketeers
 * by the first corners, upgraded early. Then a Tar Pit where the top run
 * turns into the long middle run, with Cannons behind it on that run:
 * slowed enemies bunch up inside the splash. Then more Musketeers along the
 * bottom and final runs, each upgraded as soon as gold allows.
 */
export const SOUND_PLAN: readonly BuildAction[] = [
  m(2, 5), m(7, 5), up(2, 5), up(7, 5), t(10, 5), c(15, 4), up(10, 5), up(15, 4), c(15, 9), up(15, 9),
  m(18, 9), up(18, 9), m(23, 8), up(23, 8), m(7, 7), up(7, 7), m(2, 9), up(2, 9), m(23, 3), up(23, 3),
];

/**
 * Archetype 4, a thoughtful mixed build: SOUND_PLAN, each action bought as
 * soon as gold allows. Must win (milestone 8); the v1 targets of 5 to 15
 * lives and under 150 gold after wave 9 return in milestone 12.
 */
export function soundBuild(): WaveScript {
  return recordScript(followPlan(SOUND_PLAN));
}

/**
 * soundBuild with every Tar Pit action removed: no Tar Pit builds and no
 * upgrades on the cells where soundBuild builds them. Must not do better
 * than soundBuild (milestone 8); strictly worse returns in milestone 12.
 */
export function soundBuildNoTar(): WaveScript {
  const script = soundBuild();
  const tarCells = new Set(script.flat().filter((a) => a.type === 'build' && a.tower === 'tarpit').map((a) => cellKey(a.cell)));
  return script.map((wave) => wave.filter((a) => !tarCells.has(cellKey(a.cell))));
}

/** The script without the actions on cells where `script` builds a `type` tower. */
function withoutTowerType(script: WaveScript, type: TowerType): WaveScript {
  const cells = new Set(script.flat().filter((a) => a.type === 'build' && a.tower === type).map((a) => cellKey(a.cell)));
  return script.map((wave) => wave.filter((a) => !cells.has(cellKey(a.cell))));
}

/**
 * The combo build's plan (milestone 10), in purchase order (cells as col,
 * row). Two Longbows by the first corner for the early Goblins and the
 * Wolves. Then a Tar Pit (14,6) and a Fire Pot (14,8) side by side right of
 * the long downhill run (x = 420): their ranges overlap on y 182..287 of
 * that run, so tarred enemies burn at double rate. A Mortar (17,6) in the
 * middle of the map reaches the downhill, bottom and uphill runs for the
 * Trolls; upgrades to the combo next, a third Longbow, then upgrades, a
 * second Mortar (17,9) and a fourth Longbow (19,7). Found in two runs of
 * `npm run sim` (DEVLOG, milestone 10).
 */
export const COMBO_PLAN: readonly BuildAction[] = [
  lb(6, 5), lb(2, 5), t(14, 6), fp(14, 8), mo(17, 6), up(14, 6), up(14, 8), lb(11, 4), up(17, 6),
  up(6, 5), up(2, 5), mo(17, 9), up(17, 9), lb(19, 7), up(11, 4), up(19, 7),
];

/**
 * Combo build (milestone 10): COMBO_PLAN, each action bought as soon as gold
 * allows. Must win all 10 waves.
 */
export function comboBuild(): WaveScript {
  return recordScript(followPlan(COMBO_PLAN));
}

/**
 * comboBuild with every Fire Pot action removed: no Fire Pot builds and no
 * upgrades on the cells where comboBuild builds them. Must do worse than
 * comboBuild: lost, or won with fewer lives.
 */
export function comboBuildNoFire(): WaveScript {
  return withoutTowerType(comboBuild(), 'firepot');
}

/** Every archetype, in report order. */
export const ARCHETYPES: Readonly<Record<string, () => WaveScript>> = {
  noTowers,
  lazyBuild,
  greedyMusket,
  soundBuild,
  soundBuildNoTar,
  longbowSpam,
  comboBuild,
  comboBuildNoFire,
};
