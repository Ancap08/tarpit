// Data shapes for the simulation. Pure data: no classes, no methods.

import type { BoonId, BoonOffer } from './boons';
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
  /**
   * The map's id (milestone 27): one of map.ts MAP_IDS for the registered
   * maps; a test map may use any string. High scores are kept per id.
   */
  id: string;
  width: number;
  height: number;
  /** Polyline from spawn (first point) to exit (last point). */
  path: readonly Point[];
  /**
   * Drawn map features off the path (the exit cottage). No cell whose 32 px
   * square overlaps one is buildable. Optional: test maps leave it out.
   */
  landmarks?: readonly Rect[];
  /**
   * Water (milestone 27, Riverbend's river): no cell whose 32 px square
   * overlaps one is buildable, the same rule as landmarks. Water blocks only
   * building; shots, ranges, specials and flyers ignore it. Optional.
   */
  water?: readonly Rect[];
}

export type EnemyType = 'goblin' | 'wolf' | 'troll' | 'harpy' | 'shieldbearer' | 'boss' | 'grumblemaw';

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
  /**
   * Kill counts (milestone 25c): the cell of the tower whose burn is active,
   * so a burn kill counts for that tower. Absent for a special's burn (Fire
   * Arrows) and for no burn; cleared if that tower is sold.
   */
  burnOwner?: Cell;
  /**
   * Milestone 30: the active burn came from a special (a Fire Arrows zone),
   * so a burn kill counts as a special kill (kill cause 'special'). Absent
   * or false for a tower's burn.
   */
  specialBurn?: boolean;
  /**
   * Full hp (milestone 26), set only on enemies of endless waves, whose hp
   * is scaled by the wave; absent means difficulty.ts enemyMaxHp.
   */
  maxHp?: number;
  /** Grumblemaw thresholds already called, including on the killing hit. */
  packCalls?: number;
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
  /**
   * Endless waves (milestone 26): enemy hp at spawn is multiplied by this
   * on top of the level's multiplier. Absent for the twenty table waves.
   */
  hpMultiplier?: number;
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
  /**
   * Enemies this tower killed (milestone 25c): its shot (splash included)
   * or its burn dealt the killing damage. Special kills count for no tower.
   * 0 at build, so a sell and rebuild resets it; kept on move and upgrade.
   */
  kills: number;
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
   * The map this game is played on (milestone 27), fixed at createGame.
   * Everything that needs the path or the build grid reads it from here.
   */
  map: MapDef;
  /**
   * Difficulty level (milestone 25), fixed at createGame: it set the
   * starting gold and lives and scales every enemy's hp at spawn.
   */
  difficulty: Difficulty;
  /**
   * Endless mode (milestone 26): false until the player presses Keep going
   * after winning wave 20 (game.ts continueEndless). In an endless game
   * waves go on past 20 and clearing a wave never wins.
   */
  endless: boolean;
  boons: readonly BoonId[];
  pendingBoon: BoonOffer | null;
  /** Wolf packs keep spawning independently even after their caller dies. */
  packs: { nextTick: number; remaining: number }[];
  phase: Phase;
  gold: number;
  lives: number;
  /** Current (or last finished) wave number, 1-based; 0 before the first wave. */
  wave: number;
  /** Ticks since the game was created. */
  tick: number;
  /**
   * The shared special charge (milestone 25b; a timer from milestone 30): 0
   * or 1. A wave start (startWave or an early call) sets 1; useSpecial
   * spends it and starts the recharge; a wave clear sets 0.
   */
  specialCharges: number;
  /**
   * Milestone 30: wave ticks until the spent charge is ready again; 0 when
   * the charge is ready or no recharge runs (setup). Counts down in step 6
   * of a wave tick; reaching 0 sets specialCharges to 1.
   */
  specialRechargeTicks: number;
  /** Milestone 30: the live ground zones of the Tar Barrel and Fire Arrows, oldest first. */
  zones: Zone[];
  /** Id for the next zone. */
  nextZoneId: number;
  /** Milestone 30: the gold cheat was used in this game (grantCheatGold). */
  cheated: boolean;
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

/**
 * A ground zone (milestone 30) left by the Tar Barrel or Fire Arrows at the
 * aimed point. While `ticksLeft` > 0, every wave tick (step 3, game.ts) it
 * slows or burns every live enemy within `radius` of (x, y), flyers
 * included, then counts down; at 0 it is removed.
 */
export interface Zone {
  /** Unique for the game, in firing order from 0. */
  id: number;
  type: 'tarBarrel' | 'fireArrows';
  x: number;
  y: number;
  radius: number;
  ticksLeft: number;
}

export interface WavePreviewEntry {
  type: EnemyType;
  count: number;
}
