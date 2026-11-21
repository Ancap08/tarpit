import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { createGame, startWave, tick } from './game';
import type { Enemy, GameState, TowerType } from './types';

function goblin(id: number, distance: number): Enemy {
  return { id, type: 'goblin', hp: 30, distance, slow: 0, slowTicksLeft: 0 };
}

/** Mid-wave-1 state with every wave enemy already spawned, so ticks spawn nothing. */
function arena(enemies: Enemy[], towers: [number, TowerType][]): GameState {
  const s = createGame();
  s.gold = 10_000;
  s.phase = 'wave';
  s.wave = 1;
  s.spawnedPerGroup = [8];
  s.enemies = enemies;
  s.nextEnemyId = 100;
  for (const [spotId, type] of towers) buildTower(s, spotId, type);
  return s;
}

describe('state.shots', () => {
  it('starts empty and stays empty when nothing fires', () => {
    const s = createGame();
    expect(s.shots).toEqual([]);
    tick(s); // setup tick
    expect(s.shots).toEqual([]);
    buildTower(s, 0, 'musketeer');
    startWave(s);
    tick(s); // first goblin spawns at distance 0, out of range of spot 0
    expect(s.shots).toEqual([]);
  });

  it('records one musketeer shot with tower spot and target position', () => {
    // The goblin moves 1 px to distance 200 = (160,200) before the tower fires.
    const s = arena([goblin(7, 199)], [[0, 'musketeer']]);
    tick(s);
    expect(s.shots).toEqual([
      { spotId: 0, tower: 'musketeer', targetId: 7, from: { x: 96, y: 160 }, to: { x: 160, y: 200 } },
    ]);
    expect(s.shots[0]).not.toHaveProperty('splashRadius');
  });

  it('clears shots at the start of the next tick', () => {
    const s = arena([goblin(7, 199)], [[0, 'musketeer']]);
    tick(s);
    expect(s.shots).toHaveLength(1);
    tick(s); // musketeer is on cooldown
    expect(s.shots).toEqual([]);
  });

  it('a cannon shot carries its splash radius', () => {
    const s = arena([goblin(3, 199)], [[0, 'cannon']]);
    tick(s);
    expect(s.shots).toEqual([
      {
        spotId: 0,
        tower: 'cannon',
        targetId: 3,
        from: { x: 96, y: 160 },
        to: { x: 160, y: 200 },
        splashRadius: 40,
      },
    ]);
  });

  it('records shots in firing (spotId) order, including a killing shot', () => {
    const s = arena([goblin(1, 199)], [[0, 'musketeer'], [2, 'musketeer']]);
    s.enemies[0].hp = 12; // spot 0 kills it; spot 2 then has no target
    tick(s);
    expect(s.shots.map((x) => [x.spotId, x.targetId])).toEqual([[0, 1]]);
    expect(s.enemies).toEqual([]);
  });
});
