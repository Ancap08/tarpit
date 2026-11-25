import { describe, expect, it } from 'vitest';
import { useSpecial } from './actions';
import { botGood, runBot } from './bots';
import { createGame, startWave, tick } from './game';
import { KEEP_LEVELS } from './keepLevels';
import { MAX_SIEGE_CONTACT_TICKS } from './movement';
import { positionAlongPath } from './map';

describe('siege stragglers', () => {
  function lastGoblin() {
    const state = createGame({ level: KEEP_LEVELS[3] });
    expect(startWave(state).ok).toBe(true);
    state.spawnedPerGroup = state.level!.waves[0].groups.map(group => group.count);
    const goblin = { id: 54, type: 'goblin' as const, hp: 23, distance: state.gate!.distance, slow: 0, slowTicksLeft: 0 };
    state.enemies.push(goblin);
    return { state, goblin };
  }

  it('lets a lone Goblin overrun the gate after 60 seconds of contact, then cross the yard', () => {
    const { state, goblin } = lastGoblin();
    const gate = state.gate!;
    for (let n = 1; n < MAX_SIEGE_CONTACT_TICKS; n++) tick(state);
    expect(gate.hp).toBeCloseTo(21_000 - 359.9);
    expect(gate.fallen).toBe(false);
    tick(state);
    expect(gate.fallen).toBe(true);
    expect(goblin.distance).toBe(gate.distance);
    for (let n = 0; n <= gate.yardLength; n++) tick(state);
    expect(state.phase).toBe('setup');
    expect(state.lives).toBe(19);
  });

  it('counts contact across renewed barricades and the gate', () => {
    const { state, goblin } = lastGoblin();
    const gate = state.gate!;
    goblin.distance -= 10;
    const anchor = positionAlongPath(state.map, goblin.distance);
    for (let cast = 0; cast < 3; cast++) {
      expect(useSpecial(state, 'barricade', anchor).ok).toBe(true);
      for (let n = 0; n < MAX_SIEGE_CONTACT_TICKS / 3; n++) tick(state);
      expect(state.blockers).toHaveLength(cast < 2 ? 1 : 0);
    }
    expect(gate.hp).toBe(21_000);
    for (let n = 0; n < 12; n++) tick(state);
    expect(gate.fallen).toBe(true);
  });

  it.each(['tarpit', 'mortar'] as const)('finishes the level 24 %s-only trial', tower => {
    const { state } = runBot(createGame({ level: { ...KEEP_LEVELS[3], allowedTowers: [tower] } }), botGood, Infinity, 3 * 60 * 60);
    expect(state.phase).toBe('lost');
    expect(state.wave).toBe(2);
  });
});
