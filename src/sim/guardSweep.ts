import { useSpecial } from './actions';
import { balanceRun } from './balanceRuns';
import { BARRICADE_END_EXCLUSION, guardsPlacement } from './blockers';
import { createGame, startWave, tick } from './game';
import { comboGuards, type RecordedOutcome } from './headless';
import { MAPS, pathLength, positionAlongPath, type MapId } from './map';
import { SPECIAL_DEFS } from './specials';
import type { Difficulty } from './difficulty';
import type { GameState, Point } from './types';

const GRID_STEP = 48;
const LAST_SOLO_WAVE = 8;
const GUARDS_UNLOCK = SPECIAL_DEFS.guards.unlockWave;

/** Use the Barricade sweep grid, filtering by the actual squad placement rule. */
export function guardPoints(map: MapId) {
  const terrain = MAPS[map];
  const length = pathLength(terrain);
  const points: { distance: number; point: Point }[] = [];
  for (let distance = BARRICADE_END_EXCLUSION; distance <= length; distance += GRID_STEP) {
    const point = positionAlongPath(terrain, distance);
    if (guardsPlacement(terrain, point).ok) points.push({ distance, point });
  }
  if (points.length === 0) throw new Error(`No legal Guards placements on ${map}`);
  return points;
}

/** Spend every charge on Guards, with no towers or earlier attack specials. */
function guardsOnly(map: MapId, level: Difficulty, point: Point, fromUnlock: boolean): GameState {
  const state = createGame({ map, difficulty: level });
  if (fromUnlock) state.wave = GUARDS_UNLOCK - 1;
  while (state.phase === 'setup' && state.wave < LAST_SOLO_WAVE) {
    if (!startWave(state).ok) throw new Error(`Could not start Guards-only wave: ${map}/${level}/${state.wave + 1}`);
    for (let ticks = 0; (state.phase as GameState['phase']) === 'wave' && ticks < 60 * 600; ticks++) {
      if (state.wave >= GUARDS_UNLOCK && state.specialCharges > 0 && !useSpecial(state, 'guards', point).ok) {
        throw new Error(`Refused Guards-only cast: ${map}/${level}/${state.wave}`);
      }
      tick(state);
    }
  }
  return state;
}

/** G2 compares the run that records the adaptive combo, with no second replay. */
export function measureGuardPoint(map: MapId, level: 'normal' | 'hard', distance: number) {
  const terrain = MAPS[map];
  const point = positionAlongPath(terrain, distance);
  if (!guardsPlacement(terrain, point).ok) throw new Error(`Illegal Guards sweep point: ${map}/${distance}`);
  const baseline = balanceRun('comboBuild', map, level);
  let run: RecordedOutcome | undefined;
  comboGuards(level, map, point, (outcome, refused) => {
    if (refused) throw new Error(`Refused sweep action: ${map}/${level}/${distance}`);
    run = outcome;
  });
  if (run?.phase !== 'won' && run?.phase !== 'lost') {
    throw new Error(`Unresolved Guards run: ${map}/${level}/${distance} on wave ${run?.wave}`);
  }
  return { gain: run.lives - baseline.lives, hardWinFromLoss: level === 'hard' && baseline.phase === 'lost' && run.phase === 'won' };
}

/** G2, adaptive combo towers and the same ready-charge policy at each legal point. */
export function sweepGuards(map: MapId, level: 'normal' | 'hard') {
  const points = guardPoints(map);
  let best: { distance: number; gain: number } | undefined;
  let hardWinsFromLoss = 0;
  for (const { distance } of points) {
    const { gain, hardWinFromLoss } = measureGuardPoint(map, level, distance);
    if (hardWinFromLoss) hardWinsFromLoss++;
    if (!best || gain > best.gain) best = { distance, gain };
  }
  if (!best) throw new Error(`No completed Guards campaigns: ${map}/${level}`);
  return { best, points: points.length, hardWinsFromLoss, ok: best.gain <= 5 && hardWinsFromLoss === 0 };
}

/** G3, latest loss at any legal point, both from wave 1 and from the unlock at full lives. */
export function sweepGuardsOnly(map: MapId, level: Difficulty) {
  const points = guardPoints(map);
  // Before Guards unlock the point has no effect. If that run reaches the
  // unlock, check every other point as well.
  function latestLoss(fromUnlock: boolean) {
    let latest = 0;
    let survived = 0;
    for (const { point } of points) {
      const state = guardsOnly(map, level, point, fromUnlock);
      if (state.phase === 'lost') {
        latest = Math.max(latest, state.wave);
        if (state.wave < GUARDS_UNLOCK) break;
      } else survived++;
    }
    return { latest, survived };
  }
  const campaign = latestLoss(false);
  const unlock = latestLoss(true);
  return { campaign, unlock, ok: campaign.survived === 0 && unlock.survived === 0 };
}
