// Verifier (milestone 23): independent probes of Grumblefoot, the wave 10
// boss (docs/SCOPE-v4.md, docs/DESIGN.md "Boss"), with setups chosen apart
// from boss.test.ts. Exact values throughout; the arithmetic is in each
// test's comment.
//
// Geometry. Cell B = (2,5), centre (80,176). Path distance 80 is (80,240),
// 64 px straight below B: inside every base range (Cannon 90, Tar Pit 90,
// Longbow 150). Walking right from there to distance 115 ((115,240)) B is
// sqrt(35^2 + 64^2) = 72.9 px away, still inside the upgraded Tar Pit's 105.
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTower, upgradeTower } from './actions';
import { findTarget } from './combat';
import { ENEMY_STATS } from './enemies';
import type { GameEvent } from './events';
import { createGame, spawnTick, startWave, tick } from './game';
import { cellCenter, type Cell } from './grid';
import { applyAction, applyScriptBoon, comboBuild, comboBuildNoFire, type WaveScript } from './headless';
import { MAPS, pathLength, positionAlongPath } from './map';
import { TOWER_DEFS } from './towers';
import type { Enemy, EnemyType, GameState, TowerType } from './types';
import { WAVES } from './waves';

const B: Cell = { col: 2, row: 5 };
const EXIT = pathLength(MAPS.meadow);

function enemy(id: number, type: EnemyType, distance: number, hp = ENEMY_STATS[type].hp): Enemy {
  return { id, type, hp, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 };
}

/** Mid-wave-1 state, every wave-1 enemy already counted as spawned, so ticks spawn nothing. */
function arena(enemies: Enemy[], towers: [Cell, TowerType, boolean?][] = []): GameState {
  const s = createGame();
  s.gold = 1000;
  for (const [cell, type, upgraded] of towers) {
    expect(buildTower(s, cell, type).ok).toBe(true);
    if (upgraded) expect(upgradeTower(s, cell).ok).toBe(true);
  }
  s.gold = 0;
  s.phase = 'wave';
  s.wave = 1;
  s.spawnedPerGroup = WAVES[0].groups.map((g) => g.count);
  s.enemies = enemies;
  s.nextEnemyId = 50;
  s.events = [];
  return s;
}

const of = (events: GameEvent[], ...kinds: GameEvent['kind'][]) => events.filter((e) => kinds.includes(e.kind));

describe('verifier geometry', () => {
  it('B is 64 px from distance 80 and 72.9 px from distance 115', () => {
    const c = cellCenter(B);
    const d = (distance: number) => {
      const p = positionAlongPath(MAPS.meadow, distance);
      return Math.hypot(p.x - c.x, p.y - c.y);
    };
    expect(d(80)).toBe(64);
    expect(d(115)).toBeCloseTo(Math.sqrt(35 * 35 + 64 * 64), 9);
    expect(TOWER_DEFS.tarpit.upgraded).toMatchObject({ range: 105, slow: 0.6, slowDuration: 2, fireRate: 2 });
  });
});

describe('(a)(b) slow cap: an upgraded Tar Pit (60%) on him and on a Troll', () => {
  // Tick 1: he moves 25/60 unslowed, then the Tar Pit fires: slow 0.6 capped
  // to 0.3 for 2 s = 120 ticks, and the slowed event carries 0.3. The Tar
  // Pit refires every 30 ticks (fireRate 2), refreshing the 0.3, so the next
  // 120 ticks are all slowed: 120 x 25 x 0.7 / 60 = 120 x 0.291666.. = 35 px
  // exactly, against 120 x 25 / 60 = 50 px unslowed. A Troll in the same
  // spot takes the full 0.6: 120 x 35 x 0.4 / 60 = 28 px.
  for (const [type, want, event] of [
    ['boss', 35, 0.3],
    ['troll', 28, 0.6],
  ] as const) {
    it(`${type}: moves ${want} px in the 120 ticks after the first shot, slowed event ${event}`, () => {
      const s = arena([enemy(1, type, 80)], [[B, 'tarpit', true]]);
      tick(s);
      expect(s.enemies[0].distance).toBeCloseTo(80 + ENEMY_STATS[type].speed / 60, 9);
      expect(of(s.events, 'slowed')).toEqual([{ kind: 'slowed', enemyId: 1, slow: event, ticks: 120 }]);
      const d0 = s.enemies[0].distance;
      let slowedTicks = 0;
      for (let i = 0; i < 120; i++) {
        if (s.enemies[0].slowTicksLeft > 0 && s.enemies[0].slow === event) slowedTicks += 1;
        tick(s);
      }
      expect(slowedTicks).toBe(120);
      expect(s.enemies[0].distance - d0).toBeCloseTo(want, 9);
      // Every refresh reported the same capped strength.
      expect(new Set(of(s.events, 'slowed').map((e) => (e.kind === 'slowed' ? e.slow : -1)))).toEqual(new Set([event]));
    });
  }

  it('unslowed he walks 50 px in 120 ticks (the comparison figure)', () => {
    const s = arena([enemy(1, 'boss', 80)]);
    for (let i = 0; i < 120; i++) tick(s);
    expect(s.enemies[0].distance - 80).toBeCloseTo(50, 9);
  });
});

