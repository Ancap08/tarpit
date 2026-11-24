import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { playWithStats } from './balanceRuns';
import { guardPoints, measureGuardPoint, sweepGuardsOnly } from './guardSweep';
import { comboBuild, comboGuards, playScripted } from './headless';
import { MAP_IDS, MAPS, positionAlongPath } from './map';
import { SPECIAL_DEFS } from './specials';

// G1 locked the original combos at d6a714b, omitting the unused blocker.
// Switchback buys a path B Tar Pit, so its three locks include milestone 49's Feathers.
it.each([
  ['meadow', 'easy', '42fb7a2748b4e4f5d4e618d63684ca184517accd936da55eca66ffe16e58ea7a'],
  ['meadow', 'normal', 'b32539f01a26e2b26643501305892db28baa81462616bd6e017dc720f5e6ad49'],
  ['meadow', 'hard', 'a9216586ba9dc94c66eb7c7ae61bf88c87f34c575a959392846eae401bc95dd7'],
  ['switchback', 'easy', '6449bc37a07d4980dbf27118759bda56947341824a11a29d3edfde9600b6f293'],
  ['switchback', 'normal', 'e42ee8fab0e3f7fed6faeda08793186110de110e92ef5d75b77b08b4f84c33b8'],
  ['switchback', 'hard', '856f9a1a74b318bc87fcc67a02acab81d443f28f9b0689d0579f3b905967efd5'],
  ['riverbend', 'easy', 'fe0b0882ba3fe686e22b879ab143aae6ac6a9a40f6b17cb5cec9b2342f64818a'],
  ['riverbend', 'normal', '3382e459fd2ff8d48f9f9ae38b85900b94a9f89a2586b1057dc7e8e896c1ddd1'],
  ['riverbend', 'hard', '3196523b65ae74c7433456817b785777708d8e79ff532be006781c3c5d2d1019'],
] as const)('G1 locks the combo end state on %s/%s', (map, level, sha) => {
  const { state, log } = playScripted(comboBuild(level, map), undefined, level);
  expect(log.some((step) => 'result' in step && !step.result.ok)).toBe(false);
  const { blockers, nextGuardId, lastSpecialTick, ...originalFields } = state;
  expect(blockers).toEqual([]);
  expect(nextGuardId).toBe(0);
  expect(lastSpecialTick).toBeGreaterThanOrEqual(0);
  expect(lastSpecialTick).toBeLessThanOrEqual(state.tick);
  expect(createHash('sha256').update(JSON.stringify(originalFields)).digest('hex')).toBe(sha);
});

const bestPlacements = [
  ['meadow', 'normal', 31, 784, 1],
  ['switchback', 'normal', 34, 448, 0],
  ['riverbend', 'normal', 30, 352, 3],
  ['meadow', 'hard', 31, 64, -3],
  ['switchback', 'hard', 34, 64, 0],
  ['riverbend', 'hard', 30, 64, -1],
] as const;

for (const [map, level, count, bestDistance, bestGain] of bestPlacements) {
  const points = guardPoints(map);
  it(`G2 covers all ${count} legal placements on ${map}/${level}`, () => {
    expect(points).toHaveLength(count);
    expect(points.some(({ distance }) => distance === bestDistance)).toBe(true);
  });
  for (const { distance } of points) {
    it(`G2 balance on ${map}/${level} at ${distance} px`, () => {
      const { gain, hardWinFromLoss } = measureGuardPoint(map, level, distance);
      expect(hardWinFromLoss).toBe(false);
      expect(gain).toBeLessThanOrEqual(5);
      if (distance < bestDistance) expect(gain).toBeLessThan(bestGain);
      else if (distance === bestDistance) expect(gain).toBe(bestGain);
      else expect(gain).toBeLessThanOrEqual(bestGain);
    });
  }
}

it.each(MAP_IDS)('G3 loses with Guards alone on %s', (map) => {
  for (const level of ['easy', 'normal', 'hard'] as const) {
    expect(sweepGuardsOnly(map, level), level).toEqual({
      campaign: { latest: level === 'easy' ? 2 : 1, survived: 0 },
      unlock: { latest: 6, survived: 0 },
      ok: true,
    });
  }
});

it('uses the combo special policy before the unlock and spends every ready charge on Guards afterward', () => {
  const unlock = SPECIAL_DEFS.guards.unlockWave;
  const point = positionAlongPath(MAPS.meadow, 352);
  const baseline = comboBuild('normal', 'meadow');
  const script = comboGuards('normal', 'meadow', point);
  expect(script.timed?.slice(0, unlock - 1)).toEqual(baseline.timed?.slice(0, unlock - 1));
  const casts = script.timed?.slice(unlock - 1).flat() ?? [];
  expect(casts.length).toBeGreaterThan(0);
  for (const cast of casts) expect(cast).toMatchObject({ type: 'special', special: 'guards', ...point });
  let readyTicks = 0;
  const run = playWithStats(script, 'normal', (state) => {
    if (state.wave >= unlock && state.specialCharges > 0) readyTicks++;
  });
  expect(run.wave).toBeGreaterThanOrEqual(unlock);
  expect(run.refused).toBe(0);
  expect(readyTicks).toBe(0);
});
