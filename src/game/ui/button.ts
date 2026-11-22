// Shared button: a filled box with a label, hover and pressed tints, and a
// greyed disabled state that ignores clicks, and a "picked" state (brighter
// fill, pale-yellow edge) for the build bar's active tower. Used by the HUD,
// the build bar and the tower panel.
//
// A click is a pointerdown and pointerup on the same button. Pass `right` for
// a two-part label (`text` on the left, `right` on the right, as in
// "Musketeer      50"); otherwise `text` is centred.

import Phaser from 'phaser';
import type { Rect } from '../input';
import { COLORS, FONT, TEXT } from '../palette';

export interface ButtonOptions {
  fontSize?: string;
  /** Right-aligned second label; makes the main label left-aligned. */
  right?: string;
  /** Called with true when the pointer enters and false when it leaves (or the button hides). */
  onHover?: (over: boolean) => void;
  /** Called when a press starts on the button (milestone 30: the speed button's hold), enabled or not. */
  onPress?: () => void;
}

const PAD_X = 10;

export class Button {
  private readonly box: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly rightLabel: Phaser.GameObjects.Text | null;
  private readonly onHover?: (over: boolean) => void;
  private r: Rect;
  private enabled = true;
  private hover = false;
  private pressed = false;
  private shown = true;
  private picked = false;

  constructor(scene: Phaser.Scene, rect: Rect, text: string, onClick: () => void, options: ButtonOptions = {}) {
    this.r = { ...rect };
    this.onHover = options.onHover;
    const style = { fontFamily: FONT, fontSize: options.fontSize ?? '18px', fontStyle: 'bold', color: TEXT.button };
    this.box = scene.add.rectangle(0, 0, rect.width, rect.height, COLORS.button).setOrigin(0, 0);
    if (options.right === undefined) {
      this.label = scene.add.text(0, 0, text, style).setOrigin(0.5);
      this.rightLabel = null;
    } else {
      this.label = scene.add.text(0, 0, text, style).setOrigin(0, 0.5);
      this.rightLabel = scene.add.text(0, 0, options.right, style).setOrigin(1, 0.5);
    }
    this.moveTo(rect.x, rect.y);
    this.refresh();

    this.box.setInteractive({ useHandCursor: true });
    this.box.on('pointerover', () => this.setHover(true));
    this.box.on('pointerout', () => {
      this.pressed = false;
      this.setHover(false);
    });
    this.box.on('pointerdown', () => {
      this.pressed = true;
      this.refresh();
      if (this.enabled && this.shown) options.onPress?.();
    });
    this.box.on('pointerup', () => {
      const wasPressed = this.pressed;
      this.pressed = false;
      this.refresh();
      if (wasPressed && this.enabled && this.shown) onClick();
    });
  }

  get rect(): Rect {
    return { ...this.r };
  }

  get text(): string {
    return this.rightLabel?.text ? `${this.label.text}  ${this.rightLabel.text}` : this.label.text;
  }

