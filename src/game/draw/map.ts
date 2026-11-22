// Static map: grass, the dirt path, spawn and exit markers, drawn from the
// game's map data (milestone 27). No grid lines: the build grid shows only
// through the placement highlight. Drawn once into its own Graphics object.
// Milestone 34: the grass and the trail carry the fixed texture of
// decor/recipe.ts (patches, tufts, flowers, stones; a soft edge, colour
// spots, ruts and pebbles), drawn once and baked into one image by
// decor/livingMap.ts. Trees, bushes and the moving things are not here.

import type Phaser from 'phaser';
import type { MapDef, Point, Rect } from '../../sim';
import { LANDSCAPE, type Layout } from '../layout';
import { COLORS } from '../palette';
import { decorFor, type Decor } from '../decor/recipe';

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

/** The colour `t` of the way from `a` to `b`. */
function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
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
 * A water box (milestone 27): a flat blue strip filling the box with a
 * darker bank edge (milestone 34: and a soft damp bank outside it). When the box runs off the bottom of the map its top
 * end is a pool with corners rounded by POOL_CORNER px (milestone 27
 * follow-up: a half disc left the top corner cells, which the build rule
 * refuses as water, mostly grass), so every water cell looks like water and
 * the drawing stays inside the box the rule uses.
 */
const POOL_CORNER = 12;

function water(g: Phaser.GameObjects.Graphics, box: Rect, mapHeight: number): void {
  const bank = 3;
  const pool = box.y + box.height >= mapHeight;
  const shape = (inset: number, color: number) => {
    g.fillStyle(color, 1);
    const radius = pool ? POOL_CORNER - inset : 0;
    g.fillRoundedRect(box.x + inset, box.y + inset, box.width - 2 * inset, box.height - (pool ? inset : 2 * inset), { tl: radius, tr: radius, bl: 0, br: 0 });
  };
  // Milestone 34: a soft, damp bank just outside the box.
  g.fillStyle(COLORS.bankSoft, 0.5);
  g.fillRoundedRect(box.x - 4, box.y - 4, box.width + 8, box.height + (pool ? 4 : 8), { tl: POOL_CORNER + 4, tr: POOL_CORNER + 4, bl: 0, br: 0 });
  shape(0, COLORS.waterBank);
  shape(bank, COLORS.water);
  // Milestone 34: the old fixed ripple strokes gave way to flow lines and glints (decor/livingMap.ts).
}

const FLOWER_TONES = [COLORS.flowerCream, COLORS.flowerYellow, COLORS.flowerLilac];

/** Milestone 34: the grass texture under everything: patches, flowers, stones and the still tufts. */
function grassTexture(g: Phaser.GameObjects.Graphics, d: Decor): void {
  for (const shade of ['dark', 'light'] as const) {
    // Two passes per patch: a faint wider halo, then the body, for a soft edge.
    const color = shade === 'light' ? COLORS.grassLight : COLORS.grassDark;
    for (const [grow, alpha] of [
      [5, 0.35],
      [0, 0.6],
    ] as const) {
      g.fillStyle(color, alpha);
      for (const p of d.patches) if (p.shade === shade) for (const l of p.lobes) g.fillCircle(l.x, l.y, l.r + grow);
    }
  }
  for (const t of d.tufts) drawTuft(g, t.x, t.y, t.angles, t.len, t.tone);
  for (const s of d.stones) {
    g.fillStyle(COLORS.stoneShade, 1);
    g.fillEllipse(s.x + 0.8, s.y + 0.8, s.r * 2.2, s.r * 1.7);
    g.fillStyle(COLORS.stone, 1);
    g.fillEllipse(s.x, s.y, s.r * 2, s.r * 1.5);
  }
  for (const f of d.flowers) {
    g.fillStyle(FLOWER_TONES[f.tone], 0.9);
    g.fillCircle(f.x, f.y, f.r);
  }
}

/** A tuft seen from above: a few short strokes fanning out from one point. */
export function drawTuft(g: Phaser.GameObjects.Graphics, x: number, y: number, angles: readonly number[], len: number, tone: number, dx = 0, dy = 0): void {
  g.lineStyle(1.5, tone === 0 ? COLORS.tuftDark : COLORS.tuftLight, 0.9);
  for (const a of angles) g.lineBetween(x, y, x + Math.cos(a) * len + dx, y + Math.sin(a) * len + dy);
}

/** Milestone 34: the worn trail: colour spots, two broken ruts along its direction and pebbles. */
function trailTexture(g: Phaser.GameObjects.Graphics, d: Decor): void {
  for (const s of d.trailSpots) {
    g.fillStyle(s.tone === 0 ? COLORS.pathLight : COLORS.pathDark, 0.35);
    g.fillCircle(s.x, s.y, s.r);
  }
  g.lineStyle(1.5, COLORS.pathRut, 0.24);
  for (const r of d.ruts) g.lineBetween(r.a.x, r.a.y, r.b.x, r.b.y);
  for (const p of d.pebbles) {
    g.fillStyle(p.tone === 0 ? COLORS.pebbleDark : COLORS.pebbleLight, 0.9);
    g.fillCircle(p.x, p.y, p.r);
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
    const r = box.y + box.height >= map.height ? POOL_CORNER * s : 0;
    g.fillStyle(COLORS.water, 1);
    g.fillRoundedRect(top.x, top.y, box.width * s, box.height * s, { tl: r, tr: r, bl: 0, br: 0 });
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

/**
 * `g` is world-space (placed with layout.placeWorld). Milestone 32b: on a
 * turned map the cottage would lie on its side, so it is drawn upright on
 * `upright`, a screen-space Graphics over `g`, centred where its box lands.
 */
export function drawMap(g: Phaser.GameObjects.Graphics, map: MapDef, layout: Layout = LANDSCAPE, upright?: Phaser.GameObjects.Graphics, decor: Decor = decorFor(map)): void {
  g.fillStyle(COLORS.grass, 1);
  g.fillRect(0, 0, map.width, map.height);
  grassTexture(g, decor);

  for (const box of map.water ?? []) water(g, box, map.height);
  // Milestone 34: a soft darker margin outside the trail's edge, then the edge and the strip.
  // Opaque blends of grass and pathSoft: overlapping pieces of a translucent path would double up at the corners.
  thickPath(g, map.path, PATH_WIDTH + 12, mix(COLORS.grass, COLORS.pathSoft, 0.2));
  thickPath(g, map.path, PATH_WIDTH + 7, mix(COLORS.grass, COLORS.pathSoft, 0.45));
  thickPath(g, map.path, PATH_WIDTH + 4, COLORS.pathEdge);
  thickPath(g, map.path, PATH_WIDTH, COLORS.path);
  trailTexture(g, decor);
  spawnMarker(g, map.path[0]);
  for (const box of map.landmarks ?? []) {
    if (!layout.turned || !upright) {
      exitCottage(g, box);
      continue;
    }
    const c = layout.toScreen({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    exitCottage(upright, { x: c.x - box.width / 2, y: c.y - box.height / 2, width: box.width, height: box.height });
  }
}
