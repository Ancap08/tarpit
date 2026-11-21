import { describe, expect, it } from 'vitest';
import type { Point } from './types';
import { MAP, pathLength, positionAlongPath } from './map';

/** Shortest distance from p to the path polyline. */
function distanceToPath(p: Point): number {
  let best = Infinity;
  for (let i = 1; i < MAP.path.length; i++) {
    const a = MAP.path[i - 1];
    const b = MAP.path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

describe('map', () => {
  it('has ten build spots', () => {
    expect(MAP.buildSpots).toHaveLength(10);
  });

  it('spot 3 is exactly 80 px from the path, like eight of the other spots (milestone 6a)', () => {
    expect(MAP.buildSpots[3]).toEqual({ x: 240, y: 240 });
    expect(distanceToPath(MAP.buildSpots[3])).toBe(80);
    expect(MAP.buildSpots.map(distanceToPath)).toEqual([64, 80, 80, 80, 80, 80, 80, 80, 80, 80]);
  });

  it('every spot is off the 40 px path strip and at least 50 px from every other spot', () => {
    MAP.buildSpots.forEach((s, i) => {
      expect(distanceToPath(s)).toBeGreaterThan(20);
      MAP.buildSpots.forEach((o, j) => {
        if (i !== j) expect(Math.hypot(s.x - o.x, s.y - o.y)).toBeGreaterThanOrEqual(50);
      });
    });
  });

  it('pathLength is the sum of the segment lengths', () => {
    // Segments by hand: 160 + 144 + 260 + 288 + 260 + 192 + 280.
    expect(pathLength(MAP)).toBe(1584);
  });

  it('positionAlongPath at 0 is the spawn', () => {
    expect(positionAlongPath(MAP, 0)).toEqual({ x: 0, y: 240 });
  });

  it('positionAlongPath at a corner is that waypoint', () => {
    expect(positionAlongPath(MAP, 160)).toEqual({ x: 160, y: 240 });
    // 160 + 144 = 304 is the corner (160,96).
    expect(positionAlongPath(MAP, 304)).toEqual({ x: 160, y: 96 });
  });

  it('positionAlongPath interpolates inside a segment', () => {
    // 304 + 130 is halfway along (160,96) -> (420,96).
    expect(positionAlongPath(MAP, 434)).toEqual({ x: 290, y: 96 });
  });

  it('positionAlongPath past the end clamps to the exit', () => {
    expect(positionAlongPath(MAP, 1584)).toEqual({ x: 960, y: 192 });
    expect(positionAlongPath(MAP, 5000)).toEqual({ x: 960, y: 192 });
  });

  it('positionAlongPath below 0 clamps to the spawn', () => {
    expect(positionAlongPath(MAP, -10)).toEqual({ x: 0, y: 240 });
  });
});
