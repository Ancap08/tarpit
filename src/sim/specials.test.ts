// Milestone 25b: special attacks (docs/SCOPE-v4.md "Special attacks (25b)",
// DESIGN.md "Special attacks"). Exact values, one rule per test.
import { describe, expect, it } from 'vitest';
import { useSpecial } from './actions';
import { enemyPosition } from './combat';
import { ENEMY_STATS } from './enemies';
import type { GameEvent } from './events';
import { createGame, startWave, tick } from './game';
import { comboWithKegs, KEG_POLICY_DISTANCE, KEG_POLICY_WAVE_TICK, playScripted } from './headless';
import { MAP, positionAlongPath } from './map';
import { SPECIAL_DEFS, SPECIAL_TYPES, unlockedSpecials, type SpecialType } from './specials';
import type { Enemy, EnemyType, GameState } from './types';
import { WAVES } from './waves';

// Path distance d < 160 is the point (d, 240) on the first run, so an enemy
// at distance 80 stands at (80, 240).
const AT = 80;
const POINT = { x: AT, y: 240 };
const FOUR: EnemyType[] = ['goblin', 'harpy', 'shieldbearer', 'boss'];

function enemy(id: number, type: EnemyType, distance = AT, hp = ENEMY_STATS[type].hp): Enemy {
  return { id, type, hp, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 };
}

/**
 * A game in wave `wave` (started through startWave, so it has its charge)
 * with every enemy of the wave already spawned, holding only `enemies`.
 */
function inWave(wave: number, enemies: Enemy[]): GameState {
  const s = createGame();
  s.wave = wave - 1;
  expect(startWave(s).ok).toBe(true);
  s.spawnedPerGroup = WAVES[wave - 1].groups.map((g) => g.count);
  s.enemies = enemies;
  s.nextEnemyId = 100;
  s.events = [];
  return s;
}

const kinds = (events: GameEvent[]) => events.map((e) => e.kind);

describe('the specials table (SCOPE-v4 starting numbers)', () => {
  it('Powder Keg wave 1, 80 damage, 70 px; Tar Barrel wave 4, slow 0.5 for 240 ticks, 90 px; Fire Arrows wave 7, burn 10/s for 240 ticks, 80 px', () => {
    expect(SPECIAL_TYPES).toEqual(['keg', 'tarBarrel', 'fireArrows']);
    expect(SPECIAL_DEFS.keg).toMatchObject({ unlockWave: 1, radius: 70, damage: 80, slow: 0, burnDps: 0 });
    expect(SPECIAL_DEFS.tarBarrel).toMatchObject({ unlockWave: 4, radius: 90, damage: 0, slow: 0.5, slowTicks: 240, burnDps: 0 });
    expect(SPECIAL_DEFS.fireArrows).toMatchObject({ unlockWave: 7, radius: 80, damage: 0, slow: 0, burnDps: 10, burnTicks: 240 });
    expect([1, 3, 4, 6, 7, 10].map(unlockedSpecials)).toEqual([
      ['keg'],
      ['keg'],
      ['keg', 'tarBarrel'],
      ['keg', 'tarBarrel'],
      ['keg', 'tarBarrel', 'fireArrows'],
      ['keg', 'tarBarrel', 'fireArrows'],
    ]);
  });
});

describe('Powder Keg', () => {
  it('deals the full 80 to a Goblin, a Harpy (flying), a Shieldbearer (shield ignored) and the boss', () => {
    // Goblin and Harpy given 200 hp so the 80 shows instead of a kill.
    const s = inWave(1, [enemy(0, 'goblin', AT, 200), enemy(1, 'harpy', AT, 200), enemy(2, 'shieldbearer'), enemy(3, 'boss')]);
    expect(useSpecial(s, 'keg', POINT)).toEqual({ ok: true, hits: 4, kills: 0, gold: s.gold });
    expect(s.enemies.map((e) => [e.type, e.hp])).toEqual([
      ['goblin', 120],
      ['harpy', 120],
      ['shieldbearer', 40],
      ['boss', 3920],
    ]);
  });
});

describe('Tar Barrel', () => {
  it('slows a Goblin, a Harpy and a Shieldbearer by 0.5 for 240 ticks, and the boss by his 0.3 cap', () => {
    const s = inWave(4, FOUR.map((type, i) => enemy(i, type)));
    expect(useSpecial(s, 'tarBarrel', POINT)).toMatchObject({ ok: true, hits: 4, kills: 0 });
    // Milestone 25c: the barrel uses the special slow channel; the tower slow stays empty.
    expect(s.enemies.map((e) => [e.type, e.specialSlow, e.specialSlowTicksLeft, e.slowTicksLeft])).toEqual([
      ['goblin', 0.5, 240, 0],
      ['harpy', 0.5, 240, 0],
      ['shieldbearer', 0.5, 240, 0],
      ['boss', 0.3, 240, 0],
    ]);
    expect(s.events.filter((e) => e.kind === 'slowed')).toEqual(
      FOUR.map((type, i) => ({ kind: 'slowed', enemyId: i, slow: type === 'boss' ? 0.3 : 0.5, ticks: 240 })),
    );
    // No damage.
    expect(s.enemies.map((e) => e.hp)).toEqual(FOUR.map((type) => ENEMY_STATS[type].hp));
  });
});

