import { cellCenter, type Point, GRID_COLS, GRID_ROWS, isBuildableTerrain, MAPS, terrainBlock, type Cell, type MapId } from '../src/sim';
import { snapCell } from '../src/game/touchAssist';

// Milestone 35: cells for the snap specs, found from the map data so no spec
// hard-codes a cell. A case's `under` cannot take a tower; `expected` is
// where the snap rule (touchAssist.ts snapCell) puts the ghost from the
// lifted point `at`, chosen only where points 0.5 px around it agree, so the
// page's rounding cannot flip a tie.

export interface SnapCase {
  map: MapId;
  kind: 'path' | 'landmark' | 'water' | 'occupied' | 'none';
  under: Cell;
  /** The lifted point (world px): a little up and left of the cell's centre, so a tie between two sides does not hang on rounding. */
  at: Point;
  expected: Cell | null;
  /** For 'occupied': the tower built first (on `under`). */
}

/** The lifted point used for `under`. */
export function liftedPoint(under: Cell): Point {
  const c = cellCenter(under);
  return { x: c.x - 5, y: c.y - 9 };
}

function stable(under: Cell, canTake: (c: Cell) => boolean): Cell | null | undefined {
  const c = liftedPoint(under);
  const picks = [[0, 0], [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]].map(([dx, dy]) => snapCell(under, { x: c.x + dx, y: c.y + dy }, canTake));
  const first = picks[0];
  const same = picks.every((p) => (p === null ? first === null : first !== null && p.col === first.col && p.row === first.row));
  return same ? first : undefined;
}

/** The first case of each kind that exists on `map`, in cellKey order. */
export function snapCases(map: MapId): SnapCase[] {
  const def = MAPS[map];
  const terrain = (c: Cell) => isBuildableTerrain(c, def);
  const out: SnapCase[] = [];
  const found = new Set<string>();
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const under = { col, row };
      if (terrain(under)) {
        // An occupied cell: a free buildable cell whose own snap (once occupied) is stable.
        if (!found.has('occupied')) {
          const e = stable(under, (c) => terrain(c) && !(c.col === col && c.row === row));
          if (e) {
            out.push({ map, kind: 'occupied', under, at: liftedPoint(under), expected: e });
            found.add('occupied');
          }
        }
        continue;
      }
      const block = terrainBlock(under, def) as SnapCase['kind'];
      const e = stable(under, terrain);
      if (e === undefined) continue;
      const kind = e === null ? 'none' : block;
      if (found.has(kind)) continue;
      found.add(kind);
      out.push({ map, kind, under, at: liftedPoint(under), expected: e });
    }
  }
  return out;
}
