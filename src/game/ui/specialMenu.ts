// Special attack popup (milestone 25b): a small stack of buttons above the
// HUD's Special button, one per unlocked special (names from SPECIAL_NAMES),
// in unlock order. Locked specials are not listed. Same look as the tower
// tower panel, but the list length follows the wave.
// The menu only reports clicks; GameScene owns whether it is open.

import type Phaser from 'phaser';
import { SPECIAL_TYPES, type SpecialType } from '../../sim';
import type { Rect } from '../input';
import { SPECIAL_NAMES } from '../names';
import { COLORS } from '../palette';
import { Button } from './button';
import { STACK_SIZE, type StackSize } from './geometry';

const PAD = 6;
const GAP = 4;
/** Gap between the popup's bottom edge and the top of the HUD. */
export const MENU_GAP_ABOVE_HUD = 4;

export class SpecialMenu {
  private readonly backing: Phaser.GameObjects.Rectangle;
  private readonly buttons: Record<SpecialType, Button>;
  private shownTypes: SpecialType[] = [];
  private box: Rect | null = null;

  /** `left` is the popup's left edge; `hudTop` the y it sits above. */
  constructor(
    scene: Phaser.Scene,
    private readonly left: number,
    private readonly hudTop: number,
    onPick: (type: SpecialType) => void,
    /** Milestone 32b: portrait passes larger buttons and text. */
    private readonly size: StackSize = STACK_SIZE,
    fontSize = '16px',
  ) {
    this.backing = scene.add
      .rectangle(0, 0, size.buttonW + 2 * PAD, 10, COLORS.menuBg, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(1.5, COLORS.menuEdge, 0.8)
      .setVisible(false);
    const make = (type: SpecialType) =>
      new Button(scene, { x: 0, y: 0, width: size.buttonW, height: size.buttonH }, SPECIAL_NAMES[type], () => onPick(type), {
        fontSize,
      });
    this.buttons = { keg: make('keg'), tarBarrel: make('tarBarrel'), fireArrows: make('fireArrows') };
    for (const b of Object.values(this.buttons)) b.setShown(false);
  }

  /** The popup's box while open, else null. Clicks inside belong to its buttons. */
  get rect(): Rect | null {
    return this.box ? { ...this.box } : null;
  }

  /** Show the popup listing `types` (the unlocked specials), or hide it with an empty list. */
  update(types: readonly SpecialType[]): void {
    if (types.length === this.shownTypes.length && types.every((t, i) => t === this.shownTypes[i])) return;
    this.shownTypes = [...types];
    if (types.length === 0) {
      this.box = null;
      this.backing.setVisible(false);
      for (const b of Object.values(this.buttons)) b.setShown(false);
      return;
    }
    const height = 2 * PAD + types.length * this.size.buttonH + (types.length - 1) * GAP;
    const top = this.hudTop - MENU_GAP_ABOVE_HUD - height;
    this.box = { x: this.left, y: top, width: this.size.buttonW + 2 * PAD, height };
    this.backing.setPosition(this.left, top).setSize(this.box.width, height).setVisible(true);
    for (const type of SPECIAL_TYPES) {
      const i = types.indexOf(type);
      const b = this.buttons[type];
      if (i < 0) b.setShown(false);
      else {
        b.moveTo(this.left + PAD, top + PAD + i * (this.size.buttonH + GAP));
        b.setShown(true);
      }
    }
  }

  /** `special:<type>` for each listed special while open. */
  rects(): Record<string, Rect> {
    return Object.fromEntries(this.shownTypes.map((type) => [`special:${type}`, this.buttons[type].rect]));
  }
}
