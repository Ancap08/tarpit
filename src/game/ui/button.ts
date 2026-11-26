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
import { COLORS, FONT, HUD_FONT, TEXT } from '../palette';
import { DeviceTextFit, textInset, textSlot } from './deviceText';
import { BakedPaint, CLEAN, PRINT, battleFont, battleWeight, glyph, motionClock, rounded, skinFor, textMetrics, type Icon, type Skin } from './newTheme';

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
  skin?: Skin;
  primary?: boolean;
  icon?: Icon;
  iconY?: number;
  /** If the pair does not fit, keep a fitting price beside this action icon. */
  priceFallback?: Icon;
  upgradeRow?: boolean;
  /** The owning row fits these labels together with their peers. */
  grouped?: boolean;
  semibold?: boolean;
  wrap?: boolean;
}

export class Button {
  private readonly box: Phaser.GameObjects.Rectangle;
  private readonly trim: Phaser.GameObjects.Graphics;
  private readonly chrome?: BakedPaint;
  private readonly label: Phaser.GameObjects.Text;
  private readonly rightLabel: Phaser.GameObjects.Text | null;
  private readonly onHover?: (over: boolean) => void;
  private labelY?: number;
  private readonly labelInset: number;
  private readonly bare: boolean;
  private readonly skin: Skin;
  private readonly primary: boolean;
  private readonly upgradeRow: boolean;
  private readonly wrap: boolean;
  private readonly textFit?: DeviceTextFit;
  private readonly priceFallback?: Icon;
  private labelsFit = true;
  private priceFits = false;
  private preferredSize: number;
  private coinLabelWidth = 0;
  private icon?: Icon;
  private readonly iconY?: number;
  private offsetY = 0;
  private readonly clock?: () => number;
  private rollAt = -Infinity;
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
    this.skin = options.skin ?? skinFor(scene);
    this.primary = options.primary ?? false;
    this.upgradeRow = options.upgradeRow ?? false;
    this.wrap = options.wrap ?? false;
    this.icon = options.icon;
    this.iconY = options.iconY;
    this.priceFallback = options.priceFallback;
    if (this.skin !== 'legacy') this.clock = motionClock(scene);
    const size = options.fontSize ?? '18px';
    this.preferredSize = parseFloat(size);
    if (this.skin === 'battle' && !options.grouped) {
      this.textFit = new DeviceTextFit();
      const resize = () => { if (this.shown) this.refresh(); };
      scene.scale.on('resize', resize);
      scene.events.once('shutdown', () => scene.scale.off('resize', resize));
    }
    const style = {
      fontFamily: this.skin === 'paper' ? FONT : this.skin === 'battle' ? battleFont() : HUD_FONT,
      fontSize: size, fontStyle: this.skin === 'battle' ? battleWeight(options.semibold ?? false, 'bold') : 'bold', color: TEXT.button,
      ...(this.skin === 'legacy' ? {} : { metrics: textMetrics(parseFloat(size)) }),
    };
    this.box = scene.add.rectangle(0, 0, rect.width, rect.height, COLORS.button).setOrigin(0, 0);
    this.trim = scene.add.graphics();
    if (this.skin !== 'legacy' && !this.bare) this.chrome = new BakedPaint(scene, this.trim);
    if (options.right === undefined) {
      this.label = scene.add.text(0, 0, text, style).setOrigin(0.5).setAlign('center');
      this.rightLabel = null;
    } else {
      this.label = scene.add.text(0, 0, text, style).setOrigin(0, 0.5);
      this.rightLabel = scene.add.text(0, 0, options.right, this.skin === 'battle' ? { ...style, fontStyle: battleWeight(true) } : style).setOrigin(1, 0.5);
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
    const changed = this.label.text !== text;
    const rightChanged = !!this.rightLabel && right !== undefined && this.rightLabel.text !== right;
    if (changed) {
      if (this.clock && /^\d+$/.test(text) && this.label.text) this.rollAt = this.clock();
      this.label.setText(text);
    }
    if (this.rightLabel && right !== undefined && this.rightLabel.text !== right) {
      if (this.clock && this.rightLabel.text) this.rollAt = this.clock();
      this.rightLabel.setText(right);
    }
    if (this.enabled !== enabled) {
      this.enabled = enabled;
      this.refresh();
    } else if ((changed || (this.textFit && rightChanged)) && (this.icon || this.priceFallback)) this.refresh();
    else if (this.textFit && (changed || rightChanged)) this.fitText();
    this.updateRoll();
  }

