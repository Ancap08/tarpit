// Headless runner: plays a script of actions against a fresh game, with no
// rendering. Used by tests, `npm run sim`, and from milestone 6 balance work.
//
// A script is an ordered list of actions. Time only passes inside run
// actions; every other action happens on the current tick.
//
// Milestone 25b: a special attack is an action with a wave tick and a
// position ({ type: 'special', special, x, y, atWaveTick }). A WaveScript
// may carry `timed`, per wave, a list of them next to the pre-wave
// actions; playScripted fires each when the wave's tick counter reaches its
// atWaveTick. Scripts without `timed` play exactly as before.
//
// Milestone 25c adds two timed actions: { type: 'callEarly', atWaveTick }
// calls the next wave early (game.ts callNextWave), and { type:
// 'clusterSpecial', atWaveTick } fires the best unlocked special at the
// densest cluster of enemies at that moment (densestCluster), the aim
// computed from the live state when it fires. When a wave is called early,
// playScripted applies the next wave's pre-wave actions at once (mid-wave,
// so the towers lock at once) and plays that wave without a startWave.
//
// Milestone 26: a WaveScript with `endless: true` presses Keep going
// (continueEndless) when wave 10 is won and plays on, wave by wave, until
// the game is lost or ENDLESS_WAVE_CAP waves have been played. Scripts
// without it play exactly as before.

import {
  buildTower,
  moveTower,
  sellTower,
  setTargeting,
  towerAt,
  undoUpgrade,
  upgradeTower,
  useSpecial,
  type BuildResult,
  type MoveResult,
  type SpecialResult,
  type UndoUpgradeResult,
  type SellResult,
  type TargetingResult,
  type UpgradeResult,
} from './actions';
import type { Difficulty } from './difficulty';
import { callNextWave, continueEndless, createGame, startWave, tick, wavesCleared, type CallNextWaveResult, type StartWaveResult } from './game';
import { enemyPosition } from './combat';
import { isSpecialUnlocked, type SpecialType } from './specials';
import type { GameState, TargetingMode, TowerType } from './types';
import { buildableCells, cellCenter, cellFromKey, cellKey, type Cell } from './grid';
import { MAP, pathLength, positionAlongPath } from './map';
import { TOWER_DEFS } from './towers';
import { ENDLESS_BASE_WAVES, LAST_WAVE, WAVES } from './waves';

export type BuildAction =
  | { type: 'build'; cell: Cell; tower: TowerType }
  | { type: 'upgrade'; cell: Cell }
  | { type: 'sell'; cell: Cell }
  /** Set a tower's targeting mode (milestone 24); costs nothing. */
  | { type: 'target'; cell: Cell; mode: TargetingMode };

/**
 * Planning-phase actions (milestone 25a), setup only. Kept out of
 * BuildAction (the archetypes' WaveScript entries, which all carry a cell).
 */
export type PlanningAction =
  /** Move an unlocked tower; free. */
  | { type: 'move'; from: Cell; to: Cell }
  /** Undo an upgrade bought this setup phase; full refund. */
  | { type: 'undoUpgrade'; cell: Cell };

/**
 * A special attack (milestone 25b) aimed at (x, y). In a WaveScript's
 * `timed` list it fires when the wave tick counter (state.waveTick) reaches
 * atWaveTick, that is after atWaveTick ticks of the wave; applied directly
 * (applyAction, runHeadless) it fires at once and atWaveTick is not read.
 */
export interface SpecialAction {
  type: 'special';
  special: SpecialType;
  x: number;
  y: number;
  atWaveTick: number;
}

/**
 * Call the next wave early (milestone 25c, game.ts callNextWave). In a
 * WaveScript's `timed` list it fires when state.waveTick reaches
 * atWaveTick; applied directly it fires at once.
 */
export interface CallEarlyAction {
  type: 'callEarly';
  atWaveTick: number;
}

/**
 * Fire the best unlocked special (bestUnlockedSpecial) at the centroid of
 * the densest cluster of enemies (densestCluster, CLUSTER_RADIUS px) in the
 * live state at that moment (milestone 25c). Nothing fires, and the charge
 * is kept, when no enemy is alive. Timed like SpecialAction.
 */
export interface ClusterSpecialAction {
  type: 'clusterSpecial';
  atWaveTick: number;
}

