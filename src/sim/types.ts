// Data shapes for the simulation. Pure data: no classes, no methods.

import type { Difficulty } from './difficulty';
import type { GameEvent } from './events';
import type { Cell } from './grid';

export interface Point {
  x: number;
  y: number;
}

/** An axis-aligned box in pixels: top-left corner and size. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapDef {
  width: number;
  height: number;
  /** Polyline from spawn (first point) to exit (last point). */
  path: readonly Point[];
  /**
   * Drawn map features off the path (the exit cottage). No cell whose 32 px
   * square overlaps one is buildable. Optional: test maps leave it out.
   */
  landmarks?: readonly Rect[];
}

export type EnemyType = 'goblin' | 'wolf' | 'troll' | 'harpy' | 'shieldbearer' | 'boss';

export interface EnemyStats {
  hp: number;
  /** Pixels per second. */
  speed: number;
  bounty: number;
  /**
   * Flies over the path (Harpy, milestone 22): Tar Pit, Cannon and Mortar
   * never target it and splash skips it; a Fire Pot impact hits it but its
   * burn does not stick.
   */
  flying: boolean;
  /**
   * Shielded (Shieldbearer, milestone 22): a shot whose base damage is
   * SHIELD_THRESHOLD or less does half damage. Burn is never halved.
   */
  shield: boolean;
  /** Lives lost when this enemy reaches the exit: 1, or 5 for the boss (milestone 23). */
  livesCost: number;
  /**
   * Strongest slow this enemy takes (milestone 23, the boss: 0.3): a
   * stronger slow is applied at this strength, for its full duration.
   * Absent means no cap.
   */
  slowCap?: number;
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
  /**
   * Special slow channel (milestone 25c): the Tar Barrel's slow, kept apart
   * from tower slows so neither cuts the other short. The effective slow is
   * the stronger of the two active ones (combat.ts effectiveSlow). Optional
   * so hand-built enemies stay valid; absent means 0.
   */
  specialSlow?: number;
  /** Ticks left on the special slow; 0 or absent means none applies. */
  specialSlowTicksLeft?: number;
  /**
   * Burn damage per second from a Fire Pot (milestone 10); 0 or absent means
   * no burn. Optional so enemies written before burns existed stay valid;
   * the sim spawns every enemy with 0 and treats absent as 0.
   */
  burnDps?: number;
  /** Ticks left on the current burn; 0 or absent means no burn applies. */
  burnTicksLeft?: number;
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

export type TowerType = 'musketeer' | 'cannon' | 'tarpit' | 'longbow' | 'mortar' | 'firepot';

/** Stats for one level (base or upgraded) of a tower type. */
export interface TowerLevelStats {
  /** Pixels, measured from the tower's cell centre to the enemy position, inclusive. */
  range: number;
  /** Pixels; enemies closer than this cannot be targeted (Mortar). 0 for none. */
  minRange: number;
  damage: number;
  /** Shots per second. */
  fireRate: number;
  /** Pixels around the target that also take full damage; 0 for no splash. */
  splashRadius: number;
  /** Slow strength in [0, 1); 0 for no slow. */
  slow: number;
  /** Slow duration in seconds; 0 for no slow. */
  slowDuration: number;
  /** Burn damage per second applied to the target (Fire Pot); 0 for no burn. */
  burnDps: number;
  /** Burn duration in seconds; 0 for no burn. */
  burnDuration: number;
}

export interface TowerDef {
  cost: number;
  upgradeCost: number;
  base: TowerLevelStats;
  upgraded: TowerLevelStats;
}

/**
 * How a tower picks among the enemies it can shoot (milestone 24): 'first'
 * is furthest along the path, 'last' closest to the spawn (lowest path
 * distance), 'strongest' the highest current hp. Ties: 'first' and 'last'
 * to the lower id; 'strongest' to the furthest along the path, then the
 * lower id.
 */
export type TargetingMode = 'first' | 'last' | 'strongest';

/** Every mode in the tower panel's cycle order (first, last, strongest). */
export const TARGETING_MODES: readonly TargetingMode[] = ['first', 'last', 'strongest'];

export interface Tower {
  /** Grid cell the tower stands on. One tower per cell. */
  cell: Cell;
  type: TowerType;
  upgraded: boolean;
  /** Targeting mode (milestone 24); 'first' at build, so a sell and rebuild resets it. */
  targeting: TargetingMode;
  /** Ticks until the tower may fire again; 0 means ready. */
  cooldownTicks: number;
  /** Gold spent on this tower (build plus upgrade); a locked tower sells for 70%. */
  spent: number;
  /**
   * Planning phase (milestone 25a): false while the tower was built during
   * the current setup phase; it may then be moved for free and removed for
   * a full refund. Built during a wave, or once Start Wave is pressed, true.
   */
  locked: boolean;
  /**
   * Gold spent on this tower during the current setup phase and still
   * refundable in full: the build (unlocked towers) plus an upgrade bought
   * this phase. Zeroed by startWave; building or upgrading mid-wave adds 0.
   */
  unlockedSpend: number;
  /** The upgrade was bought during the current setup phase (undoable); cleared by startWave. */
  upgradedThisPhase: boolean;
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
  /** Present only for splash shots (Cannon, Mortar). */
  splashRadius?: number;
}

export type Phase = 'setup' | 'wave' | 'won' | 'lost';

export interface GameState {
  /**
   * Difficulty level (milestone 25), fixed at createGame: it set the
   * starting gold and lives and scales every enemy's hp at spawn.
   */
  difficulty: Difficulty;
  phase: Phase;
  gold: number;
  lives: number;
  /** Current (or last finished) wave number, 1-based; 0 before the first wave. */
  wave: number;
  /** Ticks since the game was created. */
  tick: number;
  /**
   * Special attack charges (milestone 25b): 0 or 1. startWave sets 1; a
   * wave clear sets 0 (unused charges do not carry over); useSpecial spends it.
   */
  specialCharges: number;
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
  /**
   * What happened during the most recent tick, in order, plus any actions
   * since (events.ts). Cleared at the start of every tick like `shots`.
   * Read-only output for the renderer; no game rule depends on it.
   */
  events: GameEvent[];
}

export interface WavePreviewEntry {
  type: EnemyType;
  count: number;
}
