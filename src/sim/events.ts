// Simulation events (milestone 16): what happened, for the renderer to
// animate from. No game rule reads them.
//
// Lifetime: `tick` empties `state.events` (a fresh array) at its start, like
// `state.shots`, and appends to it as things happen, in order. Won and lost
// ticks do nothing, so the list keeps the last tick's events.
// Actions between ticks (startWave, build, upgrade, sell) append their own
// event to the same list; it stays there until the next tick clears it. So
// the renderer reads the new entries after every action and after every
// tick (GameScene does both, see EventCursor in src/game/anim/effects.ts).

import type { Cell } from './grid';
import type { EnemyType, TowerType } from './types';

export type GameEvent =
  /** An enemy entered the map at distance 0. */
  | { kind: 'spawn'; enemyId: number; enemyType: EnemyType }
  /** A shot damaged this enemy (one per enemy, splash included), before any kill. */
  | { kind: 'hit'; enemyId: number; cell: Cell; tower: TowerType; damage: number }
  /** One burn tick on this enemy; damage after the tar doubling. */
  | { kind: 'burn'; enemyId: number; damage: number }
  /** A slow was applied (an ignored weaker slow emits nothing). */
  | { kind: 'slowed'; enemyId: number; slow: number; ticks: number }
  | { kind: 'kill'; enemyId: number; enemyType: EnemyType; bounty: number; cause: 'shot' | 'burn' }
  /** The enemy reached the exit and cost its livesCost (1, or 5 for the boss). */
  | { kind: 'exit'; enemyId: number }
  /** The boss spawned (milestone 23); follows its 'spawn' event. */
  | { kind: 'bossSpawn'; enemyId: number }
  /** The boss is gone (milestone 23); follows its 'kill' or 'exit' event. */
  | { kind: 'bossDown'; enemyId: number; cause: 'shot' | 'burn' | 'exit' }
  | { kind: 'build'; cell: Cell; tower: TowerType }
  | { kind: 'upgrade'; cell: Cell; tower: TowerType }
  | { kind: 'sell'; cell: Cell; tower: TowerType; refund: number }
  | { kind: 'waveStart'; wave: number }
  | { kind: 'waveClear'; wave: number; bonus: number }
  | { kind: 'won' }
  | { kind: 'lost' };

export type GameEventKind = GameEvent['kind'];
