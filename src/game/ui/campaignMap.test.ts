import { expect, it } from 'vitest';
import { lockedLevelText } from '../names';
import { campaignStops } from './campaignMap';

it.each([false, true])('fits ten separate stops on one screen (portrait=%s)', portrait => {
  const width = portrait ? 480 : 960;
  const height = portrait ? 1194 : 580;
  const stops = campaignStops(portrait, { 1: 3, 2: 1 });
  expect(stops.map(stop => stop.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(stops.filter(stop => stop.open).map(stop => stop.id)).toEqual([1, 2, 3]);
  expect(stops.filter(stop => stop.next).map(stop => stop.id)).toEqual([3]);
  expect(stops.slice(0, 3).map(stop => stop.stars)).toEqual([3, 1, 0]);
  for (const [index, { rect: a }] of stops.entries()) {
    expect(a.x >= 0 && a.y >= 0 && a.x + a.width <= width && a.y + a.height <= height).toBe(true);
    if (portrait) expect(Math.min(a.width, a.height) * Math.min(390 / width, 844 / height)).toBeGreaterThanOrEqual(44);
    for (const { rect: b } of stops.slice(index + 1)) {
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    }
  }
});

it('tells the player which open level to win', () => {
  expect(lockedLevelText(1)).toBe('Win level 1 first');
  expect(lockedLevelText(9)).toBe('Win level 9 first');
});
