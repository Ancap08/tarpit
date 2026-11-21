// Static map: grass, the dirt path, spawn and exit markers, build spots.
// Drawn once into its own Graphics object.

import type Phaser from 'phaser';
import { MAP } from '../../sim';
import { COLORS } from '../palette';

export const PATH_WIDTH = 40;
export const SPOT_RADIUS = 18;

/** Fill a thick polyline with round joins: a rectangle per segment plus a disc per waypoint. */
function thickPath(g: Phaser.GameObjects.Graphics, width: number, color: number): void {
  const half = width / 2;
  const pts = MAP.path;
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

function spawnMarker(g: Phaser.GameObjects.Graphics): void {
  const s = MAP.path[0];
  // A dark cave mouth half off the left edge.
  g.fillStyle(COLORS.spawnRim, 1);
  g.fillCircle(s.x, s.y, 30);
  g.fillStyle(COLORS.spawn, 1);
  g.fillCircle(s.x, s.y, 23);
}

function exitCottage(g: Phaser.GameObjects.Graphics): void {
  const end = MAP.path[MAP.path.length - 1];
  // A small cottage just above the path's last stretch, near the right edge.
  const cx = end.x - 34;
  const base = end.y - PATH_WIDTH / 2 - 4;
  const w = 28;
  const h = 20;
  g.fillStyle(COLORS.cottageWall, 1);
  g.fillRect(cx - w / 2, base - h, w, h);
  g.fillStyle(COLORS.cottageRoof, 1);
  g.fillTriangle(cx - w / 2 - 4, base - h, cx + w / 2 + 4, base - h, cx, base - h - 16);
  g.fillStyle(COLORS.cottageDoor, 1);
  g.fillRect(cx - 4, base - 11, 8, 11);
}

export function drawMap(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(COLORS.grass, 1);
  g.fillRect(0, 0, MAP.width, MAP.height);

  thickPath(g, PATH_WIDTH + 4, COLORS.pathEdge);
  thickPath(g, PATH_WIDTH, COLORS.path);
  spawnMarker(g);
  exitCottage(g);

  g.lineStyle(1.5, COLORS.spotOutline, 0.55);
  for (const spot of MAP.buildSpots) g.strokeCircle(spot.x, spot.y, SPOT_RADIUS);
}
