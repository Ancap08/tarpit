// Milestone 34 (a living map): the fixed recipe that decorates a map.
//
// Pure and Phaser-free: given a map, decorFor() returns every decoration
// with its position and kind, in world px (the simulation's 960 x 480
// map). The pattern is defined in world space, so a turned (portrait)
// layout shows the same place turned with the map. Every random choice is
// a hash of the map id and a position or index (hash01), never
// Math.random, so a map looks the same on every run and device.
//
// Placement rules for what grows (trees and bushes, docs/DESIGN.md "Map
// decoration"): one per cell, on buildable terrain only (never on the
// trail strip, the cottage or the river), with the cell centre at least
// GROWTH_TRAIL_CLEARANCE (two cells) from the trail centreline, at least
// one cell clear of the river and the cottage, and never under the boss
// bar or the aim banner in either layout (DECOR_KEEP_OUT). Cells are taken
// round-robin across 6 x 3 regions of the map (REGION_COLS_CELLS, REGION_ROWS_CELLS), so the
// growth spreads over the whole map, not only its emptiest edges.
// A tower built on a growth's cell hides it (hiddenGrowth).

import {
  CELL,
  cellCenter,
  cellKey,
  distanceToPath,
  GRID_COLS,
  GRID_ROWS,
  isBuildableTerrain,
  type Cell,
  type MapDef,
  type Point,
  type Rect,
} from '../../sim';

/** Trail strip half-width (draw/map.ts PATH_WIDTH / 2). */
const TRAIL_HALF = 20;
/** A tree or bush's cell centre is at least this far from the trail centreline (two cells). */
export const GROWTH_TRAIL_CLEARANCE = 2 * CELL;
/** Trees and bushes per map: inclusive ranges. */
export const TREE_RANGE = { min: 8, max: 14 } as const;
export const BUSH_RANGE = { min: 8, max: 14 } as const;
/** Canopy radius per look variant: trees and bushes. */
export const TREE_R = [13, 14.5, 16] as const;
export const BUSH_R = [7, 8, 9] as const;
/** Growth regions: the map's 30 x 15 cells in blocks of this many columns and rows (6 x 3 regions). */
export const REGION_COLS_CELLS = 5;
export const REGION_ROWS_CELLS = 5;
/** Tufts that sway in play (drawn every frame), at most. */
export const MAX_SWAY_TUFTS = 12;
/** Least distance between two growth centres: trees, and a bush from anything. */
const TREE_SPACING = 56;
const BUSH_SPACING = 40;

/**
 * World rects where nothing grows: what stays over the map in either
 * layout (ui/bossBar.ts bossBarGeometry, GameScene's aim banner), with a
 * little margin. Landscape: the boss bar and the aim banner at the top
 * middle. Portrait (the map turned: world x runs down the screen, world y
 * right to left): the boss bar across the top of the screen (world x
 * 0..64; portrait shows no aim banner over the map). The wave and boss
 * banners (fx/effects.ts) show for 1.5 s only, so growth may sit under
 * them (milestone 34 follow-up, coordinator's ruling).
 */
export const DECOR_KEEP_OUT: readonly Rect[] = [
  { x: 296, y: 0, width: 368, height: 66 },
  { x: 0, y: 56, width: 66, height: 368 },
];

export type GrowthKind = 'tree' | 'bush';

export interface Growth {
  /** Index in Decor.growth; stable per map. */
  id: number;
  kind: GrowthKind;
  /** The cell it stands on: a tower built here hides it. */
  cell: Cell;
  /** Centre, world px (the cell centre with a small jitter). */
  x: number;
  y: number;
  /** Canopy radius, px. */
  r: number;
  /** Look variant (0..2). */
  variant: number;
  /** Sway phase, radians. */
  phase: number;
}

export interface Patch {
  x: number;
  y: number;
  /** 'light' or 'dark' grass. */
  shade: 'light' | 'dark';
  /** The lobes (circles) that make its soft irregular outline. */
  lobes: { x: number; y: number; r: number }[];
}

export interface Dot {
  x: number;
  y: number;
  r: number;
  /** A colour index into the drawer's list for this kind. */
  tone: number;
}

export interface Tuft {
  x: number;
  y: number;
  /** Stroke directions, radians (seen from above, so any direction). */
  angles: number[];
  len: number;
  tone: number;
  /** Sway phase (only swaying tufts use it). */
  phase: number;
}

