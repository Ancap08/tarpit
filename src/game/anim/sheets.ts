// Enemy sprite sheets (milestone 16): placeholders from the CC0 Ninja
// Adventure pack by Pixel-boy and AAA until the v5 art (assets/MANIFEST.md).
// Layouts were read with Pillow and checked by eye at 8x zoom.
//
// The PNGs live in assets/sprites/ and are imported with Vite's `?url`, so
// only the files imported here ship in dist/ (hashed; files under Vite's
// 4 kB inline limit become data URIs) and assets/MANIFEST.md does not.

import type { EnemyType } from '../../sim';
import goblinUrl from '../../../assets/sprites/goblin.png?url';
import harpyUrl from '../../../assets/sprites/harpy.png?url';
import shieldbearerUrl from '../../../assets/sprites/shieldbearer.png?url';
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
   * side frames for up and down, facing right: the path runs up,
   * down and right but never left, so up and down always follow a right.
   */
  walk: Readonly<Record<Facing, WalkCycle>>;
  sideOnly: boolean;
  /** A lying-down frame for the death effect, if the sheet has one. */
  deadFrame?: number;
  /**
   * Flying types only: pixels the sprite's centre is drawn above its path
   * position (where its ground shadow sits). 0 or absent for walkers.
   */
  lift?: number;
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
  // Hyena: 28x13, two 14x13 side-view frames facing RIGHT (snout and eye on the
  // right, checked pixel by pixel); mirrored for left. The path never runs left.
  wolf: {
    key: 'wolf',
    url: wolfUrl,
    frameWidth: 14,
    frameHeight: 13,
    scale: 2,
    walk: {
      left: { frames: [0, 1], flipX: true },
      right: { frames: [0, 1], flipX: false },
      up: { frames: [0, 1], flipX: false },
      down: { frames: [0, 1], flipX: false },
    },
    sideOnly: true,
  },
  // Cyclope: 64x64, 4 rows x 4 columns of 16x16, walk only. 3x so the Troll
  // reads bigger than the Goblin (DECISIONS.md, reorder after the art spike).
  troll: { key: 'troll', url: trollUrl, frameWidth: 16, frameHeight: 16, scale: 3, walk: fourWay(), sideOnly: false },
  // BlueBat (milestone 22): 64x64, 4 rows x 4 columns of 16x16, the same
  // column order (down, up, left, right: the eyes show in column 0, not in
  // column 1; the side views have the eye left of centre in column 2 and
  // right of centre in column 3). Rows 0 and 3 wings up, rows 1 and 2 wings
  // folded, so the walk cycle is a flap. No dead frame. Drawn 16 px above
  // its path position, over a ground shadow.
  harpy: { key: 'harpy', url: harpyUrl, frameWidth: 16, frameHeight: 16, scale: 2, walk: fourWay(), sideOnly: false, lift: 16 },
  // Knight (milestone 22): 64x112, the GreenPig layout (rows 0-3 walk; row 6
  // col 0 dead, identical to SeparateAnim/Dead.png). The visor notch is on
  // the left in column 2 and on the right in column 3.
  shieldbearer: {
    key: 'shieldbearer',
    url: shieldbearerUrl,
    frameWidth: 16,
    frameHeight: 16,
    scale: 2,
    walk: fourWay(),
    sideOnly: false,
    deadFrame: 24,
  },
};

/** Walk animation frame rate in play (test mode freezes frame 0). */
export const WALK_FPS = 10;

/** Phaser animation key for a type's walk cycle in one facing. */
export function walkAnimKey(type: EnemyType, facing: Facing): string {
  // Side-only sheets have one cycle; the facing changes only the mirroring.
  return SHEETS[type].sideOnly ? `${type}-walk` : `${type}-walk-${facing}`;
}
