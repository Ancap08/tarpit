// Balance targets for v2 (milestone 12, docs/SCOPE-v2.md "Balance targets
// for v2"), proven by headless archetype runs on the grid with all six
// towers, rechecked with the milestone 22 Harpy and Shieldbearer waves, plus
// the milestone 22 anti-air target (noAntiAir), plus the milestone 23 boss
// targets (the combo build kills Grumblefoot; the weak builds never meet him). `npm run sim` prints the same runs wave by wave. The informational
// archetypes (greedyMusket, soundBuild, soundBuildNoTar) have no target here;
// they only have to run deterministically with every action accepted.
import { describe, expect, it } from 'vitest';
import { createGame, startWave, tick } from './game';
import { buildableCells, cellCenter, cellKey } from './grid';
import {
  applyAction,
  ARCHETYPES,
  bossRush,
  comboBuild,
  comboBuildNoBows,
  comboBuildNoFire,
  FIRST_HARPY_WAVE,
  greedyMusket,
  lazyBuild,
  longbowSpam,
  noAntiAir,
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

  it('4. comboBuild pinned exactly: 12 lives and 497 gold at the end (347 before the boss bounty), 145 gold after wave 9 (milestone 23)', () => {
    const r = play(comboBuild());
    expect({ lives: r.lives, gold: r.gold, goldAfterWave9: r.waves[8].gold }).toEqual({ lives: 12, gold: 497, goldAfterWave9: 145 });
  });

  it('5. comboBuildNoFire does strictly worse than comboBuild: lost, or won with fewer lives', () => {
    const combo = play(comboBuild());
    const noFire = play(comboBuildNoFire());
    expect(noFire.refused).toEqual([]);
    const worse = noFire.phase === 'lost' || noFire.lives < combo.lives;
    expect(worse, `with fire: ${combo.msg}; without: ${noFire.msg}`).toBe(true);
  });
});

describe('milestone 22 pins (milestone 23 for the combo builds, which now also earn the 150 boss bounty): where each archetype ends', () => {
  const ends: Record<string, string> = {
    noTowers: 'lost on wave 2, 0 lives, 125 gold',
    lazyBuild: 'lost on wave 7, 0 lives, 113 gold',
    greedyMusket: 'lost on wave 7, 0 lives, 120 gold',
    soundBuild: 'lost on wave 7, 0 lives, 102 gold',
    soundBuildNoTar: 'lost on wave 6, 0 lives, 248 gold',
    longbowSpam: 'lost on wave 9, 0 lives, 464 gold',
    comboBuild: 'won on wave 10, 12 lives, 497 gold',
    comboBuildNoFire: 'won on wave 10, 2 lives, 625 gold',
    noAntiAir: 'lost on wave 7, 0 lives, 226 gold',
    bossRush: 'won on wave 10, 12 lives, 427 gold',
  };
  it('every archetype is pinned', () => {
    expect(Object.keys(ends)).toEqual(Object.keys(ARCHETYPES));
  });
  for (const [name, end] of Object.entries(ends)) {
    it(`${name}: ${end}`, () => {
      expect(play(ARCHETYPES[name]()).msg).toBe(end);
    });
  }
});

