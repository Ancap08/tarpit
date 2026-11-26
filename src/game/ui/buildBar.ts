// Build bar: the HUD's second row, one button per tower type (name from
// names.ts TOWER_NAMES, cost right-aligned: "Musketeer  50"). A button the player cannot afford is greyed and ignores
// clicks; the greying follows the gold on every redraw. The active pick is
// highlighted. The bar only reports clicks; GameScene owns the pick.

import type Phaser from 'phaser';
import { TOWER_DEFS, towerBuildCost, allowedTowers, type GameState, type TowerType } from '../../sim';
import type { Rect } from '../input';
import { drawTowerShape } from '../draw/towers';
import { CLEAN_BUILD_H, LANDSCAPE, TAXED_PORTRAIT, type Layout } from '../layout';
import type { TowerIcon } from '../skin/painted';
import { portraitBarRects } from './geometry';
import { TOWER_NAMES, towerCountText } from '../names';
import { HUD_FONT, TEXT } from '../palette';
import { makeLock } from './lock';
import { BAR_TYPES, canPick } from './buildBarModel';
import { Button } from './button';
import { DeviceTextFit, minimumTextSize, textSlot } from './deviceText';
import { CLEAN, battleFont, battleWeight, controlPaint, glyph, interLoaded, rounded, skinFor, textMetrics, type ControlPaint } from './newTheme';

/** Keep the six full-size landscape plaques inside the pause column. */
export const BAR_BUTTON_WIDTH = 132;
export const BAR_BUTTON_HEIGHT = 42;
export const BAR_LEFT = 6;
export const BAR_GAP = 4;

/** Widths beside held rewards, with room for the name and price in both fonts. */
const REWARD_ROW_WIDTH: Record<TowerType, number> = {
  musketeer: 118, cannon: 103, tarpit: 103, longbow: 113, mortar: 103, firepot: 103,
};

/** Where a portrait button's icon centre and cost centre sit, in px from its top (milestone 32b, geometry.ts). */
const ICON_Y = 27;
const COST_Y = 56;
const PAINTED_WIDE_ICON_Y = 12;
const PAINTED_WIDE_LABEL_Y = 30;
const CLEAN_ART_Y = 26;
const CLEAN_NAME_Y = 62;
const CLEAN_PRICE_Y = 91;

/** The bar's button rectangles for `layout`, in BAR_TYPES order. */
export function barRects(layout: Layout, top: number): Rect[] {
  if (layout.kind === 'portrait') return portraitBarRects(layout);
  return BAR_TYPES.map((_, i) => ({ x: BAR_LEFT + i * (BAR_BUTTON_WIDTH + BAR_GAP), y: top, width: BAR_BUTTON_WIDTH, height: BAR_BUTTON_HEIGHT }));
}

export class BuildBar {
  private readonly buttons: Button[];
  /** The Classic portrait icons and the enabled flags they were drawn for. */
  private readonly classicIcons?: Phaser.GameObjects.Graphics;
  private readonly paintedIcons?: Phaser.GameObjects.Image[];
  private readonly count: Phaser.GameObjects.Text;
  private readonly locks: Phaser.GameObjects.Graphics[];
  private iconKey = '';
  private compact = false;
  private readonly clean: boolean;
  private readonly names?: Phaser.GameObjects.Text[];
  private readonly icons?: ControlPaint;
  private readonly portraits?: Phaser.GameObjects.Image[];
  private readonly nameFit = new DeviceTextFit();
  private readonly priceFit = new DeviceTextFit();
  private readonly tallyFit = new DeviceTextFit();

