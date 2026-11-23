import { describe, expect, it } from 'vitest';
import { playWithStats } from './balanceRuns';
import { comboBuild, lazyBuild, noTowers, playAllWavesNoTowers, playScripted, referenceBuild, runHeadless } from './headless';
import { TOWER_DEFS } from './towers';
import { ACT_ONE_LAST_WAVE } from './waves';

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
      { action: 'runUntilWaveEnds', ticks: 4335 },
    ]);
    // Milestone 28: all 20 wave 1 Goblins exit; the last (spawned at
    // waveTick 2850) takes the 20th life on waveTick 2850 + 1584 = 4434.
    expect(run.state).toMatchObject({ phase: 'lost', wave: 1, lives: 0, gold: 100 });
  });

  it('is deterministic', () => {
    expect(playAllWavesNoTowers()).toEqual(playAllWavesNoTowers());
  });

  it('a 10-wave run with no towers loses', () => {
    const final = playAllWavesNoTowers();
    const msg = `no-tower run ended on wave ${final.wave} with ${final.lives} lives, phase ${final.phase}`;
    expect(final.phase, msg).toBe('lost');
    expect(final.lives, msg).toBeLessThanOrEqual(0);
    // Milestone 25c: wave 1 leaks all 20 goblins (20 -> 0).
    expect(final.wave, msg).toBe(1);
    expect(final.lives, msg).toBe(0);
  });

  it('logs build, upgrade and sell results', () => {
    const run = runHeadless([
      { type: 'build', cell: { col: 2, row: 5 }, tower: 'musketeer' },
      { type: 'upgrade', cell: { col: 2, row: 5 } },
      { type: 'build', cell: { col: 2, row: 5 }, tower: 'cannon' },
      { type: 'startWave' }, // locks the tower (milestone 25a): the sell pays 70%
      { type: 'sell', cell: { col: 2, row: 5 } },
      { type: 'sell', cell: { col: 2, row: 5 } },
      { type: 'build', cell: { col: 0, row: 7 }, tower: 'musketeer' },
    ]);
    expect(run.log.map((l) => ('result' in l ? [l.action, l.result.ok ? 'ok' : l.result.reason] : l.action))).toEqual([
      ['build', 'ok'],
      ['upgrade', 'ok'],
      ['build', 'cell-occupied'],
      ['startWave', 'ok'],
      ['sell', 'ok'],
      ['sell', 'no-tower'],
      ['build', 'not-buildable'],
    ]);
    expect(run.state.gold).toBe(74); // 100 - 50 - 35 + 59
  });
});

describe('scripted builds', () => {
  it('comboBuild wins all 20 waves with every action accepted', () => {
    const run = playScripted(comboBuild());
    const refused = run.log.filter((l) => 'result' in l && !l.result.ok);
    expect(refused).toEqual([]);
    expect(run.state.phase).toBe('won');
    expect(run.waves.map((w) => w.wave)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    // Exact pins of the balance outcome live in balance.test.ts.
  });

  it('lazyBuild loses with every action accepted', () => {
    const run = playScripted(lazyBuild());
    expect(run.log.filter((l) => 'result' in l && !l.result.ok)).toEqual([]);
    expect(run.state.phase).toBe('lost');
  });

  it.each([
    ['comboBuild', 'longbow'], ['wideBuild', 'longbow'], ['hardBuild', 'longbow'],
    ['artilleryBuild', 'mortar'], ['burnBuild', 'firepot'], ['musketBuild', 'musketeer'],
  ] as const)(
    '%s keeps the fixed plan and spends on its own reinforcements in act two',
    (build, main) => {
      const fixed = referenceBuild(build, 'normal', 'meadow', undefined, { fixedOnly: true });
      const reinvesting = referenceBuild(build, 'normal', 'meadow');
      expect(reinvesting.slice(0, ACT_ONE_LAST_WAVE)).toEqual(fixed.slice(0, ACT_ONE_LAST_WAVE));
      expect(reinvesting.flat().slice(0, fixed.flat().length)).toEqual(fixed.flat());
      expect(reinvesting.flat().length).toBeGreaterThan(fixed.flat().length);
      if (build === 'wideBuild') {
        expect(reinvesting.flat().some((action) => action.type === 'upgrade' && action.path)).toBe(false);
      }
      const run = playWithStats(reinvesting, 'normal');
      expect(run.refused).toBe(0);
      expect(run.waves.at(-1)?.goldAfterPurchases).toBeLessThan(TOWER_DEFS[main].cost);
    },
  );

  it('playScripted stops after a loss and caps each wave', () => {
    expect(playScripted(noTowers()).waves.map((w) => w.phase)).toEqual(['lost']);
    const capped = playScripted([], 100);
    expect(capped.waves[0]).toMatchObject({ wave: 1, ticks: 100, phase: 'wave' });
    expect(capped.waves).toHaveLength(1);
  });
});
