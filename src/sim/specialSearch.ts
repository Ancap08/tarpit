// The special-attack search (milestone 28). Offline: `npm run sim:specials`
// runs it and writes the result to specialLists.ts, which the archetypes
// read. specialSearch.test.ts reruns it for Meadow's lists and checks the
// stored data is what it gives.
//
// Wave-by-wave greedy search. The build plan is followed as in the
// archetypes (each action as soon as gold allows, in setup). For each wave
// in order, with the choices for earlier waves already fixed, every
// candidate below is played from that wave's start to its end, and so is
// "no special". The best outcome for that wave wins: fewest lives lost,
// then most kills by the wave's end, then the earliest clear. Ties keep the
// earlier candidate, and "no special" comes first, so a special is chosen
// only when it does strictly better than none on its own wave.
//
// Candidate set (fixed, the same on every map and wave):
// - ticks: every SEARCH_TICK_STEP wave ticks (1 s), from SEARCH_TICK_STEP
//   until the wave ends in the run without a special for that wave;
// - specials: each special unlocked on the wave, in unlock order (keg, Tar
//   Barrel, Fire Arrows);
// - targets: the centre of every cell whose centre lies within
//   SEARCH_TARGET_REACH px (16, inclusive) of the path centreline, in
//   cellKey order (searchTargets). So the aim points sit on the path every
//   32 px or so, along both sides of a segment that runs on a cell edge.
// A special's effect on an enemy does not depend on where in the radius it
// stands, so two targets that hit the same enemies at the same tick give
// the same game: only the first target of each distinct, non-empty set of
// enemies hit is played. A target that hits nothing is not a candidate.
//
// Determinism: the search only plays the game; states are copied with
// structuredClone (the map object is shared, it is never changed).

import { useSpecial } from './actions';
import type { Difficulty } from './difficulty';
import { enemyPosition } from './combat';
import { createGame, startWave, tick } from './game';
import { applyAction, followPlan, type BuildAction, type SpecialAction } from './headless';
import { cellCenter, cellFromKey, distanceToPath, GRID_COLS, GRID_ROWS, type Cell } from './grid';
import { MAPS, type MapId } from './map';
import { SPECIAL_DEFS, unlockedSpecials } from './specials';
import type { StoredSpecial } from './specialLists';
import type { GameState, MapDef } from './types';
import { LAST_WAVE, waveDef } from './waves';

/** Candidate ticks are every this many wave ticks (1 s). */
export const SEARCH_TICK_STEP = 60;
/** Candidate targets are the cells whose centre is within this many px of the path centreline. */
export const SEARCH_TARGET_REACH = 16;

/** One wave's choice: a special at a cell centre on a wave tick (specialLists.ts StoredSpecial); null for none. */
export type SpecialChoice = StoredSpecial;

/** The choice as a headless timed action (aimed at the cell's centre). */
export function choiceAction(choice: SpecialChoice): SpecialAction {
  const { x, y } = cellCenter({ col: choice.col, row: choice.row });
  return { type: 'special', special: choice.special, x, y, atWaveTick: choice.atWaveTick };
}

const targetCache = new WeakMap<MapDef, readonly Cell[]>();

/** The candidate target cells of a map (see the header), in cellKey order. */
export function searchTargets(map: MapDef): readonly Cell[] {
  const known = targetCache.get(map);
  if (known) return known;
  const cells: Cell[] = [];
  for (let key = 0; key < GRID_COLS * GRID_ROWS; key++) {
    const cell = cellFromKey(key);
    if (distanceToPath(cellCenter(cell), map) <= SEARCH_TARGET_REACH) cells.push(cell);
  }
  targetCache.set(map, cells);
  return cells;
}

/** A wave's outcome, compared by better(). */
export interface Outcome {
  livesLost: number;
  kills: number;
  /** Wave ticks the wave took. */
  ticks: number;
}

/** a is strictly better than b: fewer lives lost, then more kills, then an earlier clear. */
export function better(a: Outcome, b: Outcome): boolean {
  if (a.livesLost !== b.livesLost) return a.livesLost < b.livesLost;
  if (a.kills !== b.kills) return a.kills > b.kills;
  return a.ticks < b.ticks;
}

function clone(state: GameState): GameState {
  const { map, ...rest } = state;
  const copy = structuredClone(rest) as GameState;
  copy.map = map;
  return copy;
}

function killEvents(state: GameState): number {
  let n = 0;
  for (const e of state.events) if (e.kind === 'kill') n += 1;
  return n;
}

function unspawned(state: GameState, total: number): number {
  return total - state.spawnedPerGroup.reduce((a, b) => a + b, 0);
}

