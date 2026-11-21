import { describe, expect, it } from 'vitest';
import { buildableCells, buildTower, cellCenter, cellFromKey, createGame, isBuildableTerrain } from '../sim';
import { labelAbove, LABEL_HEIGHT, LABEL_OFFSET_Y } from './draw/labels';
import { cellAt, cellRect, classifyClick, onPath, pathCover, placeBeside, type Rect } from './input';

describe('cellAt', () => {
  it('maps a point to its 32 px cell; edges belong to the cell right of or below them', () => {
    expect(cellAt(0, 0)).toEqual({ col: 0, row: 0 });
    expect(cellAt(31.9, 31.9)).toEqual({ col: 0, row: 0 });
    expect(cellAt(32, 32)).toEqual({ col: 1, row: 1 });
    expect(cellAt(240, 176)).toEqual({ col: 7, row: 5 });
    expect(cellAt(959.9, 479.9)).toEqual({ col: 29, row: 14 });
  });

  it('is null outside the map, the HUD included', () => {
    expect(cellAt(960, 100)).toBeNull();
    expect(cellAt(100, 480)).toBeNull();
    expect(cellAt(480, 550)).toBeNull();
    expect(cellAt(-1, 10)).toBeNull();
  });

  it('cellRect is the cell square; its centre is the cell centre', () => {
    expect(cellRect({ col: 7, row: 5 })).toEqual({ x: 224, y: 160, width: 32, height: 32 });
    for (const key of [0, 167, 449]) {
      const c = cellFromKey(key);
      const r = cellRect(c);
      expect({ x: r.x + 16, y: r.y + 16 }).toEqual(cellCenter(c));
    }
  });
});

describe('classifyClick', () => {
  const state = createGame();
  state.gold = 1000;
  buildTower(state, { col: 7, row: 5 }, 'musketeer');
  const panel = { x: 156, y: 216, width: 168, height: 76 };

  it('a click inside the open panel belongs to the panel, even over a cell', () => {
    expect(classifyClick(200, 240, panel, state)).toEqual({ kind: 'ui' });
  });

  it('on the map: a tower, a buildable cell, or a blocked (path) cell', () => {
    expect(classifyClick(240, 176, null, state)).toEqual({ kind: 'tower', cell: { col: 7, row: 5 } });
    expect(classifyClick(230, 165, panel, state)).toEqual({ kind: 'tower', cell: { col: 7, row: 5 } });
    expect(classifyClick(80, 176, null, state)).toEqual({ kind: 'buildable', cell: { col: 2, row: 5 } });
    expect(classifyClick(80, 240, null, state)).toEqual({ kind: 'blocked', cell: { col: 2, row: 7 } });
  });

  it('below the map (the HUD) is outside', () => {
    expect(classifyClick(795, 505, null, state)).toEqual({ kind: 'outside' });
    expect(classifyClick(89, 555, panel, state)).toEqual({ kind: 'outside' });
  });
});

describe('placeBeside', () => {
  const PANEL = { w: 168, h: 76 };
  const at = (col: number, row: number) => placeBeside(cellCenter({ col, row }), PANEL.w, PANEL.h);

  it('takes the side over the least path; ties keep right, left, below, above', () => {
    // (18,9): right covers the x 680 run, left and below the y 384 run; above covers the least.
    expect(at(18, 9)).toEqual({ x: 508, y: 188 });
    // (29,14) at the bottom-right corner: the right and below sides clamp over the tower, and
    // the left side covers its label (above the tower and shifted left inside the map), so above.
    expect(at(29, 14)).toEqual({ x: 788, y: 348 });
    expect(pathCover(788, 348, PANEL.w, PANEL.h)).toBe(0);
  });

  it('may cover other towers (no spot rule any more)', () => {
    // (7,5)'s panel goes below it (clear of its label), over cells (5..9, 7..9) where towers may stand.
    expect(at(7, 5)).toEqual({ x: 156, y: 216 });
  });

  it('pathCover is 0 on open grass, 1 inside the path strip', () => {
    expect(onPath(160, 240)).toBe(true);
    expect(onPath(240, 176)).toBe(false);
    expect(pathCover(800, 300, 100, 100)).toBe(0);
    expect(pathCover(430, 100, 10, 200)).toBe(1); // inside the x 400..440 vertical strip
  });

  const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  it('for every buildable cell: inside the map, off the HUD, and never over its own tower or label', () => {
    buildableCells().forEach((ok, key) => {
      if (!ok) return;
      const c = cellFromKey(key);
      expect(isBuildableTerrain(c)).toBe(true);
      const p = at(c.col, c.row);
      const where = `cell (${c.col},${c.row})`;
      expect(p.x, where).toBeGreaterThanOrEqual(0);
      expect(p.x + PANEL.w, where).toBeLessThanOrEqual(960);
      expect(p.y, where).toBeGreaterThanOrEqual(0);
      expect(p.y + PANEL.h, where).toBeLessThanOrEqual(480);
      const box = { x: p.x, y: p.y, width: PANEL.w, height: PANEL.h };
      expect(overlaps(box, cellRect(c)), where).toBe(false);
      // The widest label, "Cannon+": 7 bold 12 px Courier characters (7.2 px) plus 3 px padding a side.
      const centre = cellCenter(c);
      const w = 7 * 7.2 + 6;
      const lx = Math.min(960 - w / 2, Math.max(w / 2, centre.x)); // shifted inside the map at the edges
      const top = labelAbove(centre.y) ? centre.y - LABEL_OFFSET_Y - LABEL_HEIGHT : centre.y + LABEL_OFFSET_Y;
      expect(overlaps(box, { x: lx - w / 2, y: top, width: w, height: LABEL_HEIGHT }), `${where} label`).toBe(false);
    });
  });
});
