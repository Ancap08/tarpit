// Temporary bridge for milestone 8: the ten v1 build spots as grid cells, so
// the v1 build UI keeps working while the simulation places towers on cells.
// Milestone 9 replaces this with the build bar and build-anywhere.
//
// Each v1 spot maps to its nearest buildable cell (by distance between the
// spot and the cell centre). Ties go to the cell whose distance to the path
// is closest to the spot's own, then to the lower cellKey. legacySpots.test.ts
// recomputes the list from that rule.
//
//   id  v1 spot     cell (col,row)  cell centre
//    0  (96,160)    (2,5)           (80,176)
//    1  (96,320)    (2,9)           (80,304)
//    2  (240,176)   (7,5)           (240,176)
//    3  (240,240)   (7,7)           (240,240)
//    4  (340,176)   (10,5)          (336,176)
//    5  (500,160)   (15,4)          (496,144)
//    6  (500,304)   (15,9)          (496,304)
//    7  (600,304)   (18,9)          (592,304)
//    8  (760,112)   (23,3)          (752,112)
//    9  (760,272)   (23,8)          (752,272)

import { cellCenter, sameCell, type Cell, type Point } from '../sim';

/** The v1 spot positions, indexed by spot id (docs/DESIGN.md before milestone 8). */
export const V1_SPOT_POSITIONS: readonly Point[] = [
  { x: 96, y: 160 },
  { x: 96, y: 320 },
  { x: 240, y: 176 },
  { x: 240, y: 240 },
  { x: 340, y: 176 },
  { x: 500, y: 160 },
  { x: 500, y: 304 },
  { x: 600, y: 304 },
  { x: 760, y: 112 },
  { x: 760, y: 272 },
];

/** The cell for each v1 spot, indexed by the old spot id. */
export const LEGACY_SPOT_CELLS: readonly Cell[] = [
  { col: 2, row: 5 },
  { col: 2, row: 9 },
  { col: 7, row: 5 },
  { col: 7, row: 7 },
  { col: 10, row: 5 },
  { col: 15, row: 4 },
  { col: 15, row: 9 },
  { col: 18, row: 9 },
  { col: 23, row: 3 },
  { col: 23, row: 8 },
];

/** Centre of legacy spot `id`'s cell: where its circle is drawn and clicked. */
export function spotCenter(id: number): Point {
  return cellCenter(LEGACY_SPOT_CELLS[id]);
}

/** The legacy spot id for a cell, or null if the cell is not one of the ten. */
export function spotIdOf(cell: Cell): number | null {
  const id = LEGACY_SPOT_CELLS.findIndex((c) => sameCell(c, cell));
  return id === -1 ? null : id;
}