describe('Fire Arrows', () => {
  it('sets a 10/s burn for 240 ticks on a Harpy (it sticks, unlike a Fire Pot burn) and on walkers', () => {
    const s = inWave(7, FOUR.map((type, i) => enemy(i, type)));
    expect(useSpecial(s, 'fireArrows', POINT)).toMatchObject({ ok: true, hits: 4, kills: 0 });
    expect(s.enemies.map((e) => [e.type, e.burnDps, e.burnTicksLeft])).toEqual(FOUR.map((type) => [type, 10, 240]));
  });

  it('burns double on a tarred enemy: 20 against 10 over 60 ticks', () => {
    const tarred = { ...enemy(0, 'troll'), slow: 0.5, slowTicksLeft: 1000 };
    const s = inWave(7, [tarred, enemy(1, 'troll')]);
    expect(useSpecial(s, 'fireArrows', POINT)).toMatchObject({ ok: true, hits: 2 });
    for (let i = 0; i < 60; i++) tick(s);
    const lost = s.enemies.map((e) => ENEMY_STATS.troll.hp - e.hp);
    expect(lost[0]).toBeCloseTo(20, 9);
    expect(lost[1]).toBeCloseTo(10, 9);
  });

  it('replaces a weaker burn and leaves a stronger one', () => {
    const weak = { ...enemy(0, 'troll'), burnDps: 5, burnTicksLeft: 30 };
    const strong = { ...enemy(1, 'troll'), burnDps: 12, burnTicksLeft: 30 };
    const s = inWave(7, [weak, strong]);
    useSpecial(s, 'fireArrows', POINT);
    expect(s.enemies.map((e) => [e.burnDps, e.burnTicksLeft])).toEqual([
      [10, 240],
      [12, 30],
    ]);
  });
});

describe('radius', () => {
  it('is measured from the aimed point to the enemy position, inclusive at exactly 70 px and exclusive at 70.01', () => {
    const at = (dx: number) => {
      const s = inWave(1, [enemy(0, 'troll')]);
      const p = enemyPosition(s.enemies[0]);
      return useSpecial(s, 'keg', { x: p.x + dx, y: p.y });
    };
    expect(at(70)).toMatchObject({ ok: true, hits: 1 });
    expect(at(70.01)).toMatchObject({ ok: true, hits: 0 });
  });

  it('the special event counts the enemies inside the radius', () => {
    const s = inWave(1, [enemy(0, 'troll', AT), enemy(1, 'troll', AT + 60), enemy(2, 'troll', AT + 71)]);
    expect(useSpecial(s, 'keg', POINT)).toMatchObject({ ok: true, hits: 2 });
    expect(s.events).toEqual([{ kind: 'special', type: 'keg', x: AT, y: 240, radius: 70, hits: 2 }]);
    expect(s.enemies.map((e) => e.hp)).toEqual([620, 620, 700]);
  });
});

describe('unlocks, charges and refusals', () => {
  it('Tar Barrel is locked on wave 3 and works on wave 4; Fire Arrows unlock on wave 7', () => {
    expect(useSpecial(inWave(3, [enemy(0, 'troll')]), 'tarBarrel', POINT)).toEqual({ ok: false, reason: 'locked' });
    expect(useSpecial(inWave(4, [enemy(0, 'troll')]), 'tarBarrel', POINT)).toMatchObject({ ok: true, hits: 1 });
    expect(useSpecial(inWave(6, [enemy(0, 'troll')]), 'fireArrows', POINT)).toEqual({ ok: false, reason: 'locked' });
    expect(useSpecial(inWave(7, [enemy(0, 'troll')]), 'fireArrows', POINT)).toMatchObject({ ok: true, hits: 1 });
  });

  it('one charge per wave: a second use fails no-charge and changes nothing', () => {
    const s = inWave(4, [enemy(0, 'troll')]);
    expect(s.specialCharges).toBe(1);
    expect(useSpecial(s, 'keg', POINT).ok).toBe(true);
    expect(s.specialCharges).toBe(0);
    const hp = s.enemies[0].hp;
    expect(useSpecial(s, 'tarBarrel', POINT)).toEqual({ ok: false, reason: 'no-charge' });
    expect(s.enemies[0]).toMatchObject({ hp, slowTicksLeft: 0 });
    expect(kinds(s.events)).toEqual(['special']);
  });

  it('the charge resets on the next startWave; an unused one does not carry over (1, not 2)', () => {
    const s = createGame();
    s.lives = 1000; // test setup: survive waves 1 and 2 with no towers
    // A function, so TypeScript does not narrow the phase across startWave.
    const playOn = () => {
      while (s.phase === 'wave') tick(s);
    };
    expect(s.specialCharges).toBe(0);
    startWave(s);
    expect(s.specialCharges).toBe(1);
    // Wave 1 with no towers: 8 Goblins; use the charge on nothing, play on.
    expect(useSpecial(s, 'keg', { x: 900, y: 40 })).toMatchObject({ ok: true, hits: 0 });
    playOn();
    expect([s.phase, s.specialCharges]).toEqual(['setup', 0]);
    startWave(s);
    expect(s.specialCharges).toBe(1);
    // Wave 2 cleared without using it: 0 in setup, then 1 again, not 2.
    playOn();
    expect([s.phase, s.wave, s.specialCharges]).toEqual(['setup', 2, 0]);
    startWave(s);
    expect(s.specialCharges).toBe(1);
  });

  it('is not usable in setup, outside the map, or once the game is over', () => {
    const s = createGame();
    expect(useSpecial(s, 'keg', POINT)).toEqual({ ok: false, reason: 'not-in-wave' });
    startWave(s);
    for (const p of [
      { x: -0.01, y: 10 },
      { x: 960.01, y: 10 },
      { x: 10, y: -1 },
      { x: 10, y: 481 },
      { x: Number.NaN, y: 10 },
    ]) {
      expect(useSpecial(s, 'keg', p)).toEqual({ ok: false, reason: 'out-of-bounds' });
    }
    expect(s.specialCharges).toBe(1);
    expect(useSpecial(s, 'keg', { x: MAP.width, y: MAP.height })).toMatchObject({ ok: true });
    s.phase = 'lost';
    s.specialCharges = 1;
    expect(useSpecial(s, 'keg', POINT)).toEqual({ ok: false, reason: 'game-over' });
  });
});

