import { expect, it } from 'vitest';
import { lockedLevelText } from '../names';
import { parseProgress, type CampaignProgress } from '../../sim';
import { campaignStops, openingAct } from './campaignMap';

const firstActWon: CampaignProgress = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 2] as const));

it.each([false, true])('fits ten separate stops per act on one screen (portrait=%s)', portrait => {
  const width = portrait ? 480 : 960;
  const height = portrait ? 1194 : 580;
  for (const act of [1, 2] as const) {
    const offset = (act - 1) * 10;
    const progress: CampaignProgress = { ...(act === 2 ? firstActWon : {}), [offset + 1]: 3, [offset + 2]: 1 };
    const stops = campaignStops(portrait, progress, act);
    expect(stops.map(stop => stop.id)).toEqual(Array.from({ length: 10 }, (_, i) => offset + i + 1));
    expect(stops.filter(stop => stop.open).map(stop => stop.id)).toEqual([offset + 1, offset + 2, offset + 3]);
    expect(stops.filter(stop => stop.next).map(stop => stop.id)).toEqual([offset + 3]);
    expect(stops.slice(0, 3).map(stop => stop.stars)).toEqual([3, 1, 0]);
    expect(stops.every(stop => stop.feat === (act === 2))).toBe(true);
    for (const [index, { rect: a }] of stops.entries()) {
      expect(a.x >= 0 && a.y >= 0 && a.x + a.width <= width && a.y + a.height <= height).toBe(true);
      for (const screenHeight of portrait ? [664, 844] : [580]) {
        const scale = Math.min((portrait ? 390 : 960) / width, screenHeight / height);
        expect(Math.min(a.width, a.height) * scale).toBeGreaterThanOrEqual(44);
      }
      for (const { rect: b } of stops.slice(index + 1)) {
        expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
      }
    }
  }
});

it('opens the act containing the first unwon open stop, including old saves and zero-star passes', () => {
  expect(openingAct({})).toBe(1);
  expect(openingAct({ 1: 2, 10: 3 })).toBe(1);
  const old = parseProgress(JSON.stringify({ v: 1, stars: firstActWon }));
  expect(openingAct(old)).toBe(2);
  expect(campaignStops(true, old).filter(stop => stop.next).map(stop => stop.id)).toEqual([11]);
  const cheated: CampaignProgress = { ...old, 10: 0, 11: 0 };
  expect(campaignStops(true, cheated).filter(stop => stop.next).map(stop => stop.id)).toEqual([12]);
  const complete = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, 2] as const));
  expect(openingAct(complete)).toBe(2);
  expect(campaignStops(false, complete).some(stop => stop.next)).toBe(false);
});

it('shows a passed zero-star stop and points at the following open stop', () => {
  const stops = campaignStops(false, { 1: 0 });
  expect(stops.slice(0, 3).map(({ open, next, stars }) => ({ open, next, stars }))).toEqual([
    { open: true, next: false, stars: 0 }, { open: true, next: true, stars: 0 }, { open: false, next: false, stars: 0 },
  ]);
});

it('tells the player which open level to win', () => {
  expect(lockedLevelText(1)).toBe('Win level 1 first');
  expect(lockedLevelText(9)).toBe('Win level 9 first');
});