export interface Rut {
  a: Point;
  b: Point;
}

export interface Decor {
  mapId: string;
  patches: Patch[];
  /** Static tufts (baked into the ground image). */
  tufts: Tuft[];
  /** Tufts that sway (drawn live in play). */
  swayTufts: Tuft[];
  flowers: Dot[];
  stones: Dot[];
  /** Flower-bed centres where a butterfly may appear (all at least two cells from the trail). */
  flowerBeds: Point[];
  /** Trail: pebbles, faint colour spots and the ruts' dashes. */
  pebbles: Dot[];
  trailSpots: Dot[];
  ruts: Rut[];
  /** Trees and bushes, trees first. */
  growth: Growth[];
}

/** FNV-1a hash of a string: the map's seed. */
export function seedOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A 32-bit integer hash of the seed and up to three integers (murmur3 finaliser). */
export function hash32(seed: number, a: number, b = 0, c = 0): number {
  let h = seed ^ Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A number in [0, 1) from the seed and up to three integers. */
export function hash01(seed: number, a: number, b = 0, c = 0): number {
  return hash32(seed, a, b, c) / 4294967296;
}

function overlaps(x: number, y: number, w: number, h: number, r: Rect): boolean {
  return x < r.x + r.width && r.x < x + w && y < r.y + r.height && r.y < y + h;
}

/** True when the disc (x, y, r) touches any box grown by `margin`. */
function nearBox(x: number, y: number, r: number, boxes: readonly Rect[], margin: number): boolean {
  return boxes.some((b) => overlaps(x - r, y - r, 2 * r, 2 * r, { x: b.x - margin, y: b.y - margin, width: b.width + 2 * margin, height: b.height + 2 * margin }));
}

/** True when the cell may hold a tree or bush (the rules in the header). */
export function canGrow(cell: Cell, map: MapDef): boolean {
  if (!isBuildableTerrain(cell, map)) return false;
  const c = cellCenter(cell);
  if (distanceToPath(c, map) < GROWTH_TRAIL_CLEARANCE) return false;
  const x = cell.col * CELL;
  const y = cell.row * CELL;
  if (DECOR_KEEP_OUT.some((r) => overlaps(x, y, CELL, CELL, r))) return false;
  // A cell clear of the river and the cottage, so no canopy hangs over them.
  return !nearBox(c.x, c.y, CELL / 2, [...(map.water ?? []), ...(map.landmarks ?? [])], CELL);
}

/** Salts, so each kind of decoration draws its own numbers. */
const S = { patch: 1, tuft: 2, flower: 3, stone: 4, pebble: 5, spot: 6, rut: 7, grow: 8, count: 9, jitter: 10, sway: 11 } as const;

/** True for a ground point (grass detail) clear of the trail strip, the water, the cottage and the cave. */
function onGrass(p: Point, map: MapDef, margin: number): boolean {
  if (p.x < 2 || p.y < 2 || p.x > map.width - 2 || p.y > map.height - 2) return false;
  if (distanceToPath(p, map) < TRAIL_HALF + 4 + margin) return false;
  if (nearBox(p.x, p.y, margin, [...(map.water ?? []), ...(map.landmarks ?? [])], 3)) return false;
  const cave = map.path[0];
  return Math.hypot(p.x - cave.x, p.y - cave.y) > 34 + margin;
}

/** The decorations of `map`: the same list for the same map, whatever the layout. */
export function decorFor(map: MapDef): Decor {
  const seed = seedOf(map.id);
  const r = (salt: number, i: number, j = 0) => hash01(seed, salt * 7919 + i, j);

  // Grass patches on a jittered 80 px lattice, about half of the points.
  const patches: Patch[] = [];
  for (let gy = 0; gy < Math.ceil(map.height / 80) + 1; gy++) {
    for (let gx = 0; gx < Math.ceil(map.width / 80) + 1; gx++) {
      const k = gy * 100 + gx;
      if (r(S.patch, k, 0) < 0.45) continue;
      const x = gx * 80 + (r(S.patch, k, 1) - 0.5) * 70;
      const y = gy * 80 + (r(S.patch, k, 2) - 0.5) * 70;
      const size = 18 + r(S.patch, k, 3) * 22;
      const lobes = [];
      const n = 4 + Math.floor(r(S.patch, k, 4) * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r(S.patch, k, 10 + i) * 0.8;
        const d = size * (0.35 + r(S.patch, k, 20 + i) * 0.4);
        lobes.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, r: size * (0.45 + r(S.patch, k, 30 + i) * 0.3) });
      }
      lobes.push({ x, y, r: size * 0.6 });
      patches.push({ x, y, shade: r(S.patch, k, 5) < 0.5 ? 'light' : 'dark', lobes });
    }
  }

  // Tufts: candidates on a jittered 40 px lattice; every fifth one that lands on grass sways.
  const tufts: Tuft[] = [];
  const swayTufts: Tuft[] = [];
  for (let gy = 0; gy < map.height / 40; gy++) {
    for (let gx = 0; gx < map.width / 40; gx++) {
      const k = gy * 100 + gx;
      if (r(S.tuft, k, 0) < 0.55) continue;
      const p = { x: gx * 40 + 4 + r(S.tuft, k, 1) * 32, y: gy * 40 + 4 + r(S.tuft, k, 2) * 32 };
      if (!onGrass(p, map, 4)) continue;
      const base = r(S.tuft, k, 3) * Math.PI * 2;
      const n = 3 + Math.floor(r(S.tuft, k, 4) * 2);
      const angles = Array.from({ length: n }, (_, i) => base + (i - (n - 1) / 2) * 0.55);
      const tuft = { ...p, angles, len: 4 + r(S.tuft, k, 5) * 3, tone: r(S.tuft, k, 6) < 0.6 ? 0 : 1, phase: r(S.tuft, k, 7) * Math.PI * 2 };
      if (r(S.tuft, k, 8) < 0.11 && swayTufts.length < MAX_SWAY_TUFTS) swayTufts.push(tuft);
      else tufts.push(tuft);
    }
  }

  // Flower beds: a few clusters of 4 to 7 small flowers, in one of three colours each.
  const flowers: Dot[] = [];
  const flowerBeds: Point[] = [];
  for (let i = 0; i < 40 && flowerBeds.length < 12; i++) {
    const c = { x: 20 + r(S.flower, i, 0) * (map.width - 40), y: 20 + r(S.flower, i, 1) * (map.height - 40) };
    if (!onGrass(c, map, 14)) continue;
    const tone = Math.floor(r(S.flower, i, 2) * 3);
    const n = 4 + Math.floor(r(S.flower, i, 3) * 4);
    for (let j = 0; j < n; j++) {
      const p = { x: c.x + (r(S.flower, i, 10 + j) - 0.5) * 22, y: c.y + (r(S.flower, i, 20 + j) - 0.5) * 18 };
      if (onGrass(p, map, 2)) flowers.push({ ...p, r: 1.4 + r(S.flower, i, 30 + j) * 0.6, tone });
    }
    if (distanceToPath(c, map) >= GROWTH_TRAIL_CLEARANCE + 8) flowerBeds.push(c);
  }

  // Stones: a dozen small grey ones on the grass.
  const stones: Dot[] = [];
  for (let i = 0; i < 40 && stones.length < 12; i++) {
    const p = { x: r(S.stone, i, 0) * map.width, y: r(S.stone, i, 1) * map.height };
    if (onGrass(p, map, 6)) stones.push({ ...p, r: 2.5 + r(S.stone, i, 2) * 2.5, tone: Math.floor(r(S.stone, i, 3) * 2) });
  }

  // The trail: along each segment, pebbles and colour spots near the centreline, and two broken ruts.
  const pebbles: Dot[] = [];
  const trailSpots: Dot[] = [];
  const ruts: Rut[] = [];
  for (let s = 1; s < map.path.length; s++) {
    const a = map.path[s - 1];
    const b = map.path[s];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const at = (t: number, side: number): Point => ({ x: a.x + ux * t - uy * side, y: a.y + uy * t + ux * side });
    for (let i = 0; i < len / 22; i++) {
      const t = r(S.pebble, s * 1000 + i, 0) * len;
      pebbles.push({ ...at(t, (r(S.pebble, s * 1000 + i, 1) - 0.5) * 30), r: 1.1 + r(S.pebble, s * 1000 + i, 2) * 1.1, tone: Math.floor(r(S.pebble, s * 1000 + i, 3) * 2) });
    }
    for (let i = 0; i < len / 30; i++) {
      const t = r(S.spot, s * 1000 + i, 0) * len;
      trailSpots.push({ ...at(t, (r(S.spot, s * 1000 + i, 1) - 0.5) * 18), r: 6 + r(S.spot, s * 1000 + i, 2) * 7, tone: Math.floor(r(S.spot, s * 1000 + i, 3) * 2) });
    }
    // Ruts: two worn tracks about 8 px either side of the centreline, in short
    // broken dashes that wander a little sideways, clear of the rounded corners.
    for (const side of [-8, 8]) {
      let t = 22 + r(S.rut, s * 1000, side + 150) * 20;
      for (let i = 0; t < len - 22; i++) {
        const k = s * 1000 + i;
        const dash = 7 + r(S.rut, k, side) * 15;
        const end = Math.min(len - 22, t + dash);
        const wa = side + (r(S.rut, k, side + 200) - 0.5) * 4;
        const wb = side + (r(S.rut, k, side + 250) - 0.5) * 4;
        if (r(S.rut, k, side + 50) < 0.6) ruts.push({ a: at(t, wa), b: at(end, wb) });
        t = end + 10 + r(S.rut, k, side + 100) * 26;
      }
    }
  }

  return { mapId: map.id, patches, tufts, swayTufts, flowers, stones, flowerBeds, pebbles, trailSpots, ruts, growth: growthFor(map, seed) };
}

