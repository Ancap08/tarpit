import { describe, expect, it } from 'vitest';
import { classifyClick, onPath, pathCover, placeBeside, spotAt, spotRect } from './input';
import { LEGACY_SPOT_CELLS, spotCenter } from './legacySpots';

/** Spot centres: the legacy cells' centres (milestone 8). */
const SPOTS = LEGACY_SPOT_CELLS.map((_, id) => spotCenter(id));

describe('spotAt', () => {
  it('hits a spot within 18 px of its centre, inclusive', () => {
    expect(spotAt(240, 176)).toBe(2);
    expect(spotAt(240 + 18, 176)).toBe(2);
    expect(spotAt(240 + 12, 176 + 12)).toBe(2); // 16.97 px
    expect(spotAt(240 + 19, 176)).toBeNull();
    expect(spotAt(240 + 13, 176 + 13)).toBeNull(); // 18.38 px
  });

  it('finds every spot at its centre and nothing on the path', () => {
    SPOTS.forEach((s, id) => expect(spotAt(s.x, s.y)).toBe(id));
    expect(spotAt(160, 240)).toBeNull();
    expect(spotAt(480, 510)).toBeNull(); // HUD
  });

  it('spotRect is the 36 px box around the spot', () => {
    expect(spotRect(0)).toEqual({ x: 62, y: 158, width: 36, height: 36 }); // centre (80,176)
  });
});

describe('classifyClick', () => {
  const ui = { x: 268, y: 121, width: 168, height: 110 };

  it('a click inside the open menu belongs to the menu, even over a spot', () => {
    expect(classifyClick(300, 150, ui)).toEqual({ kind: 'ui' });
    expect(classifyClick(336, 176, ui)).toEqual({ kind: 'ui' }); // spot 4 (336,176) under the menu
  });

  it('a spot outside the menu is a spot; anything else is elsewhere', () => {
    expect(classifyClick(240, 240, ui)).toEqual({ kind: 'spot', spotId: 3 });
    expect(classifyClick(240, 240, null)).toEqual({ kind: 'spot', spotId: 3 });
    expect(classifyClick(20, 20, ui)).toEqual({ kind: 'elsewhere' });
    expect(classifyClick(795, 510, ui)).toEqual({ kind: 'elsewhere' }); // HUD
  });
});

describe('placeBeside', () => {
  const MENU = { w: 168, h: 110 };
  const PANEL = { w: 168, h: 76 };

  it('prefers the right side, vertically centred, when it covers no spot', () => {
    expect(placeBeside(SPOTS[5], MENU.w, MENU.h)).toEqual({ x: 524, y: 89 }); // centre (496,144)
  });

  it('moves off a side that would cover another spot', () => {
    // Spot 2's right side would cover spot 4, its left side spot 0 and below
    // it spot 3: above is the only clear side, even though it covers path.
    expect(placeBeside(SPOTS[2], MENU.w, MENU.h)).toEqual({ x: 156, y: 38 });
    // Spot 6's right side would cover spot 7, below and above cover more path: left.
    expect(placeBeside(SPOTS[6], MENU.w, MENU.h)).toEqual({ x: 300, y: 249 }); // centre (496,304)
  });

  it('among clear sides, takes the one over the least path', () => {
    // Spot 3: the left side is clear but covers the path's first bend; below is all grass.
    const left = { x: 44, y: 185 };
    const below = { x: 156, y: 268 };
    expect(pathCover(left.x, left.y, MENU.w, MENU.h)).toBeGreaterThan(0.2);
    expect(pathCover(below.x, below.y, MENU.w, MENU.h)).toBe(0);
    expect(placeBeside(SPOTS[3], MENU.w, MENU.h)).toEqual(below);
    // Spot 7's panel: right and left cover spots; above covers less path than below.
    expect(placeBeside(SPOTS[7], PANEL.w, PANEL.h)).toEqual({ x: 508, y: 200 }); // centre (592,304)
  });

  it('pathCover is 0 on open grass, 1 inside the path strip', () => {
    expect(onPath(160, 240)).toBe(true);
    expect(onPath(240, 176)).toBe(false);
    expect(pathCover(800, 300, 100, 100)).toBe(0);
    expect(pathCover(430, 100, 10, 200)).toBe(1); // inside the x 400..440 vertical strip
  });

  it('clamps inside the map area, never over the HUD', () => {
    expect(placeBeside({ x: 900, y: 470 }, MENU.w, MENU.h)).toEqual({ x: 788, y: 366 });
    expect(placeBeside({ x: 900, y: 10 }, MENU.w, MENU.h).y).toBe(4);
  });

  for (const [name, size] of [['menu', MENU], ['panel', PANEL]] as const) {
    it(`no ${name} covers a spot or leaves the map area`, () => {
      SPOTS.forEach((s) => {
        const p = placeBeside(s, size.w, size.h);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x + size.w).toBeLessThanOrEqual(960);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y + size.h).toBeLessThanOrEqual(480);
        for (const other of SPOTS) {
          const cx = Math.min(Math.max(other.x, p.x), p.x + size.w);
          const cy = Math.min(Math.max(other.y, p.y), p.y + size.h);
          expect(Math.hypot(cx - other.x, cy - other.y)).toBeGreaterThan(18);
        }
      });
    });
  }
});
