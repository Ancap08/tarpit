// Special attack popup (milestone 25b): a small stack of buttons above the
// HUD's Special button, one per unlocked special (names from SPECIAL_NAMES),
// in unlock order. Locked specials are not listed. Same look as the tower
// tower panel, but the list length follows the wave.
// The menu only reports clicks; GameScene owns whether it is open.

import type Phaser from 'phaser';
import { SPECIAL_TYPES, type SpecialType } from '../../sim';
import type { Rect } from '../input';
import { SPECIAL_NAMES } from '../names';
import { panel, THEME } from './theme';
import { Button } from './button';
import { STACK_SIZE, type StackSize } from './geometry';

const PAD = 6;
const GAP = 4;
const MIN_TARGET_CSS = 44;
/** Gap between the popup's bottom edge and the top of the HUD. */
export const MENU_GAP_ABOVE_HUD = 4;

export class SpecialMenu {
  private readonly backing: Phaser.GameObjects.Graphics;
  private readonly buttons: Record<SpecialType, Button>;
  private shownTypes: SpecialType[] = [];
  private box: Rect | null = null;
  private buttonH = 0;
  private columns = 1;

  /** `left` is the popup's left edge; `hudTop` the y it sits above. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly left: number,
    private readonly hudTop: number,
    onPick: (type: SpecialType) => void,
    private readonly mapTop: number,
    /** Milestone 32b: portrait passes larger buttons and text. */
    private readonly size: StackSize = STACK_SIZE,
    fontSize = '16px',
  ) {
    this.backing = scene.add.graphics().setVisible(false);
    const make = (type: SpecialType) =>
      new Button(scene, { x: 0, y: 0, width: size.buttonW, height: size.buttonH }, SPECIAL_NAMES[type], () => onPick(type), {
        fontSize,
      });
    this.buttons = { keg: make('keg'), tarBarrel: make('tarBarrel'), fireArrows: make('fireArrows'), barricade: make('barricade'), guards: make('guards') };
    for (const b of Object.values(this.buttons)) b.setShown(false);
  }

  /** The popup's box while open, else null. Clicks inside belong to its buttons. */
  get rect(): Rect | null {
    return this.box ? { ...this.box } : null;
  }

  /** Show the popup listing `types` (the unlocked specials), or hide it with an empty list. */
  update(types: readonly SpecialType[]): void {
    const room = this.hudTop - this.mapTop - MENU_GAP_ABOVE_HUD - 2 * PAD;
    const fullHeight = Math.max(this.size.buttonH, Math.ceil(MIN_TARGET_CSS * this.scene.scale.displayScale.y));
    // Keep full-size targets on squat screens by splitting the new five-item menu.
    const fullRows = Math.max(1, Math.floor((room + GAP) / (fullHeight + GAP)));
    const maxColumns = Math.floor((this.scene.scale.width - 2 * PAD + GAP) / (this.size.buttonW + GAP));
    const columns = types.includes('guards') ? Math.min(maxColumns, Math.max(1, Math.ceil(types.length / fullRows))) : 1;
    const rows = Math.ceil(types.length / columns);
    const buttonH = rows === 0 ? 0 : Math.min(Math.floor((room - (rows - 1) * GAP) / rows), fullHeight);
    if (buttonH === this.buttonH && columns === this.columns && types.length === this.shownTypes.length && types.every((t, i) => t === this.shownTypes[i])) return;
    this.buttonH = buttonH;
    this.columns = columns;
    this.shownTypes = [...types];
    if (types.length === 0) {
      this.box = null;
      this.backing.setVisible(false);
      for (const b of Object.values(this.buttons)) b.setShown(false);
      return;
    }
    const height = 2 * PAD + rows * buttonH + (rows - 1) * GAP;
    const width = 2 * PAD + columns * this.size.buttonW + (columns - 1) * GAP;
    const top = this.hudTop - MENU_GAP_ABOVE_HUD - height;
    const left = Math.min(this.left, this.scene.scale.width - width);
    this.box = { x: left, y: top, width, height };
    panel(this.backing.clear().setVisible(true), this.box, THEME.paper);
    for (const type of SPECIAL_TYPES) {
      const i = types.indexOf(type);
      const b = this.buttons[type];
      if (i < 0) b.setShown(false);
      else {
        b.setSize(this.size.buttonW, buttonH);
        b.moveTo(left + PAD + (i % columns) * (this.size.buttonW + GAP), top + PAD + Math.floor(i / columns) * (buttonH + GAP));
        b.setShown(true);
      }
    }
  }

  /** `special:<type>` for each listed special while open. */
  rects(): Record<string, Rect> {
    return Object.fromEntries(this.shownTypes.map((type) => [`special:${type}`, this.buttons[type].rect]));
  }
}
