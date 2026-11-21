// Milestone 6a balance targets, proven by headless archetype runs. The
// ranges are the targets from the milestone brief; the exact pins make any
// drift visible. `npm run sim` prints the same runs wave by wave.
import { describe, expect, it } from 'vitest';
import { greedyMusket, KID_SPOT_ORDER, lazyBuild, noTowers, playScripted, soundBuild, soundBuildNoTar, type WaveScript } from './headless';

function play(script: WaveScript) {
  const run = playScripted(script);
  const refused = run.log.filter((l) => 'result' in l && !l.result.ok);
  return { ...run.state, refused, msg: `${run.state.phase} on wave ${run.state.wave}, ${run.state.lives} lives, ${run.state.gold} gold` };
}

describe('balance archetypes', () => {
  it('noTowers loses by wave 3', () => {
    const r = play(noTowers());
    expect(r.phase, r.msg).toBe('lost');
    expect(r.wave, r.msg).toBeLessThanOrEqual(3);
  });

  it('lazyBuild (base Musketeers only, kid spot order) loses on wave 6, 7 or 8', () => {
    const r = play(lazyBuild());
    expect(r.refused).toEqual([]);
    expect(r.phase, r.msg).toBe('lost');
    expect(r.wave, r.msg).toBeGreaterThanOrEqual(6);
    expect(r.wave, r.msg).toBeLessThanOrEqual(8);
  });

  it('greedyMusket loses on wave 8 to 10, or wins with at most 5 lives', () => {
    const r = play(greedyMusket());
    expect(r.refused).toEqual([]);
    if (r.phase === 'lost') {
      expect(r.wave, r.msg).toBeGreaterThanOrEqual(8);
    } else {
      expect(r.phase, r.msg).toBe('won');
      expect(r.lives, r.msg).toBeLessThanOrEqual(5);
    }
  });

  it('soundBuild wins with 5 to 15 lives and under 150 gold unspent', () => {
    const r = play(soundBuild());
    expect(r.refused).toEqual([]);
    expect(r.phase, r.msg).toBe('won');
    expect(r.lives, r.msg).toBeGreaterThanOrEqual(5);
    expect(r.lives, r.msg).toBeLessThanOrEqual(15);
    expect(r.gold, r.msg).toBeLessThan(150);
    // Exact pin, so any balance drift shows up here.
    expect({ lives: r.lives, gold: r.gold }).toEqual({ lives: 10, gold: 118 });
  });

  it('soundBuild without its Tar Pits does strictly worse', () => {
    const sound = play(soundBuild());
    const noTar = play(soundBuildNoTar());
    expect(soundBuild().flat().some((a) => a.type === 'build' && a.tower === 'tarpit')).toBe(true);
    expect(soundBuildNoTar().flat().some((a) => a.type === 'build' && a.tower === 'tarpit')).toBe(false);
    expect(noTar.refused).toEqual([]);
    const worse = noTar.phase === 'lost' || noTar.lives < sound.lives;
    expect(worse, `with tar: ${sound.msg}; without: ${noTar.msg}`).toBe(true);
  });
});

describe('archetype rules', () => {
  it('the kid spot order is nearest the spawn first', () => {
    expect(KID_SPOT_ORDER).toEqual([0, 1, 3, 2, 4, 6, 5, 7, 9, 8]);
  });

  it('lazyBuild only builds base Musketeers, in kid spot order', () => {
    const actions = lazyBuild().flat();
    expect(actions.every((a) => a.type === 'build' && a.tower === 'musketeer')).toBe(true);
    expect(actions.map((a) => a.spotId)).toEqual(KID_SPOT_ORDER.slice(0, actions.length));
  });

  it('greedyMusket alternates buy and upgrade, Musketeers only', () => {
    const actions = greedyMusket().flat();
    actions.forEach((a, i) => {
      if (i % 2 === 0) expect(a).toEqual({ type: 'build', spotId: KID_SPOT_ORDER[i / 2], tower: 'musketeer' });
      else expect(a).toEqual({ type: 'upgrade', spotId: KID_SPOT_ORDER[(i - 1) / 2] });
    });
  });
});