describe('(c) exit: 5 lives, one exit and one bossDown event', () => {
  // Distance EXIT - 0.01 plus 25/60 = 0.4166 px crosses the exit on tick 1.
  for (const [lives, left, phase] of [
    [20, 15, 'wave'],
    [5, 0, 'lost'],
  ] as const) {
    it(`${lives} lives -> ${left}, phase ${phase}`, () => {
      // A second enemy keeps the wave from clearing, so the phase is from the exit alone.
      const s = arena([enemy(1, 'boss', EXIT - 0.01), enemy(2, 'goblin', 10)]);
      s.lives = lives;
      tick(s);
      expect(s.lives).toBe(left);
      expect(s.phase).toBe(phase);
      expect(of(s.events, 'exit')).toEqual([{ kind: 'exit', enemyId: 1 }]);
      expect(of(s.events, 'bossDown')).toEqual([{ kind: 'bossDown', enemyId: 1, enemyType: 'boss', cause: 'exit' }]);
      expect(of(s.events, 'kill', 'won')).toEqual([]);
      expect(of(s.events, 'lost')).toHaveLength(phase === 'lost' ? 1 : 0);
      expect(s.enemies.map((e) => e.id)).toEqual([2]);
    });
  }
});

describe('(d) a burn kill pays 150 once, with kill and bossDown (burn)', () => {
  // Burn per tick is 5 / 60 = 0.0833 > 0.05 hp, no tar so not doubled. A
  // far-off Goblin keeps the wave open, so the gold is the bounty alone.
  it('gold 150, one kill, one bossDown', () => {
    const s = arena([{ ...enemy(1, 'boss', 300, 0.05), burnDps: 5, burnTicksLeft: 60 }, enemy(2, 'goblin', 10)]);
    tick(s);
    expect(s.gold).toBe(150);
    expect(of(s.events, 'kill')).toEqual([{ kind: 'kill', enemyId: 1, enemyType: 'boss', bounty: 150, cause: 'burn' }]);
    expect(of(s.events, 'bossDown')).toEqual([{ kind: 'bossDown', enemyId: 1, enemyType: 'boss', cause: 'burn' }]);
    expect(of(s.events, 'exit', 'waveClear')).toEqual([]);
    expect(s.enemies.map((e) => e.id)).toEqual([2]);
    for (let i = 0; i < 60; i++) tick(s);
    expect(s.gold).toBe(150);
  });
});

describe('(e) wave 10 does not clear while he lives', () => {
  function wave10Alone(): GameState {
    const s = createGame();
    s.phase = 'wave';
    s.wave = 10;
    s.spawnedPerGroup = WAVES[9].groups.map((g) => g.count); // every group fully spawned
    s.enemies = [enemy(1, 'boss', 500)];
    s.lives = 20;
    s.events = [];
    return s;
  }

  it('he is the only enemy left, everything spawned: 60 ticks, phase stays wave, no waveClear', () => {
    const s = wave10Alone();
    for (let i = 0; i < 60; i++) tick(s);
    expect(s.phase).toBe('wave');
    expect(of(s.events, 'waveClear', 'won')).toEqual([]);
    expect(s.enemies).toHaveLength(1);
  });

  it('the same state without him clears and offers a boon on the next tick', () => {
    const s = wave10Alone();
    s.enemies = [];
    tick(s);
    expect(s.phase).toBe('setup');
    expect(s.pendingBoon?.wave).toBe(10);
    expect(of(s.events, 'waveClear', 'won').map((e) => e.kind)).toEqual(['waveClear']);
  });
});

describe('(f) he walks and has no shield', () => {
  it('a Cannon at B targets him at distance 80 (a Harpy there is skipped) and its splash does the full 25', () => {
    const s = arena([enemy(1, 'boss', 80), enemy(2, 'harpy', 81)], [[B, 'cannon']]);
    expect(findTarget(s, s.towers[0])?.id).toBe(1); // the Harpy is further along but untargetable
    tick(s);
    expect(s.enemies.find((e) => e.id === 1)?.hp).toBe(4000 - 25);
    expect(s.enemies.find((e) => e.id === 2)?.hp).toBe(ENEMY_STATS.harpy.hp); // splash stays on the ground
    expect(of(s.events, 'hit')).toEqual([{ kind: 'hit', enemyId: 1, cell: B, tower: 'cannon', damage: 25 }]);
  });

  it('a Longbow at B does its full 4 to him; the same shot does 2 to a Shieldbearer', () => {
    for (const [type, damage] of [
      ['boss', 4],
      ['shieldbearer', 2],
    ] as const) {
      const s = arena([enemy(1, type, 80)], [[B, 'longbow']]);
      tick(s);
      expect(s.enemies[0].hp).toBe(ENEMY_STATS[type].hp - damage);
      expect(of(s.events, 'hit')).toEqual([{ kind: 'hit', enemyId: 1, cell: B, tower: 'longbow', damage }]);
    }
    expect(ENEMY_STATS.boss).toMatchObject({ flying: false, shield: false });
  });
});

