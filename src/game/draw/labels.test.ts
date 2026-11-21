import { describe, expect, it } from 'vitest';
import { cellKey, type TowerType } from '../../sim';
import { labelAbove, labelBox, labelText, labelX, layoutLabels } from './labels';

describe('tower labels', () => {
  it('names each tower type and marks upgrades with "+"', () => {
    expect(labelText({ type: 'musketeer', upgraded: false })).toBe('Musket');
    expect(labelText({ type: 'cannon', upgraded: false })).toBe('Cannon');
    expect(labelText({ type: 'tarpit', upgraded: false })).toBe('Tar');
    expect(labelText({ type: 'musketeer', upgraded: true })).toBe('Musket+');
    expect(labelText({ type: 'tarpit', upgraded: true })).toBe('Tar+');
    expect(labelText({ type: 'longbow', upgraded: false })).toBe('Longbow');
    expect(labelText({ type: 'mortar', upgraded: true })).toBe('Mortar+');
    expect(labelText({ type: 'firepot', upgraded: false })).toBe('Fire');
  });
});

describe('label placement', () => {
  it('goes below the tower on rows 0 to 13 and above it on row 14, so it never reaches the HUD', () => {
    expect(labelAbove(13 * 32 + 16)).toBe(false); // label 454..470
    expect(labelAbove(14 * 32 + 16)).toBe(true); // below would be 486..502
  });
});

describe('label x', () => {
  it('centres on the tower, shifted inside the map at the edges', () => {
    expect(labelX(240, 50)).toBe(240);
    expect(labelX(16, 50)).toBe(25);
    expect(labelX(944, 30)).toBe(944);
    expect(labelX(944, 60)).toBe(930);
  });
});

const tower = (col: number, row: number, type: TowerType = 'musketeer', upgraded = false) => ({ cell: { col, row }, type, upgraded });
/** layoutLabels as [col, row, size, visible] rows in cell-key order. */
const layout = (towers: ReturnType<typeof tower>[]) => {
  const m = layoutLabels(towers);
  return [...towers]
    .sort((a, b) => cellKey(a.cell) - cellKey(b.cell))
    .map((t) => {
      const l = m.get(cellKey(t.cell));
      return [t.cell.col, t.cell.row, l?.size, l?.visible];
    });
};

describe('label crowding', () => {
  it('estimates boxes from the monospace advance: "Musket" is 49.2 px at 12 px and 42 px at 10 px', () => {
    const big = labelBox(tower(7, 5), 12);
    expect(big.width).toBeCloseTo(49.2, 9);
    expect(big.x).toBeCloseTo(215.4, 9);
    expect(big).toMatchObject({ y: 198, height: 16 });
    expect(labelBox(tower(7, 5), 10)).toEqual({ x: 219, y: 198, width: 42, height: 14 });
  });

  it('keeps 12 px labels for a lone tower and for towers two columns apart', () => {
    expect(layout([tower(7, 5)])).toEqual([[7, 5, 12, true]]);
    expect(layout([tower(6, 5), tower(8, 5, 'longbow', true)])).toEqual([
      [6, 5, 12, true],
      [8, 5, 12, true],
    ]);
  });

  it('three adjacent cells in a row: all 10 px, the middle label hidden', () => {
    // At 10 px "Musket" is 42 px wide on a 32 px pitch: (7,5) meets (6,5) and
    // hides; (8,5) is 64 px from (6,5) and clears it, and a hidden label
    // hides nothing.
    expect(layout([tower(8, 5), tower(6, 5), tower(7, 5)])).toEqual([
      [6, 5, 10, true],
      [7, 5, 10, false],
      [8, 5, 10, true],
    ]);
  });

  it('a 2x2 block: all 10 px, the right-hand label of each row hidden', () => {
    // Rows 5 and 6 labels sit 32 px apart (y 198..212 and 230..244), so only
    // the horizontal pairs clash, and the higher cell key of each pair hides.
    expect(layout([tower(6, 5), tower(7, 5), tower(6, 6), tower(7, 6)])).toEqual([
      [6, 5, 10, true],
      [7, 5, 10, false],
      [6, 6, 10, true],
      [7, 6, 10, false],
    ]);
  });

  it('a vertical pair keeps 12 px and both labels', () => {
    expect(layout([tower(7, 5), tower(7, 6)])).toEqual([
      [7, 5, 12, true],
      [7, 6, 12, true],
    ]);
  });
});
