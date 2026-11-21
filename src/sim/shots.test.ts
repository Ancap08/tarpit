import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { createGame, startWave, tick } from './game';
import type { Cell } from './grid';
import type { Enemy, GameState, TowerType } from './types';

const A: Cell = { col: 2, row: 5 }; // centre (80,176)
const B: Cell = { col: 7, row: 5 }; // centre (240,176)
const U: Cell = { col: 2, row: 4 }; // centre (80,144), 125 px from the spawn

function goblin(id: number, distance: number): Enemy {
  return { id, type: 'goblin', hp: 30, distance, slow: 0, slowTicksLeft: 0 };
}

/** Mid-wave-1 state with every wave enemy already spawned, so ticks spawn nothing. */
function arena(enemies: Enemy[], towers: [Cell, TowerType][]): GameState {
  const s = createGame();
  s.gold = 10_000;
  s.phase = 'wave';
  s.wave = 1;
  s.spawnedPerGroup = [8];
  s.enemies = enemies;
  s.nextEnemyId = 100;
  for (const [cell, type] of towers) buildTower(s, cell, type);
  return s;
}

describe('state.shots', () => {
  it('starts empty and stays empty when nothing fires', () => {
    const s = createGame();
    expect(s.shots).toEqual([]);
    tick(s); // setup tick
    expect(s.shots).toEqual([]);
    buildTower(s, U, 'musketeer');
    startWave(s);
    tick(s); // first goblin spawns at distance 0, out of U's base range (125 px)
    expect(s.shots).toEqual([]);
  });

  it('records one musketeer shot with the tower cell, its centre and the target position', () => {
    // The goblin moves 1 px to distance 200 = (160,200) before the tower fires.
    const s = arena([goblin(7, 199)], [[A, 'musketeer']]);
    tick(s);
    expect(s.shots).toEqual([
      { cell: { col: 2, row: 5 }, tower: 'musketeer', targetId: 7, from: { x: 80, y: 176 }, to: { x: 160, y: 200 } },
    ]);
    expect(s.shots[0]).not.toHaveProperty('splashRadius');
  });

  it('clears shots at the start of the next tick', () => {
    const s = arena([goblin(7, 199)], [[A, 'musketeer']]);
    tick(s);
    expect(s.shots).toHaveLength(1);
    tick(s); // musketeer is on cooldown
    expect(s.shots).toEqual([]);
  });

  it('a cannon shot carries its splash radius', () => {
    const s = arena([goblin(3, 199)], [[A, 'cannon']]);
    tick(s);
    expect(s.shots).toEqual([
      {
        cell: { col: 2, row: 5 },
        tower: 'cannon',
        targetId: 3,
        from: { x: 80, y: 176 },
        to: { x: 160, y: 200 },
        splashRadius: 40,
      },
    ]);
  });

  it('records shots in firing (cellKey) order, including a killing shot', () => {
    const s = arena([goblin(1, 199)], [[B, 'musketeer'], [A, 'musketeer']]);
    s.enemies[0].hp = 12; // A (key 152) kills it; B (key 157) then has no target
    tick(s);
    expect(s.shots.map((x) => [x.cell, x.targetId])).toEqual([[A, 1]]);
    expect(s.enemies).toEqual([]);
  });
});
