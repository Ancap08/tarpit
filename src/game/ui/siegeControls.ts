import type Phaser from 'phaser';
import { quarteringStatus, TICKS_PER_SECOND, type GameState, type Point, type Rect } from '../../sim';
import type { Layout } from '../layout';
import { SIEGE_TEXT } from '../names';
import { Button } from './button';

/** Hit targets follow the illustrated actors through the live field projection. */
export class SiegeControls {
  private readonly windows: Button[];
  private readonly sites: Button[];
  private readonly paySign?: Phaser.GameObjects.Graphics;
  private readonly anchors: { button: Button; point: Point; leader?: { site: Point; line: Phaser.GameObjects.Graphics } }[] = [];
  private projection?: number;
  private emptyWindow?: { index: number; until: number };

  constructor(scene: Phaser.Scene, layout: Layout, state: GameState, shake: (index: number) => void, pay: () => void, private readonly framed = false) {
    const center = (p: Point, width: number, height: number): Rect =>
      ({ x: p.x - width / 2, y: p.y - height / 2, width, height });
    const make = (rect: Rect, action: () => void, tailLabel = false) => {
      const bare = framed;
      const button = new Button(scene, rect, '', action, { fontSize: '22px', bare,
        ...(bare ? { sound: null } : {}), ...(tailLabel ? { labelY: rect.height * .83 } : {}) });
      button.labelObjects[0].setStyle({ metrics: { ascent: 22, descent: 5, fontSize: 27 } });
      return button;
    };
    this.windows = (state.windows ?? []).map((window, index) => {
      const point = layout.toScreen(window.position);
      const height = framed && !layout.turned ? Math.max(52, 44 * scene.scale.displayScale.y) : 80;
      const button = make(center(point, framed ? 108 : 116, height), () => shake(index), framed);
      this.anchors.push({ button, point });
      return button;
    });
    const tax = state.wallSiteTax;
    if (framed && tax?.kind === 'quartering') {
      this.paySign = scene.add.graphics().setVisible(false);
      this.paySign.fillStyle(0x362822).fillRect(-3, 10, 6, 21);
      this.paySign.fillStyle(0x553824).fillRoundedRect(-40, -14, 80, 28, 3);
      this.paySign.lineStyle(2, 0xdbaf70).strokeRoundedRect(-40, -14, 80, 28, 3);
      this.paySign.fillStyle(0xd8ad75).fillCircle(-34, 0, 1.5).fillCircle(34, 0, 1.5);
    }
    const sites = tax?.kind === 'royalSurvey' ? tax.sites : tax ? [tax.site] : [];
    this.sites = sites.map(site => {
      const cell = layout.cellCenter(site);
      const siegePortrait = layout.turned && state.level?.keepRoads === 'both';
      const offset = framed ? (tax?.kind === 'quartering' ? layout.turned ? { x: 43, y: 39 } : { x: 73, y: 50 } : { x: 0, y: 0 })
        : !siegePortrait ? { x: 0, y: 0 } : tax?.kind === 'quartering' ? { x: 190, y: 42 }
          : site.row === 13 ? { x: 0, y: 60 } : { x: 106, y: 0 };
      const point = { x: cell.x + offset.x, y: cell.y + offset.y };
      const rect = center(point, framed ? tax?.kind === 'quartering' ? 100 : 112 : 136,
        framed && !layout.turned ? Math.max(54, 44 * scene.scale.displayScale.y) : 80);
      const x = Math.max(0, Math.min(rect.x, scene.scale.width - rect.width));
      const button = make({ ...rect, x }, pay);
      const leader = !framed && siegePortrait ? { site: cell, line: scene.add.graphics() } : undefined;
      this.anchors.push({ button, point, leader });
      return button;
    });
  }

  showEmptyWindow(index: number, tick: number): void {
    this.emptyWindow = { index, until: tick + 1.5 * TICKS_PER_SECOND };
  }

  update(state: GameState, covered: boolean, scale = 1, project = (p: Point) => p): void {
    if (scale !== this.projection) {
      this.projection = scale;
      for (const { button, point, leader } of this.anchors) {
        const p = project(point);
        const { x, height } = button.rect;
        if (this.framed) button.moveTo(x, p.y - height / 2);
        if (leader) {
          const site = project(leader.site);
          leader.line.clear().lineStyle(1.4, 0xc3aa77, .84);
          if (point.x === site.x) leader.line.lineBetween(site.x, site.y + 9 * scale, site.x, button.rect.y);
          else if (p.y > site.y) leader.line.strokePoints([
            { x: site.x, y: site.y + 9 * scale }, { x: site.x, y: p.y }, { x: button.rect.x, y: p.y },
          ]);
          else leader.line.lineBetween(site.x + 12, site.y, button.rect.x, site.y);
        }
      }
    }
    const shown = !covered && (state.phase === 'setup' || state.phase === 'wave');
    for (const [index, button] of this.windows.entries()) {
      const used = state.windows![index].used;
      const empty = state.phase === 'wave' && this.emptyWindow?.index === index && state.tick < this.emptyWindow.until;
      button.setShown(shown);
      button.setFontSize(this.framed || empty && !used ? '17px' : '22px');
      button.set(used ? this.framed ? '' : SIEGE_TEXT.spentWindow
        : empty ? SIEGE_TEXT.emptyWindow : this.framed ? '' : SIEGE_TEXT.window, !used);
      if (!this.framed) button.setPicked(!used);
    }
    const tax = state.wallSiteTax;
    const text = tax?.kind === 'quartering'
      ? this.framed ? SIEGE_TEXT.pay(tax.price) : `${SIEGE_TEXT.quartering}\n${SIEGE_TEXT.pay(tax.price)}`
      : this.framed ? '' : SIEGE_TEXT.survey;
    for (const site of this.sites) {
      site.setShown(shown && !!tax);
      site.set(text, quarteringStatus(state).ok);
      if (this.framed) site.setFontSize('18px');
    }
    if (this.paySign && this.sites[0] && shown && tax?.kind === 'quartering') {
      const { x, y, width, height } = this.sites[0].rect;
      this.paySign.setPosition(x + width / 2, y + height / 2).setVisible(true);
    } else this.paySign?.setVisible(false);
    for (const { leader } of this.anchors) leader?.line.setVisible(shown && !!tax);
  }

  rects(): Record<string, Rect> {
    return Object.fromEntries([
      ...this.windows.map((button, index) => [`window:${index}`, button] as const),
      ...this.sites.map((button, index) => [index ? `wallSite:${index}` : 'wallSite', button] as const),
    ].filter(([, button]) => button.labelObjects[0].visible).map(([key, button]) => [key, button.rect]));
  }
}