  /** Change the label size (both labels), e.g. for a longer label in the same slot. */
  setFontSize(size: string): void {
    if (this.textFit) {
      const preferred = parseFloat(size);
      if (preferred !== this.preferredSize) {
        this.preferredSize = preferred;
        this.refresh();
      }
      return;
    }
    for (const t of [this.label, this.rightLabel]) {
      if (t && t.style.fontSize !== size) {
        if (this.skin === 'legacy') t.setFontSize(size);
        else t.setStyle({ fontSize: size, metrics: textMetrics(parseFloat(size)) });
      }
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
    if (this.skin !== 'legacy') {
      this.positionLabels();
      this.refresh();
      return;
    }
    this.moveTo(this.r.x, this.r.y);
  }

  setLabelCenter(y: number | undefined): void {
    if (y === this.labelY) return;
    this.labelY = y;
    this.refresh();
  }

  setIcon(icon: Icon): void {
    if (icon === this.icon) return;
    this.icon = icon;
    this.positionLabels();
    this.refresh();
  }

  /** Visual translation only. The pointer target stays at its final position. */
  setVisualOffset(y: number): void {
    if (y === this.offsetY) return;
    this.offsetY = y;
    if (this.chrome) {
      this.chrome.shift(y);
      this.positionLabels();
    } else this.refresh();
  }

  private updateRoll(): void {
    if (!this.clock || this.rollAt === -Infinity) return;
    const progress = Math.min(1, (this.clock() - this.rollAt) / 130);
    const label = this.rightLabel ?? this.label;
    label.setAlpha(.5 + .5 * progress);
    const middle = this.r.y + this.offsetY + (this.labelY ?? this.r.height / 2);
    label.setY(this.downwardY(label, middle, (this.pressed && this.enabled ? 2 : 0) + 3 * (1 - progress)));
    if (progress === 1) this.rollAt = -Infinity;
  }

  moveTo(x: number, y: number): void {
    if (this.skin !== 'legacy' && this.r.x === x && this.r.y === y && this.label.x !== 0) return;
    this.r.x = x;
    this.r.y = y;
    this.box.setPosition(x, y);
    this.positionLabels();
    if (this.skin !== 'legacy') {
      this.refresh();
      return;
    }
    const { width, height } = this.r;
    const edge = this.trim.clear();
    edge.lineStyle(1, COLORS.buttonEdge, 0.65).strokeRect(x + 4, y + 4, width - 8, height - 8);
    if (height >= 70 && width >= 180) {
      edge.fillStyle(COLORS.buttonEdge);
      for (const dx of [8, width - 8]) {
        for (const dy of [8, height - 8]) edge.fillCircle(x + dx, y + dy, 2);
      }
    }
  }

  private positionLabels(): void {
    const { x, y } = this.r;
    const shift = this.skin !== 'legacy' && this.icon ? Math.min(this.rightLabel ? 24 : 13, this.r.width * .075) : 0;
    const mid = y + this.offsetY + (this.labelY ?? this.r.height / 2);
    if (this.rightLabel) {
      const inset = this.upgradeRow ? this.labelInset : this.labelInset + shift;
      this.label.setPosition(x + inset, mid);
      this.rightLabel.setPosition(x + this.r.width - (this.upgradeRow ? 12 : this.labelInset), mid);
    } else {
      this.label.setPosition(x + this.r.width / 2 + (this.label.text ? shift : 0), mid);
    }
  }

  private slots() {
    const box = { ...this.r, y: this.r.y + this.offsetY };
    const mid = box.y + (this.labelY ?? box.height / 2);
    const left = textSlot(this.label, box, this.wrap, mid);
    if (!this.rightLabel) return [left];
    const right = textSlot(this.rightLabel, box, false, mid);
    left.width = Math.min(left.width, this.rightLabel.x - this.label.x - (this.upgradeRow ? 29 : 2 * textInset(this.label)));
    left.alongside = this.rightLabel;
    return [left, right];
  }

  private fitText(): void {
    const slots = this.slots();
    this.labelsFit = this.textFit!.fit(this.preferredSize, slots);
    this.priceFits = false;
    if (!this.labelsFit && this.priceFallback && this.rightLabel) {
      const [, price] = slots;
      const iconRight = this.r.x + this.labelInset + this.iconSize();
      const width = Math.min(price.width, this.rightLabel.x - iconRight - textInset(this.rightLabel));
      this.priceFits = this.rightLabel.width <= width && this.rightLabel.height <= price.height;
    }
    this.showLabels();
  }

  static fitGroup(fitter: DeviceTextFit, buttons: Button[]): void {
    if (!buttons.length) return;
    const fits = fitter.fit(buttons[0].preferredSize, buttons.flatMap(button => button.slots()));
    for (const button of buttons) {
      const changed = button.labelsFit !== fits;
      button.labelsFit = fits;
      button.showLabels();
      if (button.icon && (changed || button.upgradeRow && button.coinLabelWidth !== button.rightLabel?.width)) button.refresh();
    }
  }

  private showLabels(): void {
    this.label.setVisible(this.shown && this.labelsFit);
    this.rightLabel?.setVisible(this.shown && (this.labelsFit || this.priceFits));
  }

  private iconSize(): number {
    return Math.min(28, this.r.height * .48);
  }

  private downwardY(label: Phaser.GameObjects.Text, middle: number, down: number): number {
    if (this.skin !== 'battle' || !down) return middle + down;
    return Math.max(middle, Math.min(middle + down,
      this.r.y + this.offsetY + this.r.height - textInset(label) - label.height * (1 - label.originY)));
  }

  setDepth(depth: number): void {
    for (const object of [this.box, this.trim, this.chrome?.image, this.label, this.rightLabel]) object?.setDepth(depth);
  }

  setShown(shown: boolean): void {
    if (this.shown === shown) return;
    this.shown = shown;
    for (const o of [this.box, this.trim, this.chrome?.image, this.label, this.rightLabel]) o?.setVisible(shown);
    this.showLabels();
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
    if (this.skin !== 'legacy') {
      this.refreshModern(available);
      return;
    }
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

  private refreshModern(available: boolean): void {
    const paper = this.skin === 'paper';
    const active = this.primary && available;
    const down = this.pressed && available;
    const compress = down && this.clock ? 2 : 0;
    const { x, y, width, height } = this.r;
    this.positionLabels();
    if (this.textFit && this.shown) this.fitText();
    const fill = paper
      ? active ? (down ? 0x16372f : PRINT.green) : !available ? 0xf0eadd : this.picked || this.hover ? PRINT.inset : PRINT.sheet
      : !available ? CLEAN.panel : active ? (down ? 0x7bc7b1 : CLEAN.mint)
        : this.picked || this.hover || down ? 0x2b4949 : CLEAN.raised;
    const color = paper ? active ? '#fff9eb' : available ? PRINT.ink : PRINT.muted
      : active ? CLEAN.mintDark : available ? CLEAN.ink : CLEAN.subdued;
    this.box.setFillStyle();
    this.trim.setVisible(!this.chrome && this.shown && !!this.icon);
    this.chrome?.image.setVisible(this.shown);
    if (this.shown) {
      const paint = this.chrome ? this.chrome.begin(this.r) : this.trim.clear();
      const offset = this.chrome ? 0 : this.offsetY;
      const edge = paper ? active || this.picked && available ? PRINT.green : PRINT.edge : this.picked ? CLEAN.mint : CLEAN.edge;
      if (!this.bare || paper && (this.picked || this.hover || down)) rounded(paint, { x: x + compress, y: y + offset + compress, width: width - 2 * compress, height: height - 2 * compress }, fill, edge, paper ? 12 : 16);
      if (this.upgradeRow && this.icon && this.rightLabel) {
        const tile = this.labelInset - 20;
        const tileX = x + 9, tileY = y + offset + height / 2 - tile / 2;
        rounded(paint, { x: tileX, y: tileY, width: tile, height: tile }, 0x274c47, 0x3f6861, 9);
        glyph(paint, this.icon, tileX + tile / 2, tileY + tile / 2, tile * .56, CLEAN.mint);
        if (this.labelsFit) {
          this.coinLabelWidth = this.rightLabel.width;
          const coinX = x + width - 12 - this.rightLabel.width - 12;
          glyph(paint, 'coin', coinX, y + offset + (this.labelY ?? height / 2), 19, 0xffda92);
        }
      } else if (!this.labelsFit && this.priceFallback) {
        const size = this.iconSize();
        glyph(paint, this.priceFallback, x + this.labelInset + size / 2, y + offset + height / 2 + compress,
          size, Number.parseInt(color.slice(1), 16));
      } else if (this.icon) {
        const label = this.labelsFit ? this.label.text : '';
        const size = this.iconSize();
        const iconX = label ? this.rightLabel ? x + this.labelInset / 1.3 : x + (width - this.label.width) / 2 - size * .35 : x + width / 2;
        glyph(paint, this.icon, iconX, y + offset + (this.iconY ?? height / 2) + compress, size, Number.parseInt(color.slice(1), 16));
      }
    }
    if (this.shown) this.chrome?.finish(this.offsetY);
    if (this.label.style.color !== color) this.label.setColor(color);
    this.label.setY(this.downwardY(this.label, this.label.y, compress));
    const priceColor = !paper && available ? CLEAN.gold : color;
    if (this.rightLabel && this.rightLabel.style.color !== priceColor) this.rightLabel.setColor(priceColor);
    if (this.rightLabel) this.rightLabel.setY(this.downwardY(this.rightLabel, this.rightLabel.y, compress));
  }
}
