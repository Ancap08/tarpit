// Build bar: the HUD's second row, one button per tower type (name from
// names.ts TOWER_NAMES, cost right-aligned: "Musketeer  50"). A button the player cannot afford is greyed and ignores
// clicks; the greying follows the gold on every redraw. The active pick is
// highlighted. The bar only reports clicks; GameScene owns the pick.

import type Phaser from 'phaser';
import { TOWER_DEFS, type GameState, type TowerType } from '../../sim';
import type { Rect } from '../input';
import { TOWER_NAMES } from '../names';
import { Button } from './button';

// All six towers (milestone 11): the three v1 towers, then the v2 three.
export const BAR_TYPES: readonly TowerType[] = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];

/**
 * Bar button geometry (milestone 11, 42 px tall from milestone 14): six 148 x 42 buttons, 8 px apart from
 * x 16, so 6 * 148 + 5 * 8 = 928 px and 16 px margins on each side of the
 * 960 px canvas. The 16 px label stays: "Musketeer" plus "50" uses about
 * 106 of the 128 px inside the padding.
 */
export const BAR_BUTTON_WIDTH = 148;
export const BAR_BUTTON_HEIGHT = 42;
export const BAR_LEFT = 16;
export const BAR_GAP = 8;

/** True when the player can pick `type` now: enough gold and the game is not over. */
export function canPick(state: GameState, type: TowerType): boolean {
  return state.phase !== 'won' && state.phase !== 'lost' && state.gold >= TOWER_DEFS[type].cost;
}

export class BuildBar {
  private readonly buttons: Button[];

  constructor(scene: Phaser.Scene, top: number, onClick: (type: TowerType) => void) {
    this.buttons = BAR_TYPES.map(
      (type, i) =>
        new Button(
          scene,
          { x: BAR_LEFT + i * (BAR_BUTTON_WIDTH + BAR_GAP), y: top, width: BAR_BUTTON_WIDTH, height: BAR_BUTTON_HEIGHT },
          TOWER_NAMES[type],
          () => onClick(type),
          { fontSize: '16px', right: String(TOWER_DEFS[type].cost) },
        ),
    );
  }

  /** Grey what cannot be picked and highlight the pick. Call on every redraw. */
  update(state: GameState, pick: TowerType | null): void {
    BAR_TYPES.forEach((type, i) => {
      const b = this.buttons[i];
      b.set(TOWER_NAMES[type], canPick(state, type));
      b.setPicked(pick === type);
    });
  }

  /** Button rectangles keyed `bar:<type>`. */
  rects(): Record<string, Rect> {
    return Object.fromEntries(BAR_TYPES.map((type, i) => [`bar:${type}`, this.buttons[i].rect]));
  }
}
