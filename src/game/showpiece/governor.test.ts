import { expect, it } from 'vitest';
import { GameClock } from '../loop';
import { DetailGovernor } from './governor';

function trace(quality = new DetailGovernor()) {
  let now = 0;
  quality.sample(now);
  const frames = (count: number, gap: number) => {
    for (let i = 0; i < count; i++) quality.sample(now += gap);
  };
  return { quality, frames };
}

it.each([true, false])('keeps the recovery cooldown with medium enabled: %s', medium => {
  const { quality, frames } = trace(new DetailGovernor(undefined, { medium }));
  const lower = medium ? 1 : 0;
  expect(quality.tier).toBe(2);
  for (const cooldown of [30_000, 60_000]) {
    frames(24, 30);
    expect(quality.tier).toBe(2);
    frames(1, 30);
    expect(quality.tier).toBe(lower);
    frames(cooldown / 15 - 1, 15);
    expect(quality.tier).toBe(lower);
    frames(1, 15);
    expect(quality.tier).toBe(2);
  }
});

it('requires fresh, continuous headroom for every step up', () => {
  const { quality, frames } = trace();
  frames(50, 30);
  expect(quality.tier).toBe(0);
  frames(80 * 40, 19); // Wait out the cooldown on a marginal device.
  frames(600, 15);
  expect(quality.tier).toBe(0);
  frames(40, 19); // Break the nine-second streak.
  frames(650, 15);
  expect(quality.tier).toBe(0);
  frames(50, 15);
  expect(quality.tier).toBe(1);
  frames(650, 15);
  expect(quality.tier).toBe(1);
  frames(50, 15);
  expect(quality.tier).toBe(2);
});

it('changes tier only once in two minutes on a device at the high-detail boundary', () => {
  const quality = new DetailGovernor();
  let now = 0;
  quality.sample(now);
  const changes = [];
  while (now < 120_000) {
    const before = quality.tier;
    // High detail overruns the budget. Medium has short spells of headroom.
    const mediumGap = now % 8000 < 6000 ? 17 : 19;
    now += before === 2 ? 21 : mediumGap;
    quality.sample(now);
    if (quality.tier !== before) changes.push({ at: now, tier: quality.tier });
  }
  expect(changes).toEqual([{ at: 756, tier: 1 }]);
});

it('ignores the first gap after resuming and still sheds detail within two slow windows', () => {
  const { quality, frames } = trace();
  quality.resetWindow();
  frames(1, 20_000);
  expect(quality.tier).toBe(2);
  frames(2, 1200);
  expect(quality.tier).toBe(0);
});

it('excludes a long pause from recovery and skips the first two frames on resume', () => {
  let wall = 0;
  const clock = new GameClock(() => wall);
  const quality = new DetailGovernor();
  const frame = (ms: number) => {
    wall += ms;
    clock.frame(ms, 1);
    quality.sample(clock.nowMs);
  };
  frame(0);
  frame(750);
  expect(quality.tier).toBe(1);
  clock.paused = true;
  wall += 60_000;
  clock.paused = false;
  quality.resetWindow(2);
  frame(1);
  frame(1000);
  expect(quality.tier).toBe(1);
  for (let i = 0; i < 700; i++) frame(15);
  expect(quality.tier).toBe(1);
  for (let i = 0; i < 1300; i++) frame(15);
  expect(quality.tier).toBe(2);
});
