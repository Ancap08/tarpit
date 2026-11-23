import { expect, test } from '@playwright/test';
import { HEADROOM, LEVEL_TIERS, levelTier, LOW_SOUNDS, RECIPES, recipeLength, SOUND_NAMES } from '../src/game/audio/recipes';

// Milestone 33 (sound): every recipe rendered offline in the page
// (OfflineAudioContext, window.__tarpit.audioLab, src/game/audio/lab.ts);
// no audio hardware needed. Each sound alone, before the limiter: renders,
// is not silent, peaks at or below HEADROOM, has its stated length (silent
// after it), ends in silence (no click at the cut) and sits in its level
// tier. Then the low sounds through the phone stand-in, the busy wave and
// the worst-case mix through the master chain.

const RMS_FLOOR = 0.005;
const TAIL_MAX = 0.01;
/**
 * Small speakers (follow-up): through the phone stand-in (a 24 dB/octave
 * high-pass at 200 Hz) a low sound keeps at least half its RMS (-6 dB). A
 * sound that is mostly sub-bass keeps a fifth or less (before their mid
 * layers the Cannon boom kept 0.19, the Mortar boom 0.16 and the Keg 0.30);
 * half means the part a phone plays carries most of the sound's energy, so
 * it keeps its shape and is still recognisable.
 */
const PHONE_KEEP = 0.5;
/** The busy wave must get at least this much louder (dB) when an important cue sounds. */
const STANDS_OUT_DB = 3;
/** The limiter only catches peaks: at most this much gain reduction (dB) in the worst case. */
const MAX_REDUCTION_DB = 3;

test.beforeEach(async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.audioLab !== undefined);
});

test('every sound renders, is audible, does not clip, has its length, ends in silence and sits in its level tier', async ({ page }) => {
  expect(await page.evaluate(() => window.__tarpit!.audioLab.names())).toEqual([...SOUND_NAMES]);
  const rows: string[] = [];
  const loud: Record<string, number> = {};
  for (const name of SOUND_NAMES) {
    const s = await page.evaluate((n) => window.__tarpit!.audioLab.render(n), name);
    loud[name] = s.loud;
    const tier = levelTier(name);
    rows.push(`${name.padEnd(20)} ${s.length.toFixed(3)} s  ${tier.padEnd(6)} loud ${s.loud.toFixed(3)}  peak ${s.peak.toFixed(3)}  rms ${s.rms.toFixed(4)}  tail ${s.tailMax.toExponential(1)}`);
    expect(s.length, name).toBeCloseTo(recipeLength(RECIPES[name]), 6);
    expect(s.rms, `${name} rms`).toBeGreaterThan(RMS_FLOOR);
    expect(s.peak, `${name} peak`).toBeLessThanOrEqual(HEADROOM);
    expect(s.tailMax, `${name} last 5 ms`).toBeLessThan(TAIL_MAX);
    expect(s.afterMax, `${name} after its length`).toBeLessThan(1e-3);
    const [lo, hi] = LEVEL_TIERS[tier];
    expect(s.loud, `${name} loudness in the ${tier} band`).toBeGreaterThanOrEqual(lo);
    expect(s.loud, `${name} loudness in the ${tier} band`).toBeLessThanOrEqual(hi);
  }
  console.log(rows.join('\n'));
  // Each tower's impact is louder than its shot.
  for (const t of ['musketeer', 'longbow', 'cannon', 'mortar', 'tarpit', 'firepot']) expect(loud[`impact.${t}`], t).toBeGreaterThan(loud[`shot.${t}`]);
  // Grumblemaw's entrance and fall are the loudest cues in the campaign.
  const finalBoss = ['grumblemawArrive', 'grumblemawFall'];
  const otherCues = SOUND_NAMES.filter((name) => !finalBoss.includes(name));
  const otherPeak = Math.max(...otherCues.map((name) => loud[name]));
  for (const name of finalBoss) expect(loud[name], name).toBeGreaterThan(otherPeak);
});

test('the low sounds keep their shape through a 200 Hz high-pass (the phone stand-in)', async ({ page }) => {
  const keep: Record<string, number> = {};
  for (const name of LOW_SOUNDS) {
    const full = await page.evaluate((n) => window.__tarpit!.audioLab.render(n), name);
    const phone = await page.evaluate((n) => window.__tarpit!.audioLab.render(n, true), name);
    keep[name] = phone.rms / full.rms;
  }
  console.log(LOW_SOUNDS.map((n) => `${n.padEnd(20)} keeps ${keep[n].toFixed(2)} of its RMS`).join('\n'));
  for (const name of LOW_SOUNDS) expect(keep[name], name).toBeGreaterThanOrEqual(PHONE_KEEP);
});

test('the busy wave does not bury the horn, Powder Keg or Grumblemaw cues', async ({ page }) => {
  const r = await page.evaluate(() => window.__tarpit!.audioLab.busyAudibility());
  console.log(r.map((x) => `${x.name} at ${x.at} s: the mix gets ${x.gainDb.toFixed(1)} dB louder`).join('\n'));
  expect(r.map((x) => x.name)).toEqual(['grumblemawArrive', 'waveStart', 'packCall', 'special.keg', 'grumblemawFall']);
  for (const x of r) expect(x.gainDb, x.name).toBeGreaterThanOrEqual(STANDS_OUT_DB);
});

test('the worst case (40 shots, impacts and deaths in half a second) does not clip or pump through the master chain', async ({ page }) => {
  for (const thin of [true, false]) {
    const s = await page.evaluate((t) => window.__tarpit!.audioLab.worstCase(t), thin);
    console.log(
      `${s.name}: peak ${s.peak.toFixed(3)}, rms ${s.rms.toFixed(3)}, limiter reduction ${s.reductionDb.toFixed(2)} dB, ` +
        `played ${s.played}, thinned ${s.thinned}, capped ${s.capped}, max voices ${s.maxVoices}`,
    );
    expect(s.peak, s.name).toBeLessThanOrEqual(1);
    expect(s.rms, s.name).toBeGreaterThan(RMS_FLOOR);
    expect(s.reductionDb, `${s.name}: limiter reduction`).toBeGreaterThanOrEqual(-MAX_REDUCTION_DB);
    if (thin) expect(s.thinned + s.capped).toBeGreaterThan(0);
  }
});
