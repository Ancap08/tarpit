import type Phaser from 'phaser';
import { nextWavePreview, roadIds, roadPath, type EnemyType, type GameState, type Point, type Rect } from '../../sim';
import type { Layout } from '../layout';
import { SIEGE_TEXT } from '../names';
import { HUD_FONT, TEXT } from '../palette';
import { panel, THEME } from './theme';

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

  constructor(scene: Phaser.Scene, private readonly layout: Layout, state: GameState) {
    const text = (name: string, size: number, bold = false) => scene.add.text(0, 0, '', {
      fontFamily: HUD_FONT, fontSize: size, fontStyle: bold ? 'bold' : 'normal', color: TEXT.button, align: 'center',
      metrics: { ascent: size, descent: 5, fontSize: size + 5 },
    }).setOrigin(0.5, 0).setName(name).setDepth(1);
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
    if (key === this.last && (key === '' || scale === this.previousScale)) return;
    const change = key !== this.last;
    this.last = key;
    this.previousScale = scale;
    const groups = show && change ? nextWavePreview(state) : [];
    for (const sign of this.signs) {
      const { heading, counts, board, road, mouth } = sign;
      const westPhone = this.layout.turned && road === 'west';
      if (change && show) {
        if (westPhone) counts.setWordWrapWidth(this.layout.width - 42);
        const tally = new Map<EnemyType, number>();
        for (const g of groups) if ((g.road ?? state.map.mainRoad) === road) {
          tally.set(g.type, (tally.get(g.type) ?? 0) + g.count);
        }
        counts.setText([...tally].map(([type, count]) => SIEGE_TEXT.roadCount(count, type)).join(westPhone ? ' · ' : '\n'));
      }
      heading.setVisible(show);
      counts.setVisible(show && !!counts.text);
      board.setVisible(show);
      sign.rect = undefined;
      if (!show) continue;

      const p = project(mouth);
      const h = heading.height + (counts.text ? counts.height : 0) + (westPhone ? 8 : 15);
      const w = Math.max(heading.width, counts.width) + 22;
      const westWide = !this.layout.turned && road === 'west';
      const left = westWide ? p.x - w - 86 : p.x - w / 2;
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
      } else if (this.layout.turned && road === 'west') {
        board.lineStyle(2, THEME.brass).lineBetween(x + 8, y, p.x + 3, p.y);
      }
      panel(board, sign.rect, THEME.wood);
      heading.setPosition(x + w / 2, y + (westPhone ? 4 : 6));
      counts.setPosition(heading.x, heading.y + heading.height + (westPhone ? 0 : 2));
    }
  }

  rects(): Record<string, Rect> {
    return Object.fromEntries(this.signs.flatMap(({ road, rect }) => rect ? [[`road:${road}`, rect]] : []));
  }
}
