// The check-only K3 campaign. Each placement gets its own start-to-finish combo plan.
import { useSpecial } from './actions';
import { balanceRun } from './balanceRuns';
import { BARRICADE_END_EXCLUSION, barricadePlacement } from './blockers';
import { lastSpawnTick, tick } from './game';
import { comboBarricade, playScripted } from './headless';
import { MAPS, pathLength, positionAlongPath, type MapId } from './map';
import type { GameState, Point } from './types';

type Level = 'normal' | 'hard';

/** With no remaining spawns, identical states just after two successive refreshes repeat forever. */
function repeatsAtRefresh(state: GameState, point: Point): boolean {
  if (state.waveTick <= lastSpawnTick(state.wave) || state.packs.length > 0) return false;
  function refresh(): string | undefined {
    for (let left = state.specialRechargeTicks; left > 0; left--) tick(state);
    if (!useSpecial(state, 'barricade', point).ok) return undefined;
    // The last cast was this tick in both states. Absolute clocks can no longer trigger spawns.
    return JSON.stringify({ ...state, tick: 0, waveTick: 0, lastBarricadeTick: 0, shots: [], events: [] });
  }
  const first = refresh();
  return first !== undefined && first === refresh();
}

export function measureBarricadePoint(map: MapId, level: Level, distance: number) {
  const point = positionAlongPath(MAPS[map], distance);
  if (!barricadePlacement(MAPS[map], point).ok) throw new Error(`Illegal sweep point: ${map}/${distance}`);
  const script = comboBarricade(level, map, undefined, undefined, { barricadePoint: point, refreshBarricade: true });
  const { state, log } = playScripted(script, undefined, level);
  if (log.some(step => 'result' in step && !step.result.ok)) throw new Error(`Refused sweep action: ${map}/${level}/${distance}`);
  if (state.phase === 'won' || state.phase === 'lost') return { phase: state.phase, lives: state.lives };
  if (state.phase === 'wave' && repeatsAtRefresh(state, point)) return { phase: 'held' as const };
  throw new Error(`Unresolved sweep run: ${map}/${level}/${distance} on wave ${state.wave}`);
}

export function sweepBarricades(map: MapId, level: Level) {
  const baseline = balanceRun('comboBuild', map, level);
  let best: { distance: number; gain: number } | undefined;
  let points = 0;
  let held = 0;
  let hardWinsFromLoss = 0;
  const length = pathLength(MAPS[map]);
  for (let distance = BARRICADE_END_EXCLUSION; distance <= length - BARRICADE_END_EXCLUSION; distance += 48) {
    points++;
    const run = measureBarricadePoint(map, level, distance);
    if (run.phase === 'held') {
      held++;
      continue;
    }
    if (level === 'hard' && baseline.phase === 'lost' && run.phase === 'won') hardWinsFromLoss++;
    const gain = run.lives - baseline.lives;
    if (!best || gain > best.gain) best = { distance, gain };
  }
  if (!best) throw new Error(`No completed campaigns: ${map}/${level}`);
  return { best, points, held, hardWinsFromLoss, ok: best.gain <= 6 && hardWinsFromLoss === 0 };
}