/** Actions a WaveScript's `timed` list may hold. */
export type TimedAction = SpecialAction | CallEarlyAction | ClusterSpecialAction;

export type HeadlessAction =
  | { type: 'startWave' }
  /** Tick until the current wave ends (phase leaves 'wave') or `maxTicks` pass. */
  | { type: 'runUntilWaveEnds'; maxTicks: number }
  | BuildAction
  | PlanningAction
  | TimedAction;

export type HeadlessStepResult =
  | { action: 'startWave'; result: StartWaveResult }
  | { action: 'runUntilWaveEnds'; ticks: number }
  | { action: 'build'; cell: Cell; result: BuildResult }
  | { action: 'upgrade'; cell: Cell; result: UpgradeResult }
  | { action: 'sell'; cell: Cell; result: SellResult }
  | { action: 'target'; cell: Cell; result: TargetingResult }
  | { action: 'move'; from: Cell; to: Cell; result: MoveResult }
  | { action: 'undoUpgrade'; cell: Cell; result: UndoUpgradeResult }
  | { action: 'special'; special: SpecialType; x: number; y: number; waveTick: number; result: SpecialResult }
  | { action: 'callEarly'; waveTick: number; result: CallNextWaveResult }
  /** A clusterSpecial with no enemy alive (or nothing unlocked): nothing fired. */
  | { action: 'clusterSpecial'; waveTick: number; fired: false };

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
    case 'target':
      return { action: 'target', cell: action.cell, result: setTargeting(state, action.cell, action.mode) };
    case 'move':
      return { action: 'move', from: action.from, to: action.to, result: moveTower(state, action.from, action.to) };
    case 'undoUpgrade':
      return { action: 'undoUpgrade', cell: action.cell, result: undoUpgrade(state, action.cell) };
    case 'special': {
      const { special, x, y } = action;
      return { action: 'special', special, x, y, waveTick: state.waveTick, result: useSpecial(state, special, { x, y }) };
    }
    case 'callEarly':
      return { action: 'callEarly', waveTick: state.waveTick, result: callNextWave(state) };
    case 'clusterSpecial': {
      const aim = densestCluster(state);
      const special = bestUnlockedSpecial(state.wave);
      if (!aim || !special) return { action: 'clusterSpecial', waveTick: state.waveTick, fired: false };
      const { x, y } = aim.centroid;
      return { action: 'special', special, x, y, waveTick: state.waveTick, result: useSpecial(state, special, { x, y }) };
    }
  }
}

/** The cluster radius the clusterSpecial policy looks for (milestone 25c): the Powder Keg's radius. */
export const CLUSTER_RADIUS = 70;

/**
 * The order clusterSpecial prefers the specials in (milestone 25c): the
 * first one unlocked on the current wave is fired.
 */
export const CLUSTER_SPECIAL_ORDER: readonly SpecialType[] = ['fireArrows', 'tarBarrel', 'keg'];

/** The first special in CLUSTER_SPECIAL_ORDER unlocked on `wave`, or undefined. */
export function bestUnlockedSpecial(wave: number): SpecialType | undefined {
  return CLUSTER_SPECIAL_ORDER.find((type) => isSpecialUnlocked(type, wave));
}

export interface Cluster {
  /** Ids of the enemies in the cluster, ascending. */
  ids: number[];
  /** Mean position of those enemies. */
  centroid: { x: number; y: number };
}

/**
 * The densest cluster of live enemies (milestone 25c). Every live enemy is
 * a candidate centre; its cluster is every live enemy (flyers included)
 * whose position is within `radius` px of it, inclusive. The cluster with
 * the most enemies wins; ties go to the cluster containing the lowest enemy
 * id, then to the candidate with the lower id. Returns its members and
 * their centroid, or undefined when no enemy is alive. Deterministic.
 */
