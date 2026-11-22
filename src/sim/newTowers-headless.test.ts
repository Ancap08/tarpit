// Milestone 10 headless builds: longbowSpam, comboBuild and comboBuildNoFire.
// The structural checks live here: longbowSpam's rule, the combo build's
// shape (a Tar Pit and a Fire Pot sharing a stretch, Longbows, a Mortar) and
// how comboBuildNoFire is derived. The milestone 12 balance targets for all
// three are in balance.test.ts.
import { describe, expect, it } from 'vitest';
import { cellCenter, cellKey } from './grid';
import { COMBO_PLAN, comboBuild, comboBuildNoFire, TRAIL_CELL_ORDER, longbowSpam, playScripted, type BuildAction, type WaveScript } from './headless';
import { MAPS, pathLength, positionAlongPath } from './map';
import { TOWER_DEFS } from './towers';
import type { Point, TowerType } from './types';

function play(script: WaveScript) {
  const run = playScripted(script);
  const refused = run.log.filter((l) => 'result' in l && !l.result.ok);
  return { ...run.state, refused, msg: `${run.state.phase} on wave ${run.state.wave}, ${run.state.lives} lives, ${run.state.gold} gold` };
}

const builds = (script: WaveScript, type: TowerType): BuildAction[] =>
  script.flat().filter((a) => a.type === 'build' && a.tower === type);

describe('longbowSpam', () => {
  it('only builds base Longbows, in trail order, every action accepted', () => {
    const actions = longbowSpam().flat();
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.type === 'build' && a.tower === 'longbow')).toBe(true);
    expect(actions.map((a) => a.cell)).toEqual(TRAIL_CELL_ORDER.slice(0, actions.length));
    expect(play(longbowSpam()).refused).toEqual([]);
  });
});

describe('comboBuild', () => {
  it('wins all 10 waves with every action accepted', () => {
    const r = play(comboBuild());
    expect(r.refused).toEqual([]);
    expect(r.phase, r.msg).toBe('won');
    expect(r.wave, r.msg).toBe(10);
  });

  it('uses a Tar Pit and a Fire Pot covering the same stretch of path, Longbows and a Mortar', () => {
    const script = comboBuild();
    const tar = builds(script, 'tarpit');
    const fire = builds(script, 'firepot');
    expect(tar.length).toBeGreaterThan(0);
    expect(fire.length).toBeGreaterThan(0);
    expect(builds(script, 'longbow').length).toBeGreaterThan(0);
    expect(builds(script, 'mortar').length).toBeGreaterThan(0);
    // Some path point is within base range of both a Tar Pit and a Fire Pot.
    const within = (p: Point, a: BuildAction, type: TowerType) => {
      const c = cellCenter(a.cell);
      return Math.hypot(p.x - c.x, p.y - c.y) <= TOWER_DEFS[type].base.range;
    };
    let shared = 0;
    for (let d = 0; d <= pathLength(MAPS.meadow); d++) {
      const p = positionAlongPath(MAPS.meadow, d);
      if (tar.some((a) => within(p, a, 'tarpit')) && fire.some((a) => within(p, a, 'firepot'))) shared++;
    }
    expect(shared).toBeGreaterThan(50);
  });

  // Milestone 25c: the plan's last items soak up late gold, so it ends
  // before them: 29 of its 31 actions are bought (28 before milestone 30).
  it('follows COMBO_PLAN in order: 29 of 31 actions bought by wave 10', () => {
    const bought = comboBuild().flat();
    expect(COMBO_PLAN).toHaveLength(31);
    expect(bought).toHaveLength(29);
    expect(bought).toEqual(COMBO_PLAN.slice(0, 29));
  });
});

describe('comboBuildNoFire', () => {
  it('is comboBuild without the Fire Pot cells, and does worse: lost, or won with fewer lives', () => {
    const combo = comboBuild();
    const noFire = comboBuildNoFire();
    const fireCells = new Set(builds(combo, 'firepot').map((a) => cellKey(a.cell)));
    expect([...noFire]).toEqual(combo.map((wave) => wave.filter((a) => !fireCells.has(cellKey(a.cell)))));
    // Milestone 30: its specials are the policy's, recorded for its own game.
    expect(noFire.timed!.flat().length).toBeGreaterThan(0);
    expect(noFire.timed!.flat().every((a) => a.type === 'special')).toBe(true);
    expect(builds(noFire, 'firepot')).toEqual([]);
    const withFire = play(combo);
    const without = play(noFire);
    expect(without.refused).toEqual([]);
    const worse = without.phase === 'lost' || without.lives < withFire.lives;
    expect(worse, `with fire: ${withFire.msg}; without: ${without.msg}`).toBe(true);
  });
});
