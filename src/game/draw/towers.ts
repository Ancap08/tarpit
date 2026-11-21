// Towers: Musketeer blue square with a barrel, Cannon grey circle with a thick
// barrel, Tar Pit dark brown tar blob with a glossy highlight, Longbow a tall
// thin green post with a bow arc on the side facing its target, Mortar a
// short wide grey tube pointing at its target with a dark mouth, Fire Pot an
// orange-red pot with a yellow flame. Upgraded towers get a gold ring.
// Labels are Text objects (labels.ts).

import type Phaser from 'phaser';
import { cellCenter, cellKey, MAP, nearestPathPoint, positionAlongPath, type Cell, type GameState, type Point, type TowerType } from '../../sim';
import { COLORS } from '../palette';

/** Barrel length from the tower centre; shot tracers start at the muzzle. */
export const BARREL_LENGTH = 22;

/** Where each tower's shot starts, in px from its centre towards the target. */
export const MUZZLE: Record<TowerType, number> = {
  musketeer: BARREL_LENGTH,
  cannon: BARREL_LENGTH,
  tarpit: BARREL_LENGTH,
  longbow: 12, // the bow arc
  mortar: 13, // the tube mouth
  firepot: 0, // the flame (straight up), so the flash starts at the pot
};

/** Mortar tube: 26 x 14, a capsule along the aim (centre line 12 px, round 7 px ends). */
const TUBE_HALF = 6;
const TUBE_R = 7;

/** Barrel angle per tower cell (keyed by cellKey), in radians. Starts aimed at the path; follows each shot. */
export class Aim {
  private readonly angles = new Map<number, number>();

  angle(cell: Cell): number {
    const known = this.angles.get(cellKey(cell));
    if (known !== undefined) return known;
    const p = cellCenter(cell);
    const q = positionAlongPath(MAP, nearestPathPoint(p).along);
    return Math.atan2(q.y - p.y, q.x - p.x);
  }

  pointAt(cell: Cell, target: Point): void {
    const p = cellCenter(cell);
    this.angles.set(cellKey(cell), Math.atan2(target.y - p.y, target.x - p.x));
  }

  /** Forget cells that no longer hold a tower, so a new tower starts fresh. */
  prune(state: GameState): void {
    for (const key of this.angles.keys()) {
      if (!state.towers.some((t) => cellKey(t.cell) === key)) this.angles.delete(key);
    }
  }
}

function barrel(g: Phaser.GameObjects.Graphics, p: Point, angle: number, len: number, width: number, color: number, alpha: number): void {
  g.lineStyle(width, color, alpha);
  g.lineBetween(p.x, p.y, p.x + Math.cos(angle) * len, p.y + Math.sin(angle) * len);
}

/**
 * One tower's shape at `p`, its barrel at `angle`. `alpha` scales every fill
 * and line (1 for a placed tower, lower for the placement ghost).
 */
export function drawTowerShape(
  g: Phaser.GameObjects.Graphics,
  type: TowerType,
  p: Point,
  angle: number,
  upgraded: boolean,
  alpha = 1,
): void {
  if (upgraded) {
    g.lineStyle(2, COLORS.upgradeRing, alpha);
    g.strokeCircle(p.x, p.y, 19);
  }

  switch (type) {
    case 'musketeer':
      g.fillStyle(COLORS.musketeer, alpha);
      g.fillRect(p.x - 13, p.y - 13, 26, 26);
      g.lineStyle(2, COLORS.musketeerEdge, alpha);
      g.strokeRect(p.x - 13, p.y - 13, 26, 26);
      barrel(g, p, angle, BARREL_LENGTH, 4, COLORS.musketeerBarrel, alpha);
      break;
    case 'cannon':
      g.fillStyle(COLORS.cannon, alpha);
      g.fillCircle(p.x, p.y, 14);
      g.lineStyle(2, COLORS.cannonEdge, alpha);
      g.strokeCircle(p.x, p.y, 14);
      barrel(g, p, angle, BARREL_LENGTH, 7, COLORS.cannonBarrel, alpha);
      break;
    case 'tarpit':
      g.fillStyle(COLORS.tarpit, alpha);
      g.fillCircle(p.x, p.y, 14);
      g.fillCircle(p.x - 8, p.y + 6, 7);
      g.fillCircle(p.x + 9, p.y + 5, 6);
      g.fillStyle(COLORS.tarpitHighlight, 0.85 * alpha);
      g.fillCircle(p.x - 5, p.y - 5, 3);
      break;
    case 'longbow': {
      g.fillStyle(COLORS.longbow, alpha);
      g.fillRect(p.x - 5, p.y - 13, 10, 26);
      g.lineStyle(1.5, COLORS.longbowEdge, alpha);
      g.strokeRect(p.x - 5, p.y - 13, 10, 26);
      // Bow: an arc of radius 12 centred on the tower, 100 degrees wide,
      // bulging towards the target, with a pale string across its ends.
      const half = (50 * Math.PI) / 180;
      const end = (a: number) => ({ x: p.x + Math.cos(a) * 12, y: p.y + Math.sin(a) * 12 });
      const a0 = end(angle - half);
      const a1 = end(angle + half);
      g.lineStyle(1, COLORS.longbowString, 0.9 * alpha);
      g.lineBetween(a0.x, a0.y, a1.x, a1.y);
      g.lineStyle(3, COLORS.longbowBow, alpha);
      g.beginPath();
      g.arc(p.x, p.y, 12, angle - half, angle + half);
      g.strokePath();
      break;
    }
    case 'mortar': {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const back = { x: p.x - dx * TUBE_HALF, y: p.y - dy * TUBE_HALF };
      const front = { x: p.x + dx * TUBE_HALF, y: p.y + dy * TUBE_HALF };
      // Edge first (1.5 px wider all round), then the body on top.
      for (const [color, r] of [
        [COLORS.mortarEdge, TUBE_R + 1.5],
        [COLORS.mortar, TUBE_R],
      ] as const) {
        g.fillStyle(color, alpha);
        g.fillCircle(back.x, back.y, r);
        g.fillCircle(front.x, front.y, r);
        g.lineStyle(r * 2, color, alpha);
        g.lineBetween(back.x, back.y, front.x, front.y);
      }
      g.fillStyle(COLORS.mortarMouth, alpha);
      g.fillCircle(front.x, front.y, 4.5);
      break;
    }
    case 'firepot':
      g.fillStyle(COLORS.firepot, alpha);
      g.fillCircle(p.x, p.y, 13);
      g.lineStyle(2, COLORS.firepotEdge, alpha);
      g.strokeCircle(p.x, p.y, 13);
      // Flame: a yellow triangle standing on the pot's centre, its tip just above the rim.
      g.fillStyle(COLORS.firepotFlame, alpha);
      g.fillTriangle(p.x - 6, p.y + 1, p.x + 6, p.y + 1, p.x, p.y - 16);
      break;
  }
}

export function drawTowers(g: Phaser.GameObjects.Graphics, state: GameState, aim: Aim): void {
  for (const tower of state.towers) {
    drawTowerShape(g, tower.type, cellCenter(tower.cell), aim.angle(tower.cell), tower.upgraded);
  }
}