  constructor(scene: Phaser.Scene, top: number, onClick: (type: TowerType) => void, private readonly layout: Layout = LANDSCAPE, towerIcon?: TowerIcon, private readonly permitBox?: Rect) {
    const portrait = layout.kind === 'portrait';
    this.clean = skinFor(scene) === 'battle';
    const gap = 4;
    // The two longest names need more of the shared width at the Inter margin.
    const nameRoom = BAR_TYPES.map(type => interLoaded && portrait
      ? type === 'musketeer' ? 22 : type === 'longbow' ? 12 : 0 : 0);
    const extraWidth = nameRoom.reduce<number>((sum, width) => sum + width, 0);
    const buttonWidth = (layout.width - 16 - 5 * gap - extraWidth) / BAR_TYPES.length;
    let nextX = 8;
    const rects = this.clean ? BAR_TYPES.map((_, i) => {
      const width = portrait ? buttonWidth + nameRoom[i] : 93;
      const x = portrait ? nextX : 16 + i * 98;
      nextX += width + gap;
      return { x, y: top, width, height: portrait ? CLEAN_BUILD_H : 65 };
    }) : barRects(layout, top);
    const priceSize = layout === TAXED_PORTRAIT ? 21 : 20;
    this.buttons = BAR_TYPES.map((type, i) =>
      this.clean
        ? new Button(scene, rects[i], String(TOWER_DEFS[type].cost), () => onClick(type), {
          fontSize: portrait ? '25px' : '15px',
          labelY: portrait ? CLEAN_PRICE_Y : 53, grouped: true, semibold: true,
        })
        : portrait
        ? new Button(scene, rects[i], String(TOWER_DEFS[type].cost), () => onClick(type), { fontSize: `${priceSize}px`, labelY: COST_Y })
        : new Button(scene, rects[i], TOWER_NAMES[type], () => onClick(type), {
          fontSize: towerIcon ? '14px' : '16px',
          right: String(TOWER_DEFS[type].cost),
          labelInset: 6,
          labelY: towerIcon ? PAINTED_WIDE_LABEL_Y : undefined,
        }),
    );
    if (portrait && !this.clean) {
      // These labels contain digits only. Reserve the lower 24 px of the
      // tower plaque so a browser with tall font metrics cannot spill its
      // cost onto the controls below.
      for (const button of this.buttons) button.labelObjects[0].setStyle({
        fixedHeight: priceSize + 4, metrics: { ascent: priceSize, descent: 4, fontSize: priceSize + 4 },
      });
    }
    if (this.clean) {
      this.icons = controlPaint(scene, scene.add.graphics());
      this.icons.image.setName('clean-build-icons');
      const nameSize = this.nameSize(scene);
      this.names = BAR_TYPES.map((type, i) =>
        scene.add.text(rects[i].x + rects[i].width / 2, top + (portrait ? CLEAN_NAME_Y : 33), TOWER_NAMES[type], {
          fontFamily: battleFont(), fontSize: nameSize, fontStyle: battleWeight(true, 'normal'), color: CLEAN.subdued, metrics: textMetrics(nameSize),
        }).setOrigin(.5).setName(`bar-name:${type}`));
      this.portraits = towerIcon ? BAR_TYPES.map(type => towerIcon(type, portrait ? 64 : 40, portrait ? 46 : 24)) : undefined;
      if (portrait && this.portraits) scene.children.bringToTop(this.icons.image);
    } else if (towerIcon) {
      this.paintedIcons = BAR_TYPES.map((type, i) => {
        const r = rects[i];
        return towerIcon(type, portrait ? 46 : 32, portrait ? 38 : 22)
          .setPosition(r.x + r.width / 2, r.y + (portrait ? ICON_Y : PAINTED_WIDE_ICON_Y));
      });
    } else if (portrait) {
      this.classicIcons = scene.add.graphics();
    }
    const countSize = this.clean ? (portrait ? 26 : 14) : layout === TAXED_PORTRAIT ? 23 : portrait ? 22 : 14;
    this.count = scene.add.text(0, 0, '', {
      fontFamily: this.clean ? battleFont() : HUD_FONT, fontSize: countSize, fontStyle: this.clean ? battleWeight(true) : 'bold', color: TEXT.hud,
      ...(this.clean ? { color: CLEAN.subdued, stroke: '#11292b', strokeThickness: interLoaded && portrait ? 1 : 2, metrics: textMetrics(countSize) }
        : { fixedHeight: countSize + 4, metrics: { ascent: countSize, descent: 4, fontSize: countSize + 4 } }),
    }).setOrigin(0.5).setName('build-bar-count').setVisible(false);
    this.locks = BAR_TYPES.map(type => makeLock(scene)
      .setName(`bar-lock:${type}`).setScale(portrait ? 1 : 0.7).setVisible(false));
  }

