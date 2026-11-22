// Milestone 25c: the cluster-seeking special policy used by the archetypes
// (headless.ts densestCluster, bestUnlockedSpecial, the clusterSpecial
// timed action). Path distance d < 160 is the point (d, 240).
import { describe, expect, it } from 'vitest';
import { ENEMY_STATS } from './enemies';
import { createGame, startWave } from './game';
import {
  applyAction,
  bestUnlockedSpecial,
  CLUSTER_RADIUS,
  CLUSTER_SPECIAL_ORDER,
  densestCluster,
  playScripted,
} from './headless';
import type { Enemy, EnemyType, GameState } from './types';
import { WAVES } from './waves';

function enemy(id: number, distance: number, type: EnemyType = 'troll'): Enemy {
  return { id, type, hp: ENEMY_STATS[type].hp, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 };
}

function inWave(wave: number, enemies: Enemy[]): GameState {
  const s = createGame();
  s.wave = wave - 1;
  startWave(s);
  s.spawnedPerGroup = WAVES[wave - 1].groups.map((g) => g.count);
  s.enemies = enemies;
  s.events = [];
  return s;
}

describe('densestCluster', () => {
  it('70 px, the keg radius', () => {
    expect(CLUSTER_RADIUS).toBe(70);
  });

  it('undefined with no enemy alive', () => {
    expect(densestCluster(inWave(1, []))).toBeUndefined();
  });

  it('picks the centre with the most enemies within 70 px (inclusive) and aims at their centroid', () => {
    // 10, 40, 80 are within 70 of 40 (and 80 is exactly 70 from 10); 155 is alone.
    const s = inWave(1, [enemy(0, 155), enemy(1, 10), enemy(2, 40), enemy(3, 80)]);
    expect(densestCluster(s)).toEqual({ ids: [1, 2, 3], centroid: { x: (10 + 40 + 80) / 3, y: 240 } });
    // 80.01 from 10 is out of 10's cluster, still in 40's.
    s.enemies[3].distance = 80.01;
    expect(densestCluster(s)?.ids).toEqual([1, 2, 3]);
  });

  it('ties go to the cluster containing the lowest enemy id', () => {
    // Two pairs, 100 px apart: {5, 2} at 0..30 and {1, 7} at 130..150 on the first run.
    const s = inWave(1, [enemy(5, 0), enemy(2, 30), enemy(1, 130), enemy(7, 150)]);
    expect(densestCluster(s)).toEqual({ ids: [1, 7], centroid: { x: 140, y: 240 } });
  });

  it('counts flyers (specials hit them)', () => {
    const s = inWave(4, [enemy(0, 20, 'harpy'), enemy(1, 30, 'harpy'), enemy(2, 150, 'goblin')]);
    expect(densestCluster(s)?.ids).toEqual([0, 1]);
  });

  it('is the same for the same state', () => {
    const s = inWave(1, [enemy(0, 155), enemy(1, 10), enemy(2, 40), enemy(3, 80)]);
    expect(densestCluster(structuredClone(s))).toEqual(densestCluster(s));
  });
});

describe('bestUnlockedSpecial', () => {
  it('prefers Fire Arrows, then the Tar Barrel, then the Powder Keg, among the unlocked', () => {
    expect(CLUSTER_SPECIAL_ORDER).toEqual(['fireArrows', 'tarBarrel', 'keg']);
    expect([0, 1, 3, 4, 6, 7, 10].map(bestUnlockedSpecial)).toEqual([undefined, 'keg', 'keg', 'tarBarrel', 'tarBarrel', 'fireArrows', 'fireArrows']);
  });
});

describe('the clusterSpecial timed action', () => {
  it('fires the best unlocked special at the densest cluster\'s centroid from the live state', () => {
    const s = inWave(1, [enemy(0, 155), enemy(1, 10), enemy(2, 40), enemy(3, 80)]);
    const step = applyAction(s, { type: 'clusterSpecial', atWaveTick: 0 });
    expect(step).toMatchObject({ action: 'special', special: 'keg', x: 130 / 3, y: 240, result: { ok: true, hits: 3 } });
    expect(s.specialCharges).toBe(0);
  });

  it('with no enemy alive nothing fires and the charge is kept', () => {
    const s = inWave(1, []);
    expect(applyAction(s, { type: 'clusterSpecial', atWaveTick: 0 })).toEqual({ action: 'clusterSpecial', waveTick: 0, fired: false });
    expect(s.specialCharges).toBe(1);
  });

  it('in a played script it fires at its wave tick', () => {
    const script = Object.assign([[]], { timed: [[{ type: 'clusterSpecial' as const, atWaveTick: 300 }]] });
    const run = playScripted(script);
    expect(run.log.find((l) => l.action === 'special')).toMatchObject({ special: 'keg', waveTick: 300, result: { ok: true } });
  });
});