describe('anti-air target (milestone 22)', () => {
  /** Play `script` up to and including wave `wave`; return the Harpies spawned and exited in that wave. */
  function harpiesInWave(script: WaveScript, wave: number) {
    const s = createGame();
    const harpies = new Set<number>();
    let exits = 0;
    const running = () => s.phase === 'wave';
    for (let i = 0; i < wave && s.phase === 'setup'; i++) {
      for (const a of script[i] ?? []) expect(applyAction(s, a)).toMatchObject({ result: { ok: true } });
      startWave(s);
      while (running()) {
        tick(s);
        if (s.wave !== wave) continue;
        for (const e of s.events) {
          if (e.kind === 'spawn' && e.enemyType === 'harpy') harpies.add(e.enemyId);
          if (e.kind === 'exit' && harpies.has(e.enemyId)) exits += 1;
        }
      }
    }
    return { reached: s.wave, spawned: harpies.size, exits };
  }

  it('Harpies first come in wave 4', () => {
    expect(FIRST_HARPY_WAVE).toBe(4);
  });

  it('noAntiAir sells its Longbows before wave 4 and builds no Musketeer or Longbow after', () => {
    const script = noAntiAir();
    expect(script[3].filter((a) => a.type === 'sell').map((a) => a.cell)).toEqual([
      { col: 9, row: 5 },
      { col: 9, row: 4 },
    ]);
    for (const wave of script.slice(3)) {
      expect(wave.some((a) => a.type === 'build' && (a.tower === 'musketeer' || a.tower === 'longbow'))).toBe(false);
    }
  });

  it('noAntiAir leaks every Harpy of wave 4', () => {
    const r = harpiesInWave(noAntiAir(), 4);
    expect(r.reached).toBe(4);
    expect(r.spawned).toBe(4);
    expect(r.exits).toBe(r.spawned);
  });

  it('noAntiAir loses by wave 8', () => {
    const r = play(noAntiAir());
    expect(r.refused).toEqual([]);
    expect(r.phase, r.msg).toBe('lost');
    expect(r.wave, r.msg).toBeLessThanOrEqual(8);
  });

  it('comboBuild with the same cells keeps some wave 4 Harpies from exiting (the bows matter)', () => {
    const r = harpiesInWave(comboBuild(), 4);
    expect(r.spawned).toBe(4);
    expect(r.exits).toBeLessThan(r.spawned);
  });

  it('why noAntiAir sells instead: dropping the bows from wave 1 loses on wave 2, before any Harpy', () => {
    const r = play(comboBuildNoBows());
    expect(r.msg).toBe('lost on wave 2, 0 lives, 65 gold');
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

describe('boss targets (milestone 23)', () => {
  /** Play `script`; every boss event and the tick (in wave 10) it came on. */
  function bossEvents(script: WaveScript) {
    const s = createGame();
    const events: { waveTick: number; kind: string; cause?: string }[] = [];
    const running = () => s.phase === 'wave';
    for (let i = 0; i < 10 && s.phase === 'setup'; i++) {
      for (const a of script[i] ?? []) expect(applyAction(s, a)).toMatchObject({ result: { ok: true } });
      startWave(s);
      while (running()) {
        const waveTick = s.waveTick;
        tick(s);
        for (const e of s.events) {
          if (e.kind === 'bossSpawn') events.push({ waveTick, kind: e.kind });
          if (e.kind === 'bossDown') events.push({ waveTick, kind: e.kind, cause: e.cause });
        }
      }
    }
    return { state: s, events };
  }

  it('comboBuild kills the boss (shot) at waveTick 4639 of wave 10 and wins with 12 lives', () => {
    const r = bossEvents(comboBuild());
    expect(r.events).toEqual([
      { waveTick: 1560, kind: 'bossSpawn' },
      { waveTick: 4639, kind: 'bossDown', cause: 'shot' },
    ]);
    expect(['shot', 'burn']).toContain(r.events[1].cause);
    expect(r.state).toMatchObject({ phase: 'won', wave: 10, lives: 12 });
  });

  it('lazyBuild and longbowSpam are lost before wave 10 and never meet the boss', () => {
    for (const script of [lazyBuild(), longbowSpam()]) {
      const r = bossEvents(script);
      expect(r.state.phase).toBe('lost');
      expect(r.state.wave).toBeLessThan(10);
      expect(r.events).toEqual([]);
    }
  });

  it('bossRush (informational): one more upgraded Longbow (all the 115 gold left allows) kills him sooner, at waveTick 4562', () => {
    const extra = bossRush()[9].slice(comboBuild()[9].length);
    expect(extra).toEqual([
      { type: 'build', cell: { col: 2, row: 5 }, tower: 'longbow' },
      { type: 'upgrade', cell: { col: 2, row: 5 } },
    ]);
    const r = bossEvents(bossRush());
    expect(r.events).toEqual([
      { waveTick: 1560, kind: 'bossSpawn' },
      { waveTick: 4562, kind: 'bossDown', cause: 'burn' },
    ]);
  });
});
