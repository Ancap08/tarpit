// Data shapes for the simulation. Pure data: no classes, no methods.

export interface Point {
  x: number;
  y: number;
}

export interface MapDef {
  width: number;
  height: number;
  /** Polyline from spawn (first point) to exit (last point). */
  path: readonly Point[];
  /** Build spots; the array index is the spot id. */
  buildSpots: readonly Point[];
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
}

export interface WavePreviewEntry {
  type: EnemyType;
  count: number;
}
