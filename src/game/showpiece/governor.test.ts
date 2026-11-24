import { expect, it } from 'vitest';
import { DetailGovernor } from './governor';

function trace() {
  const quality = new DetailGovernor();
  let now = 0;
  quality.sample(now);
  const frames = (count: number, gap: number) => {
    for (let i = 0; i < count; i++) quality.sample(now += gap);
  };
  return { quality, frames };
}

it('waits at least 30 seconds to restore detail and doubles the wait after another drop', () => {
  const { quality, frames } = trace();
  for (const cooldown of [30_000, 60_000]) {
    frames(25, 30);
    expect(quality.tier).toBe(1);
    frames(cooldown / 15 - 1, 15);
    expect(quality.tier).toBe(1);
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
