import type Phaser from 'phaser';
import { quarteringStatus, TICKS_PER_SECOND, type GameState, type Point, type Rect } from '../../sim';
import type { Layout } from '../layout';
import { SIEGE_TEXT } from '../names';
import { Button } from './button';

/** Plain field controls while the painted siege pieces are being prepared. */
export class SiegeControls {
  private readonly windows: Button[];
  private readonly sites: Button[];
  private readonly anchors: { button: Button; point: Point; leader?: { site: Point; line: Phaser.GameObjects.Graphics } }[] = [];
  private projection?: number;
  private emptyWindow?: { index: number; until: number };

  constructor(scene: Phaser.Scene, layout: Layout, state: GameState, shake: (index: number) => void, pay: () => void, private readonly framed = false) {
    const center = (p: Point, width: number, height: number): Rect =>
      ({ x: p.x - width / 2, y: p.y - height / 2, width, height });
    const make = (rect: Rect, action: () => void) => {
      const button = new Button(scene, rect, '', action, { fontSize: '22px' });
      button.labelObjects[0].setStyle({ metrics: { ascent: 22, descent: 5, fontSize: 27 } });
      return button;
    };
    this.windows = (state.windows ?? []).map((window, index) => {
      const point = layout.toScreen(window.position);
      const button = make(center(point, framed ? 108 : 116, framed && !layout.turned ? 52 : 80), () => shake(index));
      this.anchors.push({ button, point });
      return button;
    });
    const tax = state.wallSiteTax;
    const sites = tax?.kind === 'royalSurvey' ? tax.sites : tax ? [tax.site] : [];
    this.sites = sites.map(site => {
      const cell = layout.cellCenter(site);
      // The tax still binds the original cell. Leaders leave the door
      // and the health plaque legible while the portrait camera settles.
      const siegePortrait = layout.turned && state.level?.keepRoads === 'both';
      const offset = !siegePortrait ? { x: 0, y: 0 } : tax?.kind === 'quartering' ? { x: 190, y: 42 }
        : site.row === 13 ? { x: 0, y: 60 } : { x: 106, y: 0 };
      const point = { x: cell.x + offset.x, y: cell.y + offset.y };
      const rect = center(point, framed ? 132 : 136, framed && !layout.turned ? 54 : 80);
      const x = Math.max(0, Math.min(rect.x, scene.scale.width - rect.width));
      const button = make({ ...rect, x }, pay);
      const leader = siegePortrait ? { site: cell, line: scene.add.graphics() } : undefined;
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
      button.setFontSize(empty && !used ? '17px' : '22px');
      button.set(used ? SIEGE_TEXT.spentWindow : empty ? SIEGE_TEXT.emptyWindow : SIEGE_TEXT.window, !used);
      button.setPicked(!used);
    }
    const tax = state.wallSiteTax;
    const text = tax?.kind === 'quartering'
      ? `${SIEGE_TEXT.quartering}\n${SIEGE_TEXT.pay(tax.price)}` : SIEGE_TEXT.survey;
    for (const site of this.sites) {
      site.setShown(shown && !!tax);
      site.set(text, quarteringStatus(state).ok);
      if (this.framed) site.setPicked(quarteringStatus(state).ok);
    }
    for (const { leader } of this.anchors) leader?.line.setVisible(shown && !!tax);
  }

  rects(): Record<string, Rect> {
    return Object.fromEntries([
      ...this.windows.map((button, index) => [`window:${index}`, button] as const),
      ...this.sites.map((button, index) => [index ? `wallSite:${index}` : 'wallSite', button] as const),
    ].filter(([, button]) => button.labelObjects[0].visible).map(([key, button]) => [key, button.rect]));
  }
}
