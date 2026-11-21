// Balance targets for v2 (milestone 12, docs/SCOPE-v2.md "Balance targets
// for v2"), proven by headless archetype runs on the grid with all six
// towers. `npm run sim` prints the same runs wave by wave. The informational
// archetypes (greedyMusket, soundBuild, soundBuildNoTar) have no target here;
// they only have to run deterministically with every action accepted.
import { describe, expect, it } from 'vitest';
import { buildableCells, cellCenter, cellKey } from './grid';
import {
  ARCHETYPES,
  comboBuild,
  comboBuildNoFire,
  greedyMusket,
  lazyBuild,
  longbowSpam,
  noTowers,
  playScripted,
  TRAIL_CELL_ORDER,
  TRAIL_REACH,
  TRAIL_STEP,
  type WaveScript,
} from './headless';
import { MAP, pathLength, positionAlongPath } from './map';

function play(script: WaveScript) {
  const run = playScripted(script);
  const refused = run.log.filter((l) => 'result' in l && !l.result.ok);
  return { ...run.state, waves: run.waves, refused, msg: `${run.state.phase} on wave ${run.state.wave}, ${run.state.lives} lives, ${run.state.gold} gold` };
}

describe('every archetype', () => {
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
});

describe('v2 balance targets (milestone 12)', () => {
  it('1. noTowers loses by wave 3', () => {
    const r = play(noTowers());
    expect(r.phase, r.msg).toBe('lost');
    expect(r.wave, r.msg).toBeLessThanOrEqual(3);
  });

  it('2. lazyBuild (base Musketeers along the trail) loses on wave 6, 7 or 8', () => {
    const r = play(lazyBuild());
    expect(r.phase, r.msg).toBe('lost');
    expect(r.wave, r.msg).toBeGreaterThanOrEqual(6);
    expect(r.wave, r.msg).toBeLessThanOrEqual(8);
  });

  it('3. longbowSpam (base Longbows along the trail) loses on wave 7, 8 or 9', () => {
    const r = play(longbowSpam());
    expect(r.phase, r.msg).toBe('lost');
    expect(r.wave, r.msg).toBeGreaterThanOrEqual(7);
    expect(r.wave, r.msg).toBeLessThanOrEqual(9);
  });

  it('4. comboBuild wins with 5 to 15 lives and under 150 gold after wave 9', () => {
    const r = play(comboBuild());
    expect(r.refused).toEqual([]);
    expect(r.phase, r.msg).toBe('won');
    expect(r.wave, r.msg).toBe(10);
    expect(r.lives, r.msg).toBeGreaterThanOrEqual(5);
    expect(r.lives, r.msg).toBeLessThanOrEqual(15);
    const afterWave9 = r.waves[8];
    expect(afterWave9.wave).toBe(9);
    expect(afterWave9.gold).toBeLessThan(150);
  });

  it('4. comboBuild pinned exactly: 11 lives and 177 gold at the end, 136 gold after wave 9', () => {
    const r = play(comboBuild());
    expect({ lives: r.lives, gold: r.gold, goldAfterWave9: r.waves[8].gold }).toEqual({ lives: 11, gold: 177, goldAfterWave9: 136 });
  });

  it('5. comboBuildNoFire does strictly worse than comboBuild: lost, or won with fewer lives', () => {
    const combo = play(comboBuild());
    const noFire = play(comboBuildNoFire());
    expect(noFire.refused).toEqual([]);
    const worse = noFire.phase === 'lost' || noFire.lives < combo.lives;
    expect(worse, `with fire: ${combo.msg}; without: ${noFire.msg}`).toBe(true);
  });
});

describe('archetype rules', () => {
  it('the trail order takes, for each 96 px step along the path, the nearest free buildable cell within 72 px', () => {
    expect(TRAIL_STEP).toBe(96);
    expect(TRAIL_REACH).toBe(72);
    const keys = TRAIL_CELL_ORDER.map(cellKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const cell of TRAIL_CELL_ORDER) expect(buildableCells()[cellKey(cell)]).toBe(true);
    // Every one of the 16 step points (96 .. 1536 on the 1584 px path) finds a cell.
    expect(Math.floor(pathLength(MAP) / TRAIL_STEP)).toBe(16);
    expect(TRAIL_CELL_ORDER).toHaveLength(16);
    TRAIL_CELL_ORDER.forEach((cell, i) => {
      const p = positionAlongPath(MAP, TRAIL_STEP * (i + 1));
      const c = cellCenter(cell);
      expect(Math.hypot(c.x - p.x, c.y - p.y), `cell ${i}`).toBeLessThanOrEqual(TRAIL_REACH);
    });
    expect(TRAIL_CELL_ORDER.slice(0, 6)).toEqual([
      { col: 2, row: 5 },
      { col: 6, row: 6 },
      { col: 3, row: 3 },
      { col: 7, row: 1 },
      { col: 10, row: 1 },
      { col: 14, row: 3 },
    ]);
  });

  it('lazyBuild only builds base Musketeers, in trail order', () => {
    const actions = lazyBuild().flat();
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.type === 'build' && a.tower === 'musketeer')).toBe(true);
    expect(actions.map((a) => a.cell)).toEqual(TRAIL_CELL_ORDER.slice(0, actions.length));
  });

  it('greedyMusket alternates buy and upgrade, Musketeers only, in trail order', () => {
    const actions = greedyMusket().flat();
    expect(actions.length).toBeGreaterThan(0);
    actions.forEach((a, i) => {
      if (i % 2 === 0) expect(a).toEqual({ type: 'build', cell: TRAIL_CELL_ORDER[i / 2], tower: 'musketeer' });
      else expect(a).toEqual({ type: 'upgrade', cell: TRAIL_CELL_ORDER[(i - 1) / 2] });
    });
  });
});