describe('kills', () => {
  it('pays the bounty once, emits kill with cause special, removes the enemy at once, and the wave clears on the next tick', () => {
    const s = inWave(1, [enemy(0, 'goblin')]);
    const gold = s.gold;
    expect(useSpecial(s, 'keg', POINT)).toEqual({ ok: true, hits: 1, kills: 1, gold: gold + 4 });
    expect(s.gold).toBe(gold + 4);
    expect(s.enemies).toEqual([]);
    expect(s.events).toEqual([
      { kind: 'special', type: 'keg', x: AT, y: 240, radius: 70, hits: 1 },
      { kind: 'kill', enemyId: 0, enemyType: 'goblin', bounty: 4, cause: 'special' },
    ]);
    expect(s.phase).toBe('wave');
    tick(s);
    expect(s.phase).toBe('setup');
    expect(s.events).toEqual([{ kind: 'waveClear', wave: 1, bonus: 25 }]);
    expect(s.gold).toBe(gold + 4 + 25);
  });

  it('a boss killed by a special emits bossDown with cause special', () => {
    const s = inWave(10, [enemy(0, 'boss', AT, 50)]);
    useSpecial(s, 'keg', POINT);
    expect(s.events.slice(1)).toEqual([
      { kind: 'kill', enemyId: 0, enemyType: 'boss', bounty: 150, cause: 'special' },
      { kind: 'bossDown', enemyId: 0, cause: 'special' },
    ]);
  });
});

describe('headless: timed special actions and comboWithKegs', () => {
  it('a timed special fires when the wave tick counter reaches atWaveTick', () => {
    const script = Object.assign([[]], {
      timed: [[{ type: 'special' as const, special: 'keg' as SpecialType, x: 200, y: 200, atWaveTick: 123 }]],
    });
    const run = playScripted(script);
    const fired = run.log.filter((l) => l.action === 'special');
    expect(fired).toEqual([expect.objectContaining({ action: 'special', special: 'keg', waveTick: 123, result: expect.objectContaining({ ok: true }) })]);
    expect(run.waves[0].wave).toBe(1);
  });

  it('comboWithKegs aims at (420, 232), the path point 700 px from the spawn, at wave tick 600, every action accepted', () => {
    expect([KEG_POLICY_DISTANCE, KEG_POLICY_WAVE_TICK]).toEqual([700, 600]);
    expect(positionAlongPath(MAP, KEG_POLICY_DISTANCE)).toEqual({ x: 420, y: 232 });
    const script = comboWithKegs();
    expect(script.timed).toHaveLength(script.length);
    const run = playScripted(script);
    expect(run.log.filter((l) => 'result' in l && !l.result.ok)).toEqual([]);
    const kegs = run.log.filter((l) => l.action === 'special');
    expect(kegs).toHaveLength(run.waves.length);
    for (const k of kegs) expect(k).toMatchObject({ special: 'keg', x: 420, y: 232, waveTick: 600 });
  });

  it('comboWithKegs is deterministic: two runs give the same state, waves and log', () => {
    const a = playScripted(comboWithKegs());
    const b = playScripted(comboWithKegs());
    expect(b.state).toEqual(a.state);
    expect(b.waves).toEqual(a.waves);
    expect(b.log).toEqual(a.log);
  });
});
