// Milestone 23: Grumblefoot, the Troll King (docs/SCOPE-v4.md). Stats, the
// 30% slow cap, the 5-life exit, the bounty, his spawn as wave 10's last
// enemy, the wave clear rule with him alive, and the bossSpawn and bossDown
// events.
import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower } from './actions';
import { applySlow } from './combat';
import { BOSS_TYPE, cappedSlow, ENEMY_STATS, isBoss } from './enemies';
import type { GameEvent } from './events';
import { createGame, spawnTick, startWave, tick } from './game';
import type { Cell } from './grid';
import { MAP, pathLength } from './map';
import type { Enemy, EnemyType, GameState, TowerType } from './types';
import { WAVES } from './waves';

// Cell A, centre (80,176), is 64 px above path distance 80 (combat.test.ts).
const A: Cell = { col: 2, row: 5 };
const EXIT = pathLength(MAP);

function enemy(id: number, distance: number, type: EnemyType = 'boss', hp = ENEMY_STATS[type].hp): Enemy {
  return { id, type, hp, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 };
}

/** Mid-wave-1 state with every wave enemy already spawned, so ticks spawn nothing. */
function arena(enemies: Enemy[], towers: [Cell, TowerType, boolean?][] = []): GameState {
  const s = createGame();
  s.gold = 10_000;
  s.phase = 'wave';
  s.wave = 1;
  s.spawnedPerGroup = [8];
  s.enemies = enemies;
  s.nextEnemyId = 100;
  for (const [cell, type, upgraded] of towers) {
    expect(buildTower(s, cell, type).ok).toBe(true);
    if (upgraded) upgradeTower(s, cell);
  }
  s.gold = 0;
  s.events = [];
  return s;
}

const kinds = (events: GameEvent[], ...k: GameEvent['kind'][]) => events.filter((e) => k.includes(e.kind));

describe('boss stats (docs/SCOPE-v4.md)', () => {
  it('4000 hp, 25 px/s, 150 gold, 5 lives on exit, slows capped at 30%, walks, no shield', () => {
    expect(BOSS_TYPE).toBe('boss');
    expect(ENEMY_STATS.boss).toEqual({ hp: 4000, speed: 25, bounty: 150, flying: false, shield: false, livesCost: 5, slowCap: 0.3 });
  });

  it('every other enemy costs 1 life and has no slow cap', () => {
    for (const type of ['goblin', 'wolf', 'troll', 'harpy', 'shieldbearer'] as const) {
      expect(ENEMY_STATS[type].livesCost, type).toBe(1);
      expect(ENEMY_STATS[type].slowCap, type).toBeUndefined();
      expect(isBoss({ type }), type).toBe(false);
    }
    expect(isBoss({ type: 'boss' })).toBe(true);
  });
});

describe('slow cap', () => {
  it('a 40% or 60% slow applies as 30% on the boss, full strength on a Troll', () => {
    expect(cappedSlow({ type: 'boss' }, 0.4)).toBe(0.3);
    expect(cappedSlow({ type: 'boss' }, 0.6)).toBe(0.3);
    expect(cappedSlow({ type: 'boss' }, 0.2)).toBe(0.2);
    expect(cappedSlow({ type: 'troll' }, 0.6)).toBe(0.6);
    const boss = enemy(0, 10);
    expect(applySlow(boss, 0.6, 120)).toBe(0.3);
    expect(boss).toMatchObject({ slow: 0.3, slowTicksLeft: 120 });
    // Capped slows of equal strength refresh the duration, as any equal slow does.
    boss.slowTicksLeft = 5;
    expect(applySlow(boss, 0.4, 120)).toBe(0.3);
    expect(boss.slowTicksLeft).toBe(120);
  });

  it("an upgraded Tar Pit's 60% slow applies 30% for its full 2 s: he walks 25 * 0.7 = 17.5 px per second", () => {
    const s = arena([enemy(0, 80)], [[A, 'tarpit', true]]);
    tick(s);
    expect(kinds(s.events, 'slowed')).toEqual([{ kind: 'slowed', enemyId: 0, slow: 0.3, ticks: 120 }]);
    expect(s.enemies[0]).toMatchObject({ slow: 0.3, slowTicksLeft: 120 });
    const before = s.enemies[0].distance;
    for (let i = 0; i < 60; i++) tick(s);
    expect(s.enemies[0].distance - before).toBeCloseTo(17.5, 9);
  });

  it("a base Tar Pit's 40% slow also applies 30%", () => {
    const s = arena([enemy(0, 80)], [[A, 'tarpit']]);
    tick(s);
    expect(kinds(s.events, 'slowed')).toEqual([{ kind: 'slowed', enemyId: 0, slow: 0.3, ticks: 120 }]);
  });

  it('burn applies normally, doubled while he is tarred', () => {
    const s = arena([enemy(0, 80)], [[A, 'firepot']]);
    tick(s);
    expect(s.enemies[0]).toMatchObject({ hp: 3996, burnDps: 5, burnTicksLeft: 180 });
    s.enemies[0].slow = 0.3;
    s.enemies[0].slowTicksLeft = 100;
    tick(s);
    expect(kinds(s.events, 'burn')).toEqual([{ kind: 'burn', enemyId: 0, damage: 10 / 60 }]);
  });
});

