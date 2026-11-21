import { describe, expect, it } from 'vitest';
import { MAP } from '../sim';
import { classifyClick, placeBeside, spotAt, spotRect } from './input';

describe('spotAt', () => {
  it('hits a spot within 18 px of its centre, inclusive', () => {
    expect(spotAt(240, 176)).toBe(2);
    expect(spotAt(240 + 18, 176)).toBe(2);
    expect(spotAt(240 + 12, 176 + 12)).toBe(2); // 16.97 px
    expect(spotAt(240 + 19, 176)).toBeNull();
    expect(spotAt(240 + 13, 176 + 13)).toBeNull(); // 18.38 px
  });

  it('finds every spot at its centre and nothing on the path', () => {
    MAP.buildSpots.forEach((s, id) => expect(spotAt(s.x, s.y)).toBe(id));
    expect(spotAt(160, 240)).toBeNull();
    expect(spotAt(480, 510)).toBeNull(); // HUD
  });

  it('spotRect is the 36 px box around the spot', () => {
    expect(spotRect(0)).toEqual({ x: 78, y: 142, width: 36, height: 36 });
  });
});

describe('classifyClick', () => {
  const ui = { x: 268, y: 121, width: 168, height: 110 };

  it('a click inside the open menu belongs to the menu, even over a spot', () => {
    expect(classifyClick(300, 150, ui)).toEqual({ kind: 'ui' });
    expect(classifyClick(340, 176, ui)).toEqual({ kind: 'ui' }); // spot 4 under the menu
  });

  it('a spot outside the menu is a spot; anything else is elsewhere', () => {
    expect(classifyClick(240, 304, ui)).toEqual({ kind: 'spot', spotId: 3 });
    expect(classifyClick(240, 304, null)).toEqual({ kind: 'spot', spotId: 3 });
    expect(classifyClick(20, 20, ui)).toEqual({ kind: 'elsewhere' });
    expect(classifyClick(795, 510, ui)).toEqual({ kind: 'elsewhere' }); // HUD
  });
});

describe('placeBeside', () => {
  const MENU = { w: 168, h: 110 };
  const PANEL = { w: 168, h: 76 };

  it('prefers the right side, vertically centred, when it covers no spot', () => {
    expect(placeBeside(MAP.buildSpots[3], MENU.w, MENU.h)).toEqual({ x: 268, y: 249 });
  });

  it('moves off a side that would cover another spot', () => {
    // Spot 2's right side would cover spot 4 and its left side spot 0: above it is.
    expect(placeBeside(MAP.buildSpots[2], MENU.w, MENU.h)).toEqual({ x: 156, y: 38 });
    // Spot 6's right side would cover spot 7: left.
    expect(placeBeside(MAP.buildSpots[6], MENU.w, MENU.h)).toEqual({ x: 304, y: 249 });
  });

  it('clamps inside the map area, never over the HUD', () => {
    expect(placeBeside({ x: 900, y: 470 }, MENU.w, MENU.h)).toEqual({ x: 788, y: 366 });
    expect(placeBeside({ x: 900, y: 10 }, MENU.w, MENU.h).y).toBe(4);
  });

  for (const [name, size] of [['menu', MENU], ['panel', PANEL]] as const) {
    it(`no ${name} covers a spot or leaves the map area`, () => {
      MAP.buildSpots.forEach((s) => {
        const p = placeBeside(s, size.w, size.h);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x + size.w).toBeLessThanOrEqual(960);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y + size.h).toBeLessThanOrEqual(480);
        for (const other of MAP.buildSpots) {
          const cx = Math.min(Math.max(other.x, p.x), p.x + size.w);
          const cy = Math.min(Math.max(other.y, p.y), p.y + size.h);
          expect(Math.hypot(cx - other.x, cy - other.y)).toBeGreaterThan(18);
        }
      });
    });
  }
});
