// Milestone 32b: the layout object's conversions, the turned facing, the
// portrait tower panel, the lift and the portrait controls' arithmetic.

import { describe, expect, it } from 'vitest';
import { cellCenter, GRID_COLS, GRID_ROWS, isBuildableTerrain, MAP_HEIGHT, MAP_IDS, MAP_WIDTH, MAPS, type Cell, type Rect } from '../sim';
import { facingAt, facingOf } from './anim/facing';
import { arcPosition } from './fx/fxMath';
import { DRAG_LIFT, dragTargetCell, LIFT_CSS, liftPx, placeBeside } from './input';
import { aimBannerText } from './names';
import { LANDSCAPE, layoutFor, PORTRAIT, PORTRAIT_HEIGHT, PORTRAIT_MIN_FONT, PORTRAIT_WIDTH, type Layout } from './layout';
import { panelGeometry, PORTRAIT_ROW_WIDTH, PORTRAIT_STACK, PORTRAIT_TITLE, portraitBarRects, portraitRow2, stackBox, STRIP_LINE_CHARS, stripAimText, titleRects } from './ui/geometry';

const allCells: Cell[] = [];
for (let col = 0; col < GRID_COLS; col++) for (let row = 0; row < GRID_ROWS; row++) allCells.push({ col, row });
const corners = [
  { x: 0, y: 0 },
  { x: MAP_WIDTH, y: 0 },
  { x: 0, y: MAP_HEIGHT },
  { x: MAP_WIDTH, y: MAP_HEIGHT },
];

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;

describe('layoutFor', () => {
  it('is portrait only for a window taller than it is wide', () => {
    expect(layoutFor(390, 844)).toBe(PORTRAIT);
    expect(layoutFor(844, 390)).toBe(LANDSCAPE);
    expect(layoutFor(960, 580)).toBe(LANDSCAPE);
    expect(layoutFor(600, 600)).toBe(LANDSCAPE);
  });
});

