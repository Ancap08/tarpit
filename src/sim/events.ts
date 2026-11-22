// Simulation events (milestone 16): what happened, for the renderer to
// animate from. No game rule reads them.
//
// Lifetime: `tick` empties `state.events` (a fresh array) at its start, like
// `state.shots`, and appends to it as things happen, in order. Won and lost
// ticks do nothing, so the list keeps the last tick's events.
// Actions between ticks (startWave, callNextWave, continueEndless, build, upgrade, sell, targeting, move,
// undoUpgrade, useSpecial, grantCheatGold) append
// their own event to the same list; it stays there until the next tick clears it. So
// the renderer reads the new entries after every action and after every
// tick (GameScene does both, see EventCursor in src/game/anim/effects.ts).

import type { Cell } from './grid';
import type { SpecialType } from './specials';
import type { EnemyType, TargetingMode, TowerType } from './types';

/** What killed an enemy: a tower shot, a burn tick, or a special attack (milestone 25b). */
export type KillCause = 'shot' | 'burn' | 'special';

export type GameEvent =
  /** An enemy entered the map at distance 0. */
  | { kind: 'spawn'; enemyId: number; enemyType: EnemyType }
  /** A shot damaged this enemy (one per enemy, splash included), before any kill. */
  | { kind: 'hit'; enemyId: number; cell: Cell; tower: TowerType; damage: number }
  /** One burn tick on this enemy; damage after the tar doubling. */
  | { kind: 'burn'; enemyId: number; damage: number }
  /** A slow was applied (an ignored weaker slow emits nothing). */
  | { kind: 'slowed'; enemyId: number; slow: number; ticks: number }
  | { kind: 'kill'; enemyId: number; enemyType: EnemyType; bounty: number; cause: KillCause }
  /** The enemy reached the exit and cost its livesCost (1, or 5 for the boss). */
  | { kind: 'exit'; enemyId: number }
  /** The boss spawned (milestone 23); follows its 'spawn' event. */
  | { kind: 'bossSpawn'; enemyId: number }
  /** The boss is gone (milestone 23); follows its 'kill' or 'exit' event. */
  | { kind: 'bossDown'; enemyId: number; cause: KillCause | 'exit' }
  | { kind: 'build'; cell: Cell; tower: TowerType }
  | { kind: 'upgrade'; cell: Cell; tower: TowerType }
  /** A tower was sold; `full` when it was unlocked and refunded everything (milestone 25a). */
  | { kind: 'sell'; cell: Cell; tower: TowerType; refund: number; full: boolean }
  /** An unlocked tower was moved in setup (milestone 25a). */
  | { kind: 'move'; from: Cell; to: Cell; tower: TowerType }
  /** An upgrade bought this setup phase was undone and refunded in full (milestone 25a). */
  | { kind: 'undoUpgrade'; cell: Cell; tower: TowerType; refund: number }
  /**
   * A special attack was used (milestone 25b): aimed at (x, y) with this
   * radius; `hits` enemies were inside it. Its kills follow as 'kill'
   * events with cause 'special'. `zoneId` (milestone 30): the id of the
   * zone it left (Tar Barrel and Fire Arrows).
   */
  | { kind: 'special'; type: SpecialType; x: number; y: number; radius: number; hits: number; zoneId?: number }
  /** The gold cheat was used (milestone 30): `gold` was added. */
  | { kind: 'cheat'; gold: number }
  /** A tower's targeting mode was set (milestone 24). */
  | { kind: 'targeting'; cell: Cell; mode: TargetingMode }
  | { kind: 'waveStart'; wave: number }
  | { kind: 'waveClear'; wave: number; bonus: number }
  /**
   * The player called wave `wave` early (milestone 25c); `bonus` is the
   * early bonus, paid with the previous wave's clear bonus. Follows that
   * wave's 'waveClear' and comes before the new wave's 'waveStart'.
   */
  | { kind: 'earlyCall'; wave: number; bonus: number }
  | { kind: 'won' }
  /** The player pressed Keep going after the win (milestone 26, game.ts continueEndless). */
  | { kind: 'endlessStart' }
  | { kind: 'lost' };

export type GameEventKind = GameEvent['kind'];
