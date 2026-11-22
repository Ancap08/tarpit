// Balance targets for v2 (milestone 12, docs/SCOPE-v2.md "Balance targets
// for v2"), proven by headless archetype runs on the grid with all six
// towers, rechecked with the milestone 22 Harpy and Shieldbearer waves, plus
// the milestone 22 anti-air target (noAntiAir), plus the milestone 23 boss
// targets (the combo build kills Grumblefoot; the weak builds never meet him).
// Milestone 25c (horde retune, docs/SCOPE-v4.md): every target rechecked on
// the horde waves; the combo build now fires the cluster special policy and
// may have up to 199 gold after wave 9 (150 before); comboNoSpecials is new;
// the horde shape is pinned against the milestone 25b waves. `npm run sim`
// prints the same runs wave by wave. The informational archetypes
// (greedyMusket, soundBuild, soundBuildNoTar, bossRush, hardBuild on Normal)
// have no target here; they only have to run deterministically with every
// action accepted.
import { describe, expect, it } from 'vitest';
import { ENEMY_STATS } from './enemies';
import { createGame, startWave, tick } from './game';
import { buildableCells, cellCenter, cellKey } from './grid';
import {
  applyAction,
  ARCHETYPES,
  bossRush,
  CLUSTER_POLICY_TICKS,
  comboBuild,
  comboBuildNoBows,
  comboBuildNoFire,
  comboNoSpecials,
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
import type { GameState } from './types';
import { WAVES } from './waves';

/** Fire the timed actions of wave index `i` due at this tick (cluster specials, milestone 25c). */
function fireTimed(s: GameState, script: WaveScript, i: number): void {
  for (const a of script.timed?.[i] ?? []) if (a.atWaveTick === s.waveTick) applyAction(s, a);
}

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

  it('4. comboBuild wins with 5 to 15 lives and under 200 gold after wave 9 (150 before milestone 25c)', () => {
    const r = play(comboBuild());
    expect(r.refused).toEqual([]);
    expect(r.phase, r.msg).toBe('won');
    expect(r.wave, r.msg).toBe(10);
    expect(r.lives, r.msg).toBeGreaterThanOrEqual(5);
    expect(r.lives, r.msg).toBeLessThanOrEqual(15);
    const afterWave9 = r.waves[8];
    expect(afterWave9.wave).toBe(9);
    expect(afterWave9.gold).toBeLessThan(200);
  });

  it('4. comboBuild pinned exactly: 13 lives and 418 gold at the end, 163 gold after wave 9 (milestone 25c)', () => {
    const r = play(comboBuild());
    expect({ lives: r.lives, gold: r.gold, goldAfterWave9: r.waves[8].gold }).toEqual({ lives: 13, gold: 418, goldAfterWave9: 163 });
  });

  it('4. comboBuild fires one cluster special per wave, at CLUSTER_POLICY_TICKS, every one accepted', () => {
    const script = comboBuild();
    expect(script.timed).toEqual(CLUSTER_POLICY_TICKS.map((atWaveTick) => [{ type: 'clusterSpecial', atWaveTick }]));
    const run = playScripted(script);
    const fired = run.log.filter((l) => l.action === 'special');
    expect(fired.map((l) => l.waveTick)).toEqual(CLUSTER_POLICY_TICKS);
    for (const f of fired) expect(f).toMatchObject({ result: { ok: true } });
  });

  it('5. comboBuildNoFire does strictly worse than comboBuild: lost, or won with fewer lives', () => {
    const combo = play(comboBuild());
    const noFire = play(comboBuildNoFire());
    expect(noFire.refused).toEqual([]);
    const worse = noFire.phase === 'lost' || noFire.lives < combo.lives;
    expect(worse, `with fire: ${combo.msg}; without: ${noFire.msg}`).toBe(true);
  });

  it('6. comboNoSpecials (milestone 25c) does strictly worse than comboBuild but reaches wave 8', () => {
    const combo = play(comboBuild());
    const plain = play(comboNoSpecials());
    expect(plain.refused).toEqual([]);
    expect(comboNoSpecials().timed).toBeUndefined();
    const worse = plain.phase === 'lost' || plain.lives < combo.lives;
    expect(worse, `with specials: ${combo.msg}; without: ${plain.msg}`).toBe(true);
    expect(plain.wave, plain.msg).toBeGreaterThanOrEqual(8);
  });
});