/**
 * Play the running wave of `state` (in place) to its end and return the
 * outcome counted from `livesAtStart` and `killsSoFar`. Stops early, with
 * undefined, once the run can no longer beat `bound`: it has lost more
 * lives, or it is still running at bound's clear tick with no more kills
 * possible than bound's.
 */
function playOut(
  state: GameState,
  livesAtStart: number,
  killsSoFar: number,
  total: number,
  bound: Outcome,
): Outcome | undefined {
  let kills = killsSoFar;
  while (state.phase === 'wave') {
    tick(state);
    kills += killEvents(state);
    const lost = livesAtStart - state.lives;
    if (lost > bound.livesLost) return undefined;
    // Still running at or past the bound's clear tick, with no chance of
    // more kills than the bound: it can at best tie, and later.
    if (state.phase === 'wave' && state.waveTick >= bound.ticks && lost === bound.livesLost && kills + state.enemies.length + unspawned(state, total) <= bound.kills) {
      return undefined;
    }
  }
  return { livesLost: livesAtStart - state.lives, kills, ticks: state.waveTick };
}

/**
 * The outcome of the running wave of `state` (at its first tick, right
 * after startWave) with `choice` fired at its tick, or with no special;
 * played on a copy, so `state` is not changed.
 */
export function waveOutcome(state: GameState, choice: SpecialChoice | null): Outcome {
  const s = clone(state);
  const lives = s.lives;
  const fire = choice ? choiceAction(choice) : undefined;
  let kills = 0;
  while (s.phase === 'wave') {
    if (fire && s.waveTick === fire.atWaveTick) {
      const r = useSpecial(s, fire.special, fire);
      if (r.ok) kills += r.kills;
    }
    tick(s);
    kills += killEvents(s);
  }
  return { livesLost: lives - s.lives, kills, ticks: s.waveTick };
}

export interface SearchOptions {
  /** Search only the first this many waves (tests); the rest of the list is not produced. */
  waves?: number;
}

/** Enemies in a wave (every group's count). */
function waveTotal(wave: number): number {
  return waveDef(wave).groups.reduce((n, g) => n + g.count, 0);
}

/**
 * The greedy special list for `plan` on `difficulty` and `map` (see the
 * header): entry i for wave i + 1, one per wave played (fewer than 10 if
 * the plan loses first).
 */
export function searchSpecials(plan: readonly BuildAction[], difficulty: Difficulty, map: MapId, options: SearchOptions = {}): (SpecialChoice | null)[] {
  const state = createGame({ difficulty, map });
  const decide = followPlan(plan);
  const targets = searchTargets(MAPS[map]);
  const chosen: (SpecialChoice | null)[] = [];
  const waves = options.waves ?? LAST_WAVE;
  for (let i = 0; i < waves && state.phase === 'setup'; i++) {
    for (let action = decide(state); action; action = decide(state)) applyAction(state, action);
    startWave(state);
    const total = waveTotal(state.wave);
    const lives = state.lives;
    // The run without a special, keeping a copy of the state (and the kills
    // so far) at each candidate tick.
    const snapshots: { state: GameState; kills: number }[] = [];
    const base = clone(state);
    let baseKills = 0;
    while (base.phase === 'wave') {
      if (base.waveTick > 0 && base.waveTick % SEARCH_TICK_STEP === 0) snapshots.push({ state: clone(base), kills: baseKills });
      tick(base);
      baseKills += killEvents(base);
    }
    let best: Outcome = { livesLost: lives - base.lives, kills: baseKills, ticks: base.waveTick };
    let choice: SpecialChoice | null = null;
    for (const snap of snapshots) {
      const positions = snap.state.enemies.map((e) => ({ id: e.id, p: enemyPosition(e, snap.state.map) }));
      for (const special of unlockedSpecials(snap.state.wave)) {
        const radius = SPECIAL_DEFS[special].radius;
        const seen = new Set<string>();
        for (const cell of targets) {
          const c = cellCenter(cell);
          const hit = positions.filter((o) => Math.hypot(o.p.x - c.x, o.p.y - c.y) <= radius).map((o) => o.id);
          if (hit.length === 0) continue;
          const key = hit.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          const s = clone(snap.state);
          const r = useSpecial(s, special, c);
          if (!r.ok) throw new Error(`searchSpecials: ${special} refused: ${r.reason}`);
          const out = playOut(s, lives, snap.kills + r.kills, total, best);
          if (out && better(out, best)) {
            best = out;
            choice = { special, col: cell.col, row: cell.row, atWaveTick: snap.state.waveTick };
          }
        }
      }
    }
    chosen.push(choice);
    // Commit: play the wave with the choice from its start.
    const fire = choice ? choiceAction(choice) : undefined;
    while ((state.phase as GameState['phase']) === 'wave') {
      if (fire && state.waveTick === fire.atWaveTick) applyAction(state, fire);
      tick(state);
    }
  }
  return chosen;
}