export function densestCluster(state: GameState, radius = CLUSTER_RADIUS): Cluster | undefined {
  const pos = state.enemies.map((e) => ({ id: e.id, p: enemyPosition(e) }));
  let best: { ids: number[]; candidate: number } | undefined;
  for (const centre of pos) {
    const ids = pos.filter((o) => Math.hypot(o.p.x - centre.p.x, o.p.y - centre.p.y) <= radius).map((o) => o.id);
    ids.sort((a, b) => a - b);
    const better =
      !best ||
      ids.length > best.ids.length ||
      (ids.length === best.ids.length && (ids[0] < best.ids[0] || (ids[0] === best.ids[0] && centre.id < best.candidate)));
    if (better) best = { ids, candidate: centre.id };
  }
  if (!best) return undefined;
  const members = new Set(best.ids);
  const inside = pos.filter((o) => members.has(o.id));
  const x = inside.reduce((n, o) => n + o.p.x, 0) / inside.length;
  const y = inside.reduce((n, o) => n + o.p.y, 0) / inside.length;
  return { ids: best.ids, centroid: { x, y } };
}

export function runHeadless(script: readonly HeadlessAction[], difficulty?: Difficulty): HeadlessRun {
  const state = createGame({ difficulty });
  const log = script.map((action) => applyAction(state, action));
  return { state, log };
}

/**
 * Per wave (entry i for wave i + 1), the timed actions taken during it:
 * special attacks (milestone 25b), early calls and cluster specials
 * (milestone 25c).
 */
export type TimedScript = readonly (readonly TimedAction[])[];

/**
 * A scripted game: entry i lists the build, upgrade and sell actions taken
 * in setup before wave i + 1. Missing entries mean no actions that wave.
 * `timed` (milestone 25b, optional) lists, per wave, the special attacks
 * fired during it; no existing archetype has it.
 */
export type WaveScript = readonly (readonly BuildAction[])[] & {
  readonly timed?: TimedScript;
  /**
   * Milestone 26: press Keep going after the win and play endless waves
   * (entry i still holds wave i + 1's actions) until lost or
   * ENDLESS_WAVE_CAP waves have been played.
   */
  readonly endless?: boolean;
};

/**
 * Safety cap for endless runs (milestone 26): a scripted endless game stops
 * after this many waves even if it is still alive, so a run cannot loop
 * forever. `npm run sim` reports a run that hits it.
 */
export const ENDLESS_WAVE_CAP = 200;

/** How many waves a script plays at most: 10, or ENDLESS_WAVE_CAP for an endless script. */
function waveLimit(script: { readonly endless?: boolean } | undefined): number {
  return script?.endless ? ENDLESS_WAVE_CAP : WAVES.length;
}

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
 * `difficulty` (milestone 25) defaults to Normal. An endless script
 * (milestone 26) presses Keep going after the win and plays on until lost
 * or ENDLESS_WAVE_CAP waves.
 */
export function playScripted(script: WaveScript, maxTicksPerWave = 60 * 600, difficulty?: Difficulty): ScriptedRun {
  const state = createGame({ difficulty });
  const log: HeadlessStepResult[] = [];
  const waves: WaveReport[] = [];
  let called = false;
  const limit = waveLimit(script);
  for (let i = 0; i < limit && (state.phase === 'setup' || called); i++) {
    for (const action of script[i] ?? []) log.push(applyAction(state, action));
    // A wave called early (milestone 25c) has already started.
    if (!called) log.push(applyAction(state, { type: 'startWave' }));
    const timed = script.timed?.[i] ?? [];
    let ticks: number;
    if (timed.length === 0) {
      const run = applyAction(state, { type: 'runUntilWaveEnds', maxTicks: maxTicksPerWave });
      log.push(run);
      ticks = run.action === 'runUntilWaveEnds' ? run.ticks : 0;
    } else {
      ticks = runWaveWithTimed(state, timed, maxTicksPerWave, log);
    }
    called = state.phase === 'wave' && state.wave === i + 2;
    waves.push({ wave: i + 1, lives: state.lives, gold: state.gold, ticks, phase: called ? 'setup' : state.phase });
    if (script.endless && state.phase === 'won') continueEndless(state);
  }
  return { state, log, waves };
}

/**
 * Run the current wave like runUntilWaveEnds, firing each timed action
 * (in list order) before the tick on which state.waveTick equals its
 * atWaveTick. Timed actions whose tick never comes (the wave ended first)
 * are not fired. Stops at once, without ticking, when an action called the
 * next wave early (milestone 25c); the caller plays that wave next. Logs
 * each fired action, then one runUntilWaveEnds entry with the wave's tick
 * count; returns that count.
 */
