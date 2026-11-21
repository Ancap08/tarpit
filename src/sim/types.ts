// Data shapes for the simulation. Pure data: no classes, no methods.

import type { Cell } from './grid';

export interface Point {
  x: number;
  y: number;
}

export interface MapDef {
  width: number;
  height: number;
  /** Polyline from spawn (first point) to exit (last point). */
  path: readonly Point[];
}

export type EnemyType = 'goblin' | 'wolf' | 'troll';

export interface EnemyStats {
  hp: number;
  /** Pixels per second. */
  speed: number;
  bounty: number;
}

export interface Enemy {
  /** Unique for the whole game, assigned in spawn order from 0. */
  id: number;
  type: EnemyType;
  hp: number;
  /** Distance travelled along the path, in pixels. */
  distance: number;
  /** Slow strength in [0, 1); speed is multiplied by (1 - slow) while active. */
  slow: number;
  /** Ticks left on the current slow; 0 means no slow applies. */
  slowTicksLeft: number;
}

export interface GroupDef {
  type: EnemyType;
  count: number;
  /** Seconds between spawns in this group. */
  interval: number;
  /** Seconds after the wave start before the first spawn. */
  delay: number;
}

export interface WaveDef {
  groups: readonly GroupDef[];
}

export type TowerType = 'musketeer' | 'cannon' | 'tarpit';

/** Stats for one level (base or upgraded) of a tower type. */
export interface TowerLevelStats {
  /** Pixels, measured from the tower's cell centre to the enemy position, inclusive. */
  range: number;
  damage: number;
  /** Shots per second. */
  fireRate: number;
  /** Pixels around the target that also take full damage; 0 for no splash. */
  splashRadius: number;
  /** Slow strength in [0, 1); 0 for no slow. */
  slow: number;
  /** Slow duration in seconds; 0 for no slow. */
  slowDuration: number;
}

export interface TowerDef {
  cost: number;
  upgradeCost: number;
  base: TowerLevelStats;
  upgraded: TowerLevelStats;
}

export interface Tower {
  /** Grid cell the tower stands on. One tower per cell. */
  cell: Cell;
  type: TowerType;
  upgraded: boolean;
  /** Ticks until the tower may fire again; 0 means ready. */
  cooldownTicks: number;
  /** Gold spent on this tower (build plus upgrade); sell refunds 70%. */
  spent: number;
}

/**
 * One tower firing, recorded for the renderer. The simulation is hitscan, so
 * this is the whole shot: from the tower's cell centre to the target's
 * position at the moment it fired.
 */
export interface Shot {
  cell: Cell;
  tower: TowerType;
  targetId: number;
  from: Point;
  to: Point;
  /** Present only for splash shots (Cannon). */
  splashRadius?: number;
}

export type Phase = 'setup' | 'wave' | 'won' | 'lost';

export interface GameState {
  phase: Phase;
  gold: number;
  lives: number;
  /** Current (or last finished) wave number, 1-based; 0 before the first wave. */
  wave: number;
  /** Ticks since the game was created. */
  tick: number;
  /** Ticks since the current wave started; the first tick of a wave is 0. */
  waveTick: number;
  /** Enemies spawned so far in the current wave, per group index. */
  spawnedPerGroup: number[];
  /** Live enemies in spawn order. */
  enemies: Enemy[];
  /** Id for the next enemy spawned. */
  nextEnemyId: number;
  /** Built towers, kept sorted by cellKey (the order they fire in). */
  towers: Tower[];
  /**
   * Shots fired during the most recent tick, in firing order. Cleared at the
   * start of every tick (except once won or lost, when tick does nothing).
   * Read-only output for the renderer; no game rule depends on it.
   */
  shots: Shot[];
}

export interface WavePreviewEntry {
  type: EnemyType;
  count: number;
}
