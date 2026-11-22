// Static map: grass, the dirt path, spawn and exit markers, drawn from the
// game's map data (milestone 27). No grid lines: the build grid shows only
// through the placement highlight. Drawn once into its own Graphics object.

import type Phaser from 'phaser';
import type { MapDef, Point, Rect } from '../../sim';
import { COLORS } from '../palette';

export const PATH_WIDTH = 40;

/** Fill a thick polyline with round joins: a rectangle per segment plus a disc per waypoint. */
function thickPath(g: Phaser.GameObjects.Graphics, pts: readonly Point[], width: number, color: number): void {
  const half = width / 2;
  g.fillStyle(color, 1);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    // The v1 path is axis-aligned, so each segment is an axis-aligned rectangle.
    const x = Math.min(a.x, b.x) - (a.y === b.y ? 0 : half);
    const y = Math.min(a.y, b.y) - (a.x === b.x ? 0 : half);
    const w = Math.abs(b.x - a.x) + (a.y === b.y ? 0 : width);
    const h = Math.abs(b.y - a.y) + (a.x === b.x ? 0 : width);
    g.fillRect(x, y, w, h);
  }
  for (let i = 1; i < pts.length - 1; i++) g.fillCircle(pts[i].x, pts[i].y, half);
}

function spawnMarker(g: Phaser.GameObjects.Graphics, s: Point): void {
  // A dark cave mouth half off the left edge.
  g.fillStyle(COLORS.spawnRim, 1);
  g.fillCircle(s.x, s.y, 30);
  g.fillStyle(COLORS.spawn, 1);
  g.fillCircle(s.x, s.y, 23);
  // A lighter inner arc on the visible half: the cave's back wall, for depth.
  g.lineStyle(3, COLORS.caveInner, 1);
  g.beginPath();
  g.arc(s.x, s.y, 14, -Math.PI * 0.4, Math.PI * 0.4);
  g.strokePath();
}

function exitCottage(g: Phaser.GameObjects.Graphics, box: Rect): void {
  // A small cottage just above the path's last stretch, near the right edge,
  // drawn inside the sim's landmark box (map.ts cottageFor; no cell
  // overlapping it is buildable).
  const cx = box.x + box.width / 2;
  const base = box.y + box.height;
  const w = 28;
  const h = 20;
  // Chimney first, so the roof covers its foot.
  g.fillStyle(COLORS.cottageChimney, 1);
  g.fillRect(cx + 5, base - h - 17, 5, 11);
  g.fillStyle(COLORS.cottageWall, 1);
  g.fillRect(cx - w / 2, base - h, w, h);
  g.fillStyle(COLORS.cottageRoof, 1);
  g.fillTriangle(cx - w / 2 - 4, base - h, cx + w / 2 + 4, base - h, cx, base - h - 16);
  g.fillStyle(COLORS.cottageDoor, 1);
  g.fillRect(cx - 4, base - 11, 8, 11);
}

/**
 * A water box (milestone 27): a flat blue strip inside the box with a darker
 * bank edge. When the box runs off the bottom of the map its top end is a
 * rounded pool (a half disc as wide as the strip), so the drawn water stays
 * inside the box, which is what the build rule uses.
 */
function water(g: Phaser.GameObjects.Graphics, box: Rect, mapHeight: number): void {
  const bank = 3;
  const pool = box.y + box.height >= mapHeight;
  const r = box.width / 2;
  const cx = box.x + r;
  const shape = (inset: number, color: number) => {
    g.fillStyle(color, 1);
    const top = pool ? box.y + r : box.y + inset;
    g.fillRect(box.x + inset, top, box.width - 2 * inset, box.y + box.height - top);
    if (pool) g.fillCircle(cx, box.y + r, r - inset);
  };
  shape(0, COLORS.waterBank);
  shape(bank, COLORS.water);
  // Ripples: short pale strokes scattered down the strip in a fixed pattern.
  const offsets = [-40, 10, -18, 28, -34, 2];
  g.lineStyle(2, COLORS.waterRipple, 0.7);
  for (let i = 0, y = box.y + (pool ? r * 0.6 : 20); y + 8 < box.y + box.height; i++, y += 38) {
    const x = cx + offsets[i % offsets.length];
    g.lineBetween(x, y, x + 16, y);
  }
}

/**
 * A small picture of `map` in the box (x, y, w, h), for the title menu's map
 * row (milestone 27): grass, the path as a thick line, the water, the cave
 * mouth and a dot for the cottage, all scaled from the map data.
 */
export function drawMapThumbnail(g: Phaser.GameObjects.Graphics, map: MapDef, x: number, y: number, w: number, h: number): void {
  const s = Math.min(w / map.width, h / map.height);
  const px = (p: Point) => ({ x: x + p.x * s, y: y + p.y * s });
  g.fillStyle(COLORS.grass, 1);
  g.fillRect(x, y, map.width * s, map.height * s);
  for (const box of map.water ?? []) {
    const top = px({ x: box.x, y: box.y });
    const r = (box.width * s) / 2;
    const pool = box.y + box.height >= map.height;
    g.fillStyle(COLORS.water, 1);
    g.fillRect(top.x, pool ? top.y + r : top.y, box.width * s, box.height * s - (pool ? r : 0));
    if (pool) g.fillCircle(top.x + r, top.y + r, r);
  }
  for (const [width, color] of [
    [(PATH_WIDTH + 4) * s, COLORS.pathEdge],
    [PATH_WIDTH * s, COLORS.path],
  ] as const) {
    g.lineStyle(width, color, 1);
    g.beginPath();
    const first = px(map.path[0]);
    g.moveTo(first.x, first.y);
    for (const p of map.path.slice(1)) {
      const q = px(p);
      g.lineTo(q.x, q.y);
    }
    g.strokePath();
    // Round the corners like the full-size path.
    g.fillStyle(color, 1);
    for (const p of map.path.slice(1, -1)) {
      const q = px(p);
      g.fillCircle(q.x, q.y, width / 2);
    }
  }
  // The cave mouth as a dot just inside the picture (the full-size cave hangs off the edge).
  const cave = px(map.path[0]);
  g.fillStyle(COLORS.spawn, 1);
  g.fillCircle(cave.x + 2, cave.y, 2.5);
  for (const box of map.landmarks ?? []) {
    const c = px({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    g.fillStyle(COLORS.cottageRoof, 1);
    g.fillRect(c.x - 2, c.y - 2, 4, 4);
  }
}

export function drawMap(g: Phaser.GameObjects.Graphics, map: MapDef): void {
  g.fillStyle(COLORS.grass, 1);
  g.fillRect(0, 0, map.width, map.height);

  for (const box of map.water ?? []) water(g, box, map.height);
  thickPath(g, map.path, PATH_WIDTH + 4, COLORS.pathEdge);
  thickPath(g, map.path, PATH_WIDTH, COLORS.path);
  spawnMarker(g, map.path[0]);
  for (const box of map.landmarks ?? []) exitCottage(g, box);
}
