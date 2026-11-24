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
// (continueEndless) when wave 20 is won and plays on, wave by wave, until
// the game is lost or ENDLESS_WAVE_CAP waves have been played. Scripts
// without it play exactly as before.
//
// Milestone 27: a game is played on a map. A WaveScript may carry `mapId` (a
// MapId); playScripted plays it on that map, Meadow when it is absent. The
// archetypes take the map after the difficulty and record it in the script.
// TRAIL_CELL_ORDER and the combo plan and its cluster ticks exist per map
// (trailCellOrder, COMBO_PLANS); the other
// hand-placed plans (SOUND_PLAN, the keg policy) are Meadow's alone, and
// those archetypes throw for another map.
//
// Milestone 28: hardBuild has a plan per map (HARD_PLANS). oneMusket is
// new; bossRush is gone (it had become the same game as comboBuild).
//
// Milestone 30: the archetypes that fire specials (comboBuild and the
// scripts made from it, hardBuild, the endless ones) fire them by the
// special policy (specialPolicy.ts) while they are recorded; each special
// fired is written into the script's `timed` list, so playScripted and the
// browser's runScript replay the same game. The stored search of milestone
// 28 is gone.

import {
  buildTower,
  moveTower,
  pickBoon,
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
import { BOONS, type BoonId } from './boons';
import type { Difficulty } from './difficulty';
import { callNextWave, continueEndless, createGame, startWave, tick, wavesCleared, type CallNextWaveResult, type StartWaveResult } from './game';
import { enemyPosition } from './combat';
import { isSpecialUnlocked, spendSpecialCharge, type SpecialType } from './specials';
import type { GameState, MapDef, Point, TargetingMode, TowerType, UpgradePath } from './types';
import { buildableCells, cellCenter, cellFromKey, cellKey, type Cell } from './grid';
import { DEFAULT_MAP, MAPS, pathLength, positionAlongPath, type MapId } from './map';
import { TOWER_DEFS, TOWER_PATHS } from './towers';
import { ACT_ONE_LAST_WAVE, LAST_WAVE } from './waves';
import { policyChoice, type PolicyOptions } from './specialPolicy';

export type BuildAction =
  | { type: 'build'; cell: Cell; tower: TowerType }
  | { type: 'upgrade'; cell: Cell; path?: UpgradePath }
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
  | { type: 'pickBoon'; boon: BoonId }
  /** Tick until the current wave ends (phase leaves 'wave') or `maxTicks` pass. */
  | { type: 'runUntilWaveEnds'; maxTicks: number }
  | BuildAction
  | PlanningAction
  | TimedAction;

export type HeadlessStepResult =
  | { action: 'startWave'; result: StartWaveResult }
  | { action: 'pickBoon'; boon: BoonId; result: ReturnType<typeof pickBoon> }
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
    case 'pickBoon':
      return { action: 'pickBoon', boon: action.boon, result: pickBoon(state, action.boon) };
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
      return { action: 'upgrade', cell: action.cell, result: upgradeTower(state, action.cell, action.path) };
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
  const pos = state.enemies.map((e) => ({ id: e.id, p: enemyPosition(e, state.map) }));
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

export function runHeadless(script: readonly HeadlessAction[], difficulty?: Difficulty, map?: MapId): HeadlessRun {
  const state = createGame({ difficulty, map });
  const log = script.map((action) => applyAction(state, action));
  return { state, log };
}

/**
 * Per wave (entry i for wave i + 1), the timed actions taken during it:
 * special attacks (milestone 25b), early calls and cluster specials
 * (milestone 25c).
 */
export type TimedScript = readonly (readonly TimedAction[])[];

export type BoonChoices = Readonly<Partial<Record<number, BoonId>>>;

interface WaveScriptMeta {
  readonly timed?: TimedScript;
  /** Optional picks keyed by the wave just cleared. Missing picks take the first card. */
  readonly boons?: BoonChoices;
  /**
   * Milestone 26: press Keep going after the win and play endless waves
   * (entry i still holds wave i + 1's actions) until lost or
   * ENDLESS_WAVE_CAP waves have been played.
   */
  readonly endless?: boolean;
  /** Milestone 27: the map the script is played on; Meadow when absent. (Not `map`: a WaveScript is an array.) */
  readonly mapId?: MapId;
}

/**
 * Entry i lists purchases and target changes in setup before wave i + 1.
 * Missing entries mean no actions that wave. The metadata holds the
 * script's choices at boon offers and actions taken during waves.
 */
export type WaveScript = readonly (readonly BuildAction[])[] & WaveScriptMeta;

/** Copy the optional script metadata when filtering or recording actions. */
function withMeta(out: (readonly BuildAction[])[], from: WaveScriptMeta): WaveScript {
  const meta: { -readonly [Key in keyof WaveScriptMeta]: WaveScriptMeta[Key] } = {};
  if (from.boons) meta.boons = from.boons;
  if (from.timed) meta.timed = from.timed;
  if (from.endless) meta.endless = true;
  if (from.mapId) meta.mapId = from.mapId;
  return Object.assign(out, meta);
}

/**
 * Safety cap for endless runs (milestone 26): a scripted endless game stops
 * after this many waves even if it is still alive, so a run cannot loop
 * forever. `npm run sim` reports a run that hits it.
 */
export const ENDLESS_WAVE_CAP = 200;

/** How many waves a script plays at most: the campaign length, or ENDLESS_WAVE_CAP for an endless script. */
function waveLimit(script: { readonly endless?: boolean } | undefined): number {
  return script?.endless ? ENDLESS_WAVE_CAP : LAST_WAVE;
}

/** Resolve a pending offer before the next wave's purchases. */
export function applyScriptBoon(state: GameState, script?: { readonly boons?: BoonChoices }): HeadlessStepResult | undefined {
  const pending = state.pendingBoon;
  if (!pending) return undefined;
  return applyAction(state, { type: 'pickBoon', boon: script?.boons?.[pending.wave] ?? pending.options[0] });
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
 * Play all campaign waves: before each wave apply that wave's actions, then start
 * it and run until it ends or `maxTicksPerWave` pass. Stops once lost.
 * `difficulty` (milestone 25) defaults to Normal. An endless script
 * (milestone 26) presses Keep going after the win and plays on until lost
 * or ENDLESS_WAVE_CAP waves. The game is played on the script's map
 * (milestone 27), Meadow when it has none.
 */
export function playScripted(script: WaveScript, maxTicksPerWave = 60 * 600, difficulty?: Difficulty): ScriptedRun {
  const state = createGame({ difficulty, map: script.mapId });
  const log: HeadlessStepResult[] = [];
  const waves: WaveReport[] = [];
  let called = false;
  const limit = waveLimit(script);
  for (let i = 0; i < limit && (state.phase === 'setup' || called); i++) {
    const boon = applyScriptBoon(state, script);
    if (boon) {
      log.push(boon);
      if ('result' in boon && !boon.result.ok) break;
    }
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
function runWaveWithTimed(
  state: GameState,
  timed: readonly TimedAction[],
  maxTicks: number,
  log: HeadlessStepResult[],
  policy?: PolicyRecorder,
  tally?: { kills: number },
): number {
  const wave = state.wave;
  let ticks = 0;
  outer: while (state.phase === 'wave' && ticks < maxTicks) {
    const previousEvents = tally ? state.events.length : 0;
    for (const action of timed) {
      if (action.atWaveTick !== state.waveTick) continue;
      log.push(applyAction(state, action));
      if (state.wave !== wave) break outer;
    }
    if (policy) policyStep(state, policy);
    // A cast can kill between ticks. Read only its newly appended events
    // before the tick clears them, then read this tick's own events.
    if (tally) tally.kills += countKills(state.events, previousEvents);
    tick(state);
    if (tally) tally.kills += countKills(state.events, 0);
    ticks += 1;
  }
  log.push({ action: 'runUntilWaveEnds', ticks });
  return ticks;
}

function countKills(events: GameState['events'], start: number): number {
  let kills = 0;
  for (let i = start; i < events.length; i++) {
    if (events[i].kind === 'kill') kills += 1;
  }
  return kills;
}

/**
 * A special policy being recorded (milestone 30): its options, the last
 * Tar Barrel or Fire Arrows it fired (whose turn comes next), and, per wave
 * index, the specials it fired as timed actions.
 */
export interface PolicyRecorder {
  options: PolicyOptions;
  lastZone?: SpecialType;
  fired: SpecialAction[][];
}

/** One policy look before a tick: fire and record its choice, if any (specialPolicy.ts). */
function policyStep(state: GameState, policy: PolicyRecorder): void {
  const choice = policyChoice(state, policy.lastZone, policy.options);
  if (!choice) return;
  if (policy.options.leaveBarrelUnused && choice.special === 'tarBarrel') {
    policy.lastZone = 'tarBarrel';
    spendSpecialCharge(state, 'tarBarrel');
    return;
  }
  const action: SpecialAction = { type: 'special', special: choice.special, x: choice.x, y: choice.y, atWaveTick: state.waveTick };
  const step = applyAction(state, action);
  if (step.action !== 'special' || !step.result.ok) throw new Error(`policyStep: ${JSON.stringify(step)}`);
  if (choice.special === 'tarBarrel' || choice.special === 'fireArrows') policy.lastZone = choice.special;
  (policy.fired[state.wave - 1] ??= []).push(action);
}

/** `timed` with the policy's recorded specials added after each wave's own actions. */
function mergeTimed(timed: TimedScript | undefined, policy: PolicyRecorder | undefined, waves: number): TimedScript | undefined {
  if (!policy) return timed;
  return Array.from({ length: waves }, (_, i) => [...(timed?.[i] ?? []), ...(policy.fired[i] ?? [])]);
}

/**
 * Re-record a script's purchases with the special policy (milestone 30):
 * play each wave's actions as written (a refused one is skipped, as
 * playScripted counts it) and its own timed actions, with the policy
 * firing; return the script with the specials it fired. For scripts made by
 * editing another (comboBuildNoFire, noAntiAir), so they fire for their own
 * game. Not for endless scripts.
 */
export function withPolicy(script: WaveScript, difficulty?: Difficulty, options: PolicyOptions = {}, report?: RecordReporter): WaveScript {
  const state = createGame({ difficulty, map: script.mapId });
  const policy: PolicyRecorder = { options, fired: [] };
  const tally = report ? { kills: 0 } : undefined;
  let refused = 0;
  let played = 0;
  for (let i = 0; i < LAST_WAVE && state.phase === 'setup'; i++) {
    const boon = applyScriptBoon(state, script);
    if (boon && 'result' in boon && !boon.result.ok) {
      refused += 1;
      break;
    }
    for (const action of script[i] ?? []) {
      const step = applyAction(state, action);
      if ('result' in step && !step.result.ok) refused += 1;
    }
    if (!startWave(state).ok) {
      refused += 1;
      break;
    }
    const timedLog: HeadlessStepResult[] = [];
    runWaveWithTimed(state, script.timed?.[i] ?? [], 60 * 600, timedLog, policy, tally);
    refused += timedLog.filter((step) => 'result' in step && !step.result.ok).length;
    played = i + 1;
  }
  if (tally && report) report({ phase: state.phase, lives: state.lives, wave: state.wave, gold: state.gold, kills: tally.kills }, refused);
  const out = script.map((wave) => [...wave]);
  return Object.assign(withMeta(out, script), { timed: mergeTimed(script.timed, policy, Math.max(played, script.length)) });
}

/**
 * Start each campaign wave and run it to its end, with no towers.
 * `maxTicksPerWave` caps each wave's run so a bug cannot loop forever.
 */
export function playAllWavesNoTowers(maxTicksPerWave = 60 * 600, map?: MapId): GameState {
  return playScripted(noTowers(undefined, map), maxTicksPerWave).state;
}

// ---------------------------------------------------------------------------
// Balance archetypes (milestone 6a). Each returns a WaveScript, so the e2e
// runScript hook and playScripted replay them unchanged. The rule-based
// archetypes (lazy, greedy) decide by playing the game: before each wave they
// look at the gold they have and record what they buy. The sim is
// deterministic, so replaying the recorded script gives the same game.

/** Decide the next action before a wave, or undefined to start the wave. */
type Decide = (state: GameState) => BuildAction | undefined;

export type RecordedOutcome = Pick<GameState, 'phase' | 'lives' | 'wave' | 'gold'> & { kills: number };
type RecordReporter = (outcome: RecordedOutcome, refused: number) => void;

interface RecordOptions {
  difficulty?: Difficulty;
  map?: MapId;
  boons?: BoonChoices;
  endless?: boolean;
  specials?: PolicyOptions;
  report?: RecordReporter;
}

/** Play the decisions against a real game and record purchases and policy casts for replay. */
function recordScript(decide: Decide, { difficulty, map, boons, endless, specials, report }: RecordOptions): WaveScript {
  const state = createGame({ difficulty, map });
  const tally = report ? { kills: 0 } : undefined;
  const policy: PolicyRecorder | undefined = specials ? { options: specials, fired: [] } : undefined;
  const script: BuildAction[][] = [];
  const limit = waveLimit({ endless });
  for (let i = 0; i < limit && state.phase === 'setup'; i++) {
    const boon = applyScriptBoon(state, { boons });
    if (boon && 'result' in boon && !boon.result.ok) throw new Error(`recordScript: ${JSON.stringify(boon)}`);
    const actions: BuildAction[] = [];
    for (let action = decide(state); action; action = decide(state)) {
      const step = applyAction(state, action);
      if ('result' in step && !step.result.ok) throw new Error(`recordScript: ${JSON.stringify(step)}`);
      actions.push(action);
    }
    script.push(actions);
    const start = startWave(state);
    if (!start.ok) throw new Error(`recordScript: ${start.reason}`);
    runWaveWithTimed(state, [], 60 * 600, [], policy, tally);
    if (endless && (state.phase as GameState['phase']) === 'won') continueEndless(state);
  }
  if (tally && report) report({ phase: state.phase, lives: state.lives, wave: state.wave, gold: state.gold, kills: tally.kills }, 0);
  const allTimed = mergeTimed(undefined, policy, script.length);
  return withMeta(script, { timed: allTimed, endless, mapId: map, boons });
}

/** `script` with each wave's actions filtered by `keep`, keeping its timed actions (milestone 25c) and map (27). */
function filterScript(script: WaveScript, keep: (action: BuildAction, wave: number) => boolean): WaveScript {
  return withMeta(
    script.map((wave, i) => wave.filter((a) => keep(a, i))),
    script,
  );
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
 * Milestone 27: per map, computed once per map.
 */
export function trailCellOrder(map: MapDef): readonly Cell[] {
  const known = trailCache.get(map);
  if (known) return known;
  const order = walkTrail(map);
  trailCache.set(map, order);
  return order;
}

/** Take one nearest unused buildable cell at each trail step. */
function walkTrail(map: MapDef, used = new Set<number>()): Cell[] {
  const mask = buildableCells(map);
  const order: Cell[] = [];
  const total = pathLength(map);
  for (let d = TRAIL_STEP; d <= total; d += TRAIL_STEP) {
    const p = positionAlongPath(map, d);
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
}

const trailCache = new WeakMap<MapDef, readonly Cell[]>();

/** Meadow's trail order (trailCellOrder), kept under its milestone 12 name. */
export const TRAIL_CELL_ORDER: readonly Cell[] = trailCellOrder(MAPS.meadow);

function nextFreeKidCell(state: GameState): Cell | undefined {
  return trailCellOrder(state.map).find((cell) => !towerAt(state, cell));
}

const extendedTrailCache = new WeakMap<MapDef, readonly Cell[]>();

/** Keep walking the trail until no other buildable cell is within reach. */
function extendedTrailCellOrder(map: MapDef): readonly Cell[] {
  const known = extendedTrailCache.get(map);
  if (known) return known;
  const order = [...trailCellOrder(map)];
  const used = new Set(order.map(cellKey));
  for (let pass = walkTrail(map, used); pass.length > 0; pass = walkTrail(map, used)) {
    order.push(...pass);
  }
  extendedTrailCache.set(map, order);
  return order;
}

/**
 * Milestone 27 follow-up: the archetypes whose plans are Meadow's alone
 * (soundBuild, soundBuildNoTar, comboStrongest; hardBuild
 * has a plan per map from milestone 28) throw for any other map instead of
 * returning a Meadow script that would be played on it.
 */
function meadowOnly(name: string, map: MapId | undefined): void {
  if (map !== undefined && map !== 'meadow') throw new Error(`${name} has a script for Meadow only, not for ${map}`);
}

/** Archetype 1: build nothing (on any level). Target: lost by wave 3. */
export function noTowers(_difficulty?: Difficulty, map?: MapId, boons?: BoonChoices): WaveScript {
  return withMeta([], { mapId: map, boons });
}

/**
 * A first-time player's opening (milestone 28): one base Musketeer on the
 * first cell of the map's trail order (trailCellOrder) before wave 1, and
 * nothing else, ever. Used only to measure wave 1: targets N8 (Normal:
 * at most 6 of wave 1's enemies exit) and E3 (Easy: at most 3).
 */
export function oneMusket(_difficulty?: Difficulty, map?: MapId, boons?: BoonChoices): WaveScript {
  const cell = trailCellOrder(MAPS[map ?? DEFAULT_MAP])[0];
  const script: (readonly BuildAction[])[] = [[{ type: 'build', cell, tower: 'musketeer' }]];
  return withMeta(script, { mapId: map, boons });
}

/**
 * Archetype 2, a kid's build: before each wave, buy base Musketeers while
 * affordable, on cells in TRAIL_CELL_ORDER. Never upgrades, never sells.
 * Repeats the trail walk as the cells from each pass fill up.
 * Targets: loses on waves 7 to 14 on Normal, wins Easy with at least 8
 * lives, and loses on waves 2 to 8 on Hard.
 */
export function lazyBuild(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices, report?: RecordReporter): WaveScript {
  return recordScript((state) => {
    const cell = extendedTrailCellOrder(state.map).find((spot) => !towerAt(state, spot));
    if (cell === undefined || state.gold < TOWER_DEFS.musketeer.cost) return undefined;
    return { type: 'build', cell, tower: 'musketeer' };
  }, { difficulty, map, boons, report });
}

/**
 * Archetype 3: like lazyBuild, but an unupgraded Musketeer is upgraded
 * (when affordable) before another is bought, so purchases alternate buy,
 * upgrade, buy. Informational since milestone 12: no target.
 */
export function greedyMusket(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices): WaveScript {
  return recordScript((state) => {
    const plain = state.towers.find((tw) => tw.type === 'musketeer' && !tw.upgraded);
    if (plain) {
      return state.gold >= TOWER_DEFS.musketeer.upgradeCost ? { type: 'upgrade', cell: plain.cell } : undefined;
    }
    const cell = nextFreeKidCell(state);
    if (cell === undefined || state.gold < TOWER_DEFS.musketeer.cost) return undefined;
    return { type: 'build', cell, tower: 'musketeer' };
  }, { difficulty, map, boons });
}

/**
 * Cheap spam (milestone 10): before each wave, buy base Longbows while
 * affordable, on cells in TRAIL_CELL_ORDER. Never upgrades, never sells.
 * v2 target (milestone 12): lost on wave 7 to 9.
 */
export function longbowSpam(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices, report?: RecordReporter): WaveScript {
  return recordScript((state) => {
    const cell = nextFreeKidCell(state);
    if (cell === undefined || state.gold < TOWER_DEFS.longbow.cost) return undefined;
    return { type: 'build', cell, tower: 'longbow' };
  }, { difficulty, map, boons, report });
}

const m = (col: number, row: number): BuildAction => ({ type: 'build', cell: { col, row }, tower: 'musketeer' });
const c = (col: number, row: number): BuildAction => ({ type: 'build', cell: { col, row }, tower: 'cannon' });
const t = (col: number, row: number): BuildAction => ({ type: 'build', cell: { col, row }, tower: 'tarpit' });
const lb = (col: number, row: number): BuildAction => ({ type: 'build', cell: { col, row }, tower: 'longbow' });
const mo = (col: number, row: number): BuildAction => ({ type: 'build', cell: { col, row }, tower: 'mortar' });
const fp = (col: number, row: number): BuildAction => ({ type: 'build', cell: { col, row }, tower: 'firepot' });
const up = (col: number, row: number, path?: UpgradePath): BuildAction =>
  path ? { type: 'upgrade', cell: { col, row }, path } : { type: 'upgrade', cell: { col, row } };

const laterUpgrade = (build: BuildAction): BuildAction => up(build.cell.col, build.cell.row);

/** Gold the action costs in this state (0 if the sim would refuse it anyway). */
function actionCost(state: GameState, action: BuildAction): number {
  if (action.type === 'build') return TOWER_DEFS[action.tower].cost;
  if (action.type === 'upgrade') {
    const tower = towerAt(state, action.cell);
    if (!tower) return 0;
    return action.path ? TOWER_PATHS[tower.type].cost : TOWER_DEFS[tower.type].upgradeCost;
  }
  return 0;
}

/** Take the plan's actions in order, each as soon as it is affordable. */
export function followPlan(plan: readonly BuildAction[], actTwo: readonly BuildAction[] = [], buyCost = actionCost, afterPlan?: Decide): Decide {
  let next = 0;
  return (state) => {
    const action = plan[next] ?? (state.wave >= ACT_ONE_LAST_WAVE ? actTwo[next - plan.length] : undefined);
    if (!action) return state.wave >= ACT_ONE_LAST_WAVE ? afterPlan?.(state) : undefined;
    if (state.gold < buyCost(state, action)) return undefined;
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
export function soundBuild(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices, report?: RecordReporter): WaveScript {
  meadowOnly('soundBuild', map);
  return recordScript(followPlan(SOUND_PLAN), { difficulty, map, boons, report });
}

/**
 * soundBuild with every Tar Pit action removed: no Tar Pit builds and no
 * upgrades on the cells where soundBuild builds them. Informational since
 * milestone 12: no target.
 */
export function soundBuildNoTar(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices): WaveScript {
  meadowOnly('soundBuildNoTar', map);
  return withoutTowerType(soundBuild(difficulty, map, boons), 'tarpit');
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
 * The combo buys its third Longbow at (15,6) before its Tar/Fire pair
 * so the opening stays robust as Wolf HP moves by one point on Hard.
 * A Tar Pit (14,10) and a Fire Pot (14,9) inside the bottom-left corner
 * of the second U: both reach the end of the downhill run and the start of
 * the bottom run, so tarred enemies burn at double rate there. A Mortar
 * (17,6) in the middle of the second U reaches the downhill, bottom and
 * uphill runs for the Trolls. Then upgrades to the combo, the Mortar and the
 * first Longbows as gold allows, a second Mortar (9,7) in the first U,
 * Longbows (17,9) and (17,10) on the bottom of the second U, and a second
 * Tar Pit and Fire Pot pair at (11,4) and (10,4) on the top run. Milestone
 * 22 adds anti-air: the third Longbow is bought before
 * wave 4 so the first Harpies meet three bows, and its upgrade as the last
 * of the milestone 22 actions. Milestone 25c appends a gold sink (below).
 * The order offers useful buys through the first act. The campaign tails
 * continue the plan into the second act.
 */
function meadowPlan(bow: BuildAction, earlyBow = false): readonly BuildAction[] {
  const tarAndFire = [t(14, 10), fp(14, 9)];
  return [
    lb(9, 5), lb(9, 4), ...(earlyBow ? [bow, ...tarAndFire] : [...tarAndFire, bow]),
    mo(17, 6), up(14, 10), up(14, 9), lb(17, 9), up(17, 6),
    up(9, 5), up(9, 4), mo(9, 7), lb(17, 10), up(17, 9), up(9, 7), up(17, 10), t(11, 4), fp(10, 4), up(11, 4),
    laterUpgrade(bow),
    // Milestone 25c: the horde pays more, so the plan goes on (bought from
    // about wave 8): three upgraded Longbows inside the second U and the
    // first U, then a third Mortar (16,7) and an upgraded Cannon (15,10).
    // The cheap Longbow pairs come first so the gold left before wave 9 is
    // always under 70.
    lb(16, 8), up(16, 8), lb(9, 6), up(9, 6), lb(16, 9), up(16, 9), mo(16, 7), up(16, 7), c(15, 10), up(15, 10),
  ];
}

export const COMBO_PLAN = meadowPlan(lb(15, 6), true);

/**
 * The first two purchases cover the folded lanes. The shared
 * purchases put Fire Pots beside Tar Pits and place Mortars outside the
 * narrow strips between lanes, leaving both strips for short-range towers.
 */
function switchbackPlan(lead: BuildAction, rear: BuildAction, rearLane = lb(15, 7)): readonly BuildAction[] {
  return [
    lead, rear, t(12, 7), fp(11, 7), lb(13, 7), mo(14, 11), up(12, 7), up(11, 7), lb(12, 4), up(14, 11),
    laterUpgrade(lead), laterUpgrade(rear), mo(19, 7), rearLane, up(12, 4), up(19, 7), laterUpgrade(rearLane), t(15, 4), fp(14, 4), up(15, 4),
    up(13, 7),
    lb(11, 4), up(11, 4), lb(16, 7), up(16, 7), lb(10, 4), up(10, 4), mo(18, 7), up(18, 7), c(17, 7), up(17, 7),
  ];
}
export const SWITCHBACK_COMBO_PLAN = switchbackPlan(lb(14, 7), lb(18, 7), lb(20, 7)).slice(0, 15);

/**
 * Riverbend's combo plan (milestone 27), chosen like SWITCHBACK_COMBO_PLAN:
 * COMBO_PLAN's roles, each on the free cell covering the most path for its
 * range, or one within 1% of it inside the arch, so the first six towers
 * stand on the river's banks and reach both the climbs and the top run; the
 * Fire Pots stand beside their Tar Pits. The first Longbow stands at (10,6)
 * on Normal or (12,5) in the Hard opening. The next bow (12,6) and first
 * Mortar (12,7) cover the left bank; the first pair (11,4) and
 * (11,5) in the arch's top-left corner, the second (18,4) and (18,5) in its
 * top-right corner; the anti-air Longbow and the second Mortar on the right
 * bank; the later Longbows, the third Mortar and the Cannon at the two outer
 * corners and on the banks.
 */
function riverbendPlan(lead: BuildAction, rear: BuildAction, tar = t(11, 4)): readonly BuildAction[] {
  return [
    lead, rear, tar, fp(11, 5), lb(17, 5), mo(12, 7), laterUpgrade(tar), up(11, 5), lb(17, 6), up(12, 7),
    laterUpgrade(lead), laterUpgrade(rear), mo(17, 7), lb(6, 8), up(17, 6), up(17, 7), up(6, 8), t(18, 4), fp(18, 5), up(18, 4),
    up(17, 5),
    lb(23, 8), up(23, 8), lb(11, 6), up(11, 6), lb(18, 6), up(18, 6), mo(6, 7), up(6, 7), c(7, 10), up(7, 10),
  ];
}
export const RIVERBEND_COMBO_PLAN = riverbendPlan(lb(10, 6), lb(12, 6), t(12, 4));

/** The paired Longbow opening used by the Hard and specialized builds. */
const BOW_OPENINGS: Readonly<Record<MapId, readonly BuildAction[]>> = {
  meadow: meadowPlan(lb(17, 8)),
  switchback: switchbackPlan(lb(14, 7), lb(13, 4)),
  riverbend: riverbendPlan(lb(12, 5), lb(12, 6)),
};

/** The combo build's plan per map (milestone 27); Meadow's is COMBO_PLAN. */
export const COMBO_PLANS: Readonly<Record<MapId, readonly BuildAction[]>> = {
  meadow: COMBO_PLAN,
  switchback: SWITCHBACK_COMBO_PLAN,
  riverbend: RIVERBEND_COMBO_PLAN,
};

/** Act 2 reinforces the exit and the firing lanes after the first plan is complete.
 * Extra bows cover Meadow's two turns. Riverbend prioritizes artillery for the dense Troll waves.
 */
const HARD_REINFORCEMENTS: Readonly<Record<MapId, readonly BuildAction[]>> = {
  meadow: [
    up(10, 4), c(23, 8), up(23, 8), m(25, 8), up(25, 8),
    lb(8, 5), up(8, 5), lb(8, 6), up(8, 6),
  ],
  switchback: [up(14, 4), c(24, 10), up(24, 10), m(25, 10), up(25, 10)],
  riverbend: [
    up(17, 7, 'A'),
    up(18, 5), c(22, 9), up(22, 9), m(23, 9), up(23, 9),
  ],
};

/** Buy one branch in each role, adding bow and artillery coverage where the lane needs it. */
export const ACT_TWO_PLANS: Readonly<Record<MapId, readonly BuildAction[]>> = {
  meadow: [
    m(25, 8), up(25, 8), up(25, 8, 'A'), up(15, 10, 'B'), up(14, 10, 'A'),
    up(9, 5, 'A'), up(17, 6, 'A'), up(14, 9, 'B'),
  ],
  switchback: [
    up(19, 7), c(17, 7), up(17, 7), m(25, 10), up(25, 10),
    up(25, 10, 'A'), up(17, 7, 'A'), up(12, 7, 'B'), up(14, 7, 'B'),
    up(18, 7, 'B'), up(12, 4, 'B'), up(14, 11, 'A'), up(19, 7, 'A'), up(11, 7, 'B'),
  ],
  riverbend: [
    m(23, 9), up(23, 9), up(23, 9, 'A'), up(7, 10, 'B'), up(12, 4, 'A'),
    up(10, 6, 'A'), up(12, 6, 'A'), up(12, 7, 'A'), up(17, 7, 'A'), up(11, 5, 'B'),
  ],
};

export interface ReinvestmentOptions {
  /** Stop buying once the scripted plan has been exhausted. */
  fixedOnly?: boolean;
}

const REINVESTMENT_PATHS: Readonly<Record<TowerType, UpgradePath>> = {
  musketeer: 'A', cannon: 'A', tarpit: 'A', longbow: 'A', mortar: 'A', firepot: 'A',
};

/** After the fixed plan, buy the cheapest affordable branch (cell order breaks ties), else upgrade the main type or build it on the next free trail cell. */
function reinvest(main: TowerType, paths: false | Readonly<Partial<Record<TowerType, UpgradePath>>> = REINVESTMENT_PATHS): Decide {
  return (state) => {
    if (paths) {
      let cheapest = state.gold + 1;
      let next: BuildAction | undefined;
      for (const tower of state.towers) {
        const path = paths[tower.type];
        const cost = TOWER_PATHS[tower.type].cost;
        if (!path || !tower.upgraded || tower.path || cost >= cheapest) continue;
        cheapest = cost;
        next = { type: 'upgrade', cell: tower.cell, path };
      }
      if (next) return next;
    }
    const def = TOWER_DEFS[main];
    const pending = state.towers.find((tower) => tower.type === main && !tower.upgraded);
    if (pending && state.gold >= def.upgradeCost) return { type: 'upgrade', cell: pending.cell };
    if (state.gold < def.cost) return undefined;
    const cell = extendedTrailCellOrder(state.map).find((spot) => !towerAt(state, spot));
    return cell ? { type: 'build', cell, tower: main } : undefined;
  };
}

/** After a costly wave, spend more of the reserve in the next setup. Spend it all before the boss. */
function paceReinvestment(buy: Decide, allowance = 0): Decide {
  let wave = -1;
  let spent = 0;
  let previousLives: number | undefined;
  let budget = allowance;
  return (state) => {
    if (state.wave === LAST_WAVE - 1) return buy(state);
    if (wave !== state.wave) {
      wave = state.wave;
      spent = 0;
      const lives = state.lives - (state.boons.includes('stoneWalls') ? BOONS.stoneWalls.value : 0);
      budget = allowance === 0 && previousLives !== undefined && previousLives - lives >= 3 ? 425 : allowance;
      previousLives = lives;
    }
    const action = buy(state);
    if (!action) return undefined;
    const cost = actionCost(state, action);
    if (spent > 0 && spent + cost > budget) return undefined;
    spent += cost;
    return action;
  };
}

const SPECIALIST_SETUP_GOLD = 180;

function followComboPlan(map: MapId = DEFAULT_MAP, wide = false, { fixedOnly }: ReinvestmentOptions = {}): Decide {
  const opening = COMBO_PLANS[map];
  const tail = ACT_TWO_PLANS[map];
  const main = referenceMainTower(wide ? 'wideBuild' : 'comboBuild', map);
  const afterPlan = fixedOnly ? undefined : paceReinvestment(reinvest(main, wide ? false : REINVESTMENT_PATHS));
  if (!wide) return followPlan(opening, tail, actionCost, afterPlan);
  const builds = new Map([...opening, ...tail].flatMap((a) => a.type === 'build' ? [[cellKey(a.cell), a.tower] as const] : []));
  const focus = tail.flatMap((a) => a.type === 'upgrade' && a.path ? [builds.get(cellKey(a.cell))!] : []);
  const copies = reinforcementPlan(map, [...opening, ...tail], focus);
  const purchases = tail.flatMap((a) => a.type === 'upgrade' && a.path ? copies.splice(0, 2) : [a]);
  return followPlan(opening, purchases, actionCost, afterPlan);
}

export function wideBuild(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices, options?: ReinvestmentOptions): WaveScript {
  return referenceBuild('wideBuild', difficulty, map, boons, options);
}

/**
 * Combo build (milestone 10): the map's combo plan, each action bought as
 * soon as gold allows. Milestone 30: plus the special policy
 * (specialPolicy.ts), recorded into its timed list.
 * Targets S1 and S2 measure this plan’s Normal campaign and act-two losses.
 */
export function comboBuild(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices, report?: RecordReporter, options?: ReinvestmentOptions): WaveScript {
  return recordScript(followComboPlan(map, false, options), { difficulty, map, boons, specials: {}, report });
}

/** On each trail, within the combo plan's Mortar and Fire Pot coverage. */
export const COMBO_BARRICADE_POINTS: Readonly<Record<MapId, Point>> = {
  meadow: { x: 420, y: 312 },
  switchback: { x: 368, y: 288 },
  riverbend: { x: 322, y: 96 },
};

/** The combo purchase policy, with Barricades placed beside its splash towers. */
export function comboBarricade(difficulty?: Difficulty, map: MapId = DEFAULT_MAP, boons?: BoonChoices, report?: RecordReporter,
  specials: Pick<PolicyOptions, 'barricadePoint' | 'refreshBarricade'> = {}): WaveScript {
  return recordScript(followComboPlan(map), {
    difficulty, map, boons, report, specials: { barricadePoint: COMBO_BARRICADE_POINTS[map], ...specials },
  });
}

/** The combo purchase policy, spending every ready charge on Guards from their unlock. */
export function comboGuards(difficulty: Difficulty, map: MapId, guardsPoint: Point, report?: RecordReporter): WaveScript {
  return recordScript(followComboPlan(map), { difficulty, map, specials: { guardsPoint }, report });
}

/**
 * The combo build with the special policy forbidden one special (milestone
 * 30), recorded by playing (the specials change the gold, so the purchases
 * can differ). Target N9 on Meadow, Normal: forbidding any one of the three
 * makes the combo strictly worse.
 */
export function comboWithoutSpecial(type: SpecialType, difficulty?: Difficulty, map?: MapId, boons?: BoonChoices, report?: RecordReporter): WaveScript {
  return recordScript(followComboPlan(map), { difficulty, map, boons, specials: { forbid: type }, report });
}

/** The C2 control spends each barrel turn and its full wait without applying the barrel. */
export function comboIdleBarrel(map: MapId, report?: RecordReporter): WaveScript {
  return recordScript(followComboPlan(map), { difficulty: 'normal', map, specials: { leaveBarrelUnused: true }, report });
}

/**
 * The combo plan without specials (milestone 25c): COMBO_PLAN, each action
 * as soon as gold allows, and no timed actions; recorded by playing, since
 * the specials' kills change the gold. Target: at least three lives below the combo, with a win or a loss on wave 17 or later.
 */
export function comboNoSpecials(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices): WaveScript {
  return recordScript(followComboPlan(map), { difficulty, map, boons });
}

/**
 * comboBuild with every Fire Pot action removed: no Fire Pot builds and no
 * upgrades on the cells where comboBuild builds them; its specials are
 * the policy's, re-recorded for this game (withPolicy, milestone 30).
 * Target S6 compares final lives on all three Normal maps.
 */
export function comboBuildNoFire(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices, report?: RecordReporter): WaveScript {
  return withPolicy(withoutSpecials(withoutTowerType(comboBuild(difficulty, map, boons), 'firepot')), difficulty, {}, report);
}

/** `script` without its timed actions (its purchases, endless flag and map kept). */
function withoutSpecials(script: WaveScript): WaveScript {
  const out = script.map((wave) => [...wave]);
  return withMeta(out, { endless: script.endless, mapId: script.mapId, boons: script.boons });
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
 * Target N7: at least half of wave 4's Harpies exit, and the game is lost
 * by wave 12.
 */
export function noAntiAir(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices): WaveScript {
  const script = comboBuild(difficulty, map, boons);
  const before = FIRST_HARPY_WAVE - 1;
  const antiAir = (a: BuildAction) => a.type === 'build' && (a.tower === 'musketeer' || a.tower === 'longbow');
  const cells = new Set(script.flat().filter(antiAir).map((a) => cellKey(a.cell)));
  const owned = script.slice(0, before).flat().filter(antiAir).map((a) => a.cell);
  const out = script.map((wave, i) => {
    if (i < before) return wave;
    const kept = wave.filter((a) => !cells.has(cellKey(a.cell)));
    return i === before ? [...owned.map((cell): BuildAction => ({ type: 'sell', cell })), ...kept] : kept;
  });
  // Its map is kept (milestone 27); its specials are the policy's,
  // re-recorded for this game (milestone 30).
  return withPolicy(withoutSpecials(withMeta(out, script)), difficulty);
}

/**
 * comboBuild with every Musketeer and Longbow action removed from wave 1
 * (like withoutTowerType). Not an archetype: it loses on wave 2, before any
 * Harpy, which is why noAntiAir sells its bows before wave 4 instead.
 */
export function comboBuildNoBows(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices): WaveScript {
  return withoutTowerType(withoutTowerType(comboBuild(difficulty, map, boons), 'musketeer'), 'longbow');
}

/**
 * Informational (milestone 24): the combo build played with every tower set
 * to 'strongest' right after it is built. COMBO_PLAN is followed as in
 * comboBuild (each action as soon as gold allows) and a 'target' action
 * follows every build. It is recorded by playing, not by editing the
 * comboBuild script, because the mode changes kills and so the gold. No
 * target: `npm run sim` reports it beside comboBuild.
 */
export function comboStrongest(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices): WaveScript {
  meadowOnly('comboStrongest', map);
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
  }, { difficulty, map, boons });
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
export type Archetype = (difficulty?: Difficulty, map?: MapId, boons?: BoonChoices) => WaveScript;

// comboWithKegs (milestone 25b, a Powder Keg at a fixed point every wave)
// was removed in milestone 28: its kegs hit nothing on the horde waves, so
// it was the comboNoSpecials game.

/**
 * The Hard purchase order (milestone 25c second pass on Meadow; milestone 28
 * for every map), as indexes into a combo plan, whose 31 actions are role
 * for role the same on every map: the two opening Longbows (0, 1) and the
 * anti-air Longbow (4), then their upgrades (10, 11, 20), the first late
 * Longbow pair (21, 22), the first Tar Pit (2), the second and third late
 * pairs (23 to 26), the first Fire Pot (3), the Tar Pit and Fire Pot
 * upgrades (6, 7). The rest of the combo plan follows in its own order.
 * Upgraded Longbows first, since an upgraded Longbow is the most damage per
 * gold against Hard's 1140 hp Trolls.
 */
export const HARD_ORDER: readonly number[] = [0, 1, 4, 10, 11, 20, 21, 22, 2, 23, 24, 25, 26, 3, 6, 7];

/** A map's Hard plan (milestone 28): its combo plan's own cells, bought in HARD_ORDER, then the rest in plan order. */
export function hardPlanFrom(plan: readonly BuildAction[]): BuildAction[] {
  const head = HARD_ORDER.map((i) => plan[i]);
  return [...head, ...plan.filter((_, i) => !HARD_ORDER.includes(i))];
}

/**
 * The hand-tuned plan for Hard on Meadow (milestone 25c, second pass), in
 * purchase order: the two first Longbows and (17,8), all three upgraded,
 * then upgraded pairs at (16,8), (9,6) and (16,9) with the Tar Pit (14,10)
 * between them, then the Fire Pot (14,9) and the Tar Pit and Fire Pot
 * upgrades, then the rest of COMBO_PLAN in its order: hardPlanFrom(COMBO_PLAN).
 */
export const HARD_PLAN: readonly BuildAction[] = hardPlanFrom(BOW_OPENINGS.meadow);

/**
 * Hard uses the paired-bow opening and buys its early upgrades in HARD_ORDER.
 */
export const HARD_PLANS: Readonly<Record<MapId, readonly BuildAction[]>> = {
  meadow: HARD_PLAN,
  switchback: hardPlanFrom(BOW_OPENINGS.switchback),
  riverbend: hardPlanFrom(BOW_OPENINGS.riverbend),
};

/** One additional upgraded Mortar covers the long approach on each open map. */
const HARD_ARTILLERY: Record<MapId, readonly BuildAction[]> = {
  meadow: [mo(17, 5), up(17, 5)],
  switchback: [],
  riverbend: [mo(14, 4), up(14, 4)],
};

/**
 * Hard build (milestone 25c; per map from milestone 28): the map's Hard
 * plan, each action as soon as gold allows, plus the special policy
 * (milestone 30). Target H1: wins on Hard on every map. Played on Easy and
 * Normal too (informational).
 */
export function hardBuild(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices, options?: ReinvestmentOptions): WaveScript {
  return referenceBuild('hardBuild', difficulty, map, boons, options);
}

/**
 * Informational (milestone 26): comboBuild (COMBO_PLAN as soon as gold
 * allows), then Keep going after the win with no further purchases; the
 * special policy fires in every wave, endless ones included (milestone 30).
 */
export function endlessIdle(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices): WaveScript {
  const plan = followComboPlan(map);
  return recordScript((state) => (state.endless ? undefined : plan(state)), { difficulty, map, boons, endless: true, specials: {} });
}

/**
 * Informational (milestone 26): comboBuild, then Keep going after the win,
 * with the special policy in every wave (milestone 30).
 * Invest in Siege Shell Mortars after victory to handle the repeated Troll waves.
 */
export function endlessGreedy(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices): WaveScript {
  const plan = followComboPlan(map);
  const reinforce = reinvest('mortar', { mortar: 'A' });
  return recordScript(
    (state) => state.endless ? reinforce(state) : plan(state),
    { difficulty, map, boons, endless: true, specials: {} },
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
  artilleryBuild,
  burnBuild,
  musketBuild,
};

/** Every archetype, in report order. */
export const ARCHETYPES: Readonly<Record<string, Archetype>> = {
  noTowers,
  oneMusket,
  lazyBuild,
  greedyMusket,
  soundBuild,
  soundBuildNoTar,
  longbowSpam,
  comboBuild,
  wideBuild,
  comboBuildNoFire,
  comboNoSpecials,
  noAntiAir,
  hardBuild,
};

/** Rank open firing positions by the number of in-range trail samples. */
function reinforcementCells(map: MapDef, type: TowerType): Cell[] {
  const { range, minRange } = TOWER_DEFS[type].upgraded;
  const trail = Array.from({ length: Math.floor(pathLength(map) / 8) }, (_, i) => positionAlongPath(map, i * 8));
  return buildableCells(map).flatMap((open, key) => {
    if (!open) return [];
    const cell = cellFromKey(key);
    const point = cellCenter(cell);
    const coverage = trail.filter(({ x, y }) => {
      const distance = Math.hypot(x - point.x, y - point.y);
      return distance >= minRange && distance <= range;
    }).length;
    return [{ cell, coverage }];
  }).sort((a, b) => b.coverage - a.coverage || cellKey(a.cell) - cellKey(b.cell)).map(({ cell }) => cell);
}

function limitType(plan: readonly BuildAction[], type: TowerType, count: number): BuildAction[] {
  const omitted = new Set(plan.filter((action) => action.type === 'build' && action.tower === type)
    .slice(count).map(({ cell }) => cellKey(cell)));
  return plan.filter(({ cell }) => !omitted.has(cellKey(cell)));
}

/** Spend on another upgraded tower once the opening defense is complete. */
function reinforcementPlan(map: MapId, opening: readonly BuildAction[], types: readonly TowerType[]): BuildAction[] {
  const used = new Set(opening.flatMap((action) => action.type === 'build' ? [cellKey(action.cell)] : []));
  const ranked = new Map([...new Set(types)].map((type) => [type, reinforcementCells(MAPS[map], type)]));
  let lastTar: Cell | undefined;
  return types.flatMap((tower) => {
    const choices = ranked.get(tower)!.filter((candidate) => !used.has(cellKey(candidate)));
    const tar = lastTar;
    const nearby = tower === 'firepot' && tar
      ? choices.find(({ col, row }) => Math.abs(col - tar.col) + Math.abs(row - tar.row) <= 2)
      : undefined;
    const cell = nearby ?? choices[0];
    if (!cell) return [];
    if (tower === 'tarpit') lastTar = cell;
    used.add(cellKey(cell));
    const actions: BuildAction[] = [{ type: 'build', cell, tower }, { type: 'upgrade', cell }];
    return actions;
  });
}

/** Adds and upgrades Cannons and Mortars as the campaign's second act begins. */
export function artilleryBuild(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices, report?: RecordReporter, options?: ReinvestmentOptions): WaveScript {
  return referenceBuild('artilleryBuild', difficulty, map, boons, options, report);
}

/** Reinforces a mixed opening with Fire Pots beside upgraded Tar Pits. */
export function burnBuild(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices, report?: RecordReporter, options?: ReinvestmentOptions): WaveScript {
  return referenceBuild('burnBuild', difficulty, map, boons, options, report);
}

export function musketBuild(difficulty?: Difficulty, map?: MapId, boons?: BoonChoices, options?: ReinvestmentOptions): WaveScript {
  return referenceBuild('musketBuild', difficulty, map, boons, options);
}

/** Reference plans available for the equal-budget branch and copy comparisons. */
export type ChoiceBuild = 'comboBuild' | 'hardBuild' | 'artilleryBuild' | 'burnBuild' | 'musketBuild';
export type ReferenceBuild = ChoiceBuild | 'wideBuild';

const MAIN_TOWER: Readonly<Record<ReferenceBuild, TowerType>> = {
  comboBuild: 'longbow', wideBuild: 'longbow', hardBuild: 'longbow', artilleryBuild: 'mortar',
  burnBuild: 'firepot', musketBuild: 'musketeer',
};

function referenceMainTower(build: ReferenceBuild, map: MapId): TowerType {
  if (map === 'riverbend') {
    if (build === 'comboBuild') return 'tarpit';
    if (build === 'wideBuild') return 'cannon';
  }
  return MAIN_TOWER[build];
}

export function referenceBuild(build: ReferenceBuild, difficulty?: Difficulty, map: MapId = DEFAULT_MAP, boons?: BoonChoices,
  options?: ReinvestmentOptions, report?: RecordReporter): WaveScript {
  if (build === 'comboBuild') return comboBuild(difficulty, map, boons, report, options);
  if (build === 'wideBuild') return recordScript(followComboPlan(map, true, options), { difficulty, map, boons, specials: {}, report });
  const [opening, plan] = referencePlan(build, map);
  const buy = reinvest(referenceMainTower(build, map));
  const afterPlan = options?.fixedOnly ? undefined : paceReinvestment(buy, build === 'hardBuild' ? 0 : SPECIALIST_SETUP_GOLD);
  return recordScript(followPlan(opening, plan, actionCost, afterPlan), { difficulty, map, boons, specials: {}, report });
}

function referencePlan(build: ChoiceBuild, map: MapId): [readonly BuildAction[], readonly BuildAction[]] {
  if (build === 'hardBuild') {
    const mortar = HARD_PLANS[map].find((a) => a.type === 'build' && a.tower === 'mortar')!.cell;
    return [HARD_PLANS[map], [...HARD_REINFORCEMENTS[map], ...HARD_ARTILLERY[map], up(mortar.col, mortar.row, 'A')]];
  }
  if (build === 'comboBuild') return [COMBO_PLANS[map], ACT_TWO_PLANS[map]];
  const artillery = build === 'artilleryBuild';
  const opening = artillery ? limitType(BOW_OPENINGS[map], 'longbow', 4)
    : limitType(BOW_OPENINGS[map], 'mortar', build === 'musketBuild' ? 2 : 3);
  const types: TowerType[] = artillery ? ['cannon', 'mortar', 'cannon', 'mortar', 'cannon']
    : build === 'burnBuild' ? ['firepot', 'tarpit', 'firepot']
    : Array.from({ length: map === 'riverbend' ? 2 : 4 }, () => 'musketeer');
  // On the folded lane, the third Tar Pit can reach the next turn from (13,10).
  if (build === 'burnBuild' && map === 'switchback') {
    return [opening, [fp(9, 4), up(9, 4), t(13, 10), up(13, 10), fp(15, 11), up(15, 11)]];
  }
  const purchases = reinforcementPlan(map, opening, types);
  // The artillery and musket plans specialize their lead gun before expanding.
  if (build !== 'burnBuild') {
    const { col, row } = purchases[0].cell;
    purchases.splice(2, 0, up(col, row, 'A'));
  }
  return [opening, purchases];
}

function focalPlan(build: ChoiceBuild, map: MapId, tower: TowerType) {
  const [opening, tail] = referencePlan(build, map);
  const plan = [...opening, ...tail];
  const focal = plan.filter((action) => action.type === 'build' && action.tower === tower);
  const cells = new Set(focal.map(({ cell }) => cellKey(cell)));
  const upgrades = new Set(plan.flatMap((action) =>
    action.type === 'upgrade' && !action.path ? [cellKey(action.cell)] : [],
  ));
  const firstUpgrades = focal.filter(({ cell }) => !upgrades.has(cellKey(cell)))
    .map(({ cell }): BuildAction => ({ type: 'upgrade', cell }));
  return { opening, tail, plan, focal, cells, firstUpgrades };
}

/** Run the standard reference build with a single path assigned to every focal tower. */
export function compareTowerPaths(build: ChoiceBuild, map: MapId, tower: TowerType, path: UpgradePath,
  report: RecordReporter): WaveScript {
  const { opening, tail, cells, firstUpgrades } = focalPlan(build, map, tower);
  const actTwo = tail.map((action) =>
    action.type === 'upgrade' && action.path && cells.has(cellKey(action.cell)) ? { ...action, path } : action,
  );
  const reinforce = reinvest(referenceMainTower(build, map), { ...REINVESTMENT_PATHS, [tower]: path });
  return recordScript(followPlan(opening, [...actTwo, ...firstUpgrades], actionCost,
    paceReinvestment(reinforce, build === 'comboBuild' || build === 'hardBuild' ? 0 : SPECIALIST_SETUP_GOLD)),
    { map, difficulty: 'normal', specials: {}, report });
}

/** Bring the same focal towers to level two, then specialize them or buy an
 * equal-price upgraded copy of each. Freeze other buys for budget comparisons. */
export function compareTowerPlan(build: ChoiceBuild, map: MapId, tower: TowerType,
  choice: UpgradePath | 'copy', report: RecordReporter, support = 0): WaveScript {
  const { opening, tail, plan, focal, cells, firstUpgrades } = focalPlan(build, map, tower);
  const rest = tail.filter((action) =>
    !(action.type === 'upgrade' && action.path && cells.has(cellKey(action.cell))),
  );
  const copies = reinforcementPlan(map, plan, focal.map(() => tower));
  const choices = choice === 'copy' ? copies : focal.map(({ cell }): BuildAction => ({ type: 'upgrade', cell, path: choice }));
  // Deliberately reserve the same cells and queue the same nonfocal support in every arm.
  const supportTower = tower === 'longbow' ? 'mortar' : 'longbow';
  const extras = reinforcementPlan(map, [...plan, ...copies], Array<TowerType>(support).fill(supportTower));
  const actTwo = [...rest, ...firstUpgrades, ...choices, ...extras];
  const pairedBuilds = new Set<BuildAction>([...copies, ...extras].filter((action) => action.type === 'build'));
  const readyCost = (state: GameState, action: BuildAction) => {
    const cost = actionCost(state, action);
    return action.type === 'build' && pairedBuilds.has(action) ? cost + TOWER_DEFS[action.tower].upgradeCost : cost;
  };
  return recordScript(followPlan(opening, actTwo, readyCost), { map, difficulty: 'normal', specials: {}, report });
}
