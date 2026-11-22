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

export function drawMap(g: Phaser.GameObjects.Graphics, map: MapDef): void {
  g.fillStyle(COLORS.grass, 1);
  g.fillRect(0, 0, map.width, map.height);

  thickPath(g, map.path, PATH_WIDTH + 4, COLORS.pathEdge);
  thickPath(g, map.path, PATH_WIDTH, COLORS.path);
  spawnMarker(g, map.path[0]);
  for (const box of map.landmarks ?? []) exitCottage(g, box);
}
