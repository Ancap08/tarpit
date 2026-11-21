// Build bar: the HUD's second row, one button per tower type ("Musketeer  50",
// cost right-aligned). A button the player cannot afford is greyed and ignores
// clicks; the greying follows the gold on every redraw. The active pick is
// highlighted. The bar only reports clicks; GameScene owns the pick.

import type Phaser from 'phaser';
import { TOWER_DEFS, type GameState, type TowerType } from '../../sim';
import type { Rect } from '../input';
import { Button } from './button';

export const BAR_TYPES: readonly TowerType[] = ['musketeer', 'cannon', 'tarpit'];

export const TOWER_NAME: Record<TowerType, string> = { musketeer: 'Musketeer', cannon: 'Cannon', tarpit: 'Tar Pit' };

/** Bar button geometry: 150 x 36, 10 px apart from x 14 (room for six in 960 px). */
export const BAR_BUTTON_WIDTH = 150;
export const BAR_BUTTON_HEIGHT = 36;
export const BAR_LEFT = 14;
export const BAR_GAP = 10;

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
          TOWER_NAME[type],
          () => onClick(type),
          { fontSize: '16px', right: String(TOWER_DEFS[type].cost) },
        ),
    );
  }

  /** Grey what cannot be picked and highlight the pick. Call on every redraw. */
  update(state: GameState, pick: TowerType | null): void {
    BAR_TYPES.forEach((type, i) => {
      const b = this.buttons[i];
      b.set(TOWER_NAME[type], canPick(state, type));
      b.setPicked(pick === type);
    });
  }

  /** Button rectangles keyed `bar:<type>`. */
  rects(): Record<string, Rect> {
    return Object.fromEntries(BAR_TYPES.map((type, i) => [`bar:${type}`, this.buttons[i].rect]));
  }
}
