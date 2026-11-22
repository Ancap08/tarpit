import { expect, test } from '@playwright/test';
import { RECIPES, recipeLength, SOUND_NAMES } from '../src/game/audio/recipes';

// Milestone 33 (sound): every recipe rendered offline in the page
// (OfflineAudioContext, window.__tarpit.audioLab, src/game/audio/lab.ts);
// no audio hardware needed. Each sound alone, before the limiter: renders,
// is not silent, peaks at or below 1.0 (the headroom rule keeps it under
// 0.9), has its stated length (silent after it) and ends in silence (no
// click at the cut). Then the worst-case mix through the master chain.

const RMS_FLOOR = 0.005;
const TAIL_MAX = 0.01;

test.beforeEach(async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.audioLab !== undefined);
});

test('every sound renders, is audible, does not clip, has its length and ends in silence', async ({ page }) => {
  expect(await page.evaluate(() => window.__tarpit!.audioLab.names())).toEqual([...SOUND_NAMES]);
  const rows: string[] = [];
  for (const name of SOUND_NAMES) {
    const s = await page.evaluate((n) => window.__tarpit!.audioLab.render(n), name);
    rows.push(`${name.padEnd(20)} ${s.length.toFixed(3)} s  peak ${s.peak.toFixed(3)}  rms ${s.rms.toFixed(4)}  tail ${s.tailMax.toExponential(1)}`);
    expect(s.length, name).toBeCloseTo(recipeLength(RECIPES[name]), 6);
    expect(s.rms, `${name} rms`).toBeGreaterThan(RMS_FLOOR);
    expect(s.peak, `${name} peak`).toBeLessThanOrEqual(0.9);
    expect(s.tailMax, `${name} last 5 ms`).toBeLessThan(TAIL_MAX);
    expect(s.afterMax, `${name} after its length`).toBeLessThan(1e-3);
  }
  console.log(rows.join('\n'));
});

test('the worst case (40 shots, impacts and deaths in half a second) does not clip through the master chain', async ({ page }) => {
  for (const thin of [true, false]) {
    const s = await page.evaluate((t) => window.__tarpit!.audioLab.worstCase(t), thin);
    console.log(`${s.name}: peak ${s.peak.toFixed(3)}, rms ${s.rms.toFixed(3)}, played ${s.played}, thinned ${s.thinned}, capped ${s.capped}, max voices ${s.maxVoices}`);
    expect(s.peak, s.name).toBeLessThanOrEqual(1);
    expect(s.rms, s.name).toBeGreaterThan(RMS_FLOOR);
    if (thin) expect(s.thinned + s.capped).toBeGreaterThan(0);
  }
});
