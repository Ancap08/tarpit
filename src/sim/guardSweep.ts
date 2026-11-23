import { useSpecial } from './actions';
import { balanceRun } from './balanceRuns';
import { BARRICADE_END_EXCLUSION, guardsPlacement } from './blockers';
import { createGame, startWave, tick } from './game';
import { comboGuards, playScripted } from './headless';
import { MAPS, pathLength, positionAlongPath, type MapId } from './map';
import { SPECIAL_DEFS } from './specials';
import type { Difficulty } from './difficulty';
import type { GameState, Point } from './types';

const GRID_STEP = 48;
const LAST_SOLO_WAVE = 8;
const GUARDS_UNLOCK = SPECIAL_DEFS.guards.unlockWave;

/** Use the Barricade sweep grid, filtering by the actual squad placement rule. */
function guardPoints(map: MapId) {
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

/** G2, adaptive combo towers and the same ready-charge policy at each legal point. */
export function sweepGuards(map: MapId, level: 'normal' | 'hard') {
  const baseline = balanceRun('comboBuild', map, level);
  const points = guardPoints(map);
  let best: { distance: number; gain: number } | undefined;
  let hardWinsFromLoss = 0;
  for (const { distance, point } of points) {
    const { state, log } = playScripted(comboGuards(level, map, point), undefined, level);
    if (log.some(step => 'result' in step && !step.result.ok)) throw new Error(`Refused sweep action: ${map}/${level}/${distance}`);
    if (state.phase !== 'won' && state.phase !== 'lost') throw new Error(`Unresolved Guards run: ${map}/${level}/${distance} on wave ${state.wave}`);
    if (level === 'hard' && baseline.phase === 'lost' && state.phase === 'won') hardWinsFromLoss++;
    const gain = state.lives - baseline.lives;
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
