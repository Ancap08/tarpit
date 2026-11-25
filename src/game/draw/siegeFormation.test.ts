import { describe, expect, it } from 'vitest';
import { areaSpecialTargets, createGame, distanceOnRoad, enemyPosition, specialRadius, startWave, useSpecial, type Enemy } from '../../sim';
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

  it('keeps every foot of a 60-enemy crowd within 40 px and in the same slot on replay', () => {
    const crowd = Array.from({ length: 60 }, (_, id) => enemy(id, id % 2 ? 'east' : 'west'));
    const poses = crowd.map(enemy => siegeStance(state, enemy)!);
    expect(Math.max(...poses.map(({ x, y }) => Math.hypot(x, y)))).toBeLessThanOrEqual(40);
    expect(crowd.map(enemy => siegeStance(structuredClone(state), enemy))).toEqual(poses);
  });

  it.each(['keg', 'tarBarrel', 'fireArrows'] as const)('%s marks the true stack as a hit when aimed at its farthest foot', type => {
    const siege = createGame({ level: KEEP_LEVELS[2] });
    expect(startWave(siege).ok).toBe(true);
    siege.enemies = Array.from({ length: 60 }, (_, id) => ({
      ...enemy(id, id % 2 ? 'east' : 'west'), type: 'troll', hp: 950,
    }));
    const furthest = siege.enemies.reduce((a, b) => {
      const offset = (enemy: Enemy) => {
        const { x, y } = siegeStance(siege, enemy)!;
        return Math.hypot(x, y);
      };
      return offset(b) > offset(a) ? b : a;
    });
    const foot = siegeStance(siege, furthest)!;
    const truePoint = enemyPosition(furthest, siege.map);
    const aim = { x: truePoint.x + foot.x, y: truePoint.y + foot.y };
    const flyer: Enemy = { ...furthest, id: 60, type: 'harpy', distance: 0 };
    siege.enemies.push(flyer);
    const targets = areaSpecialTargets(siege, aim, specialRadius(type, siege.boons));
    expect(targets.map(enemy => enemy.id)).toEqual(Array.from({ length: 60 }, (_, id) => id));
    expect(useSpecial(siege, type, aim)).toMatchObject({ ok: true, hits: 60 });
    if (type === 'keg') expect(targets.every(enemy => enemy.hp === 890)).toBe(true);
    expect(flyer.hp).toBe(950);
  });

  it('keeps fanning in the yard and leaves flyers and distant walkers alone', () => {
    expect(siegeStance(state, enemy(7, 'east', 90))).toMatchObject({ scale: 1.28 });
    expect(siegeStance(state, enemy(7, 'east', -100))).toBeUndefined();
    expect(siegeStance(state, { ...enemy(7), type: 'harpy' })).toBeUndefined();
  });
});
