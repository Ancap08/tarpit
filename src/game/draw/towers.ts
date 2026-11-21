// Towers: Musketeer blue square with a barrel, Cannon grey circle with a thick
// barrel, Tar Pit dark brown tar blob with a glossy highlight. Upgraded
// towers get a gold ring. Labels are Text objects (labels.ts).

import type Phaser from 'phaser';
import { cellCenter, cellKey, MAP, nearestPathPoint, positionAlongPath, type Cell, type GameState, type Point } from '../../sim';
import { COLORS } from '../palette';

/** Barrel length from the tower centre; shot tracers start at the muzzle. */
export const BARREL_LENGTH = 22;

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

function barrel(g: Phaser.GameObjects.Graphics, p: Point, angle: number, len: number, width: number, color: number): void {
  g.lineStyle(width, color, 1);
  g.lineBetween(p.x, p.y, p.x + Math.cos(angle) * len, p.y + Math.sin(angle) * len);
}

export function drawTowers(g: Phaser.GameObjects.Graphics, state: GameState, aim: Aim): void {
  for (const tower of state.towers) {
    const p = cellCenter(tower.cell);
    const angle = aim.angle(tower.cell);

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
