// Balance archetypes on the grid (milestone 8). The v1 wave targets (lazy
// loses on wave 6 to 8, sound wins with 5 to 15 lives, and so on) are
// suspended until milestone 12 (DECISIONS.md, "v2 approved"). Until then
// these tests assert only that every archetype runs to completion with every
// action accepted, deterministically, that no towers loses by wave 3, that
// the sound build wins, and that removing its Tar Pits does not help.
// `npm run sim` prints the same runs wave by wave.
import { describe, expect, it } from 'vitest';
import { buildableCells, cellCenter, cellKey, distanceToPath, nearestPathPoint } from './grid';
import { ARCHETYPES, greedyMusket, KID_BAND, KID_CELL_ORDER, lazyBuild, noTowers, playScripted, soundBuild, soundBuildNoTar, type WaveScript } from './headless';

function play(script: WaveScript) {
  const run = playScripted(script);
  const refused = run.log.filter((l) => 'result' in l && !l.result.ok);
  return { ...run.state, waves: run.waves, refused, msg: `${run.state.phase} on wave ${run.state.wave}, ${run.state.lives} lives, ${run.state.gold} gold` };
}

describe('balance archetypes (milestone 8: v1 wave targets suspended)', () => {
  for (const [name, archetype] of Object.entries(ARCHETYPES)) {
    it(`${name} runs to completion with every action accepted, identically twice`, () => {
      const a = playScripted(archetype());
      const b = playScripted(archetype());
      expect(a.log.filter((l) => 'result' in l && !l.result.ok)).toEqual([]);
      expect(['won', 'lost']).toContain(a.state.phase);
      expect(b.state).toEqual(a.state);
      expect(b.waves).toEqual(a.waves);
      expect(b.log).toEqual(a.log);
    });
  }

  it('noTowers loses by wave 3', () => {
    const r = play(noTowers());
    expect(r.phase, r.msg).toBe('lost');
    expect(r.wave, r.msg).toBeLessThanOrEqual(3);
  });

  it('soundBuild wins', () => {
    const r = play(soundBuild());
    expect(r.refused).toEqual([]);
    expect(r.phase, r.msg).toBe('won');
    expect(r.wave, r.msg).toBe(10);
  });

  it('soundBuild without its Tar Pits does no better: lost, or won with fewer or equal lives', () => {
    const sound = play(soundBuild());
    const noTar = play(soundBuildNoTar());
    expect(soundBuild().flat().some((a) => a.type === 'build' && a.tower === 'tarpit')).toBe(true);
    expect(soundBuildNoTar().flat().some((a) => a.type === 'build' && a.tower === 'tarpit')).toBe(false);
    expect(noTar.refused).toEqual([]);
    const noBetter = noTar.phase === 'lost' || noTar.lives <= sound.lives;
    expect(noBetter, `with tar: ${sound.msg}; without: ${noTar.msg}`).toBe(true);
  });
});

describe('archetype rules', () => {
  it('the kid cell order holds buildable cells beside the path, entrance first', () => {
    expect(KID_CELL_ORDER.length).toBeGreaterThan(0);
    const keys = KID_CELL_ORDER.map(cellKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const cell of KID_CELL_ORDER) {
      expect(buildableCells()[cellKey(cell)]).toBe(true);
      expect(distanceToPath(cellCenter(cell))).toBeLessThan(KID_BAND);
    }
    // Sorted by (along-path distance of the nearest path point, distance to path, cellKey).
    const sortKey = KID_CELL_ORDER.map((c) => {
      const n = nearestPathPoint(cellCenter(c));
      return [n.along, n.distance, cellKey(c)];
    });
    for (let i = 1; i < sortKey.length; i++) {
      const [a, b] = [sortKey[i - 1], sortKey[i]];
      const cmp = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      expect(cmp, `entries ${i - 1} and ${i}`).toBeLessThan(0);
    }
    // The first cells sit right by the spawn, above and below the first segment.
    expect(KID_CELL_ORDER.slice(0, 4)).toEqual([
      { col: 0, row: 5 },
      { col: 0, row: 9 },
      { col: 1, row: 5 },
      { col: 1, row: 9 },
    ]);
  });

  it('lazyBuild only builds base Musketeers, in kid cell order', () => {
    const actions = lazyBuild().flat();
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.type === 'build' && a.tower === 'musketeer')).toBe(true);
    expect(actions.map((a) => a.cell)).toEqual(KID_CELL_ORDER.slice(0, actions.length));
  });

  it('greedyMusket alternates buy and upgrade, Musketeers only', () => {
    const actions = greedyMusket().flat();
    expect(actions.length).toBeGreaterThan(0);
    actions.forEach((a, i) => {
      if (i % 2 === 0) expect(a).toEqual({ type: 'build', cell: KID_CELL_ORDER[i / 2], tower: 'musketeer' });
      else expect(a).toEqual({ type: 'upgrade', cell: KID_CELL_ORDER[(i - 1) / 2] });
    });
  });
});
