import { describe, expect, it } from 'vitest';
import { createGame, distanceOnRoad, type Enemy } from '../../sim';
import { KEEP_LEVELS } from '../../sim/keepLevels';
import { siegeStance } from './siegeFormation';

describe('siege formation', () => {
  const state = createGame({ level: KEEP_LEVELS[2] });
  const enemy = (id: number, road = 'east', offset = 0): Enemy => ({
    id, road, distance: distanceOnRoad(state.map, road, state.gate!)! + offset,
    type: 'goblin', hp: 23, slow: 0, slowTicksLeft: 0,
  });

  it('gives 30 held enemies stable, distinct feet on both roads independent of iteration order', () => {
    const enemies = Array.from({ length: 30 }, (_, id) => enemy(id, id % 2 ? 'east' : 'west'));
    const pose = enemies.map(e => siegeStance(state, e));
    expect(new Set(pose.map(p => JSON.stringify(p))).size).toBe(30);
    expect([...enemies].reverse().map(e => siegeStance(structuredClone(state), e)).reverse()).toEqual(pose);
    expect(pose.every(p => p && p.scale === 1.48)).toBe(true);
  });

  it('keeps fanning in the yard and leaves flyers and distant walkers alone', () => {
    expect(siegeStance(state, enemy(7, 'east', 90))).toMatchObject({ scale: 1.28 });
    expect(siegeStance(state, enemy(7, 'east', -100))).toBeUndefined();
    expect(siegeStance(state, { ...enemy(7), type: 'harpy' })).toBeUndefined();
  });
});
