import { describe, expect, it } from 'vitest';
import { playAllWavesNoTowers, runHeadless } from './headless';

describe('headless runner', () => {
  it('runs a script and logs each action', () => {
    const run = runHeadless([
      { type: 'startWave' },
      { type: 'startWave' },
      { type: 'runUntilWaveEnds', maxTicks: 100 },
      { type: 'runUntilWaveEnds', maxTicks: 10_000 },
    ]);
    expect(run.log).toEqual([
      { action: 'startWave', result: { ok: true, wave: 1 } },
      { action: 'startWave', result: { ok: false, reason: 'not-in-setup' } },
      { action: 'runUntilWaveEnds', ticks: 100 },
      { action: 'runUntilWaveEnds', ticks: 1905 },
    ]);
    expect(run.state).toMatchObject({ phase: 'setup', wave: 1, lives: 12, gold: 125 });
  });

  it('is deterministic', () => {
    expect(playAllWavesNoTowers()).toEqual(playAllWavesNoTowers());
  });

  it('a 10-wave run with no towers loses', () => {
    const final = playAllWavesNoTowers();
    const msg = `no-tower run ended on wave ${final.wave} with ${final.lives} lives, phase ${final.phase}`;
    expect(final.phase, msg).toBe('lost');
    expect(final.lives, msg).toBeLessThanOrEqual(0);
    // Wave 1 leaks 8 goblins (20 -> 12); wave 2 leaks the 12th goblin at 0.
    expect(final.wave, msg).toBe(2);
    expect(final.lives, msg).toBe(0);
  });
});