  /** Grey what cannot be picked and highlight the pick. Call on every redraw. */
  update(state: GameState, pick: TowerType | null): void {
    const portrait = this.layout.kind === 'portrait';
    if (this.clean) {
      this.updateClean(state, pick);
      return;
    }
    const compact = !portrait && state.boons.length > 0;
    if (this.compact !== compact) {
      this.compact = compact;
      let x = BAR_LEFT;
      this.buttons.forEach((button, i) => {
        const width = compact ? REWARD_ROW_WIDTH[BAR_TYPES[i]] : BAR_BUTTON_WIDTH;
        button.setWidth(width);
        button.moveTo(x, button.rect.y);
        x += width + BAR_GAP;
        button.setFontSize(this.paintedIcons ? (compact ? '13px' : '14px') : (compact ? '14px' : '16px'));
        const r = button.rect;
        this.paintedIcons?.[i].setX(r.x + r.width / 2);
      });
    }
    const cap = state.level?.taxes?.rationing;
    if (portrait && cap !== undefined && !this.count.visible) {
      for (const icon of this.paintedIcons?.slice(0, 2) ?? []) icon.setScale(icon.scaleX * 0.60);
    }
    this.count.setVisible(cap !== undefined);
    if (cap !== undefined) {
      const first = this.buttons[0].rect;
      const text = towerCountText(state.towers.length, cap);
      if (this.count.text !== text) this.count.setText(text);
      this.count.setPosition(first.x + first.width + BAR_GAP / 2, first.y + (portrait ? 14 : 9));
    }
    BAR_TYPES.forEach((type, i) => {
      const b = this.buttons[i];
      const enabled = canPick(state, type);
      const locked = !allowedTowers(state).includes(type);
      const cost = String(towerBuildCost(state, type));
      const lockReplacesCost = locked && !portrait && !this.paintedIcons;
      b.set(portrait ? cost : TOWER_NAMES[type], enabled, lockReplacesCost ? '' : cost);
      if (!portrait && state.level?.taxes?.windowTax) {
        const [name, price] = b.labelObjects;
        name.setScale(Math.min(1, (price.x - price.width - name.x - 3) / name.width), 1);
      }
      b.setPicked(pick === type);
      const { x, y, width, height } = b.rect;
      // The tally spans the two upper inside corners. Keep their icons
      // toward the opposite edges and leave every price and hit area in place.
      if (cap !== undefined && i < 2) {
        const xOffset = (i === 0 ? -1 : 1) * width / 4;
        this.paintedIcons?.[i].setPosition(x + width / 2 + xOffset, y + (portrait ? 37 : PAINTED_WIDE_ICON_Y));
        if (!portrait) for (const label of b.labelObjects) label.setY(y + Math.min(PAINTED_WIDE_LABEL_Y, height - label.height / 2));
      }
      const lockX = x + width - 14;
      const lockY = y + (lockReplacesCost ? height / 2 - 2 : portrait ? 12 : 8);
      this.locks[i].setPosition(lockX, lockY).setVisible(locked);
      this.paintedIcons?.[i].setAlpha(enabled ? 1 : 0.4);
    });
    const g = this.classicIcons;
    if (!g) return;
    const key = BAR_TYPES.map((t) => (canPick(state, t) ? '1' : '0')).join('');
    if (key === this.iconKey) return;
    this.iconKey = key;
    g.clear();
    BAR_TYPES.forEach((type, i) => {
      const r = this.buttons[i].rect;
      // Barrels point up the screen; a tower the player cannot afford is faint, as its greyed cost.
      const offset = cap !== undefined && i < 2 ? (i === 0 ? -1 : 1) * r.width / 4 : 0;
      drawTowerShape(g, type, { x: r.x + r.width / 2 + offset, y: r.y + (offset ? 32 : ICON_Y) }, -Math.PI / 2, false, canPick(state, type) ? 1 : 0.4);
    });
  }

