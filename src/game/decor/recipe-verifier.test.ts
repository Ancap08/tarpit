// Milestone 34 verifier: the recipe checked with the verifier's own geometry
// (a plain point-to-segment distance, rect gaps, own layout rects), not the
// sim's distanceToPath or the recipe's canGrow.

import { describe, expect, it } from 'vitest';
import { CELL, GRID_COLS, GRID_ROWS, isBuildableTerrain, MAP_IDS, MAPS, type MapDef, type Rect } from '../../sim';
import { BOSS_BAR, BOSS_PILL, bossBarGeometry } from '../ui/bossBar';
import { LANDSCAPE, PORTRAIT } from '../layout';
import { butterflyAt, birdAt } from './motion';
import { decorFor } from './recipe';

const TRAIL_HALF = 20;

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function trailDist(map: MapDef, x: number, y: number): number {
  let best = Infinity;
  for (let i = 1; i < map.path.length; i++) best = Math.min(best, segDist(x, y, map.path[i - 1].x, map.path[i - 1].y, map.path[i].x, map.path[i].y));
  return best;
}
/** Chebyshev-style gap between two rects (0 when they touch or overlap). */
function gap(a: Rect, b: Rect): number {
  const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
  const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
  return Math.max(dx, dy);
}
function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
function inRect(x: number, y: number, r: Rect, m = 0): boolean {
  return x >= r.x - m && x <= r.x + r.width + m && y >= r.y - m && y <= r.y + r.height + m;
}

/** World rects (the 960 x 480 map) of what stays over the map: the boss bar with its name pill and the aim banner. */
function overlays(): { name: string; rect: Rect }[] {
  const out: { name: string; rect: Rect }[] = [];
  // Landscape: the boss bar and its pill (screen = world), and the aim banner (18 px text; the touch
  // hint line is the widest, about 440 px with its 32 px padding): y 8..54, centred on x 480.
  out.push({ name: 'boss bar landscape', rect: { x: BOSS_BAR.x, y: BOSS_PILL.y, width: BOSS_BAR.width, height: BOSS_BAR.y + BOSS_BAR.height - BOSS_PILL.y } });
  // The aim banner at its real widest (477 px, x 242..719; also checked on its own below).
  out.push({ name: 'aim banner landscape (widest)', rect: { x: 242, y: 8, width: 477, height: 46 } });
  // Portrait: the boss bar in screen px, back to world px through the layout.
  const geo = bossBarGeometry(PORTRAIT);
  const a = PORTRAIT.toWorld({ x: geo.bar.x, y: geo.pill.y });
  const b = PORTRAIT.toWorld({ x: geo.bar.x + geo.bar.width, y: geo.bar.y + geo.bar.height });
  out.push({ name: 'boss bar portrait', rect: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) } });
  return out;
}

