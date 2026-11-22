// Layouts (milestone 32b): where the map and the controls sit on the canvas.
//
// One Layout object owns every conversion between world points (the
// simulation's 960 x 480 map, src/sim) and screen points (canvas px). Draw,
// effect and input code never places or hit-tests a map thing without it:
//
// - World-space Graphics (the map, zones, towers, range circles, the ghost,
//   projectiles, impacts) draw in world coordinates and take the layout's
//   transform with placeWorld(), so a turned layout turns them whole.
// - Screen-space objects that must stay upright (sprites, text, hp bars,
//   particles, banners) are placed with toScreen().
// - Pointer input goes through cellAt(), toWorld() and onMap().
//
// Landscape is the identity: the map fills x 0..960, y 0..480 and every
// conversion returns its input, so the landscape frames do not move.

import { CELL, GRID_COLS, GRID_ROWS, MAP_HEIGHT, MAP_WIDTH, type Cell, type Point, type Rect } from '../sim';

export type LayoutKind = 'landscape' | 'portrait';

/** Something with a transform, such as a Phaser Graphics object. */
export interface Placeable {
  setPosition(x: number, y: number): unknown;
  setRotation(radians: number): unknown;
}

export class Layout {
  /** Canvas size. */
  readonly width: number;
  readonly height: number;
  /** The map's box on the canvas. */
  readonly map: Rect;
  /** True when the map is turned a quarter turn clockwise (portrait). */
  readonly turned: boolean;
  /**
   * The world direction that points to the top of the screen (unit
   * vector): arcs, lifts and flyers rise this way.
   */
  readonly up: Point;

  constructor(
    readonly kind: LayoutKind,
    size: { width: number; height: number },
    map: Rect,
  ) {
    this.width = size.width;
    this.height = size.height;
    this.map = map;
    this.turned = kind === 'portrait';
    this.up = this.turned ? { x: -1, y: 0 } : { x: 0, y: -1 };
  }

  /** World point to canvas point. */
  toScreen(p: Point): Point {
    if (!this.turned) return { x: p.x, y: p.y };
    return { x: this.map.x + MAP_HEIGHT - p.y, y: this.map.y + p.x };
  }

  /** Canvas point to world point. */
  toWorld(s: Point): Point {
    if (!this.turned) return { x: s.x, y: s.y };
    return { x: s.y - this.map.y, y: MAP_HEIGHT - (s.x - this.map.x) };
  }

  /** A world direction as a screen direction (for facing and knocks). */
  screenDir(dx: number, dy: number): Point {
    return this.turned ? { x: -dy, y: dx } : { x: dx, y: dy };
  }

  /** World point `p` moved by a screen-space offset (dx, dy): "3 px below on screen", "16 px up on screen". */
  offset(p: Point, dx: number, dy: number): Point {
    if (!this.turned) return { x: p.x + dx, y: p.y + dy };
    return { x: p.x + dy, y: p.y - dx };
  }

  /** An ellipse that is `w` wide and `h` tall on screen, as world-space width and height. */
  ellipse(w: number, h: number): { w: number; h: number } {
    return this.turned ? { w: h, h: w } : { w, h };
  }

  /** Give a world-space Graphics the layout's transform. */
  placeWorld<T extends Placeable>(g: T): T {
    if (this.turned) {
      g.setPosition(this.map.x + MAP_HEIGHT, this.map.y);
      g.setRotation(Math.PI / 2);
    }
    return g;
  }

  /**
   * The grid cell under canvas point (x, y), or null off the map. A point
   * on a shared edge belongs to the cell to its right or below on screen.
   */
  cellAt(x: number, y: number): Cell | null {
    const sx = x - this.map.x;
    const sy = y - this.map.y;
    if (!(sx >= 0 && sx < this.map.width && sy >= 0 && sy < this.map.height)) return null;
    const col = this.turned ? Math.floor(sy / CELL) : Math.floor(sx / CELL);
    const row = this.turned ? GRID_ROWS - 1 - Math.floor(sx / CELL) : Math.floor(sy / CELL);
    return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS ? { col, row } : null;
  }

