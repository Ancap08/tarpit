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
import { COLORS, HUD_FONT, TEXT } from '../palette';

/** Emitted on the scene input plugin when a pause cancels any unfinished click. */
export const CANCEL_UI_PRESS = 'cancel-ui-press';

export interface ButtonOptions {
  fontSize?: string;
  /** Horizontal inset for paired labels. */
  labelInset?: number;
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
  /** A separately illustrated control supplies its own background. */
  bare?: boolean;
}

export class Button {
  private readonly box: Phaser.GameObjects.Rectangle;
  private readonly trim: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly rightLabel: Phaser.GameObjects.Text | null;
  private readonly onHover?: (over: boolean) => void;
  private readonly labelY?: number;
  private readonly labelInset: number;
  private readonly bare: boolean;
  private r: Rect;
  private enabled = true;
  private locked = false;
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
    this.bare = options.bare ?? false;
    this.labelInset = options.labelInset ?? 10;
    const style = { fontFamily: HUD_FONT, fontSize: options.fontSize ?? '18px', fontStyle: 'bold', color: TEXT.button };
    this.box = scene.add.rectangle(0, 0, rect.width, rect.height, COLORS.button).setOrigin(0, 0);
    this.trim = scene.add.graphics();
    if (options.right === undefined) {
      this.label = scene.add.text(0, 0, text, style).setOrigin(0.5).setAlign('center');
      this.rightLabel = null;
    } else {
      this.label = scene.add.text(0, 0, text, style).setOrigin(0, 0.5);
      this.rightLabel = scene.add.text(0, 0, options.right, style).setOrigin(1, 0.5);
    }
    this.moveTo(rect.x, rect.y);
    this.refresh();

    scene.input.on(CANCEL_UI_PRESS, () => {
      this.pressed = false;
      this.setHover(false);
    });
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

  /** A closed campaign stop still responds with its unlock condition. */
  setLocked(locked: boolean): void {
    if (this.locked === locked) return;
    this.locked = locked;
    this.refresh();
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
    const { width, height } = this.r;
    const edge = this.trim.clear();
    edge.lineStyle(1, COLORS.buttonEdge, 0.65).strokeRect(x + 4, y + 4, width - 8, height - 8);
    if (height >= 70 && width >= 180) {
      edge.fillStyle(COLORS.buttonEdge);
      for (const dx of [8, width - 8]) {
        for (const dy of [8, height - 8]) edge.fillCircle(x + dx, y + dy, 2);
      }
    }
    const mid = y + (this.labelY ?? this.r.height / 2);
    if (this.rightLabel) {
      this.label.setPosition(x + this.labelInset, mid);
      this.rightLabel.setPosition(x + this.r.width - this.labelInset, mid);
    } else {
      this.label.setPosition(x + this.r.width / 2, mid);
    }
  }

  setDepth(depth: number): void {
    for (const object of [this.box, this.trim, this.label, this.rightLabel]) object?.setDepth(depth);
  }

  setShown(shown: boolean): void {
    if (this.shown === shown) return;
    this.shown = shown;
    for (const o of [this.box, this.trim, this.label, this.rightLabel]) o?.setVisible(shown);
    if (this.box.input) this.box.input.enabled = shown;
    if (!shown) {
      // A hidden button gets no pointerout, so clear hover and press here.
      this.pressed = false;
      this.setHover(false);
    } else this.refresh();
  }

  private setHover(over: boolean): void {
    const changed = this.hover !== over;
    this.hover = over;
    this.refresh();
    if (changed) this.onHover?.(over);
  }

  private refresh(): void {
    const available = this.enabled && !this.locked;
    this.trim.setVisible(this.shown && available && !this.bare);
    let fill: number = COLORS.button;
    if (!available) fill = COLORS.buttonDisabled;
    else if (this.pressed) fill = COLORS.buttonPressed;
    else if (this.picked) fill = COLORS.buttonPicked;
    else if (this.hover) fill = COLORS.buttonHover;
    this.box.setFillStyle(fill, this.bare ? 0 : 1);
    if (!available || this.bare) this.box.setStrokeStyle();
    else if (this.picked) this.box.setStrokeStyle(3, COLORS.buttonEdgePicked);
    else this.box.setStrokeStyle(2, COLORS.buttonEdge);
    const color = available ? TEXT.button : TEXT.buttonDisabled;
    this.label.setColor(color);
    this.rightLabel?.setColor(color);
  }
}
