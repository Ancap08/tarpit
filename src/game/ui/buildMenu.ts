// Build menu: opens beside an empty build spot with one button per tower
// type ("Musketeer  50"). A button the player cannot afford is greyed and
// ignores clicks. Hovering a button reports its type so the scene can draw
// that tower's range preview.

import type Phaser from 'phaser';
import { MAP, TOWER_DEFS, type GameState, type TowerType } from '../../sim';
import { placeBeside, type Rect } from '../input';
import { ButtonStack } from './button';

export const MENU_TYPES: readonly TowerType[] = ['musketeer', 'cannon', 'tarpit'];

export const TOWER_NAME: Record<TowerType, string> = { musketeer: 'Musketeer', cannon: 'Cannon', tarpit: 'Tar Pit' };

export interface BuildMenuHandlers {
  onBuild: (type: TowerType) => void;
  /** The hovered tower type, or null when the pointer leaves a button. */
  onPreview: (type: TowerType | null) => void;
}

export class BuildMenu {
  private readonly stack: ButtonStack;
  private spot: number | null = null;

  constructor(scene: Phaser.Scene, handlers: BuildMenuHandlers) {
    this.stack = new ButtonStack(
      scene,
      MENU_TYPES.map((type) => ({
        text: TOWER_NAME[type],
        right: String(TOWER_DEFS[type].cost),
        onClick: () => handlers.onBuild(type),
        onHover: (over: boolean) => handlers.onPreview(over ? type : null),
      })),
    );
  }

  /** The spot the menu is open at, or null when closed. */
  get spotId(): number | null {
    return this.spot;
  }

  get rect(): Rect | null {
    return this.stack.rect;
  }

  open(spotId: number, state: GameState): void {
    this.spot = spotId;
    const { x, y } = placeBeside(MAP.buildSpots[spotId], this.stack.width, this.stack.height);
    this.update(state);
    this.stack.show(x, y);
  }

  close(): void {
    this.spot = null;
    this.stack.hide();
  }

  /** Grey out what the player cannot afford. Call on every redraw. */
  update(state: GameState): void {
    MENU_TYPES.forEach((type, i) => {
      this.stack.buttons[i].set(TOWER_NAME[type], state.gold >= TOWER_DEFS[type].cost);
    });
  }

  /** Button rectangles keyed `menu:<type>`, only while open. */
  rects(): Record<string, Rect> {
    if (!this.stack.isOpen) return {};
    return Object.fromEntries(MENU_TYPES.map((type, i) => [`menu:${type}`, this.stack.buttons[i].rect]));
  }
}