  /** A cell's centre on the canvas. */
  cellCenter(cell: Cell): Point {
    return this.toScreen({ x: cell.col * CELL + CELL / 2, y: cell.row * CELL + CELL / 2 });
  }

  /** A cell's 32 px square on the canvas. */
  cellRect(cell: Cell): Rect {
    const c = this.cellCenter(cell);
    return { x: c.x - CELL / 2, y: c.y - CELL / 2, width: CELL, height: CELL };
  }

  /** True when canvas point (x, y) is on the map, edges included. */
  onMap(x: number, y: number): boolean {
    const m = this.map;
    return x >= m.x && x <= m.x + m.width && y >= m.y && y <= m.y + m.height;
  }

  /** True when (x, y) is on the map and above its bottom edge (where a special may be aimed or fired). */
  inMap(x: number, y: number): boolean {
    return this.onMap(x, y) && y < this.map.y + this.map.height;
  }
}

/** Today's layout: a 960 x 580 canvas, the map at the top, the HUD's two rows under it. */
export const LANDSCAPE = new Layout('landscape', { width: 960, height: 580 }, { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT });

/**
 * Portrait (milestone 32b): a 480 px wide canvas. From the top: the status
 * strip (PORTRAIT_STRIP_H), the map turned a quarter turn clockwise (480 x
 * 960: world x runs down the screen, world y right to left, so the spawn is
 * at the top and the cottage at the bottom), then the controls: a row of
 * the six tower buttons and a row with Special, Start Wave and speed, each
 * PORTRAIT_BUTTON_H tall with PORTRAIT_GAP around them.
 *
 * Sizes: on a 390 x 763 CSS px phone (iPhone standalone, inside the safe
 * areas) the 480 x 1194 canvas fits at 763 / 1194 = 0.639, so a 70 px
 * button is 44.7 CSS px and 18 px text is 11.5 CSS px; with Safari's bars
 * (390 x 664) the scale is 0.556: buttons 38.9 CSS px, 18 px text 10.0.
 */
export const PORTRAIT_WIDTH = 480;
export const PORTRAIT_STRIP_H = 76;
export const PORTRAIT_BUTTON_H = 70;
export const PORTRAIT_GAP = 6;
/** Top of the controls (the map's bottom edge). */
export const PORTRAIT_CONTROLS_Y = PORTRAIT_STRIP_H + MAP_WIDTH;
export const PORTRAIT_ROW1_Y = PORTRAIT_CONTROLS_Y + PORTRAIT_GAP;
export const PORTRAIT_ROW2_Y = PORTRAIT_ROW1_Y + PORTRAIT_BUTTON_H + PORTRAIT_GAP;
export const PORTRAIT_HEIGHT = PORTRAIT_ROW2_Y + PORTRAIT_BUTTON_H + PORTRAIT_GAP;

export const PORTRAIT = new Layout(
  'portrait',
  { width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT },
  { x: 0, y: PORTRAIT_STRIP_H, width: MAP_HEIGHT, height: MAP_WIDTH },
);

/** Portrait text is at least this size, so it reads at 11 CSS px or more on a 390 x 763 phone. */
export const PORTRAIT_MIN_FONT = 18;

/** The layout for a window: taller than it is wide is portrait, anything else landscape. */
export function layoutFor(width: number, height: number): Layout {
  return height > width ? PORTRAIT : LANDSCAPE;
}

/** A font size in px for `layout`: as given in landscape, at least PORTRAIT_MIN_FONT in portrait. */
export function fontPx(layout: Layout, px: number): string {
  return `${layout.kind === 'portrait' ? Math.max(px, PORTRAIT_MIN_FONT) : px}px`;
}