describe.each([
  ['landscape', LANDSCAPE],
  ['portrait', PORTRAIT],
] as const)('%s conversions', (_name, layout: Layout) => {
  it('round-trips every cell centre and the map corners', () => {
    for (const cell of allCells) {
      const w = cellCenter(cell);
      expect(layout.toWorld(layout.toScreen(w))).toEqual(w);
      const s = layout.cellCenter(cell);
      expect(layout.toScreen(layout.toWorld(s))).toEqual(s);
      expect(layout.cellAt(s.x, s.y)).toEqual(cell);
    }
    for (const c of corners) expect(layout.toWorld(layout.toScreen(c))).toEqual(c);
  });

  it('maps the world corners onto the corners of the map box', () => {
    const m = layout.map;
    const screen = corners.map((c) => layout.toScreen(c));
    const xs = screen.map((p) => p.x);
    const ys = screen.map((p) => p.y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([m.x, m.x + m.width, m.y, m.y + m.height]);
  });

  it('finds no cell off the map, and every on-map point in its own cell square', () => {
    const m = layout.map;
    expect(layout.cellAt(m.x - 1, m.y + 10)).toBeNull();
    expect(layout.cellAt(m.x + 10, m.y - 1)).toBeNull();
    expect(layout.cellAt(m.x + m.width, m.y + 10)).toBeNull();
    expect(layout.cellAt(m.x + 10, m.y + m.height)).toBeNull();
    for (const cell of allCells) {
      const r = layout.cellRect(cell);
      expect(layout.cellAt(r.x, r.y)).toEqual(cell); // top-left corner: the shared edge belongs right and below
      expect(layout.cellAt(r.x + r.width - 0.01, r.y + r.height - 0.01)).toEqual(cell);
      expect(inside(r, m)).toBe(true);
    }
  });

  it('screen up is one px up the screen', () => {
    const p = { x: 300, y: 200 };
    const a = layout.toScreen(p);
    const b = layout.toScreen({ x: p.x + layout.up.x, y: p.y + layout.up.y });
    expect({ x: b.x - a.x, y: b.y - a.y }).toEqual({ x: 0, y: -1 });
    const o = layout.toScreen(layout.offset(p, 5, -7));
    expect({ x: o.x - a.x, y: o.y - a.y }).toEqual({ x: 5, y: -7 });
  });
});

describe('landscape is the identity', () => {
  it('returns every point unchanged and keeps graphics where they are', () => {
    expect(LANDSCAPE.map).toEqual({ x: 0, y: 0, width: 960, height: 480 });
    expect([LANDSCAPE.width, LANDSCAPE.height]).toEqual([960, 580]);
    expect(LANDSCAPE.toScreen({ x: 123.5, y: 77.25 })).toEqual({ x: 123.5, y: 77.25 });
    expect(LANDSCAPE.toWorld({ x: 123.5, y: 77.25 })).toEqual({ x: 123.5, y: 77.25 });
    const calls: string[] = [];
    LANDSCAPE.placeWorld({ setPosition: () => calls.push('pos'), setRotation: () => calls.push('rot') });
    expect(calls).toEqual([]);
  });
});

describe('portrait turns the map a quarter turn clockwise', () => {
  it('runs world x down the screen and world y right to left', () => {
    const m = PORTRAIT.map;
    expect(PORTRAIT.toScreen({ x: 0, y: 0 })).toEqual({ x: m.x + m.width, y: m.y });
    expect(PORTRAIT.toScreen({ x: 960, y: 0 })).toEqual({ x: m.x + m.width, y: m.y + m.height });
    expect(PORTRAIT.toScreen({ x: 0, y: 480 })).toEqual({ x: m.x, y: m.y });
    expect(PORTRAIT.cellCenter({ col: 0, row: 0 })).toEqual({ x: m.x + m.width - 16, y: m.y + 16 });
    expect(PORTRAIT.cellCenter({ col: 29, row: 14 })).toEqual({ x: m.x + 16, y: m.y + m.height - 16 });
  });

  it('puts every map spawn at the top of the screen and the exit at the bottom', () => {
    for (const id of MAP_IDS) {
      const path = MAPS[id].path;
      expect(PORTRAIT.toScreen(path[0]).y).toBe(PORTRAIT.map.y);
      expect(PORTRAIT.toScreen(path[path.length - 1]).y).toBe(PORTRAIT.map.y + PORTRAIT.map.height);
    }
  });

  it('turns world-space graphics by the same transform', () => {
    let pos = { x: 0, y: 0 };
    let rot = 0;
    PORTRAIT.placeWorld({ setPosition: (x: number, y: number) => (pos = { x, y }), setRotation: (r: number) => (rot = r) });
    const apply = (p: { x: number; y: number }) => ({
      x: Math.round(pos.x + p.x * Math.cos(rot) - p.y * Math.sin(rot)),
      y: Math.round(pos.y + p.x * Math.sin(rot) + p.y * Math.cos(rot)),
    });
    for (const p of [...corners, { x: 100, y: 37 }]) expect(apply(p)).toEqual(PORTRAIT.toScreen(p));
  });

  it('swaps an ellipse so it stays wide on screen', () => {
    expect(PORTRAIT.ellipse(24, 9)).toEqual({ w: 9, h: 24 });
    expect(LANDSCAPE.ellipse(24, 9)).toEqual({ w: 24, h: 9 });
  });
});

describe('facing on a turned map', () => {
  it('faces the way the enemy moves on the screen', () => {
    const d = (dx: number, dy: number) => PORTRAIT.screenDir(dx, dy);
    const f = (dx: number, dy: number) => facingOf(d(dx, dy).x, d(dx, dy).y);
    expect(f(1, 0)).toBe('down'); // world right is screen down
    expect(f(-1, 0)).toBe('up');
    expect(f(0, 1)).toBe('left'); // world down is screen left
    expect(f(0, -1)).toBe('right');
  });

  it('walks down from Meadow’s spawn in portrait and right in landscape', () => {
    const meadow = MAPS.meadow;
    expect(facingAt(meadow, 10, 1, LANDSCAPE)).toBe('right');
    expect(facingAt(meadow, 10, 1, PORTRAIT)).toBe('down');
  });
});

describe('the lift is toward the top of the screen', () => {
  it('a touch drag aims DRAG_LIFT px above the finger in both layouts', () => {
    for (const layout of [LANDSCAPE, PORTRAIT]) {
      for (const cell of [{ col: 5, row: 3 }, { col: 20, row: 12 }]) {
        const c = layout.cellCenter(cell);
        expect(dragTargetCell(c.x, c.y + DRAG_LIFT, true, layout)).toEqual(cell);
        expect(dragTargetCell(c.x, c.y, false, layout)).toEqual(cell);
      }
    }
  });

  it('a mortar arc rises up the screen at its middle', () => {
    for (const layout of [LANDSCAPE, PORTRAIT]) {
      const a = arcPosition({ x: 100, y: 100 }, { x: 300, y: 260 }, 0.5, 40, layout.up);
      const top = layout.toScreen({ x: a.x, y: a.y });
      const ground = layout.toScreen({ x: a.groundX, y: a.groundY });
      expect(top.x).toBeCloseTo(ground.x, 9);
      expect(ground.y - top.y).toBeCloseTo(40, 9);
    }
  });
});

describe('portrait tower panel', () => {
  const { box } = panelGeometry(PORTRAIT);

  it('is 306 x 256 with thumb-sized buttons', () => {
    expect(box).toEqual({ width: 306, height: 256 });
    expect(panelGeometry(LANDSCAPE).box).toEqual(stackBox({ buttonW: 156, buttonH: 42, close: 42 }, 3, 20, true));
  });

  it('opens inside the map, off the tower, for every buildable cell of every map', () => {
    for (const id of MAP_IDS) {
      const map = MAPS[id];
      for (const cell of allCells) {
        if (!isBuildableTerrain(cell, map)) continue;
        const c = PORTRAIT.cellCenter(cell);
        const p = placeBeside(c, box.width, box.height, map, PORTRAIT);
        const panel = { x: p.x, y: p.y, width: box.width, height: box.height };
        expect(inside(panel, PORTRAIT.map), `${id} ${cell.col},${cell.row}`).toBe(true);
        expect(overlaps(panel, PORTRAIT.cellRect(cell)), `${id} ${cell.col},${cell.row}`).toBe(false);
      }
    }
  });
});

describe('portrait controls and title arithmetic', () => {
  const canvas = { x: 0, y: 0, width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT };
  const controls = [...portraitBarRects(), ...Object.values(portraitRow2())];
  /** CSS px per canvas px on a 390 x 763 phone (standalone, inside the safe areas). */
  const phone = Math.min(390 / PORTRAIT_WIDTH, 763 / PORTRAIT_HEIGHT);

  it('fits a 390 x 763 phone with 44 CSS px buttons and 11 CSS px text', () => {
    expect([PORTRAIT_WIDTH, PORTRAIT_HEIGHT]).toEqual([480, 1194]);
    expect(phone * PORTRAIT_MIN_FONT).toBeGreaterThanOrEqual(11);
    for (const r of controls) {
      expect(r.width * phone).toBeGreaterThanOrEqual(44);
      expect(r.height * phone).toBeGreaterThanOrEqual(44);
    }
    expect(PORTRAIT_STACK.buttonH * phone).toBeGreaterThanOrEqual(44);
    expect(PORTRAIT_STACK.close * phone).toBeGreaterThanOrEqual(44);
  });

  it('preserves a 44 CSS px pause target with the phone browser bars showing', () => {
    const { pause } = portraitRow2();
    expect(Math.min(pause.width, pause.height) * 664 / PORTRAIT_HEIGHT).toBeGreaterThanOrEqual(44);
  });

  it('keeps the controls inside the canvas, under the map and apart', () => {
    controls.forEach((r, i) => {
      expect(inside(r, { ...canvas, width: PORTRAIT_ROW_WIDTH })).toBe(true);
      expect(r.y).toBeGreaterThanOrEqual(PORTRAIT.map.y + PORTRAIT.map.height);
      controls.slice(i + 1).forEach((q) => expect(overlaps(r, q)).toBe(false));
    });
  });

  it('lays the title buttons inside 480 px, at least as large as the controls, apart', () => {
    const t = titleRects(PORTRAIT_TITLE, PORTRAIT_WIDTH / 2);
    const all = [...t.levels, ...t.maps, t.play];
    all.forEach((r, i) => {
      expect(inside(r, canvas)).toBe(true);
      expect(r.height).toBeGreaterThanOrEqual(70);
      expect(r.width).toBeGreaterThanOrEqual(75);
      all.slice(i + 1).forEach((q) => expect(overlaps(r, q)).toBe(false));
    });
  });
});

describe('the lift on screen (32b follow-up)', () => {
  it('is DRAG_LIFT canvas px in landscape at any fit, and LIFT_CSS CSS px in portrait', () => {
    expect(liftPx(LANDSCAPE, 1)).toBe(DRAG_LIFT);
    expect(liftPx(LANDSCAPE, 960 / 1024)).toBe(DRAG_LIFT); // the tablet keeps its 51.2 page px
    const phone = PORTRAIT_HEIGHT / 763; // canvas px per CSS px on a 390 x 763 phone
    expect(liftPx(PORTRAIT, phone)).toBe(75);
    expect(liftPx(PORTRAIT, phone) / phone).toBeCloseTo(LIFT_CSS, 0);
  });

  it('reaches the top and bottom screen rows of the turned map with the bigger lift', () => {
    const lift = liftPx(PORTRAIT, PORTRAIT_HEIGHT / 664); // the largest: Safari with its bars
    for (const cell of [{ col: 0, row: 7 }, { col: 29, row: 7 }]) {
      const c = PORTRAIT.cellCenter(cell);
      expect(dragTargetCell(c.x, c.y + lift, true, PORTRAIT, lift)).toEqual(cell);
    }
  });
});

describe('the aim instruction in the portrait strip (32b follow-up)', () => {
  it('keeps the main line and the hint sentences that fit one 18 px line', () => {
    expect(STRIP_LINE_CHARS).toBe(43);
    const touch = stripAimText(aimBannerText('keg', true));
    expect(touch).toBe('Tap the trail to throw the Powder Keg\nOr hold to aim and lift to let go.');
    const mouse = stripAimText(aimBannerText('fireArrows', false));
    expect(mouse).toBe('Click the trail to shoot the Fire Arrows\nEsc or Special again cancels.');
    for (const type of ['keg', 'tarBarrel', 'fireArrows'] as const)
      for (const t of [true, false]) for (const line of stripAimText(aimBannerText(type, t)).split('\n')) expect(line.length).toBeLessThanOrEqual(STRIP_LINE_CHARS);
  });
});