describe('(g) the combo builds against him', () => {
  /** Replay through the requested wave and record boss events from ticks and specials. */
  function run(script: WaveScript, lastWave: number) {
    const s = createGame();
    const boss: { wave: number; waveTick: number; kind: string; cause?: string; threshold?: number }[] = [];
    const running = () => s.phase === 'wave';
    const recordBossEvents = (events: GameEvent[], waveTick: number) => {
      for (const e of events) {
        if (e.kind === 'bossSpawn') boss.push({ wave: s.wave, waveTick, kind: e.kind });
        if (e.kind === 'bossDown') boss.push({ wave: s.wave, waveTick, kind: e.kind, cause: e.cause });
        if (e.kind === 'packCall') boss.push({ wave: s.wave, waveTick, kind: e.kind, threshold: e.threshold });
      }
    };
    let midpoint: Pick<GameState, 'phase' | 'wave' | 'gold' | 'lives' | 'pendingBoon'> | undefined;
    for (let w = 0; w < lastWave && s.phase === 'setup'; w++) {
      applyScriptBoon(s, script);
      for (const a of script[w] ?? []) expect(applyAction(s, a)).toMatchObject({ result: { ok: true } });
      expect(startWave(s).ok).toBe(true);
      for (let t = 0; running() && t < 60 * 600; t++) {
        const waveTick = s.waveTick;
        for (const a of script.timed?.[w] ?? []) {
          if (a.atWaveTick !== waveTick) continue;
          const firstEvent = s.events.length;
          applyAction(s, a);
          recordBossEvents(s.events.slice(firstEvent), waveTick);
        }
        tick(s);
        recordBossEvents(s.events, waveTick);
      }
      if (s.wave === 10) {
        const { phase, wave, gold, lives, pendingBoon } = s;
        midpoint = { phase, wave, gold, lives, pendingBoon };
      }
    }
    return { s, boss, midpoint };
  }

  let combo: ReturnType<typeof run>;
  beforeAll(() => {
    combo = run(comboBuild(), 20);
  });

  it.each([
    [comboBuild, 6215, 14, 489],
    [comboBuildNoFire, 6345, 12, 663],
  ] as const)('%s defeats Grumblefoot at tick %i, ending act 1 with %i lives and %i gold', (record, killTick, lives, gold) => {
    const replay = record === comboBuild ? combo : run(record(), 10);
    expect(replay.boss.filter((e) => e.wave <= 10)).toEqual([
      { wave: 10, waveTick: 3900, kind: 'bossSpawn' },
      { wave: 10, waveTick: killTick, kind: 'bossDown', cause: 'shot' },
    ]);
    expect(replay.midpoint).toMatchObject({ phase: 'setup', wave: 10, lives, gold, pendingBoon: { wave: 10 } });
  });

  it('Normal combo kills Grumblemaw at tick 5235, winning with 14 lives and 250 gold', () => {
    expect(combo.boss.filter((e) => e.wave === 20)).toEqual([
      { wave: 20, waveTick: 1170, kind: 'bossSpawn' },
      { wave: 20, waveTick: 3367, kind: 'packCall', threshold: 2 },
      { wave: 20, waveTick: 4372, kind: 'packCall', threshold: 1 },
      { wave: 20, waveTick: 5235, kind: 'bossDown', cause: 'shot' },
    ]);
    expect(combo.s).toMatchObject({ phase: 'won', wave: 20, lives: 14, gold: 250 });
  });
});

describe('(h) wave 10 spawn table, from the groups themselves', () => {
  it('last non-boss spawn is the 15th Troll at 63 s (3780); he comes at 65 s (3900), the last spawn (milestone 25c second pass)', () => {
    const groups = WAVES[9].groups;
    // Last spawn of a group: delay + (count - 1) x interval, in seconds.
    const lastSecond = groups.map((g) => g.delay + (g.count - 1) * g.interval);
    expect(groups.map((g) => g.type)).toEqual(['wolf', 'troll', 'harpy', 'shieldbearer', 'boss']);
    // Wolves 4 + 19 x 1.5 = 32.5; Trolls 0 + 14 x 4.5 = 63; Harpies 6 + 11 x 1.5 = 22.5;
    // Shieldbearers 2.5 + 7 x 5 = 37.5; him 65 + 0.
    expect(lastSecond.map((x) => Math.round(x * 100) / 100)).toEqual([32.5, 63, 22.5, 37.5, 65]);
    expect(Math.max(...lastSecond.slice(0, -1))).toBe(63);
    expect(groups.map((g) => spawnTick(g, g.count - 1))).toEqual([1950, 3780, 1350, 2250, 3900]);
    expect(groups.filter((g) => g.type === 'boss').map((g) => g.count)).toEqual([1]);
    expect(WAVES.slice(0, 9).flatMap((w) => w.groups).some((g) => g.type === 'boss')).toBe(false);
  });
});