describe('horde shape (milestone 25c) against the milestone 25b waves', () => {
  // Per wave before milestone 25c: enemies and total bounty (no clear bonus).
  const BEFORE_COUNTS = [8, 12, 14, 14, 17, 35, 24, 45, 18, 30];
  const BEFORE_BOUNTY = [32, 48, 62, 78, 85, 169, 158, 249, 108, 357];
  const count = WAVES.map((w) => w.groups.reduce((n, g) => n + g.count, 0));
  const bounty = WAVES.map((w) => w.groups.reduce((n, g) => n + g.count * ENEMY_STATS[g.type].bounty, 0));

  it('2 to 3 times the enemies over waves 1 to 10 (500 against 217)', () => {
    const before = BEFORE_COUNTS.reduce((a, b) => a + b, 0);
    const after = count.reduce((a, b) => a + b, 0);
    expect([before, after]).toEqual([217, 500]);
    expect(after / before).toBeGreaterThanOrEqual(2);
    expect(after / before).toBeLessThanOrEqual(3);
  });

  it('no wave has fewer enemies than before, and every wave pays more bounty', () => {
    count.forEach((n, i) => expect(n, `wave ${i + 1}`).toBeGreaterThanOrEqual(BEFORE_COUNTS[i]));
    bounty.forEach((b, i) => expect(b, `wave ${i + 1}`).toBeGreaterThan(BEFORE_BOUNTY[i]));
  });

  it('Goblin, Wolf and Harpy have less hp than before (30, 28, 40)', () => {
    expect(ENEMY_STATS.goblin.hp).toBeLessThan(30);
    expect(ENEMY_STATS.wolf.hp).toBeLessThan(28);
    expect(ENEMY_STATS.harpy.hp).toBeLessThan(40);
  });

  it('every wave spawns within 90 s', () => {
    for (const w of WAVES) {
      const last = Math.max(...w.groups.map((g) => g.delay + (g.count - 1) * g.interval));
      expect(last).toBeLessThan(90);
    }
  });
});

describe('milestone 25c pins: where each archetype ends on Normal', () => {
  const ends: Record<string, string> = {
    noTowers: 'lost on wave 1, 0 lives, 100 gold',
    lazyBuild: 'lost on wave 8, 0 lives, 349 gold',
    greedyMusket: 'lost on wave 10, -4 lives, 227 gold',
    soundBuild: 'lost on wave 8, 0 lives, 257 gold',
    soundBuildNoTar: 'lost on wave 7, 0 lives, 236 gold',
    longbowSpam: 'lost on wave 8, 0 lives, 504 gold',
    comboBuild: 'won on wave 10, 13 lives, 418 gold',
    comboBuildNoFire: 'won on wave 10, 4 lives, 572 gold',
    comboNoSpecials: 'won on wave 10, 10 lives, 395 gold',
    noAntiAir: 'lost on wave 4, 0 lives, 189 gold',
    bossRush: 'won on wave 10, 13 lives, 418 gold',
    hardBuild: 'won on wave 10, 20 lives, 442 gold',
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
        fireTimed(s, script, i);
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
      { col: 17, row: 8 },
    ]);
    for (const wave of script.slice(3)) {
      expect(wave.some((a) => a.type === 'build' && (a.tower === 'musketeer' || a.tower === 'longbow'))).toBe(false);
    }
  });

  // Milestone 25c: at least 75% of them (8 of 10; the game is lost on wave
  // 4 with two Harpies still on the field). Before: all 4 of 4.
  it('noAntiAir leaks at least 75% of the wave 4 Harpies: 8 of 10', () => {
    const r = harpiesInWave(noAntiAir(), 4);
    expect(r.reached).toBe(4);
    expect(r).toMatchObject({ spawned: 10, exits: 8 });
    expect(r.exits).toBeGreaterThanOrEqual(0.75 * r.spawned);
  });

  it('noAntiAir loses by wave 8', () => {
    const r = play(noAntiAir());
    expect(r.refused).toEqual([]);
    expect(r.phase, r.msg).toBe('lost');
    expect(r.wave, r.msg).toBeLessThanOrEqual(8);
  });

  it('comboBuild with the same cells keeps some wave 4 Harpies from exiting (the bows matter)', () => {
    const r = harpiesInWave(comboBuild(), 4);
    expect(r.spawned).toBe(10);
    expect(r.exits).toBeLessThan(r.spawned);
  });

  it('why noAntiAir sells instead: dropping the bows from wave 1 loses on wave 2, before any Harpy', () => {
    const r = play(comboBuildNoBows());
    expect(r.msg).toBe('lost on wave 2, 0 lives, 87 gold');
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
        fireTimed(s, script, i);
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

  it('comboBuild kills the boss (shot) at waveTick 3921 of wave 10 and wins with 13 lives', () => {
    const r = bossEvents(comboBuild());
    expect(r.events).toEqual([
      { waveTick: 1560, kind: 'bossSpawn' },
      { waveTick: 3921, kind: 'bossDown', cause: 'shot' },
    ]);
    expect(['shot', 'burn']).toContain(r.events[1].cause);
    expect(r.state).toMatchObject({ phase: 'won', wave: 10, lives: 13 });
  });

  it('lazyBuild and longbowSpam are lost before wave 10 and never meet the boss', () => {
    for (const script of [lazyBuild(), longbowSpam()]) {
      const r = bossEvents(script);
      expect(r.state.phase).toBe('lost');
      expect(r.state.wave).toBeLessThan(10);
      expect(r.events).toEqual([]);
    }
  });

  // Milestone 25c: the longer combo plan spends the gold a bossRush Longbow
  // pair needs (70), so bossRush adds nothing and equals comboBuild.
  it('bossRush (informational): no gold left for an extra Longbow pair, so the boss dies at the same waveTick 3921', () => {
    const extra = bossRush()[9].slice(comboBuild()[9].length);
    expect(extra).toEqual([]);
    const r = bossEvents(bossRush());
    expect(r.events).toEqual([
      { waveTick: 1560, kind: 'bossSpawn' },
      { waveTick: 3921, kind: 'bossDown', cause: 'shot' },
    ]);
  });
});
