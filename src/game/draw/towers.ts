// Towers: Musketeer blue square with a barrel, Cannon grey circle with a thick
// barrel, Tar Pit dark brown tar blob with a glossy highlight, Longbow a tall
// thin green post with a bow arc on the side facing its target, Mortar a
// short wide grey tube pointing at its target with a dark mouth, Fire Pot an
// orange-red pot with a yellow flame. Upgraded towers get a gold ring.
// Unlocked towers (built this setup phase, milestone 25a) get a pale dashed
// outline round their cell. Labels are Text objects (labels.ts).

import type Phaser from 'phaser';
import { CELL, cellCenter, cellKey, nearestPathPoint, positionAlongPath, roadPath, type Cell, type GameState, type MapDef, type Point, type Tower, type TowerType, type UpgradePath } from '../../sim';
import { LANDSCAPE, type Layout } from '../layout';
import { CLEAN, roundPoints } from '../ui/newTheme';
import { COLORS } from '../palette';

export const PATH_MARKS = {
  centerX: 10,
  centerY: -10,
  radius: 8,
  A: { shape: 'diamond', color: COLORS.towerPathA, halfSize: 6 },
  B: { shape: 'two dots', color: COLORS.towerPathB, offset: 4, radius: 3 },
} as const;

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

  /** `map` is the game's map: a new barrel starts aimed at its path. */
  constructor(private readonly map: MapDef) {}

  angle(cell: Cell): number {
    const known = this.angles.get(cellKey(cell));
    if (known !== undefined) return known;
    const p = cellCenter(cell);
    const trail = nearestPathPoint(p, this.map);
    const q = positionAlongPath(roadPath(this.map, trail.road), trail.along);
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

/** A barrel `len` px long; `recoil` (milestone 31, play only) slides it back that many px. */
function barrel(g: Phaser.GameObjects.Graphics, p: Point, angle: number, len: number, width: number, color: number, alpha: number, recoil = 0): void {
  g.lineStyle(width, color, alpha);
  if (recoil === 0) {
    g.lineBetween(p.x, p.y, p.x + Math.cos(angle) * len, p.y + Math.sin(angle) * len);
    return;
  }
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  g.lineBetween(p.x - dx * recoil, p.y - dy * recoil, p.x + dx * (len - recoil), p.y + dy * (len - recoil));
}

/**
 * A null type draws just the code-drawn marks over a separately painted body.
 * One tower's shape at `p`, its barrel at `angle`. `alpha` scales every fill
 * and line (1 for a placed tower, lower for the placement ghost). `recoil`
 * (milestone 31, play only; 0 in test mode) slides the barrel, bow or tube
 * back by that many px. `g` is world-space; `layout` (milestone 32b) keeps
 * the parts that have an up (the Fire Pot's flame, the Longbow's post, the
 * Tar Pit's blobs and gloss) the right way up on a turned map.
 */
export function drawTowerShape(
  g: Phaser.GameObjects.Graphics,
  type: TowerType | null,
  p: Point,
  angle: number,
  upgraded: boolean,
  alpha = 1,
  recoil = 0,
  layout: Layout = LANDSCAPE,
  path?: UpgradePath,
): void {
  const at = (dx: number, dy: number) => layout.offset(p, dx, dy);
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
      barrel(g, p, angle, BARREL_LENGTH, 4, COLORS.musketeerBarrel, alpha, recoil);
      break;
    case 'cannon':
      g.fillStyle(COLORS.cannon, alpha);
      g.fillCircle(p.x, p.y, 14);
      g.lineStyle(2, COLORS.cannonEdge, alpha);
      g.strokeCircle(p.x, p.y, 14);
      barrel(g, p, angle, BARREL_LENGTH, 7, COLORS.cannonBarrel, alpha, recoil);
      break;
    case 'tarpit':
      g.fillStyle(COLORS.tarpit, alpha);
      g.fillCircle(p.x, p.y, 14);
      for (const [dx, dy, r] of [
        [-8, 6, 7],
        [9, 5, 6],
      ] as const) {
        const b = at(dx, dy);
        g.fillCircle(b.x, b.y, r);
      }
      g.fillStyle(COLORS.tarpitHighlight, 0.85 * alpha);
      {
        const h = at(-5, -5);
        g.fillCircle(h.x, h.y, 3);
      }
      break;
    case 'longbow': {
      const post = layout.ellipse(10, 26);
      g.fillStyle(COLORS.longbow, alpha);
      g.fillRect(p.x - post.w / 2, p.y - post.h / 2, post.w, post.h);
      g.lineStyle(1.5, COLORS.longbowEdge, alpha);
      g.strokeRect(p.x - post.w / 2, p.y - post.h / 2, post.w, post.h);
      // Bow: an arc of radius 12 centred on the tower, 100 degrees wide,
      // bulging towards the target, with a pale string across its ends.
      const half = (50 * Math.PI) / 180;
      const c = recoil === 0 ? p : { x: p.x - Math.cos(angle) * recoil, y: p.y - Math.sin(angle) * recoil };
      const end = (a: number) => ({ x: c.x + Math.cos(a) * 12, y: c.y + Math.sin(a) * 12 });
      const a0 = end(angle - half);
      const a1 = end(angle + half);
      g.lineStyle(1, COLORS.longbowString, 0.9 * alpha);
      g.lineBetween(a0.x, a0.y, a1.x, a1.y);
      g.lineStyle(3, COLORS.longbowBow, alpha);
      g.beginPath();
      g.arc(c.x, c.y, 12, angle - half, angle + half);
      g.strokePath();
      break;
    }
    case 'mortar': {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const back = { x: p.x - dx * (TUBE_HALF + recoil), y: p.y - dy * (TUBE_HALF + recoil) };
      const front = { x: p.x + dx * (TUBE_HALF - recoil), y: p.y + dy * (TUBE_HALF - recoil) };
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
      {
        const [a, b, c] = [at(-6, 1), at(6, 1), at(0, -16)];
        g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
      }
      break;
  }

  if (path) drawTowerPathBadge(g, p, layout, path, alpha);
}

/** The branch badge sits upright above the tower's own silhouette. */
export function drawTowerPathBadge(
  g: Phaser.GameObjects.Graphics, p: Point, layout: Layout, path: UpgradePath, alpha: number, largerDots = false,
): void {
  const at = (dx: number, dy: number) => layout.offset(p, dx, dy);
  const { centerX: x, centerY: y, radius } = PATH_MARKS;
  const center = at(x, y);
  g.fillStyle(COLORS.towerPathEdge, alpha).fillCircle(center.x, center.y, radius);
  const mark = PATH_MARKS[path];
  g.fillStyle(mark.color, alpha);
  if (mark.shape === 'diamond') {
    const half = mark.halfSize;
    const [top, right, bottom, left] = [at(x, y - half), at(x + half, y), at(x, y + half), at(x - half, y)];
    g.fillTriangle(top.x, top.y, right.x, right.y, bottom.x, bottom.y)
      .fillTriangle(top.x, top.y, bottom.x, bottom.y, left.x, left.y);
  } else {
    const [left, right] = [at(x - mark.offset, y), at(x + mark.offset, y)];
    const dot = largerDots ? 3.6 : mark.radius;
    g.fillCircle(left.x, left.y, dot).fillCircle(right.x, right.y, dot);
  }
}

/** The unlocked outline: 2 px pale dashes, DASH long with DASH gaps, inset 1 px so it stays inside the cell. */
const OUTLINE_WIDTH = 2;
const DASH = 4;
/** Opacity of a tower being dragged to a new cell, at its origin. */
export const DRAG_ORIGIN_ALPHA = 0.3;

/** A dashed square round `cell` (milestone 25a): this tower is still free to move or remove. */
export function drawUnlockedOutline(g: Phaser.GameObjects.Graphics, cell: Cell, alpha = 0.9): void {
  const inset = OUTLINE_WIDTH / 2;
  const x0 = cell.col * CELL + inset;
  const y0 = cell.row * CELL + inset;
  const len = CELL - OUTLINE_WIDTH;
  g.lineStyle(OUTLINE_WIDTH, COLORS.unlockedOutline, alpha);
  // Each side: dashes from the corner, so the four corners are drawn.
  for (let d = 0; d < len; d += 2 * DASH) {
    const e = Math.min(d + DASH, len);
    g.lineBetween(x0 + d, y0, x0 + e, y0);
    g.lineBetween(x0 + d, y0 + len, x0 + e, y0 + len);
    g.lineBetween(x0, y0 + d, x0, y0 + e);
    g.lineBetween(x0 + len, y0 + d, x0 + len, y0 + e);
  }
}

/** A tower's pose in play (milestone 31): barrel angle, recoil in px and pop scale. */
export interface TowerPose {
  angle: number;
  recoil: number;
  scale: number;
}

/**
 * One tower drawn scaled by `scale` about its centre (milestone 31 pops),
 * through the Graphics transform stack.
 */
export function drawTowerScaled(
  g: Phaser.GameObjects.Graphics,
  type: TowerType | null,
  p: Point,
  pose: TowerPose,
  upgraded: boolean,
  alpha = 1,
  layout: Layout = LANDSCAPE,
  path?: UpgradePath,
): void {
  if (pose.scale === 1) {
    drawTowerShape(g, type, p, pose.angle, upgraded, alpha, pose.recoil, layout, path);
    return;
  }
  g.save();
  g.translateCanvas(p.x, p.y);
  g.scaleCanvas(pose.scale, pose.scale);
  g.translateCanvas(-p.x, -p.y);
  drawTowerShape(g, type, p, pose.angle, upgraded, alpha, pose.recoil, layout, path);
  g.restore();
}

/**
 * Every tower; the one on `dimmed` (a tower being moved, milestone 25a) is
 * drawn faint. In play (milestone 31) `pose` gives each tower's turning
 * barrel, recoil and pop; test mode leaves it out and draws as before.
 */
export function drawTowers(
  g: Phaser.GameObjects.Graphics,
  state: GameState,
  aim: Aim,
  dimmed: Cell | null = null,
  pose?: (cell: Cell, type: TowerType) => TowerPose,
  layout: Layout = LANDSCAPE,
  body?: (tower: Tower, p: Point, pose: TowerPose, alpha: number) => void,
  clean = false,
): void {
  for (const tower of state.towers) {
    const dim = dimmed !== null && dimmed.col === tower.cell.col && dimmed.row === tower.cell.row;
    if (!clean && !tower.locked) drawUnlockedOutline(g, tower.cell, dim ? DRAG_ORIGIN_ALPHA : 0.9);
    const p = cellCenter(tower.cell);
    const stance = pose?.(tower.cell, tower.type) ?? { angle: aim.angle(tower.cell), scale: 1, recoil: 0 };
    const alpha = dim ? DRAG_ORIGIN_ALPHA : 1;
    if (clean) {
      const foot = layout.offset(p, 0, 7);
      const { w, h } = layout.ellipse(38, 24);
      const points = roundPoints({ x: foot.x - w / 2, y: foot.y - h / 2, width: w, height: h }, 8);
      g.fillStyle(CLEAN.ground, .66 * alpha).fillPoints(points, true);
      g.lineStyle(tower.locked ? 1 : 2, tower.upgraded ? 0xffda92 : CLEAN.mint, alpha).strokePoints(points, true);
    }
    body?.(tower, p, stance, alpha);
    drawTowerScaled(g, body ? null : tower.type, p, stance, tower.upgraded && !clean, alpha, layout, clean ? undefined : tower.path);
  }
}