  private updateClean(state: GameState, pick: TowerType | null): void {
    const cap = state.level?.taxes?.rationing;
    const open = allowedTowers(state);
    const flags = BAR_TYPES.map(type => ({ enabled: canPick(state, type), locked: !open.includes(type) }));
    const key = flags.map(f => f.locked ? 'L' : f.enabled ? '1' : '0').join('') + (cap !== undefined && !this.permitBox ? 't' : '');
    const redraw = key !== this.iconKey;
    const portrait = this.layout.turned;
    const top = this.buttons[0].rect.y;
    const paint = redraw ? this.icons!.begin({ x: 0, y: top, width: this.layout.width, height: portrait ? CLEAN_BUILD_H + 1 : 66 }) : null;
    if (redraw) this.iconKey = key;
    for (const [i, type] of BAR_TYPES.entries()) {
      const b = this.buttons[i];
      const { enabled, locked } = flags[i];
      const cost = towerBuildCost(state, type);
      b.set(String(cost), enabled);
      b.setPicked(pick === type);
      if (portrait) {
        const price = b.labelObjects[0];
        const priceColor = enabled ? CLEAN.gold : !locked && cost > state.gold ? '#ffb5a0' : CLEAN.subdued;
        if (price.style.color !== priceColor) price.setColor(priceColor);
      }
      if (!redraw) continue;
      const label = this.names![i];
      const color = enabled ? CLEAN.ink : CLEAN.subdued;
      if (label.style.color !== color) label.setColor(color);
      const r = b.rect;
      const away = !this.permitBox && cap !== undefined && i < 2 ? (i === 0 ? -1 : 1) * 22 : 0;
      const x = r.x + r.width / 2 + away - (portrait && locked && !away ? 6 : 0);
      const y = r.y + (portrait ? CLEAN_ART_Y : 13);
      const g = paint!;
      const alpha = locked ? .38 : enabled ? 1 : .62;
      const image = this.portraits?.[i];
      if (image) image.setPosition(x, y).setAlpha(alpha);
      else {
        const scale = portrait ? 1.18 : .68;
        g.save().translateCanvas(x, y).scaleCanvas(scale, scale);
        drawTowerShape(g, type, { x: 0, y: 0 }, -Math.PI / 2, false, alpha);
        g.restore();
      }
      if (locked && portrait) {
        const badge = { x: r.x + r.width - 35, y: r.y + 14, width: 29, height: 29 };
        rounded(g, badge, CLEAN.ground, CLEAN.edge, 9);
        glyph(g, 'lock', badge.x + badge.width / 2, badge.y + badge.height / 2, 18, 0xe0eee6);
      } else if (locked) glyph(g, 'lock', r.x + r.width - 13, r.y + 13, 15, 0xc4ded6);
    }
    if (redraw) this.icons!.finish();
    const names = this.names!;
    const showNames = this.nameFit.fit(this.nameSize(names[0].scene), names.map((label, i) => textSlot(label, this.buttons[i].rect)));
    for (const label of names) label.setVisible(showNames);
    Button.fitGroup(this.priceFit, this.buttons);
    this.count.setVisible(cap !== undefined);
    if (cap !== undefined) {
      const first = this.buttons[0].rect;
      const label = towerCountText(state.towers.length, cap);
      if (this.count.text !== label) this.count.setText(label);
      const second = this.buttons[1].rect;
      const box = this.permitBox;
      if (box) this.count.setOrigin(1, .5).setPosition(box.x + box.width - 5, box.y + box.height / 2);
      else this.count.setPosition(first.x + first.width + 1, first.y + 13);
      const area = box ?? { ...first, width: second.x + second.width - first.x, height: 26 };
      this.count.setVisible(this.tallyFit.fit(portrait ? 25 : 14, [textSlot(this.count, area)]));
    }
  }

  private nameSize(scene: Phaser.Scene): number {
    if (!this.layout.turned) return 14;
    if (interLoaded) return Math.max(18.5, minimumTextSize(this.buttons[0].labelObjects[0]));
    return Math.max(scene.scale.parentSize.height >= 800 ? 20 : 23, Math.ceil(11.15 * scene.scale.displayScale.x));
  }

  /** Button rectangles keyed `bar:<type>`. */
  rects(): Record<string, Rect> {
    return Object.fromEntries(BAR_TYPES.map((type, i) => [`bar:${type}`, this.buttons[i].rect]));
  }
}
