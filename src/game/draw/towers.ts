// Towers: Musketeer blue square with a barrel, Cannon grey circle with a thick
// barrel, Tar Pit black blob. Upgraded towers get a gold ring.

import type Phaser from 'phaser';
import { MAP, type GameState, type Point } from '../../sim';
import { COLORS } from '../palette';

/** Barrel length from the tower centre; shot tracers start at the muzzle. */
export const BARREL_LENGTH = 22;

/** Closest point on the path to `p`; used as a barrel's resting direction. */
function nearestPathPoint(p: Point): Point {
  let best: Point = MAP.path[0];
  let bestD = Infinity;
  for (let i = 1; i < MAP.path.length; i++) {
    const a = MAP.path[i - 1];
    const b = MAP.path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/** Barrel angle per spot, in radians. Starts aimed at the path; follows each shot. */
export class Aim {
  private readonly angles = new Map<number, number>();

  angle(spotId: number): number {
    const known = this.angles.get(spotId);
    if (known !== undefined) return known;
    const spot = MAP.buildSpots[spotId];
    const q = nearestPathPoint(spot);
    return Math.atan2(q.y - spot.y, q.x - spot.x);
  }

  pointAt(spotId: number, target: Point): void {
    const spot = MAP.buildSpots[spotId];
    this.angles.set(spotId, Math.atan2(target.y - spot.y, target.x - spot.x));
  }

  /** Forget spots that no longer hold a tower, so a new tower starts fresh. */
  prune(state: GameState): void {
    for (const id of this.angles.keys()) {
      if (!state.towers.some((t) => t.spotId === id)) this.angles.delete(id);
    }
  }
}

function barrel(g: Phaser.GameObjects.Graphics, p: Point, angle: number, len: number, width: number, color: number): void {
  g.lineStyle(width, color, 1);
  g.lineBetween(p.x, p.y, p.x + Math.cos(angle) * len, p.y + Math.sin(angle) * len);
}

export function drawTowers(g: Phaser.GameObjects.Graphics, state: GameState, aim: Aim): void {
  for (const tower of state.towers) {
    const p = MAP.buildSpots[tower.spotId];
    const angle = aim.angle(tower.spotId);

    if (tower.upgraded) {
      g.lineStyle(2, COLORS.upgradeRing, 1);
      g.strokeCircle(p.x, p.y, 19);
    }

    switch (tower.type) {
      case 'musketeer':
        g.fillStyle(COLORS.musketeer, 1);
        g.fillRect(p.x - 13, p.y - 13, 26, 26);
        g.lineStyle(2, COLORS.musketeerEdge, 1);
        g.strokeRect(p.x - 13, p.y - 13, 26, 26);
        barrel(g, p, angle, BARREL_LENGTH, 4, COLORS.musketeerBarrel);
        break;
      case 'cannon':
        g.fillStyle(COLORS.cannon, 1);
        g.fillCircle(p.x, p.y, 14);
        g.lineStyle(2, COLORS.cannonEdge, 1);
        g.strokeCircle(p.x, p.y, 14);
        barrel(g, p, angle, BARREL_LENGTH, 7, COLORS.cannonBarrel);
        break;
      case 'tarpit':
        g.fillStyle(COLORS.tarpit, 1);
        g.fillCircle(p.x, p.y, 14);
        g.fillCircle(p.x - 8, p.y + 6, 7);
        g.fillCircle(p.x + 9, p.y + 5, 6);
        g.fillStyle(COLORS.tarpitHighlight, 0.85);
        g.fillCircle(p.x - 5, p.y - 5, 3);
        break;
    }
  }
}