describe('verifier: recipe geometry, own maths', () => {
  const rects = overlays();
  it('the overlay rects are sane', () => {
    expect(rects[2].rect.x).toBeLessThan(10);
    expect(rects[2].rect.width).toBeLessThan(70);
    expect(LANDSCAPE.kind).toBe('landscape');
  });

  for (const id of MAP_IDS) {
    const map = MAPS[id];
    const d = decorFor(map);
    describe(id, () => {
      it('counts are in range', () => {
        const trees = d.growth.filter((g) => g.kind === 'tree').length;
        const bushes = d.growth.filter((g) => g.kind === 'bush').length;
        expect(trees).toBeGreaterThanOrEqual(8);
        expect(trees).toBeLessThanOrEqual(14);
        expect(bushes).toBeGreaterThanOrEqual(8);
        expect(bushes).toBeLessThanOrEqual(14);
        expect(d.swayTufts.length).toBeLessThanOrEqual(12);
      });

      it('no growth within 2 cells of the trail centreline (centre or canopy-adjusted), near water or cottage, off the map, on a blocked cell', () => {
        let minCentre = Infinity;
        let minEdge = Infinity;
        for (const g of d.growth) {
          const cx = g.cell.col * CELL + CELL / 2;
          const cy = g.cell.row * CELL + CELL / 2;
          expect(g.cell.col).toBeGreaterThanOrEqual(0);
          expect(g.cell.col).toBeLessThan(GRID_COLS);
          expect(g.cell.row).toBeGreaterThanOrEqual(0);
          expect(g.cell.row).toBeLessThan(GRID_ROWS);
          expect(isBuildableTerrain(g.cell, map)).toBe(true);
          // own cell centre distance, and the jittered growth centre's
          expect(trailDist(map, cx, cy)).toBeGreaterThanOrEqual(2 * CELL);
          minCentre = Math.min(minCentre, trailDist(map, g.x, g.y));
          minEdge = Math.min(minEdge, trailDist(map, g.x, g.y) - g.r - TRAIL_HALF);
          // the whole canopy is inside the map and does not poke into the trail strip
          expect(g.x - g.r).toBeGreaterThan(-2);
          expect(g.y - g.r).toBeGreaterThan(-2);
          expect(g.x + g.r).toBeLessThan(map.width + 2);
          expect(g.y + g.r).toBeLessThan(map.height + 2);
          const cell: Rect = { x: g.cell.col * CELL, y: g.cell.row * CELL, width: CELL, height: CELL };
          for (const box of [...(map.water ?? []), ...(map.landmarks ?? [])]) {
            expect(gap(cell, box)).toBeGreaterThanOrEqual(CELL);
            expect(inRect(g.x, g.y, box, g.r)).toBe(false);
          }
          for (const o of rects) expect(overlap({ x: g.x - g.r, y: g.y - g.r, width: 2 * g.r, height: 2 * g.r }, o.rect), `${o.name}: growth ${g.id}`).toBe(false);
        }
        console.log(`${id}: smallest growth-centre to trail centreline ${minCentre.toFixed(1)} px; canopy edge to trail strip edge ${minEdge.toFixed(1)} px`);
        expect(minEdge).toBeGreaterThan(20);
      });

      it('the list is identical across calls and has no shared cell, ids are the index', () => {
        expect(JSON.stringify(decorFor(map))).toBe(JSON.stringify(d));
        const cells = new Set(d.growth.map((g) => `${g.cell.col},${g.cell.row}`));
        expect(cells.size).toBe(d.growth.length);
        d.growth.forEach((g, i) => expect(g.id).toBe(i));
        // no two canopies overlap
        for (let i = 0; i < d.growth.length; i++) for (let j = i + 1; j < d.growth.length; j++) expect(Math.hypot(d.growth[i].x - d.growth[j].x, d.growth[i].y - d.growth[j].y)).toBeGreaterThan(d.growth[i].r + d.growth[j].r - 1);
      });

      it('flowers, stones and tufts never touch the trail strip, water, cottage, or cave', () => {
        const cave = map.path[0];
        const items = [...d.flowers.map((p) => ({ k: 'flower', ...p })), ...d.stones.map((p) => ({ k: 'stone', ...p })), ...[...d.tufts, ...d.swayTufts].map((p) => ({ k: 'tuft', x: p.x, y: p.y, r: p.len }))];
        for (const it of items) {
          expect(trailDist(map, it.x, it.y) - it.r, `${it.k} at ${it.x.toFixed(0)},${it.y.toFixed(0)}`).toBeGreaterThanOrEqual(TRAIL_HALF);
          expect(it.x).toBeGreaterThanOrEqual(0);
          expect(it.y).toBeGreaterThanOrEqual(0);
          expect(it.x).toBeLessThanOrEqual(map.width);
          expect(it.y).toBeLessThanOrEqual(map.height);
          for (const box of [...(map.water ?? []), ...(map.landmarks ?? [])]) expect(inRect(it.x, it.y, box, it.r)).toBe(false);
          expect(Math.hypot(it.x - cave.x, it.y - cave.y)).toBeGreaterThan(30);
        }
      });

      it('trail details (pebbles, spots, ruts) stay on the trail strip; spots may reach a little past it', () => {
        let spotOver = 0;
        for (const p of d.pebbles) expect(trailDist(map, p.x, p.y) + p.r).toBeLessThanOrEqual(TRAIL_HALF + 0.5);
        for (const s of d.trailSpots) spotOver = Math.max(spotOver, trailDist(map, s.x, s.y) + s.r - TRAIL_HALF);
        for (const r of d.ruts) for (const e of [r.a, r.b]) expect(trailDist(map, e.x, e.y)).toBeLessThan(12);
        console.log(`${id}: trail spots reach at most ${spotOver.toFixed(1)} px past the strip edge`);
        expect(spotOver).toBeLessThan(6);
        // a stone is 2.5..5 px: pebbles on the trail are 1.1..2.2, so a stone never sits on the trail.
        expect(Math.max(...d.pebbles.map((p) => p.r))).toBeLessThan(Math.min(...d.stones.map((s) => s.r)));
      });

      it('the butterfly stays two cells or more from the trail, the bird is high (over the map, drawn under enemies)', () => {
        let min = Infinity;
        for (let t = 0; t < 120000; t += 100) {
          const f = butterflyAt(map, d.flowerBeds, t);
          if (f) min = Math.min(min, trailDist(map, f.x, f.y));
        }
        console.log(`${id}: butterfly closest to the trail ${min.toFixed(1)} px`);
        expect(min).toBeGreaterThan(CELL * 1.5);
        for (let t = 0; t < 60000; t += 250) {
          const b = birdAt(map, t);
          if (b) expect(Number.isFinite(b.x + b.y)).toBe(true);
        }
      });
    });
  }

  // Measured in the browser (e2e): the aim banner's widest text is the touch hint (445 px at 13 px bold) and
  // the main line "Click the trail to shoot the Fire Arrows" (433 px at 18 px bold); with 32 px of padding the box
  // is up to 477 px wide, centred on x 480 (x 242..719), y 8..54. DECOR_KEEP_OUT covered only x 296..664 before follow-up 2.
  // Switchback tree 3 (238, 14) and Riverbend bush 17 (242, 46) reach under it. Harmless to play (the banner is
  // drawn over them and is on screen only while aiming) but it breaks the stated rule "not under the aim banner".
  it('no growth reaches under the widest aim banner (x 242..719; verifier finding, fixed in follow-up 2)', () => {
    const banner: Rect = { x: 242, y: 8, width: 477, height: 46 };
    for (const id of MAP_IDS) for (const g of decorFor(MAPS[id]).growth) expect(overlap({ x: g.x - g.r, y: g.y - g.r, width: 2 * g.r, height: 2 * g.r }, banner), `${id} ${g.kind} ${g.id}`).toBe(false);
  });

  it('the generator reads no non-deterministic input', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(__dirname);
    for (const f of ['recipe.ts', 'motion.ts']) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|Date\b|performance\.now|crypto|Math\.random|process\.|window\.|localStorage/);
    }
  });
});
