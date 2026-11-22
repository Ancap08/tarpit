import { describe, expect, it } from 'vitest';
import { MAPS, pathLength, positionAlongPath } from './map';

describe('map', () => {
  it('pathLength is the sum of the segment lengths', () => {
    // Segments by hand: 160 + 144 + 260 + 288 + 260 + 192 + 280.
    expect(pathLength(MAPS.meadow)).toBe(1584);
  });

  it('positionAlongPath at 0 is the spawn', () => {
    expect(positionAlongPath(MAPS.meadow, 0)).toEqual({ x: 0, y: 240 });
  });

  it('positionAlongPath at a corner is that waypoint', () => {
    expect(positionAlongPath(MAPS.meadow, 160)).toEqual({ x: 160, y: 240 });
    // 160 + 144 = 304 is the corner (160,96).
    expect(positionAlongPath(MAPS.meadow, 304)).toEqual({ x: 160, y: 96 });
  });

  it('positionAlongPath interpolates inside a segment', () => {
    // 304 + 130 is halfway along (160,96) -> (420,96).
    expect(positionAlongPath(MAPS.meadow, 434)).toEqual({ x: 290, y: 96 });
  });

  it('positionAlongPath past the end clamps to the exit', () => {
    expect(positionAlongPath(MAPS.meadow, 1584)).toEqual({ x: 960, y: 192 });
    expect(positionAlongPath(MAPS.meadow, 5000)).toEqual({ x: 960, y: 192 });
  });

  it('positionAlongPath below 0 clamps to the spawn', () => {
    expect(positionAlongPath(MAPS.meadow, -10)).toEqual({ x: 0, y: 240 });
  });
});
