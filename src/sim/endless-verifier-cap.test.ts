// Milestone 26 verifier: the headless safety cap. No real build survives
// 200 waves, so the level's lives are mocked up: with no towers every enemy
// walks out, wave 10 is "won" on lives, and the endless script must stop at
// ENDLESS_WAVE_CAP and report `capped`.
import { expect, it, vi } from 'vitest';

vi.mock('./difficulty', async (importOriginal) => {
  const real = await importOriginal<typeof import('./difficulty')>();
  return {
    ...real,
    DIFFICULTY_DEFS: { ...real.DIFFICULTY_DEFS, normal: { ...real.DIFFICULTY_DEFS.normal, startLives: 1e9 } },
  };
});

it('an endless script that never loses stops after ENDLESS_WAVE_CAP waves and reports capped', async () => {
  const { endlessReport, playScripted, ENDLESS_WAVE_CAP } = await import('./headless');
  const script = Object.assign([], { endless: true as const });
  const run = playScripted(script);
  expect(run.waves).toHaveLength(ENDLESS_WAVE_CAP);
  expect(run.state).toMatchObject({ phase: 'setup', wave: 200, endless: true });
  expect(run.waves[9].phase).toBe('won');
  expect(run.waves.filter((w) => w.phase === 'won')).toHaveLength(1);
  expect(endlessReport(script)).toMatchObject({ result: 'capped', wave: 200, wavesCleared: 200 });
  expect(Number.isInteger(run.state.lives)).toBe(true);
});
