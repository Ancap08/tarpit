// Enemy sprite sheets (milestone 16): placeholders from the CC0 Ninja
// Adventure pack by Pixel-boy and AAA until the v5 art (assets/MANIFEST.md).
// Layouts were read with Pillow and checked by eye at 8x zoom.
//
// The PNGs live in assets/sprites/ and are imported with Vite's `?url`, so
// only the files imported here ship in dist/ (hashed; files under Vite's
// 4 kB inline limit become data URIs) and assets/MANIFEST.md does not.

import type { EnemyType } from '../../sim';
import goblinUrl from '../../../assets/sprites/goblin.png?url';
import trollUrl from '../../../assets/sprites/troll.png?url';
import wolfUrl from '../../../assets/sprites/wolf.png?url';

export type Facing = 'down' | 'up' | 'left' | 'right';
export const FACINGS: readonly Facing[] = ['down', 'up', 'left', 'right'];

/** One walk cycle: frame indices in the sheet (row-major) and whether to mirror them. */
export interface WalkCycle {
  frames: readonly number[];
  flipX: boolean;
}

export interface SheetLayout {
  /** Phaser texture key (the enemy type). */
  key: EnemyType;
  url: string;
  frameWidth: number;
  frameHeight: number;
  /** Display scale (nearest-neighbour). */
  scale: number;
  /**
   * Walk cycle per facing. A side-view-only sheet (`sideOnly`) reuses its
   * side frames for up and down, mirrored to face right: the path runs up,
   * down and right but never left, so up and down always follow a right.
   */
  walk: Readonly<Record<Facing, WalkCycle>>;
  sideOnly: boolean;
  /** A lying-down frame for the death effect, if the sheet has one. */
  deadFrame?: number;
}

/**
 * Ninja Adventure 4-direction sheet: 16x16 cells, 4 columns. Columns are
 * facings (down, up, left, right); rows 0 to 3 are the 4 walk frames. So
 * facing column c walks through frames c, c + 4, c + 8, c + 12.
 */
function fourWay(): Record<Facing, WalkCycle> {
  const cycle = (c: number): WalkCycle => ({ frames: [c, c + 4, c + 8, c + 12], flipX: false });
  return { down: cycle(0), up: cycle(1), left: cycle(2), right: cycle(3) };
}

export const SHEETS: Readonly<Record<EnemyType, SheetLayout>> = {
  // GreenPig: 64x112, 7 rows of 16x16. Rows 0-3 walk; row 4 attack, row 5
  // jump (1 frame per facing each); row 6: dead (col 0, identical to
  // SeparateAnim/Dead.png), item, special 1, special 2.
  goblin: { key: 'goblin', url: goblinUrl, frameWidth: 16, frameHeight: 16, scale: 2, walk: fourWay(), sideOnly: false, deadFrame: 24 },
  // Hyena: 28x13, two 14x13 side-view frames facing LEFT; mirrored for right.
  wolf: {
    key: 'wolf',
    url: wolfUrl,
    frameWidth: 14,
    frameHeight: 13,
    scale: 2,
    walk: {
      left: { frames: [0, 1], flipX: false },
      right: { frames: [0, 1], flipX: true },
      up: { frames: [0, 1], flipX: true },
      down: { frames: [0, 1], flipX: true },
    },
    sideOnly: true,
  },
  // Cyclope: 64x64, 4 rows x 4 columns of 16x16, walk only. 3x so the Troll
  // reads bigger than the Goblin (DECISIONS.md, reorder after the art spike).
  troll: { key: 'troll', url: trollUrl, frameWidth: 16, frameHeight: 16, scale: 3, walk: fourWay(), sideOnly: false },
};

/** Walk animation frame rate in play (test mode freezes frame 0). */
export const WALK_FPS = 10;

/** Phaser animation key for a type's walk cycle in one facing. */
export function walkAnimKey(type: EnemyType, facing: Facing): string {
  // Side-only sheets have one cycle; the facing changes only the mirroring.
  return SHEETS[type].sideOnly ? `${type}-walk` : `${type}-walk-${facing}`;
}
