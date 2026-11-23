// Shared button: a filled box with a label, hover and pressed tints, and a
// greyed disabled state that ignores clicks, and a "picked" state (brighter
// fill, pale-yellow edge) for the build bar's active tower. Used by the HUD,
// the build bar and the tower panel.
//
// A click is a pointerdown and pointerup on the same button. Pass `right` for
// a two-part label (`text` on the left, `right` on the right, as in
// "Musketeer      50"); otherwise `text` is centred.

import Phaser from 'phaser';
import { sound } from '../audio/engine';
import type { SoundName } from '../audio/recipes';
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
  /** Milestone 32b: the label's centre, in px from the button's top (default: the middle). */
  labelY?: number;
  /** Milestone 33: the sound a click plays: 'tap' when left out, none for null (a button whose action has its own sound). */
  sound?: SoundName | null;
}

const PAD_X = 10;

export class Button {
  private readonly box: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly rightLabel: Phaser.GameObjects.Text | null;
  private readonly onHover?: (over: boolean) => void;
  private readonly labelY?: number;
  private r: Rect;
  private enabled = true;
  private hover = false;
  private pressed = false;
  private shown = true;
  private picked = false;

  private readonly click: () => void;

  constructor(scene: Phaser.Scene, rect: Rect, text: string, onClick: () => void, options: ButtonOptions = {}) {
    this.click = () => {
      const cue = options.sound === undefined ? 'tap' : options.sound;
      if (cue !== null) sound.play(cue);
      onClick();
    };
    this.r = { ...rect };
    this.onHover = options.onHover;
    this.labelY = options.labelY;
    const style = { fontFamily: FONT, fontSize: options.fontSize ?? '18px', fontStyle: 'bold', color: TEXT.button };
    this.box = scene.add.rectangle(0, 0, rect.width, rect.height, COLORS.button).setOrigin(0, 0);
    if (options.right === undefined) {
      this.label = scene.add.text(0, 0, text, style).setOrigin(0.5).setAlign('center');
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
      if (wasPressed) this.activate();
    });
  }

  activate(): void {
    if (this.enabled && this.shown) this.click();
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

  setWidth(width: number): void {
    this.setSize(width, this.r.height);
  }

  setSize(width: number, height: number): void {
    if (this.r.width === width && this.r.height === height) return;
    this.r.width = width;
    this.r.height = height;
    this.box.setSize(width, height);
    this.moveTo(this.r.x, this.r.y);
  }

  moveTo(x: number, y: number): void {
    this.r.x = x;
    this.r.y = y;
    this.box.setPosition(x, y);
    const mid = y + (this.labelY ?? this.r.height / 2);
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
