// Verifier (milestone 12): an independent recomputation of TRAIL_CELL_ORDER.
// Own polyline walk, own distance-to-segment, own buildable rule; only the
// path waypoints and the cottage box are copied from docs/DESIGN.md.
import { describe, expect, it } from 'vitest';
import { MAPS } from './map';
import { buildableCells } from './grid';
import { TRAIL_CELL_ORDER } from './headless';

const PATH: [number, number][] = [
  [0, 240], [160, 240], [160, 96], [420, 96], [420, 384], [680, 384], [680, 192], [960, 192],
];

function segDist(px: number, py: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
const pathDist = (x: number, y: number) => Math.min(...PATH.slice(1).map((p, i) => segDist(x, y, PATH[i], p)));

function pointAt(d: number): [number, number] {
  let left = d;
  for (let i = 1; i < PATH.length; i++) {
    const len = Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]);
    if (left <= len) {
      const f = left / len;
      return [PATH[i - 1][0] + f * (PATH[i][0] - PATH[i - 1][0]), PATH[i - 1][1] + f * (PATH[i][1] - PATH[i - 1][1])];
    }
    left -= len;
  }
  return PATH[PATH.length - 1];
}

const total = PATH.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - PATH[i][0], p[1] - PATH[i][1]), 0);

// Own buildable rule: centre >= 36 px from the path, 32 px square clear of the cottage box.
function buildable(col: number, row: number): boolean {
  const x = col * 32 + 16;
  const y = row * 32 + 16;
  if (pathDist(x, y) < 36) return false;
  const overlapsCottage = col * 32 < 944 && col * 32 + 32 > 908 && row * 32 < 168 && row * 32 + 32 > 131;
  return !overlapsCottage;
}

function recompute(): { cells: [number, number][]; steps: number; found: number } {
  const used = new Set<number>();
  const cells: [number, number][] = [];
  let steps = 0;
  for (let d = 96; d <= total + 1e-9; d += 96) {
    steps++;
    const [px, py] = pointAt(d);
    let best: { key: number; dist: number } | undefined;
    for (let key = 0; key < 450; key++) {
      const col = key % 30;
      const row = Math.floor(key / 30);
      if (!buildable(col, row) || used.has(key)) continue;
      const dist = Math.hypot(col * 32 + 16 - px, row * 32 + 16 - py);
      if (dist <= 72 && (!best || dist < best.dist)) best = { key, dist }; // ascending key: ties keep lower
    }
    if (best) {
      used.add(best.key);
      cells.push([best.key % 30, Math.floor(best.key / 30)]);
    }
  }
  return { cells, steps, found: cells.length };
}

describe('trail verifier: TRAIL_CELL_ORDER recomputed independently', () => {
  const mine = recompute();

  it('my buildable rule agrees with the sim mask on all 450 cells (344 buildable)', () => {
    const mask = buildableCells(MAPS.meadow);
    let n = 0;
    for (let key = 0; key < 450; key++) {
      expect(mask[key]).toBe(buildable(key % 30, Math.floor(key / 30)));
      if (mask[key]) n++;
    }
    expect(n).toBe(344);
  });

  it('path is 1584 px: 16 step points, every one found a cell', () => {
    expect(total).toBe(1584);
    expect(mine.steps).toBe(16);
    expect(mine.found).toBe(16);
    expect(TRAIL_CELL_ORDER).toHaveLength(16);
  });

  it('equals the sim order cell for cell', () => {
    expect(TRAIL_CELL_ORDER.map((c) => [c.col, c.row])).toEqual(mine.cells);
  });

  it('first six cells are (2,5) (6,6) (3,3) (7,1) (10,1) (14,3)', () => {
    expect(mine.cells.slice(0, 6)).toEqual([[2, 5], [6, 6], [3, 3], [7, 1], [10, 1], [14, 3]]);
    expect(TRAIL_CELL_ORDER.slice(0, 6).map((c) => [c.col, c.row])).toEqual(mine.cells.slice(0, 6));
  });

  it('no cell in column 0 or 1 unless it was the only candidate for its step', () => {
    const used = new Set<number>();
    let d = 96;
    for (const [col, row] of mine.cells) {
      const [px, py] = pointAt(d);
      d += 96;
      const cands: number[] = [];
      for (let key = 0; key < 450; key++) {
        if (buildable(key % 30, Math.floor(key / 30)) && !used.has(key) && Math.hypot((key % 30) * 32 + 16 - px, Math.floor(key / 30) * 32 + 16 - py) <= 72) cands.push(key);
      }
      used.add(row * 30 + col);
      if (col <= 1) expect(cands).toEqual([row * 30 + col]);
    }
    expect(mine.cells.filter(([col]) => col <= 1)).toEqual([]);
  });
});