/** Trees, then bushes: eligible cells taken in a hashed order, kept apart by their spacing. */
function growthFor(map: MapDef, seed: number): Growth[] {
  const cells: { cell: Cell; order: number }[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cell = { col, row };
      if (canGrow(cell, map)) cells.push({ cell, order: hash01(seed, S.grow * 7919 + cellKey(cell)) });
    }
  }
  cells.sort((p, q) => p.order - q.order);
  // Round-robin over the regions (each in hashed order), so every part of the map gets its share.
  const regions = new Map<number, Cell[]>();
  for (const { cell } of cells) {
    const key = Math.floor(cell.row / REGION_ROWS_CELLS) * 100 + Math.floor(cell.col / REGION_COLS_CELLS);
    if (!regions.has(key)) regions.set(key, []);
    regions.get(key)!.push(cell);
  }
  const regionOrder = [...regions.keys()].sort((p, q) => hash01(seed, S.grow * 7919 + 5000 + p) - hash01(seed, S.grow * 7919 + 5000 + q));
  const spread: Cell[] = [];
  for (let round = 0; spread.length < cells.length; round++) {
    for (const key of regionOrder) {
      const list = regions.get(key)!;
      if (round < list.length) spread.push(list[round]);
    }
  }
  const growth: Growth[] = [];
  const pick = (kind: GrowthKind, target: number, spacing: number) => {
    let placed = 0;
    for (const cell of spread) {
      if (placed >= target) break;
      const c = cellCenter(cell);
      if (growth.some((g) => (g.cell.col === cell.col && g.cell.row === cell.row) || Math.hypot(g.x - c.x, g.y - c.y) < spacing)) continue;
      const k = cellKey(cell);
      const jx = (hash01(seed, S.jitter * 7919 + k, 0) - 0.5) * 6;
      const jy = (hash01(seed, S.jitter * 7919 + k, 1) - 0.5) * 6;
      const variant = Math.floor(hash01(seed, S.jitter * 7919 + k, 3) * 3);
      growth.push({
        id: growth.length,
        kind,
        cell,
        x: c.x + jx,
        y: c.y + jy,
        r: kind === 'tree' ? TREE_R[variant] : BUSH_R[variant],
        variant,
        phase: hash01(seed, S.sway * 7919 + k) * Math.PI * 2,
      });
      placed += 1;
    }
  };
  const count = (salt: number, range: { min: number; max: number }) => range.min + Math.floor(hash01(seed, S.count * 7919 + salt) * (range.max - range.min + 1));
  pick('tree', count(1, TREE_RANGE), TREE_SPACING);
  pick('bush', count(2, BUSH_RANGE), BUSH_SPACING);
  return growth;
}

/** The ids of the growths whose cell holds a tower: drawn hidden. */
export function hiddenGrowth(growth: readonly Growth[], towerCells: readonly Cell[]): number[] {
  const built = new Set(towerCells.map(cellKey));
  return growth.filter((g) => built.has(cellKey(g.cell))).map((g) => g.id);
}