describe('boss exit', () => {
  it('costs 5 lives, emits exit then bossDown with cause exit, and the game goes on above 0 lives', () => {
    const s = arena([enemy(7, EXIT - 0.1)]);
    s.lives = 20;
    tick(s);
    expect(s.lives).toBe(15);
    expect(s.phase).not.toBe('lost');
    expect(kinds(s.events, 'exit', 'bossDown')).toEqual([
      { kind: 'exit', enemyId: 7 },
      { kind: 'bossDown', enemyId: 7, cause: 'exit' },
    ]);
  });

  for (const lives of [5, 4, 1]) {
    it(`with ${lives} lives left the game is lost at once`, () => {
      const s = arena([enemy(7, EXIT - 0.1)]);
      s.lives = lives;
      tick(s);
      expect(s.lives).toBe(lives - 5);
      expect(s.phase).toBe('lost');
      expect(s.events.at(-1)).toEqual({ kind: 'lost' });
    });
  }

  it('with 6 lives he leaves 1, and an empty wave 10 is then won', () => {
    const s = arena([enemy(7, EXIT - 0.1)]);
    s.wave = WAVES.length;
    s.spawnedPerGroup = WAVES[WAVES.length - 1].groups.map((g) => g.count);
    s.lives = 6;
    tick(s);
    expect(s.lives).toBe(1);
    expect(s.phase).toBe('won');
  });
});

describe('boss bounty', () => {
  it('pays 150 once, with kill and bossDown (cause shot) events', () => {
    const s = arena([enemy(3, 80, 'boss', 1)], [[A, 'musketeer']]);
    tick(s);
    // 150 for him and the 25 clear bonus (he was the arena's last enemy).
    expect(s.gold).toBe(150 + 25);
    expect(kinds(s.events, 'kill', 'bossDown')).toEqual([
      { kind: 'kill', enemyId: 3, enemyType: 'boss', bounty: 150, cause: 'shot' },
      { kind: 'bossDown', enemyId: 3, cause: 'shot' },
    ]);
    expect(kinds(s.events, 'kill')).toHaveLength(1);
    for (let i = 0; i < 120; i++) tick(s);
    expect(s.gold).toBe(175);
  });

  it('a burn kill pays 150 with bossDown cause burn', () => {
    const s = arena([{ ...enemy(3, 1000, 'boss', 0.05), burnDps: 5, burnTicksLeft: 60 }]);
    tick(s);
    expect(kinds(s.events, 'kill', 'bossDown')).toEqual([
      { kind: 'kill', enemyId: 3, enemyType: 'boss', bounty: 150, cause: 'burn' },
      { kind: 'bossDown', enemyId: 3, cause: 'burn' },
    ]);
    expect(s.gold).toBe(150 + 25);
  });
});

describe('boss in wave 10', () => {
  it("is wave 10's last group: 1 boss, 26 s in, 4 s after the 12th Troll at 22 s (waveTick 1560)", () => {
    const groups = WAVES[9].groups;
    const boss = groups.at(-1)!;
    expect(boss).toEqual({ type: 'boss', count: 1, interval: 0, delay: 26 });
    const lastOthers = Math.max(...groups.slice(0, -1).map((g) => spawnTick(g, g.count - 1)));
    expect(lastOthers).toBe(1320);
    expect(spawnTick(boss, 0)).toBe(lastOthers + 240);
    expect(spawnTick(boss, 0)).toBe(1560);
    for (const w of WAVES.slice(0, 9)) expect(w.groups.some((g) => g.type === 'boss')).toBe(false);
  });

  /** Wave 10 with no towers and lives to spare; per tick: waveTick, events, phase, whether he is alive. */
  function playWave10() {
    const s = createGame();
    s.wave = 9;
    s.lives = 1000;
    startWave(s);
    const log: { waveTick: number; events: GameEvent[]; phase: string; bossAlive: boolean }[] = [];
    while (s.phase === 'wave' && log.length < 60 * 600) {
      const waveTick = s.waveTick;
      tick(s);
      log.push({ waveTick, events: s.events, phase: s.phase, bossAlive: s.enemies.some(isBoss) });
    }
    return { s, log };
  }

  it('he spawns at waveTick 1560 as the last spawn of the wave, with spawn then bossSpawn', () => {
    const { log } = playWave10();
    const spawns = log.flatMap((l) => l.events.filter((e) => e.kind === 'spawn').map((e) => ({ ...e, waveTick: l.waveTick })));
    const last = spawns.at(-1)!;
    expect(last).toMatchObject({ kind: 'spawn', enemyType: 'boss', waveTick: 1560 });
    expect(spawns.filter((e) => e.kind === 'spawn' && e.enemyType === 'boss')).toHaveLength(1);
    const at = log.find((l) => l.waveTick === 1560)!;
    const i = at.events.findIndex((e) => e.kind === 'spawn' && e.enemyType === 'boss');
    expect(at.events[i + 1]).toEqual({ kind: 'bossSpawn', enemyId: last.enemyId });
    expect(log.flatMap((l) => l.events).filter((e) => e.kind === 'bossSpawn')).toHaveLength(1);
  });

  it('the wave does not clear while he lives; it ends (won) when he exits, costing 5 lives', () => {
    const { s, log } = playWave10();
    // Every other enemy is gone long before he exits.
    const othersGone = log.findIndex((l, i) => i > 1560 && l.events.length === 0 && l.bossAlive);
    expect(othersGone).toBeGreaterThan(0);
    for (const l of log) if (l.bossAlive) expect(l.phase).toBe('wave');
    const end = log.at(-1)!;
    expect(end.events.filter((e) => e.kind === 'bossDown')).toEqual([{ kind: 'bossDown', enemyId: expect.any(Number), cause: 'exit' }]);
    expect(s.phase).toBe('won');
    // 8 Wolves, 12 Trolls, 5 Harpies, 4 Shieldbearers at 1 life each, then him at 5.
    expect(s.lives).toBe(1000 - 29 - 5);
  });
});
