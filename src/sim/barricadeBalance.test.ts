import { describe, expect, it } from 'vitest';
import { useSpecial } from './actions';
import { balanceRun, playWithStats } from './balanceRuns';
import { KILL_EPSILON } from './combat';
import type { Difficulty } from './difficulty';
import { ENEMY_STATS } from './enemies';
import { createGame, startWave, tick, TICKS_PER_SECOND } from './game';
import { applyAction, COMBO_BARRICADE_POINTS, comboBarricade, type TimedAction } from './headless';
import { MAP_IDS, type MapId } from './map';
import type { GameState } from './types';
import { LAST_WAVE } from './waves';

const levels = ['easy', 'normal', 'hard'] as const;

function campaignGain(map: MapId, level: Difficulty): number {
  const baseline = balanceRun('comboBuild', map, level);
  const script = comboBarricade(level, map);
  const run = playWithStats(script, level);
  const label = `${map}/${level}`;
  expect(script.timed?.flat().some((action) => action.type === 'special' && action.special === 'barricade'), label).toBe(true);
  expect(run.refused, label).toBe(0);
  const gain = run.lives - baseline.lives;
  expect(gain, label).toBeLessThanOrEqual(6);
  if (level === 'normal') {
    expect(run.phase, label).toBe('won');
    expect(gain, label).toBeGreaterThanOrEqual(-2);
  }
  return gain;
}

describe('Barricade campaign balance', () => {
  it('gains at least one Normal life on two maps, loses at most two, and gains at most six (K2, K3)', () => {
    const gains = MAP_IDS.map((map) => campaignGain(map, 'normal'));
    expect(gains.filter((gain) => gain >= 1).length).toBeGreaterThanOrEqual(2);
  });

  it.each(MAP_IDS)('gains at most six Easy or Hard lives on %s (K3)', (map) => {
    campaignGain(map, 'easy');
    campaignGain(map, 'hard');
  });

  it.each(MAP_IDS)('loses by wave 4 on %s using only walls (K3)', (map) => {
    for (const difficulty of levels) {
      const state = createGame({ map, difficulty });
      // The unassisted game dies before the unlock. Give walls a full-lives
      // control starting at their first wave so this test exercises them.
      const baseline = balanceRun('noTowers', map, difficulty);
      expect(baseline.phase, difficulty).toBe('lost');
      expect(baseline.wave, difficulty).toBeLessThan(3);
      state.wave = 2;
      let hits = 0;
      while (state.phase === 'setup' && state.wave < 4) {
        expect(startWave(state).ok, difficulty).toBe(true);
        for (let step = 0; (state.phase as GameState['phase']) === 'wave' && step < 60 * TICKS_PER_SECOND; step++) {
          if (state.specialCharges > 0 && !state.blocker) {
            expect(useSpecial(state, 'barricade', COMBO_BARRICADE_POINTS[map]).ok, difficulty).toBe(true);
          }
          tick(state);
          hits += state.events.filter((event) => event.kind === 'blockerHit').length;
        }
      }
      expect(hits, difficulty).toBeGreaterThan(0);
      expect(state.phase, difficulty).toBe('lost');
      expect(state.wave, difficulty).toBeLessThanOrEqual(4);
    }
  });
});

/** Find a real pre-contact state from the scripted game before the boss dies. */
function actualContact(map: MapId, difficulty: Difficulty) {
  let beforeContact: GameState | undefined;
  const script = comboBarricade(difficulty, map);
  const run = playWithStats(script, difficulty, (state) => {
    if (beforeContact || state.wave !== LAST_WAVE || !state.blocker) return;
    const boss = state.enemies.find((enemy) => enemy.type === 'grumblemaw');
    if (!boss) return;
    const remaining = state.blocker.distance - boss.distance;
    if (remaining < 0 || remaining > ENEMY_STATS.grumblemaw.speed / TICKS_PER_SECOND) return;
    const probe = structuredClone(state);
    tick(probe);
    if (probe.events.some((event) => event.kind === 'blockerHit' && event.enemyId === boss.id)) {
      beforeContact = structuredClone(state);
    }
  });
  expect(run.refused).toBe(0);
  const kill = run.bossFight.find(({ event }) => event === 'kill');
  if (!kill) throw new Error(`Grumblemaw did not die on ${map}/${difficulty}`);
  if (!beforeContact) throw new Error(`No live Grumblemaw contact on ${map}/${difficulty}`);
  return { beforeContact, killTick: kill.tick, timed: script.timed?.[LAST_WAVE - 1] ?? [] };
}

/** Keep the live board and casts in both arms. Override only lethal boss damage. */
function bossExit(snapshot: GameState, timed: readonly TimedAction[], keepWall: boolean) {
  const state = structuredClone(snapshot);
  if (!keepWall) state.blocker = null;

  const boss = state.enemies.find((enemy) => enemy.type === 'grumblemaw');
  if (!boss) throw new Error('Contact state did not contain Grumblemaw');
  let hp = boss.hp;
  let firstLethalTick: number | undefined;
  Object.defineProperty(boss, 'hp', {
    get: () => hp,
    set(value: number) {
      if (value <= KILL_EPSILON) {
        firstLethalTick ??= state.waveTick;
        hp = 1;
      } else {
        hp = value;
      }
    },
  });

  for (let steps = 1; steps <= 180 * TICKS_PER_SECOND && state.phase === 'wave'; steps++) {
    // The observer captured the first tick after its actions were applied.
    if (steps > 1) {
      for (const action of timed) {
        if (action.atWaveTick !== state.waveTick) continue;
        const result = applyAction(state, action);
        if ('result' in result) expect(result.result.ok).toBe(true);
      }
    }
    tick(state);
    if (state.events.some((event) => event.kind === 'bossDown' && event.enemyType === 'grumblemaw' && event.cause === 'exit')) {
      return { steps, firstLethalTick };
    }
  }
  throw new Error('Grumblemaw did not reach the exit in the survival comparison');
}

it.each(['meadow', 'riverbend'] as const)('adds at most 5 s to the Normal Grumblemaw exit comparison on %s (K4)', (map) => {
  const { beforeContact, killTick, timed } = actualContact(map, 'normal');
  const withWall = bossExit(beforeContact, timed, true);
  const withoutWall = bossExit(beforeContact, timed, false);
  expect(withWall.firstLethalTick).toBe(killTick);
  const delay = withWall.steps - withoutWall.steps;
  expect(delay).toBeGreaterThan(0);
  expect(delay).toBeLessThanOrEqual(5 * TICKS_PER_SECOND);
});
