import type Phaser from 'phaser';
import { uiBounds } from './devicePixels';
import { nextWavePreview, roadIds, roadPath, type EnemyType, type GameState, type Point, type Rect } from '../../sim';
import type { Layout } from '../layout';
import { SIEGE_TEXT } from '../names';
import { HUD_FONT, TEXT } from '../palette';
import { panel, THEME } from './theme';
import { minimumTextSize } from './deviceText';
import { CLEAN, glyph, rounded, sans, skinFor, textMetrics } from './newTheme';

interface Banner {
  road: string;
  mouth: Point;
  board: Phaser.GameObjects.Graphics;
  heading: Phaser.GameObjects.Text;
  counts: Phaser.GameObjects.Text;
  rect?: Rect;
}

/** One compact sign per road, alongside its mouth and clear of the plinths. */
export class RoadBanners {
  private readonly signs: Banner[];
  private last?: string;
  private previousScale = 0;
  private previousDisplayScale = 0;
  private readonly clean: boolean;

  constructor(private readonly scene: Phaser.Scene, private readonly layout: Layout, state: GameState) {
    const clean = this.clean = skinFor(scene) === 'battle';
    const text = (name: string, size: number, bold = false) => (clean
      ? sans(scene, 0, 0, '', size, bold ? CLEAN.ink : CLEAN.subdued, bold)
      : scene.add.text(0, 0, '', {
      fontFamily: HUD_FONT, fontSize: size, fontStyle: bold ? 'bold' : 'normal', color: TEXT.button, align: 'center',
      metrics: { ascent: size, descent: 5, fontSize: size + 5 },
    })).setOrigin(clean ? 0 : 0.5, 0).setName(name).setDepth(1);
    this.signs = roadIds(state.map).filter((id): id is string => id !== undefined).map(road => ({
      road,
      mouth: layout.toScreen(roadPath(state.map, road).path[0]),
      board: scene.add.graphics().setDepth(1),
      heading: text(`road:${road}:heading`, layout.turned ? road === 'west' ? 20 : 22 : 17, true)
        .setText(SIEGE_TEXT.road(road)),
      counts: text(`road:${road}:counts`, layout.turned ? road === 'west' ? 20 : 22 : 17),
    }));
  }

  update(state: GameState, covered: boolean, scale = 1, project = (p: Point) => p): void {
    const show = state.phase === 'setup' && !covered;
    const key = show ? String(state.wave) : '';
    const displayScale = this.clean ? this.scene.scale.displayScale.y : 0;
    if (key === this.last && (key === '' || scale === this.previousScale && displayScale === this.previousDisplayScale)) return;
    const change = key !== this.last;
    this.last = key;
    this.previousScale = scale;
    this.previousDisplayScale = displayScale;
    const groups = show && change ? nextWavePreview(state) : [];
    for (const sign of this.signs) {
      const { heading, counts, board, road, mouth } = sign;
      const westPhone = this.layout.turned && road === 'west';
      if (change && show) {
        if (westPhone && !this.clean) counts.setWordWrapWidth(this.layout.width - 42);
        const tally = new Map<EnemyType, number>();
        for (const g of groups) if ((g.road ?? state.map.mainRoad) === road) {
          tally.set(g.type, (tally.get(g.type) ?? 0) + g.count);
        }
        counts.setText([...tally].map(([type, count]) => SIEGE_TEXT.roadCount(count, type)).join(westPhone && !this.clean ? ' · ' : '\n'));
      }
      heading.setVisible(show);
      counts.setVisible(show && !!counts.text);
      board.setVisible(show);
      sign.rect = undefined;
      if (!show) continue;

      const p = project(mouth);
      if (this.clean) {
        this.drawClean(sign, p);
        continue;
      }
      const h = heading.height + (counts.text ? counts.height : 0) + (westPhone ? 8 : 15);
      const w = Math.max(heading.width, counts.width) + 22;
      const westWide = !this.layout.turned && road === 'west';
      // The west-only siege has its gate farther up this road. Put the
      // sign beside the approach to keep its timber and sill visible.
      const besideGate = westPhone && state.level?.keepRoads === 'west';
      const left = besideGate ? 204
        : westWide ? p.x - w - 86 : p.x - w / 2;
      const x = Math.max(8, Math.min(this.layout.width - w - 8, left));
      // The west road comes in at the side. Leave room above it for the
      // window and keep the long east preview above the lower control bar.
      const y = this.layout.turned
        ? Math.min(this.layout.map.y + this.layout.map.height - 8 - h, road === 'west' ? p.y + 60 * scale + 10 : p.y - h - 5)
        : road === 'west' ? this.layout.map.height - h - 8 : p.y - h - 10;
      sign.rect = { x, y, width: w, height: h };
      board.clear();
      if (westWide) {
        board.lineStyle(2, THEME.brass).lineBetween(x + w, y + h - 2, p.x, p.y - 4);
      } else if (besideGate) {
        const mid = y + h / 2;
        board.fillStyle(THEME.brass).fillTriangle(x, mid - 5, x - 10, mid, x, mid + 5);
      } else if (this.layout.turned && road === 'west') {
        board.lineStyle(2, THEME.brass).lineBetween(x + 8, y, p.x + 3, p.y);
      }
      panel(board, sign.rect, THEME.wood);
      heading.setPosition(x + w / 2, y + (westPhone ? 4 : 6));
      counts.setPosition(heading.x, heading.y + heading.height + (westPhone ? 0 : 2));
    }
  }

  private drawClean(sign: Banner, p: Point): void {
    const { heading, counts, board, road } = sign;
    const phone = this.layout.turned;
    const west = road === 'west';
    const pad = phone ? 14 : 10;
    const size = Math.max(phone ? 24 : 15, minimumTextSize(heading));
    for (const label of [heading, counts]) if (parseFloat(String(label.style.fontSize)) !== size) {
      label.setStyle({ fontSize: size, metrics: textMetrics(size) });
    }
    const iconSpace = size + 3;
    const w = Math.max(heading.width + iconSpace, counts.width) + 2 * pad;
    const h = heading.height + (counts.text ? counts.height + 4 : 0) + 2 * pad;
    const foot = this.layout.map.y + this.layout.map.height;
    const left = phone ? west ? p.x - 94 : p.x + 34
      : west ? p.x - w - 107 : p.x - w - 30;
    const x = Math.max(12, Math.min(this.layout.width - w - 12, left));
    const eastInset = x - p.x < 29 ? 128 : 47;
    const y = phone ? west ? p.y - h - 100 : foot - h - eastInset
      : west ? foot - h - 12 : p.y - h - 18;
    sign.rect = { x, y, width: w, height: h };
    const paint = board.clear();
    uiBounds(board, sign.rect);
    rounded(paint, sign.rect);
    glyph(paint, west ? 'back' : 'arrow', x + pad + size / 2, y + pad + heading.height / 2, size, CLEAN.mint);
    heading.setPosition(x + pad + iconSpace, y + pad);
    counts.setPosition(x + pad, y + pad + heading.height + 4);
  }

  rects(): Record<string, Rect> {
    return Object.fromEntries(this.signs.flatMap(({ road, rect }) => rect ? [[`road:${road}`, rect]] : []));
  }
}
