// Special attack popup (milestone 25b): a small stack of buttons above the
// HUD's Special button, one per unlocked special (names from SPECIAL_NAMES),
// in unlock order. Locked specials are not listed. Same look as the tower
// tower panel, but the list length follows the wave.
// The menu only reports clicks; GameScene owns whether it is open.

import type Phaser from 'phaser';
import { SPECIAL_TYPES, type SpecialType } from '../../sim';
import type { Rect } from '../input';
import { SPECIAL_NAMES, TAR_BARREL_DESCRIPTION } from '../names';
import { panel, THEME } from './theme';
import { rounded, skinFor } from './newTheme';
import { Button } from './button';
import { STACK_SIZE, type StackSize } from './geometry';
import { DeviceTextFit, textInset, textSlot } from './deviceText';

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
  private readonly barrelCaption: Phaser.GameObjects.Text;
  private buttonH = 0;
  private columns = 1;
  private readonly namesFit = new DeviceTextFit();
  private readonly captionFit = new DeviceTextFit();
  private readonly clean: boolean;

  /** `left` is the popup's left edge; `hudTop` the y it sits above. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly left: number,
    private readonly hudTop: number,
    onPick: (type: SpecialType) => void,
    private readonly mapTop: number,
    /** Milestone 32b: portrait passes larger buttons and text. */
    private readonly size: StackSize = STACK_SIZE,
    private readonly fontSize = '16px',
  ) {
    this.clean = skinFor(scene) === 'battle';
    this.backing = scene.add.graphics().setVisible(false);
    const make = (type: SpecialType) =>
      new Button(scene, { x: 0, y: 0, width: size.buttonW, height: size.buttonH }, SPECIAL_NAMES[type], () => onPick(type), {
        fontSize, grouped: this.clean, semibold: true,
      });
    this.buttons = { keg: make('keg'), tarBarrel: make('tarBarrel'), fireArrows: make('fireArrows'), barricade: make('barricade'), guards: make('guards') };
    this.barrelCaption = scene.add.text(0, 0, TAR_BARREL_DESCRIPTION, {
      fontFamily: this.buttons.tarBarrel.labelObjects[0].style.fontFamily, fontSize,
      color: this.buttons.tarBarrel.labelObjects[0].style.color, align: 'center',
    }).setOrigin(0.5, 0).setVisible(false);
    for (const b of Object.values(this.buttons)) b.setShown(false);
  }

  /** The popup's box while open, else null. Clicks inside belong to its buttons. */
  get rect(): Rect | null {
    return this.box ? { ...this.box } : null;
  }

  /** Show the popup listing `types` (the unlocked specials), or hide it with an empty list. */
  update(types: readonly SpecialType[], featherBarrels: boolean): void {
    const room = this.hudTop - this.mapTop - MENU_GAP_ABOVE_HUD - 2 * PAD;
    const fullHeight = Math.max(this.size.buttonH, Math.ceil(MIN_TARGET_CSS * this.scene.scale.displayScale.y));
    const barrel = featherBarrels ? types.indexOf('tarBarrel') : -1;
    // The barrel card carries an instruction below its name, in the menu's normal type.
    const cardWidth = barrel < 0 ? this.size.buttonW : this.size.buttonW + 100;
    this.barrelCaption.setVisible(barrel >= 0);
    const captionWidth = cardWidth - (this.clean ? Math.max(16, 2 * textInset(this.barrelCaption)) : 16);
    if (barrel >= 0 && this.barrelCaption.style.wordWrapWidth !== captionWidth)
      this.barrelCaption.setWordWrapWidth(captionWidth);
    const extra = barrel >= 0 ? this.barrelCaption.height + 4 : 0;
    // Keep full-size targets on squat screens by splitting the new five-item menu.
    const fullRows = Math.max(1, Math.floor((room - extra + GAP) / (fullHeight + GAP)));
    const maxColumns = Math.floor((this.scene.scale.width - 2 * PAD + GAP) / (cardWidth + GAP));
    const columns = types.includes('guards') ? Math.min(maxColumns, Math.max(1, Math.ceil(types.length / fullRows))) : 1;
    const rows = Math.ceil(types.length / columns);
    const buttonH = rows === 0 ? 0 : Math.min(Math.floor((room - extra - (rows - 1) * GAP) / rows), fullHeight);
    if (buttonH === this.buttonH && columns === this.columns && types.length === this.shownTypes.length && types.every((t, i) => t === this.shownTypes[i])) {
      if (this.clean && types.length) this.fitText(types, barrel);
      return;
    }
    this.buttonH = buttonH;
    this.columns = columns;
    this.shownTypes = [...types];
    if (types.length === 0) {
      this.box = null;
      this.backing.setVisible(false);
      for (const b of Object.values(this.buttons)) b.setShown(false);
      return;
    }
    const height = 2 * PAD + extra + rows * buttonH + (rows - 1) * GAP;
    const width = 2 * PAD + columns * cardWidth + (columns - 1) * GAP;
    const top = this.hudTop - MENU_GAP_ABOVE_HUD - height;
    const left = Math.min(this.left, this.scene.scale.width - width);
    this.box = { x: left, y: top, width, height };
    this.backing.clear().setVisible(true);
    if (skinFor(this.scene) === 'battle') rounded(this.backing, this.box);
    else panel(this.backing, this.box, THEME.paper);
    for (const type of SPECIAL_TYPES) {
      const i = types.indexOf(type);
      const b = this.buttons[type];
      if (i < 0) b.setShown(false);
      else {
        const row = Math.floor(i / columns);
        const rowY = top + PAD + row * (buttonH + GAP) + (row > Math.floor(barrel / columns) ? extra : 0);
        const x = left + PAD + (i % columns) * (cardWidth + GAP);
        b.setSize(cardWidth, buttonH + (row === Math.floor(barrel / columns) ? extra : 0));
        b.moveTo(x, rowY);
        if (this.clean) b.setLabelCenter(i === barrel ? buttonH / 2 : undefined);
        b.setShown(true);
        if (i === barrel) {
          b.labelObjects[0].setY(rowY + buttonH / 2);
          this.barrelCaption.setPosition(x + cardWidth / 2, rowY + buttonH - 3);
        }
      }
    }
    if (this.clean) this.fitText(types, barrel);
  }

  private fitText(types: readonly SpecialType[], barrel: number): void {
    Button.fitGroup(this.namesFit, types.map(type => this.buttons[type]));
    if (barrel < 0) return;
    const box = this.buttons.tarBarrel.rect;
    const slot = textSlot(this.barrelCaption, box, true);
    slot.width = Math.min(slot.width, box.width - 16);
    this.barrelCaption.setVisible(this.captionFit.fit(parseFloat(this.fontSize), [slot]));
  }

  /** `special:<type>` for each listed special while open. */
  rects(): Record<string, Rect> {
    return Object.fromEntries(this.shownTypes.map((type) => [`special:${type}`, this.buttons[type].rect]));
  }
}
