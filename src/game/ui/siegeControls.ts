import type Phaser from 'phaser';
import { quarteringStatus, TICKS_PER_SECOND, type GameState, type Point, type Rect } from '../../sim';
import type { Layout } from '../layout';
import { SIEGE_TEXT } from '../names';
import { Button } from './button';

/** Plain field controls while the painted siege pieces are being prepared. */
export class SiegeControls {
  private readonly windows: Button[];
  private readonly sites: Button[];
  private readonly anchors: { button: Button; point: Point }[] = [];
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
      const point = layout.cellCenter(site);
      const rect = center(point, framed ? 132 : 136, framed && !layout.turned ? 54 : 80);
      const x = Math.max(0, Math.min(rect.x, scene.scale.width - rect.width));
      const button = make({ ...rect, x }, pay);
      this.anchors.push({ button, point });
      return button;
    });
  }

  showEmptyWindow(index: number, tick: number): void {
    this.emptyWindow = { index, until: tick + 1.5 * TICKS_PER_SECOND };
  }

  update(state: GameState, covered: boolean, scale = 1, project = (p: Point) => p): void {
    if (this.framed && scale !== this.projection) {
      this.projection = scale;
      for (const { button, point } of this.anchors) {
        const p = project(point);
        const { x, height } = button.rect;
        button.moveTo(x, p.y - height / 2);
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
  }

  rects(): Record<string, Rect> {
    return Object.fromEntries([
      ...this.windows.map((button, index) => [`window:${index}`, button] as const),
      ...this.sites.map((button, index) => [index ? `wallSite:${index}` : 'wallSite', button] as const),
    ].filter(([, button]) => button.labelObjects[0].visible).map(([key, button]) => [key, button.rect]));
  }
}
