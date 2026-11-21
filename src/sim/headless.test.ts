import { describe, expect, it } from 'vitest';
import { lazyBuild, noTowers, playAllWavesNoTowers, playScripted, runHeadless, soundBuild } from './headless';

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

  it('logs build, upgrade and sell results', () => {
    const run = runHeadless([
      { type: 'build', spotId: 0, tower: 'musketeer' },
      { type: 'upgrade', spotId: 0 },
      { type: 'build', spotId: 0, tower: 'cannon' },
      { type: 'sell', spotId: 0 },
      { type: 'sell', spotId: 0 },
    ]);
    expect(run.log.map((l) => ('result' in l ? [l.action, l.result.ok ? 'ok' : l.result.reason] : l.action))).toEqual([
      ['build', 'ok'],
      ['upgrade', 'ok'],
      ['build', 'spot-occupied'],
      ['sell', 'ok'],
      ['sell', 'no-tower'],
    ]);
    expect(run.state.gold).toBe(74); // 100 - 50 - 35 + 59
  });
});

describe('scripted builds', () => {
  it('soundBuild wins all 10 waves with every action accepted', () => {
    const run = playScripted(soundBuild());
    const refused = run.log.filter((l) => 'result' in l && !l.result.ok);
    expect(refused).toEqual([]);
    expect(run.state.phase).toBe('won');
    expect(run.waves.map((w) => w.wave)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Exact pins of the balance outcome live in balance.test.ts.
  });

  it('lazyBuild loses with every action accepted', () => {
    const run = playScripted(lazyBuild());
    expect(run.log.filter((l) => 'result' in l && !l.result.ok)).toEqual([]);
    expect(run.state.phase).toBe('lost');
  });

  it('playScripted stops after a loss and caps each wave', () => {
    expect(playScripted(noTowers()).waves.map((w) => w.phase)).toEqual(['setup', 'lost']);
    const capped = playScripted([], 100);
    expect(capped.waves[0]).toMatchObject({ wave: 1, ticks: 100, phase: 'wave' });
    expect(capped.waves).toHaveLength(1);
  });
});
