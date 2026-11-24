// Build bar: the HUD's second row, one button per tower type (name from
// names.ts TOWER_NAMES, cost right-aligned: "Musketeer  50"). A button the player cannot afford is greyed and ignores
// clicks; the greying follows the gold on every redraw. The active pick is
// highlighted. The bar only reports clicks; GameScene owns the pick.

import type Phaser from 'phaser';
import { TOWER_DEFS, towerBuildCost, allowedTowers, type GameState, type TowerType } from '../../sim';
import type { Rect } from '../input';
import { drawTowerShape } from '../draw/towers';
import { LANDSCAPE, TAXED_PORTRAIT, type Layout } from '../layout';
import type { PaintedSkin } from '../skin/painted';
import { portraitBarRects } from './geometry';
import { TOWER_NAMES, towerCountText } from '../names';
import { HUD_FONT, TEXT } from '../palette';
import { makeLock } from './lock';
import { BAR_TYPES, canPick } from './buildBarModel';
import { Button } from './button';

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

  constructor(scene: Phaser.Scene, top: number, onClick: (type: TowerType) => void, private readonly layout: Layout = LANDSCAPE, painted?: PaintedSkin) {
    const portrait = layout.kind === 'portrait';
    const rects = barRects(layout, top);
    const priceSize = layout === TAXED_PORTRAIT ? 21 : 20;
    this.buttons = BAR_TYPES.map((type, i) =>
      portrait
        ? new Button(scene, rects[i], String(TOWER_DEFS[type].cost), () => onClick(type), { fontSize: `${priceSize}px`, labelY: COST_Y })
        : new Button(scene, rects[i], TOWER_NAMES[type], () => onClick(type), {
          fontSize: painted ? '14px' : '16px',
          right: String(TOWER_DEFS[type].cost),
          labelInset: 6,
          labelY: painted ? PAINTED_WIDE_LABEL_Y : undefined,
        }),
    );
    if (portrait) {
      // These labels contain digits only. Reserve the lower 24 px of the
      // tower plaque so a browser with tall font metrics cannot spill its
      // cost onto the controls below.
      for (const button of this.buttons) button.labelObjects[0].setStyle({
        fixedHeight: priceSize + 4, metrics: { ascent: priceSize, descent: 4, fontSize: priceSize + 4 },
      });
    }
    if (painted) {
      this.paintedIcons = BAR_TYPES.map((type, i) => {
        const r = rects[i];
        return painted.towerIcon(type, portrait ? 46 : 32, portrait ? 38 : 22)
          .setPosition(r.x + r.width / 2, r.y + (portrait ? ICON_Y : PAINTED_WIDE_ICON_Y));
      });
    } else if (portrait) {
      this.classicIcons = scene.add.graphics();
    }
    const countSize = layout === TAXED_PORTRAIT ? 23 : portrait ? 22 : 14;
    this.count = scene.add.text(0, 0, '', {
      fontFamily: HUD_FONT, fontSize: countSize, fontStyle: 'bold', color: TEXT.hud,
      fixedHeight: countSize + 4, metrics: { ascent: countSize, descent: 4, fontSize: countSize + 4 },
    }).setOrigin(0.5).setName('build-bar-count').setVisible(false);
    this.locks = BAR_TYPES.map(type => makeLock(scene)
      .setName(`bar-lock:${type}`).setScale(portrait ? 1 : 0.7).setVisible(false));
  }

  /** Grey what cannot be picked and highlight the pick. Call on every redraw. */
  update(state: GameState, pick: TowerType | null): void {
    const portrait = this.layout.kind === 'portrait';
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

  /** Button rectangles keyed `bar:<type>`. */
  rects(): Record<string, Rect> {
    return Object.fromEntries(BAR_TYPES.map((type, i) => [`bar:${type}`, this.buttons[i].rect]));
  }
}
