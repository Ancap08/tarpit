// Milestone 26 verifier: the headless safety cap. No real build survives
// 200 waves, so the level's lives are mocked up: with no towers every enemy
// walks out, wave 20 is "won" on lives, and the endless script must stop at
// ENDLESS_WAVE_CAP and report `capped`.
import { expect, it, vi } from 'vitest';

vi.mock('./difficulty', async (importOriginal) => {
  const real = await importOriginal<typeof import('./difficulty')>();
  return {
    ...real,
    DIFFICULTY_DEFS: { ...real.DIFFICULTY_DEFS, normal: { ...real.DIFFICULTY_DEFS.normal, startLives: 1e9 } },
  };
});

// Keep the real wave numbers, scaling, and transitions. One Goblin per
// wave is enough to exercise the cap without simulating 200 full hordes.
vi.mock('./waves', async (importOriginal) => {
  const real = await importOriginal<typeof import('./waves')>();
  const groups = [{ type: 'goblin', count: 1, interval: 0, delay: 0 }] as const;
  const waves = new Map<number, ReturnType<typeof real.waveDef>>();
  return {
    ...real,
    waveDef(wave: number) {
      let def = waves.get(wave);
      if (!def) {
        def = { ...real.waveDef(wave), groups };
        waves.set(wave, def);
      }
      return def;
    },
  };
});

it('an endless script that never loses stops after ENDLESS_WAVE_CAP waves and reports capped', async () => {
  const { playScripted, ENDLESS_WAVE_CAP } = await import('./headless');
  const script = Object.assign([], { endless: true as const });
  const run = playScripted(script);
  expect(run.waves).toHaveLength(ENDLESS_WAVE_CAP);
  expect(run.state).toMatchObject({ phase: 'setup', wave: 200, endless: true });
  expect(run.waves[19].phase).toBe('won');
  expect(run.waves.filter((w) => w.phase === 'won')).toHaveLength(1);
  expect(Number.isInteger(run.state.lives)).toBe(true);
});

it('the summary labels an uninterrupted run through wave 200 as capped', async () => {
  const { endlessReport } = await import('./headless');
  const script = Object.assign([], { endless: true as const });
  expect(endlessReport(script)).toMatchObject({ result: 'capped', wave: 200, wavesCleared: 200 });
});
