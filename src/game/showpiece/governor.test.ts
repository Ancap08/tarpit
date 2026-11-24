import { expect, it } from 'vitest';
import { DetailGovernor } from './governor';

it('sheds detail within two slow windows and restores it only after sustained headroom', () => {
  const quality = new DetailGovernor();
  let now = 0;
  quality.sample(now);
  const frames = (count: number, gap: number) => {
    for (let i = 0; i < count; i++) quality.sample(now += gap);
  };
  frames(25, 30);
  expect(quality.tier).toBe(1);
  frames(25, 30);
  expect(quality.tier).toBe(0);
  frames(188, 16);
  expect(quality.tier).toBe(0);
  frames(47, 16);
  expect(quality.tier).toBe(1);
  frames(235, 16);
  expect(quality.tier).toBe(2);
  frames(1, 20_000);
  expect(quality.tier).toBe(2);
});