function runWaveWithTimed(state: GameState, timed: readonly TimedAction[], maxTicks: number, log: HeadlessStepResult[]): number {
  const wave = state.wave;
  let ticks = 0;
  outer: while (state.phase === 'wave' && ticks < maxTicks) {
    for (const action of timed) {
      if (action.atWaveTick !== state.waveTick) continue;
      log.push(applyAction(state, action));
      if (state.wave !== wave) break outer;
    }
    tick(state);
    ticks += 1;
  }
  log.push({ action: 'runUntilWaveEnds', ticks });
  return ticks;
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

/**
 * Play all waves on `difficulty` (Normal when left out), asking `decide`
 * for actions before each one; return what it did. With `timed`
 * (milestone 25c), each wave also plays its timed actions (as in
 * playScripted) and the returned script carries them, so a replay with
 * playScripted is the same game.
 */
function recordScript(decide: Decide, difficulty?: Difficulty, timed?: TimedScript, endless = false): WaveScript {
  const state = createGame({ difficulty });
  const script: BuildAction[][] = [];
  const limit = waveLimit({ endless });
  for (let i = 0; i < limit && state.phase === 'setup'; i++) {
    const actions: BuildAction[] = [];
    for (let action = decide(state); action; action = decide(state)) {
      const step = applyAction(state, action);
      if ('result' in step && !step.result.ok) throw new Error(`recordScript: ${JSON.stringify(step)}`);
      actions.push(action);
    }
    script.push(actions);
    applyAction(state, { type: 'startWave' });
    runWaveWithTimed(state, timed?.[i] ?? [], 60 * 600, []);
    if (endless && (state.phase as GameState['phase']) === 'won') continueEndless(state);
  }
  const out = timed ? Object.assign(script, { timed }) : script;
  return endless ? Object.assign(out, { endless: true }) : out;
}

/** `script` with each wave's actions filtered by `keep`, keeping its timed actions (milestone 25c). */
function filterScript(script: WaveScript, keep: (action: BuildAction, wave: number) => boolean): WaveScript {
  const out = script.map((wave, i) => wave.filter((a) => keep(a, i)));
  return script.timed ? Object.assign(out, { timed: script.timed }) : out;
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

/** Archetype 1: build nothing (on any level). Target: lost by wave 3. */
export function noTowers(): WaveScript {
  return [];
}

/**
 * Archetype 2, a kid's build: before each wave, buy base Musketeers while
 * affordable, on cells in TRAIL_CELL_ORDER. Never upgrades, never sells.
 * v2 target (milestone 12): lost on wave 6, 7 or 8.
 */
export function lazyBuild(difficulty?: Difficulty): WaveScript {
  return recordScript((state) => {
    const cell = nextFreeKidCell(state);
    if (cell === undefined || state.gold < TOWER_DEFS.musketeer.cost) return undefined;
    return { type: 'build', cell, tower: 'musketeer' };
  }, difficulty);
}

/**
 * Archetype 3: like lazyBuild, but an unupgraded Musketeer is upgraded
 * (when affordable) before another is bought, so purchases alternate buy,
 * upgrade, buy. Informational since milestone 12: no target.
 */
export function greedyMusket(difficulty?: Difficulty): WaveScript {
  return recordScript((state) => {
    const plain = state.towers.find((tw) => tw.type === 'musketeer' && !tw.upgraded);
    if (plain) {
      return state.gold >= TOWER_DEFS.musketeer.upgradeCost ? { type: 'upgrade', cell: plain.cell } : undefined;
    }
    const cell = nextFreeKidCell(state);
    if (cell === undefined || state.gold < TOWER_DEFS.musketeer.cost) return undefined;
    return { type: 'build', cell, tower: 'musketeer' };
  }, difficulty);
}

/**
 * Cheap spam (milestone 10): before each wave, buy base Longbows while
 * affordable, on cells in TRAIL_CELL_ORDER. Never upgrades, never sells.
 * v2 target (milestone 12): lost on wave 7 to 9.
 */
export function longbowSpam(difficulty?: Difficulty): WaveScript {
  return recordScript((state) => {
    const cell = nextFreeKidCell(state);
    if (cell === undefined || state.gold < TOWER_DEFS.longbow.cost) return undefined;
    return { type: 'build', cell, tower: 'longbow' };
  }, difficulty);
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
export function soundBuild(difficulty?: Difficulty): WaveScript {
  return recordScript(followPlan(SOUND_PLAN), difficulty);
}

/**
 * soundBuild with every Tar Pit action removed: no Tar Pit builds and no
 * upgrades on the cells where soundBuild builds them. Informational since
 * milestone 12: no target.
 */
export function soundBuildNoTar(difficulty?: Difficulty): WaveScript {
  const script = soundBuild(difficulty);
  const tarCells = new Set(script.flat().filter((a) => a.type === 'build' && a.tower === 'tarpit').map((a) => cellKey(a.cell)));
  return script.map((wave) => wave.filter((a) => !tarCells.has(cellKey(a.cell))));
}

/** The script without the actions on cells where `script` builds a `type` tower. */
function withoutTowerType(script: WaveScript, type: TowerType): WaveScript {
  const cells = new Set(script.flat().filter((a) => a.type === 'build' && a.tower === type).map((a) => cellKey(a.cell)));
  return filterScript(script, (a) => !cells.has(cellKey(a.cell)));
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
 * of the milestone 22 actions. Milestone 25c appends a gold sink (below).
 * Not every action is bought: on Normal comboBuild buys 28 of the 31 (not
 * the third Mortar's upgrade, the Cannon or its upgrade), on Easy 30 and
 * on Hard 17 before it loses. The unbought tail stays so the plan never
 * runs dry before wave 10 on any level (Easy reaches the Cannon), which
 * keeps the gold left before wave 9 small (balance.test.ts pins the count).
 */
export const COMBO_PLAN: readonly BuildAction[] = [
  lb(9, 5), lb(9, 4), t(14, 10), fp(14, 9), lb(17, 8), mo(17, 6), up(14, 10), up(14, 9), lb(17, 9), up(17, 6),
  up(9, 5), up(9, 4), mo(9, 7), lb(17, 10), up(17, 9), up(9, 7), up(17, 10), t(11, 4), fp(10, 4), up(11, 4),
  up(17, 8),
  // Milestone 25c: the horde pays more, so the plan goes on (bought from
  // about wave 8): three upgraded Longbows inside the second U and the
  // first U, then a third Mortar (16,7) and an upgraded Cannon (15,10).
  // The cheap Longbow pairs come first so the gold left before wave 9 is
  // always under 70.
  lb(16, 8), up(16, 8), lb(9, 6), up(9, 6), lb(16, 9), up(16, 9), mo(16, 7), up(16, 7), c(15, 10), up(15, 10),
];

/**
 * The wave tick at which the archetypes' cluster special fires in each wave
 * (entry i for wave i + 1; milestone 25c). Chosen per wave by a headless
 * scan of comboBuild on Normal: for each wave in turn (earlier waves
 * already firing at their ticks), the first wave tick at which the
 * densest 70 px cluster is largest.
 */
export const CLUSTER_POLICY_TICKS: readonly number[] = [164, 109, 291, 398, 749, 651, 668, 1241, 1194, 713];

/** One clusterSpecial per wave at CLUSTER_POLICY_TICKS (milestone 25c). */
export const CLUSTER_POLICY: TimedScript = CLUSTER_POLICY_TICKS.map((atWaveTick): TimedAction[] => [{ type: 'clusterSpecial', atWaveTick }]);

/**
 * Combo build (milestone 10): COMBO_PLAN, each action bought as soon as gold
 * allows. Milestone 25c: plus the cluster special policy (CLUSTER_POLICY:
 * once per wave, at that wave's CLUSTER_POLICY_TICKS tick, the best
 * unlocked special at the densest 70 px cluster). v4 target (milestone
 * 25c): won with 5 to 15 lives and under 200 gold after wave 9.
 */
export function comboBuild(difficulty?: Difficulty): WaveScript {
  return recordScript(followPlan(COMBO_PLAN), difficulty, CLUSTER_POLICY);
}

/**
 * The combo plan without specials (milestone 25c): COMBO_PLAN, each action
 * as soon as gold allows, and no timed actions; recorded by playing, since
 * the specials' kills change the gold. Target: strictly worse than
 * comboBuild (lost, or fewer lives) but reaches wave 8.
 */
export function comboNoSpecials(difficulty?: Difficulty): WaveScript {
  return recordScript(followPlan(COMBO_PLAN), difficulty);
}

/**
 * comboBuild with every Fire Pot action removed: no Fire Pot builds and no
 * upgrades on the cells where comboBuild builds them; its cluster specials
 * are kept. v2 target (milestone 12): strictly worse than comboBuild (lost,
 * or won with fewer lives).
 */
export function comboBuildNoFire(difficulty?: Difficulty): WaveScript {
  return withoutTowerType(comboBuild(difficulty), 'firepot');
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
 * Target (milestone 25c second pass): at least 75% of the wave 4 Harpies
 * exit, it survives wave 4, and the game is lost on wave 5 to 8.
 */
export function noAntiAir(difficulty?: Difficulty): WaveScript {
  const script = comboBuild(difficulty);
  const before = FIRST_HARPY_WAVE - 1;
  const antiAir = (a: BuildAction) => a.type === 'build' && (a.tower === 'musketeer' || a.tower === 'longbow');
  const cells = new Set(script.flat().filter(antiAir).map((a) => cellKey(a.cell)));
  const owned = script.slice(0, before).flat().filter(antiAir).map((a) => a.cell);
  const out = script.map((wave, i) => {
    if (i < before) return wave;
    const kept = wave.filter((a) => !cells.has(cellKey(a.cell)));
    return i === before ? [...owned.map((cell): BuildAction => ({ type: 'sell', cell })), ...kept] : kept;
  });
  // Milestone 25c: the combo's cluster specials are kept.
  return script.timed ? Object.assign(out, { timed: script.timed }) : out;
}

/**
 * comboBuild with every Musketeer and Longbow action removed from wave 1
 * (like withoutTowerType). Not an archetype: it loses on wave 2, before any
 * Harpy, which is why noAntiAir sells its bows before wave 4 instead.
 */
export function comboBuildNoBows(difficulty?: Difficulty): WaveScript {
  return withoutTowerType(withoutTowerType(comboBuild(difficulty), 'musketeer'), 'longbow');
}

/**
 * Informational (milestone 23): the combo build, then in setup before wave
 * 10, after the combo's own wave 10 actions, every remaining gold piece goes
 * to Longbow upgrades. The combo build has upgraded all its Longbows by
 * then, so each upgrade needs a new Longbow first: while gold allows a
 * Longbow and its upgrade (40 + 30), build one on the next free cell in
 * TRAIL_CELL_ORDER and upgrade it. No target: it shows how much faster a
 * richer bow line kills the boss.
 */
export function bossRush(difficulty?: Difficulty): WaveScript {
  const combo = comboBuild(difficulty);
  const last = WAVES.length - 1;
  const state = createGame({ difficulty });
  for (let i = 0; i < last && state.phase === 'setup'; i++) {
    for (const action of combo[i] ?? []) applyAction(state, action);
    applyAction(state, { type: 'startWave' });
    runWaveWithTimed(state, combo.timed?.[i] ?? [], 60 * 600, []);
  }
  const extra: BuildAction[] = [];
  if (state.phase === 'setup') {
    for (const action of combo[last] ?? []) applyAction(state, action);
    const pair = TOWER_DEFS.longbow.cost + TOWER_DEFS.longbow.upgradeCost;
    for (let cell = nextFreeKidCell(state); cell && state.gold >= pair; cell = nextFreeKidCell(state)) {
      for (const action of [lb(cell.col, cell.row), up(cell.col, cell.row)]) {
        applyAction(state, action);
        extra.push(action);
      }
    }
  }
  const out = combo.map((wave, i) => (i === last ? [...wave, ...extra] : wave));
  return combo.timed ? Object.assign(out, { timed: combo.timed }) : out;
}

/**
 * Informational (milestone 24): the combo build played with every tower set
 * to 'strongest' right after it is built. COMBO_PLAN is followed as in
 * comboBuild (each action as soon as gold allows) and a 'target' action
 * follows every build. It is recorded by playing, not by editing the
 * comboBuild script, because the mode changes kills and so the gold. No
 * target: `npm run sim` reports it beside comboBuild.
 */
export function comboStrongest(difficulty?: Difficulty): WaveScript {
  const plan = followPlan(COMBO_PLAN);
  let pending: BuildAction | undefined;
  return recordScript((state) => {
    if (pending) {
      const next = pending;
      pending = undefined;
      return next;
    }
    const action = plan(state);
    if (action?.type === 'build') pending = { type: 'target', cell: action.cell, mode: 'strongest' };
    return action;
  }, difficulty);
}

/**
 * Informational scripts that `npm run sim` prints after ARCHETYPES. Kept out
 * of ARCHETYPES so the archetype pins stay as they are.
 */
/**
 * A balance archetype: records its script by playing on `difficulty`
 * (Normal when left out; milestone 25). Replay it with playScripted on the
 * same level, since gold and kills differ between levels.
 */
export type Archetype = (difficulty?: Difficulty) => WaveScript;

/** comboWithKegs aims every Powder Keg at the path point this far from the spawn (the long downhill run). */
export const KEG_POLICY_DISTANCE = 700;
/** comboWithKegs fires its Powder Keg when the wave tick counter reaches this (10 s into the wave). */
export const KEG_POLICY_WAVE_TICK = 600;

/**
 * Informational (milestone 25b): the combo build plus one Powder Keg per
 * wave at a fixed policy: at wave tick KEG_POLICY_WAVE_TICK (600), aimed at
 * the path point KEG_POLICY_DISTANCE (700) px from the spawn, (420, 232) in
 * the middle of the long downhill run. COMBO_PLAN is followed as in
 * comboBuild, recorded by playing (the keg kills change the gold), so the
 * pre-wave actions can differ from comboBuild's. No target.
 */
export function comboWithKegs(difficulty?: Difficulty): WaveScript {
  const at = positionAlongPath(MAP, KEG_POLICY_DISTANCE);
  const keg: SpecialAction = { type: 'special', special: 'keg', x: at.x, y: at.y, atWaveTick: KEG_POLICY_WAVE_TICK };
  const decide = followPlan(COMBO_PLAN);
  const state = createGame({ difficulty });
  const script: BuildAction[][] = [];
  const timed: SpecialAction[][] = [];
  for (let i = 0; i < WAVES.length && state.phase === 'setup'; i++) {
    const actions: BuildAction[] = [];
    for (let action = decide(state); action; action = decide(state)) {
      applyAction(state, action);
      actions.push(action);
    }
    script.push(actions);
    timed.push([keg]);
    applyAction(state, { type: 'startWave' });
    runWaveWithTimed(state, [keg], 60 * 600, []);
  }
  return Object.assign(script, { timed });
}

/**
 * The hand-tuned plan for Hard (milestone 25c, second pass), in purchase
 * order: upgraded Longbows first, since an upgraded Longbow is the most
 * damage per gold against Hard's 1080 hp Trolls: the two first Longbows and
 * (17,8), all three upgraded, then upgraded pairs at (16,8), (9,6) and
 * (16,9) with the Tar Pit (14,10) between them, then the Fire Pot (14,9)
 * and the Tar Pit and Fire Pot upgrades, then the rest of COMBO_PLAN in its
 * order.
 */
export const HARD_PLAN: readonly BuildAction[] = ((): BuildAction[] => {
  const head = [
    lb(9, 5), lb(9, 4), lb(17, 8), up(9, 5), up(9, 4), up(17, 8), lb(16, 8), up(16, 8), t(14, 10), lb(9, 6), up(9, 6),
    lb(16, 9), up(16, 9), fp(14, 9), up(14, 10), up(14, 9),
  ];
  const key = (a: BuildAction) => `${a.type} ${cellKey(a.cell)}`;
  const taken = new Set(head.map(key));
  return [...head, ...COMBO_PLAN.filter((a) => !taken.has(key(a)))];
})();

/**
 * Hard build (milestone 25c): HARD_PLAN, each action as soon as gold
 * allows, plus the cluster special policy (CLUSTER_POLICY). Target: wins on
 * Hard. Played on Normal too (informational).
 */
export function hardBuild(difficulty?: Difficulty): WaveScript {
  return recordScript(followPlan(HARD_PLAN), difficulty, CLUSTER_POLICY);
}

/**
 * Endless waves' cluster special (milestone 26): each endless wave fires one
 * clusterSpecial at the CLUSTER_POLICY_TICKS tick of the table wave it
 * repeats (8, 9 or 10: 1241, 1194, 713). Entry i is for wave i + 1; the
 * first ten are CLUSTER_POLICY.
 */
export const ENDLESS_CLUSTER_POLICY: TimedScript = Array.from({ length: ENDLESS_WAVE_CAP }, (_, i): readonly TimedAction[] => {
  if (i < LAST_WAVE) return CLUSTER_POLICY[i];
  const base = ENDLESS_BASE_WAVES[(i - LAST_WAVE) % ENDLESS_BASE_WAVES.length];
  return [{ type: 'clusterSpecial', atWaveTick: CLUSTER_POLICY_TICKS[base - 1] }];
});

/**
 * Informational (milestone 26): comboBuild (COMBO_PLAN as soon as gold
 * allows, the cluster special policy), then Keep going after the win with
 * no further purchases, one cluster special per endless wave
 * (ENDLESS_CLUSTER_POLICY). Target on Normal: loses on wave 11 to 16.
 */
export function endlessIdle(difficulty?: Difficulty): WaveScript {
  const plan = followPlan(COMBO_PLAN);
  return recordScript((state) => (state.endless ? undefined : plan(state)), difficulty, ENDLESS_CLUSTER_POLICY, true);
}

/**
 * Informational (milestone 26): comboBuild, then Keep going after the win,
 * with one cluster special per endless wave (ENDLESS_CLUSTER_POLICY).
 * Reinvest rule, in each endless setup phase while gold allows: upgrade
 * the un-upgraded tower with the cheapest upgrade (ties to the first in
 * cell order), and wait if it is not yet affordable; with every tower
 * upgraded, build a Longbow on the next free cell of TRAIL_CELL_ORDER; with
 * no free trail cell left, buy nothing. Target on Normal: further than
 * endlessIdle, at least wave 14, and lost by wave 40.
 */
export function endlessGreedy(difficulty?: Difficulty): WaveScript {
  const plan = followPlan(COMBO_PLAN);
  return recordScript(
    (state) => {
      if (!state.endless) return plan(state);
      // Upgrade the un-upgraded tower with the cheapest upgrade, else build a Longbow on the trail.
      let cheapest: (typeof state.towers)[number] | undefined;
      for (const tw of state.towers) {
        if (!tw.upgraded && (!cheapest || TOWER_DEFS[tw.type].upgradeCost < TOWER_DEFS[cheapest.type].upgradeCost)) cheapest = tw;
      }
      if (cheapest) return state.gold >= TOWER_DEFS[cheapest.type].upgradeCost ? { type: 'upgrade', cell: cheapest.cell } : undefined;
      const cell = nextFreeKidCell(state);
      if (cell === undefined || state.gold < TOWER_DEFS.longbow.cost) return undefined;
      return { type: 'build', cell, tower: 'longbow' };
    },
    difficulty,
    ENDLESS_CLUSTER_POLICY,
    true,
  );
}

/** What an endless run reached (milestone 26), for `npm run sim` and tests. */
export interface EndlessReport {
  /** 'lost' on `wave`, or 'capped' when it was still alive after ENDLESS_WAVE_CAP waves. */
  result: 'lost' | 'capped';
  wave: number;
  wavesCleared: number;
  lives: number;
  gold: number;
}

/** Play an endless script to its end on `difficulty` and report it (milestone 26). */
export function endlessReport(script: WaveScript, difficulty?: Difficulty): EndlessReport {
  const { state } = playScripted(script, undefined, difficulty);
  return {
    result: state.phase === 'lost' ? 'lost' : 'capped',
    wave: state.wave,
    wavesCleared: wavesCleared(state),
    lives: state.lives,
    gold: state.gold,
  };
}

/** Endless archetypes (milestone 26), informational; `npm run sim` reports them in their own table. */
export const ENDLESS_ARCHETYPES: Readonly<Record<string, Archetype>> = {
  endlessIdle,
  endlessGreedy,
};

export const INFORMATIONAL: Readonly<Record<string, Archetype>> = {
  comboStrongest,
  comboWithKegs,
};

/** Every archetype, in report order. */
export const ARCHETYPES: Readonly<Record<string, Archetype>> = {
  noTowers,
  lazyBuild,
  greedyMusket,
  soundBuild,
  soundBuildNoTar,
  longbowSpam,
  comboBuild,
  comboBuildNoFire,
  comboNoSpecials,
  noAntiAir,
  bossRush,
  hardBuild,
};
