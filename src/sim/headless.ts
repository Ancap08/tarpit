// Headless runner: plays a script of actions against a fresh game, with no
// rendering. Used by tests, `npm run sim`, and from milestone 6 balance work.
//
// A script is an ordered list of actions. Time only passes inside run
// actions; every other action happens on the current tick.

import { buildTower, sellTower, towerAt, upgradeTower, type BuildResult, type SellResult, type UpgradeResult } from './actions';
import { createGame, startWave, tick, type StartWaveResult } from './game';
import type { GameState, TowerType } from './types';
import { buildableCells, cellCenter, cellFromKey, cellKey, type Cell } from './grid';
import { MAP, pathLength, positionAlongPath } from './map';
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

/** Spacing of the trail walk's step points along the path, in pixels (three cells). */
export const TRAIL_STEP = 96;
/** A step point takes the nearest free buildable cell whose centre is within this many pixels. */
export const TRAIL_REACH = 72;

/**
 * The order a kid fills cells (milestone 12), spread along the trail: walk
 * the path from the spawn in steps of TRAIL_STEP px, starting at path
 * distance TRAIL_STEP. At each step point take the nearest buildable cell
 * whose centre is within TRAIL_REACH px of the point and not already in the
 * list (ties by cellKey); skip the point if there is none. So towers spread
 * along the whole path instead of stacking at the map's left edge.
 */
export const TRAIL_CELL_ORDER: readonly Cell[] = ((): Cell[] => {
  const mask = buildableCells();
  const used = new Set<number>();
  const order: Cell[] = [];
  const total = pathLength(MAP);
  for (let d = TRAIL_STEP; d <= total; d += TRAIL_STEP) {
    const p = positionAlongPath(MAP, d);
    let best: { key: number; dist: number } | undefined;
    mask.forEach((ok, key) => {
      if (!ok || used.has(key)) return;
      const ctr = cellCenter(cellFromKey(key));
      const dist = Math.hypot(ctr.x - p.x, ctr.y - p.y);
      if (dist <= TRAIL_REACH && (!best || dist < best.dist)) best = { key, dist };
    });
    if (best) {
      used.add(best.key);
      order.push(cellFromKey(best.key));
    }
  }
  return order;
})();

function nextFreeKidCell(state: GameState): Cell | undefined {
  return TRAIL_CELL_ORDER.find((cell) => !towerAt(state, cell));
}

/** Archetype 1: build nothing. Target: lost by wave 3. */
export function noTowers(): WaveScript {
  return [];
}

/**
 * Archetype 2, a kid's build: before each wave, buy base Musketeers while
 * affordable, on cells in TRAIL_CELL_ORDER. Never upgrades, never sells.
 * v2 target (milestone 12): lost on wave 6, 7 or 8.
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
 * upgrade, buy. Informational since milestone 12: no target.
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
 * affordable, on cells in TRAIL_CELL_ORDER. Never upgrades, never sells.
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
 * soon as gold allows. v1 towers only. Informational since milestone 12: no
 * target (the combo build carries the v2 targets).
 */
export function soundBuild(): WaveScript {
  return recordScript(followPlan(SOUND_PLAN));
}

/**
 * soundBuild with every Tar Pit action removed: no Tar Pit builds and no
 * upgrades on the cells where soundBuild builds them. Informational since
 * milestone 12: no target.
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
 * The combo build's plan (re-planned in milestone 12), in purchase order
 * (cells as col, row). Two Longbows at (9,5) and (9,4) inside the first U,
 * where a 150 px range reaches the climb, the top run and the downhill run.
 * Then a Tar Pit (14,10) and a Fire Pot (14,9) inside the bottom-left corner
 * of the second U: both reach the end of the downhill run and the start of
 * the bottom run, so tarred enemies burn at double rate there. A Mortar
 * (17,6) in the middle of the second U reaches the downhill, bottom and
 * uphill runs for the Trolls. Then upgrades to the combo, the Mortar and the
 * first Longbows as gold allows, a second Mortar (9,7) in the first U,
 * Longbows (17,9) and (17,10) on the bottom of the second U, and a second
 * Tar Pit and Fire Pot pair at (11,4) and (10,4) on the top run. Milestone
 * 22 adds anti-air: a third Longbow (17,8) before the Mortar, bought before
 * wave 4 so the first Harpies meet three bows, and its upgrade as the last
 * action. Every action is bought by wave 10.
 */
export const COMBO_PLAN: readonly BuildAction[] = [
  lb(9, 5), lb(9, 4), t(14, 10), fp(14, 9), lb(17, 8), mo(17, 6), up(14, 10), up(14, 9), lb(17, 9), up(17, 6),
  up(9, 5), up(9, 4), mo(9, 7), lb(17, 10), up(17, 9), up(9, 7), up(17, 10), t(11, 4), fp(10, 4), up(11, 4),
  up(17, 8),
];

/**
 * Combo build (milestone 10): COMBO_PLAN, each action bought as soon as gold
 * allows. v2 target (milestone 12): won with 5 to 15 lives and under 150
 * gold after wave 9.
 */
export function comboBuild(): WaveScript {
  return recordScript(followPlan(COMBO_PLAN));
}

/**
 * comboBuild with every Fire Pot action removed: no Fire Pot builds and no
 * upgrades on the cells where comboBuild builds them. v2 target (milestone
 * 12): strictly worse than comboBuild (lost, or won with fewer lives).
 */
export function comboBuildNoFire(): WaveScript {
  return withoutTowerType(comboBuild(), 'firepot');
}

/** The first wave with Harpies (WAVES). */
export const FIRST_HARPY_WAVE = 4;

/**
 * comboBuild without anti-air from the first Harpy wave on (milestone 22):
 * in setup before wave FIRST_HARPY_WAVE, sell every Musketeer and Longbow
 * built so far, and drop every later action on the cells where comboBuild
 * builds one (builds and upgrades). The refunds and the gold those actions
 * would have cost are spent on nothing; the other actions keep their waves.
 * Removing the actions from wave 1 instead (no sells) loses on wave 2,
 * before any Harpy, because the combo build opens with Longbows; that
 * variant is pinned in balance.test.ts as the reason for the sells.
 * Target: every Harpy of wave 4 exits, and the game is lost by wave 8.
 */
export function noAntiAir(): WaveScript {
  const script = comboBuild();
  const before = FIRST_HARPY_WAVE - 1;
  const antiAir = (a: BuildAction) => a.type === 'build' && (a.tower === 'musketeer' || a.tower === 'longbow');
  const cells = new Set(script.flat().filter(antiAir).map((a) => cellKey(a.cell)));
  const owned = script.slice(0, before).flat().filter(antiAir).map((a) => a.cell);
  return script.map((wave, i) => {
    if (i < before) return wave;
    const kept = wave.filter((a) => !cells.has(cellKey(a.cell)));
    return i === before ? [...owned.map((cell): BuildAction => ({ type: 'sell', cell })), ...kept] : kept;
  });
}

/**
 * comboBuild with every Musketeer and Longbow action removed from wave 1
 * (like withoutTowerType). Not an archetype: it loses on wave 2, before any
 * Harpy, which is why noAntiAir sells its bows before wave 4 instead.
 */
export function comboBuildNoBows(): WaveScript {
  return withoutTowerType(withoutTowerType(comboBuild(), 'musketeer'), 'longbow');
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
  noAntiAir,
};