  /** The label text objects (milestone 30: the HUD slides the recharge fill under them). */
  get labelObjects(): Phaser.GameObjects.Text[] {
    return this.rightLabel ? [this.label, this.rightLabel] : [this.label];
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Update the label(s) and whether the button responds to clicks. */
  set(text: string, enabled: boolean, right?: string): void {
    if (this.label.text !== text) this.label.setText(text);
    if (this.rightLabel && right !== undefined && this.rightLabel.text !== right) this.rightLabel.setText(right);
    if (this.enabled !== enabled) {
      this.enabled = enabled;
      this.refresh();
    }
  }

  /** Change the label size (both labels), e.g. for a longer label in the same slot. */
  setFontSize(size: string): void {
    for (const t of [this.label, this.rightLabel]) {
      if (t && t.style.fontSize !== size) t.setFontSize(size);
    }
  }

  get isPicked(): boolean {
    return this.picked;
  }

  /** Show the button as the active pick (highlighted) or not. */
  setPicked(picked: boolean): void {
    if (this.picked === picked) return;
    this.picked = picked;
    this.refresh();
  }

  moveTo(x: number, y: number): void {
    this.r.x = x;
    this.r.y = y;
    this.box.setPosition(x, y);
    const mid = y + this.r.height / 2;
    if (this.rightLabel) {
      this.label.setPosition(x + PAD_X, mid);
      this.rightLabel.setPosition(x + this.r.width - PAD_X, mid);
    } else {
      this.label.setPosition(x + this.r.width / 2, mid);
    }
  }

  setShown(shown: boolean): void {
    if (this.shown === shown) return;
    this.shown = shown;
    for (const o of [this.box, this.label, this.rightLabel]) o?.setVisible(shown);
    if (this.box.input) this.box.input.enabled = shown;
    if (!shown) {
      // A hidden button gets no pointerout, so clear hover and press here.
      this.pressed = false;
      this.setHover(false);
    }
  }

  private setHover(over: boolean): void {
    const changed = this.hover !== over;
    this.hover = over;
    this.refresh();
    if (changed) this.onHover?.(over);
  }

  private refresh(): void {
    let fill: number = COLORS.button;
    if (!this.enabled) fill = COLORS.buttonDisabled;
    else if (this.pressed) fill = COLORS.buttonPressed;
    else if (this.picked) fill = COLORS.buttonPicked;
    else if (this.hover) fill = COLORS.buttonHover;
    this.box.setFillStyle(fill);
    if (!this.enabled) this.box.setStrokeStyle(2, COLORS.buttonEdgeDisabled);
    else if (this.picked) this.box.setStrokeStyle(3, COLORS.buttonEdgePicked);
    else this.box.setStrokeStyle(2, COLORS.buttonEdge);
    const color = this.enabled ? TEXT.button : TEXT.buttonDisabled;
    this.label.setColor(color);
    this.rightLabel?.setColor(color);
  }
}

export const STACK_BUTTON_WIDTH = 156;
/** 42 px: at least 44 px on screen at iPad landscape scale (milestone 14). */
export const STACK_BUTTON_HEIGHT = 42;
/** The square close button in the stack's top-right corner. */
export const STACK_CLOSE_SIZE = 42;
const STACK_GAP = 4;
const STACK_PAD = 6;

export interface StackItem {
  text: string;
  /** Right-aligned second label; leave it out for one centred label. */
  right?: string;
  /** Label size; 16px when left out. */
  fontSize?: string;
  onClick: () => void;
  onHover?: (over: boolean) => void;
}

/**
 * A small popup: buttons stacked vertically on a dark backing, opened beside
 * a point, with an optional square close button ("×") in a column to the
 * right of the stack, at the top. Used by the tower panel. `header`
 * (milestone 25c) leaves that many px above the first button for a caption.
 */
export class ButtonStack {
  readonly buttons: Button[];
  /** The close button, when the stack was made with `onClose`. */
  readonly close: Button | null;
  private readonly backing: Phaser.GameObjects.Rectangle;
  private open = false;
  readonly width: number;
  readonly height: number;

  /** Inner padding of the backing (px). */
  readonly pad = STACK_PAD;
  /** Room above the first button for a caption line (milestone 25c: the panel's kill count). */
  readonly header: number;

  constructor(scene: Phaser.Scene, items: StackItem[], onClose?: () => void, header = 0) {
    this.header = header;
    this.width = STACK_BUTTON_WIDTH + 2 * STACK_PAD + (onClose ? STACK_GAP + STACK_CLOSE_SIZE : 0);
    this.height = 2 * STACK_PAD + header + items.length * STACK_BUTTON_HEIGHT + (items.length - 1) * STACK_GAP;
    this.backing = scene.add
      .rectangle(0, 0, this.width, this.height, COLORS.menuBg, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(1.5, COLORS.menuEdge, 0.8)
      .setVisible(false);
    this.buttons = items.map((item) =>
      new Button(scene, { x: 0, y: 0, width: STACK_BUTTON_WIDTH, height: STACK_BUTTON_HEIGHT }, item.text, item.onClick, {
        fontSize: item.fontSize ?? '16px',
        right: item.right,
        onHover: item.onHover,
      }),
    );
    this.close = onClose
      ? new Button(scene, { x: 0, y: 0, width: STACK_CLOSE_SIZE, height: STACK_CLOSE_SIZE }, '\u00d7', onClose, { fontSize: '24px' })
      : null;
    for (const b of this.all()) b.setShown(false);
  }

  private all(): Button[] {
    return this.close ? [...this.buttons, this.close] : this.buttons;
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The backing's box while open, else null. Clicks inside it belong to the stack. */
  get rect(): Rect | null {
    return this.open ? { x: this.backing.x, y: this.backing.y, width: this.width, height: this.height } : null;
  }

  /** Show with the backing's top-left corner at (x, y). */
  show(x: number, y: number): void {
    this.backing.setPosition(x, y).setVisible(true);
    this.buttons.forEach((b, i) => {
      b.moveTo(x + STACK_PAD, y + STACK_PAD + this.header + i * (STACK_BUTTON_HEIGHT + STACK_GAP));
    });
    this.close?.moveTo(x + this.width - STACK_PAD - STACK_CLOSE_SIZE, y + STACK_PAD);
    for (const b of this.all()) b.setShown(true);
    this.open = true;
  }

  hide(): void {
    this.backing.setVisible(false);
    for (const b of this.all()) b.setShown(false);
    this.open = false;
  }
}
