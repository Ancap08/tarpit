// Build bar: the HUD's second row, one button per tower type (name from
// names.ts TOWER_NAMES, cost right-aligned: "Musketeer  50"). A button the player cannot afford is greyed and ignores
// clicks; the greying follows the gold on every redraw. The active pick is
// highlighted. The bar only reports clicks; GameScene owns the pick.

import type Phaser from 'phaser';
import { TOWER_DEFS, allowedTowers, type GameState, type TowerType } from '../../sim';
import type { Rect } from '../input';
import { drawTowerShape } from '../draw/towers';
import { LANDSCAPE, type Layout } from '../layout';
import type { PaintedSkin } from '../skin/painted';
import { portraitBarRects } from './geometry';
import { TOWER_NAMES } from '../names';
import { makeLock } from './lock';
import { BAR_TYPES, canPick } from './buildBarModel';
import { Button } from './button';

/** Keep the six full-size landscape plaques inside the pause column. */
export const BAR_BUTTON_WIDTH = 132;
export const BAR_BUTTON_HEIGHT = 42;
export const BAR_LEFT = 6;
export const BAR_GAP = 4;

/** Where a portrait button's icon centre and cost centre sit, in px from its top (milestone 32b, geometry.ts). */
const ICON_Y = 27;
const COST_Y = 56;
const PAINTED_WIDE_ICON_Y = 12;
const PAINTED_WIDE_LABEL_Y = 30;

/** The bar's button rectangles for `layout`, in BAR_TYPES order. */
export function barRects(layout: Layout, top: number): Rect[] {
  if (layout.kind === 'portrait') return portraitBarRects();
  return BAR_TYPES.map((_, i) => ({ x: BAR_LEFT + i * (BAR_BUTTON_WIDTH + BAR_GAP), y: top, width: BAR_BUTTON_WIDTH, height: BAR_BUTTON_HEIGHT }));
}

export class BuildBar {
  private readonly buttons: Button[];
  /** The Classic portrait icons and the enabled flags they were drawn for. */
  private readonly classicIcons?: Phaser.GameObjects.Graphics;
  private readonly paintedIcons?: Phaser.GameObjects.Image[];
  private readonly locks: Phaser.GameObjects.Graphics[];
  private iconKey = '';
  private compact = false;

  constructor(scene: Phaser.Scene, top: number, onClick: (type: TowerType) => void, private readonly layout: Layout = LANDSCAPE, painted?: PaintedSkin) {
    const portrait = layout.kind === 'portrait';
    const rects = barRects(layout, top);
    this.buttons = BAR_TYPES.map((type, i) =>
      portrait
        ? new Button(scene, rects[i], String(TOWER_DEFS[type].cost), () => onClick(type), { fontSize: '20px', labelY: COST_Y })
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
        fixedHeight: 24, metrics: { ascent: 20, descent: 4, fontSize: 24 },
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
        const compactWidth = BAR_TYPES[i] === 'musketeer' ? 118 : 103;
        const width = compact ? compactWidth : BAR_BUTTON_WIDTH;
        button.setWidth(width);
        button.moveTo(x, button.rect.y);
        x += width + BAR_GAP;
        button.setFontSize(this.paintedIcons ? (compact ? '13px' : '14px') : (compact ? '14px' : '16px'));
        const r = button.rect;
        this.paintedIcons?.[i].setX(r.x + r.width / 2);
      });
    }
    BAR_TYPES.forEach((type, i) => {
      const b = this.buttons[i];
      const enabled = canPick(state, type);
      const locked = !allowedTowers(state).includes(type);
      const cost = String(TOWER_DEFS[type].cost);
      const lockReplacesCost = locked && !portrait && !this.paintedIcons;
      b.set(portrait ? cost : TOWER_NAMES[type], enabled, lockReplacesCost ? '' : cost);
      b.setPicked(pick === type);
      const { x, y, width, height } = b.rect;
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
      drawTowerShape(g, type, { x: r.x + r.width / 2, y: r.y + ICON_Y }, -Math.PI / 2, false, canPick(state, type) ? 1 : 0.4);
    });
  }

  /** Button rectangles keyed `bar:<type>`. */
  rects(): Record<string, Rect> {
    return Object.fromEntries(BAR_TYPES.map((type, i) => [`bar:${type}`, this.buttons[i].rect]));
  }
}
