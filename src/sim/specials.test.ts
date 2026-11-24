// Special attacks: milestone 25b, reworked in milestone 30 (docs/SCOPE-v5.md
// "Specials rework", DESIGN.md "Special attacks"): a recharging charge,
// ground zones for the Tar Barrel and Fire Arrows, bigger circles, the gold
// cheat. Exact values, one rule per test.
import { describe, expect, it } from 'vitest';
import { buildTower, CHEAT_GOLD, grantCheatGold, pickBoon, useSpecial } from './actions';
import { enemyPosition } from './combat';
import { ENEMY_STATS } from './enemies';
import type { GameEvent } from './events';
import { callNextWave, continueEndless, createGame, lastSpawnTick, startWave, tick } from './game';
import { playScripted } from './headless';
import { LEVELS } from './levels';
import { MAPS } from './map';
import { BARREL_RECHARGE_TICKS, SPECIAL_DEFS, SPECIAL_RECHARGE_TICKS, SPECIAL_TYPES, unlockedSpecials, ZONE_LINGER_TICKS, type SpecialType } from './specials';
import type { Enemy, EnemyType, GameState, MapDef } from './types';
import { WAVES } from './waves';

// Path distance d < 160 is the point (d, 240) on Meadow's first run, so an
// enemy at distance 80 stands at (80, 240).
const AT = 80;
const POINT = { x: AT, y: 240 };
const FOUR: EnemyType[] = ['goblin', 'harpy', 'shieldbearer', 'boss'];

/** A straight path along y = 240: distance d is the point (d, 240). */
const LINE: MapDef = { id: 'line', width: 960, height: 480, path: [{ x: 0, y: 240 }, { x: 960, y: 240 }] };

// Arena hp, fixed so the arithmetic below stays as written; no special rule
// depends on an enemy's full hp.
const ARENA_HP: Record<EnemyType, number> = { goblin: 30, wolf: 28, troll: 700, harpy: 40, shieldbearer: 120, boss: 4000, grumblemaw: 5600 };

function enemy(id: number, type: EnemyType, distance = AT, hp = ARENA_HP[type]): Enemy {
  return { id, type, hp, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 };
}

/**
 * A game in wave `wave` (started through startWave, so its charge is ready)
 * with every enemy of the wave already spawned, holding only `enemies`.
 */
function inWave(wave: number, enemies: Enemy[], map?: MapDef): GameState {
  const s = createGame({ map });
  s.wave = wave - 1;
  expect(startWave(s).ok).toBe(true);
  s.spawnedPerGroup = WAVES[wave - 1].groups.map((g) => g.count);
  s.enemies = enemies;
  s.nextEnemyId = 100;
  s.events = [];
  return s;
}

const kinds = (events: GameEvent[]) => events.map((e) => e.kind);
const ticks = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) tick(s);
};

describe('the specials table (milestone 30)', () => {
  it('keg wave 1, 90 px, 60 damage; Tar Barrel wave 4, 100 px, slow 0.5, zone 660; Fire Arrows wave 7, 90 px, burn 26/s, zone 660; recharge 1200, linger 60', () => {
    expect(SPECIAL_TYPES).toEqual(['keg', 'barricade', 'tarBarrel', 'guards', 'fireArrows']);
    expect(SPECIAL_DEFS.barricade).toEqual({ unlockWave: 3, radius: 0, damage: 0, slow: 0, burnDps: 0, zoneTicks: 0 });
    expect(SPECIAL_DEFS.keg).toEqual({ unlockWave: 1, radius: 90, damage: 60, slow: 0, burnDps: 0, zoneTicks: 0 });
    expect(SPECIAL_DEFS.tarBarrel).toEqual({ unlockWave: 4, radius: 100, damage: 0, slow: 0.5, burnDps: 0, zoneTicks: 660 });
    expect(SPECIAL_DEFS.fireArrows).toEqual({ unlockWave: 7, radius: 90, damage: 0, slow: 0, burnDps: 26, zoneTicks: 660 });
    expect(SPECIAL_RECHARGE_TICKS).toBe(1200);
    expect(ZONE_LINGER_TICKS).toBe(60);
    expect([1, 3, 4, 6, 7, 10].map(unlockedSpecials)).toEqual([
      ['keg'],
      ['keg', 'barricade'],
      ['keg', 'barricade', 'tarBarrel'],
      ['keg', 'barricade', 'tarBarrel', 'guards'],
      ['keg', 'barricade', 'tarBarrel', 'guards', 'fireArrows'],
      ['keg', 'barricade', 'tarBarrel', 'guards', 'fireArrows'],
    ]);
  });
});

describe('Powder Keg', () => {
  it('deals 60 to a Goblin, a Harpy (flying), a Shieldbearer (shield ignored) and the boss, and leaves no zone', () => {
    // Goblin and Harpy given 200 hp so the 60 shows instead of a kill.
    const s = inWave(1, [enemy(0, 'goblin', AT, 200), enemy(1, 'harpy', AT, 200), enemy(2, 'shieldbearer', AT, 120), enemy(3, 'boss')]);
    expect(useSpecial(s, 'keg', POINT)).toEqual({ ok: true, hits: 4, kills: 0, gold: s.gold });
    expect(s.enemies.map((e) => [e.type, e.hp])).toEqual([
      ['goblin', 140],
      ['harpy', 140],
      ['shieldbearer', 60],
      ['boss', 3940],
    ]);
    expect(s.zones).toEqual([]);
    expect(s.events[0]).toEqual({ kind: 'special', type: 'keg', x: AT, y: 240, radius: 90, hits: 4 });
  });
});

describe('Tar Barrel landing', () => {
  it('slows a Goblin, a Harpy and a Shieldbearer by 0.5 and the boss by his 0.3 cap, for the linger, and leaves a zone', () => {
    const s = inWave(4, FOUR.map((type, i) => enemy(i, type)));
    expect(useSpecial(s, 'tarBarrel', POINT)).toMatchObject({ ok: true, hits: 4, kills: 0 });
    expect(s.enemies.map((e) => [e.type, e.specialSlow, e.specialSlowTicksLeft, e.slowTicksLeft])).toEqual([
      ['goblin', 0.5, 60, 0],
      ['harpy', 0.5, 60, 0],
      ['shieldbearer', 0.5, 60, 0],
      ['boss', 0.3, 60, 0],
    ]);
    expect(s.events[0]).toEqual({ kind: 'special', type: 'tarBarrel', x: AT, y: 240, radius: 100, hits: 4, zoneId: 0 });
    expect(s.events.filter((e) => e.kind === 'slowed')).toEqual(FOUR.map((type, i) => ({ kind: 'slowed', enemyId: i, slow: type === 'boss' ? 0.3 : 0.5, ticks: 60 })));
    expect(s.zones).toEqual([{ id: 0, type: 'tarBarrel', x: AT, y: 240, radius: 100, ticksLeft: 660 }]);
    expect(s.nextZoneId).toBe(1);
    expect(s.enemies.map((e) => e.hp)).toEqual(FOUR.map((type) => ARENA_HP[type]));
  });
});

describe('Fire Arrows landing', () => {
  it('sets a 26/s special burn for the linger on a Harpy and on walkers, and leaves a zone', () => {
    const s = inWave(7, FOUR.map((type, i) => enemy(i, type)));
    expect(useSpecial(s, 'fireArrows', POINT)).toMatchObject({ ok: true, hits: 4, kills: 0 });
    expect(s.enemies.map((e) => [e.type, e.burnDps, e.burnTicksLeft, e.specialBurn])).toEqual(FOUR.map((type) => [type, 26, 60, true]));
    expect(s.zones).toEqual([{ id: 0, type: 'fireArrows', x: AT, y: 240, radius: 90, ticksLeft: 660 }]);
  });

  it('replaces a weaker burn and leaves a stronger one', () => {
    const weak = { ...enemy(0, 'troll'), burnDps: 5, burnTicksLeft: 30 };
    const strong = { ...enemy(1, 'troll'), burnDps: 40, burnTicksLeft: 30 };
    const s = inWave(7, [weak, strong]);
    useSpecial(s, 'fireArrows', POINT);
    expect(s.enemies.map((e) => [e.burnDps, e.burnTicksLeft])).toEqual([
      [26, 60],
      [40, 30],
    ]);
  });
});

describe('zones (step 2b of the tick)', () => {
  it('enter: a Wolf is slowed on the tick it reaches the zone edge, not before', () => {
    // Zone at (300, 240), 100 px: the Wolf (2 px a tick) at 196 reaches 200 on the second tick.
    const s = inWave(4, [enemy(0, 'wolf', 196, 1000)], LINE);
    useSpecial(s, 'tarBarrel', { x: 300, y: 240 });
    tick(s);
    expect([s.enemies[0].distance, s.enemies[0].specialSlowTicksLeft ?? 0]).toEqual([198, 0]);
    tick(s);
    expect([s.enemies[0].distance, s.enemies[0].specialSlow, s.enemies[0].specialSlowTicksLeft]).toEqual([200, 0.5, 60]);
    // Stay: refreshed to the linger every tick while inside, at half speed.
    tick(s);
    expect([s.enemies[0].distance, s.enemies[0].specialSlowTicksLeft]).toEqual([201, 60]);
  });

  it('leave: the slow lasts the linger after the last tick inside, then full speed', () => {
    // At 390, inside, so the landing slows it: 1 px a tick to 400 (inside, the edge) on tick 10.
    const s = inWave(4, [{ ...enemy(0, 'wolf', 390, 1000), feathered: true }], LINE);
    useSpecial(s, 'tarBarrel', { x: 300, y: 240 });
    ticks(s, 10);
    expect([s.enemies[0].distance, s.enemies[0].specialSlowTicksLeft]).toEqual([400, 60]);
    tick(s); // 401: outside, not refreshed
    expect([s.enemies[0].distance, s.enemies[0].specialSlowTicksLeft]).toEqual([401, 59]);
    ticks(s, 59);
    expect([s.enemies[0].distance, s.enemies[0].specialSlowTicksLeft, s.enemies[0].specialSlow]).toEqual([460, 0, 0]);
    tick(s);
    expect(s.enemies[0].distance).toBe(462);
  });

  it('expiry: a zone acts for 660 ticks and is then removed; an enemy on the spot afterwards is not slowed', () => {
    const s = inWave(4, [enemy(0, 'troll', 0, 100000)], LINE);
    useSpecial(s, 'tarBarrel', { x: 900, y: 240 });
    ticks(s, 659);
    expect(s.zones.map((z) => z.ticksLeft)).toEqual([1]);
    tick(s);
    expect(s.zones).toEqual([]);
    s.enemies.push(enemy(1, 'goblin', 900, 1000));
    tick(s);
    expect(s.enemies[1].specialSlowTicksLeft ?? 0).toBe(0);
  });

  it('two overlapping zones: tar and fire on one enemy burn at 26/s doubled (52/s); two tar zones do not stack', () => {
    const s = inWave(7, [{ ...enemy(0, 'troll', 300, 1000), feathered: true }], LINE);
    useSpecial(s, 'tarBarrel', { x: 300, y: 240 });
    tick(s);
    s.specialCharges = 1; // Test setup: refill while the first zone is still live.
    useSpecial(s, 'fireArrows', { x: 320, y: 240 });
    tick(s);
    s.specialCharges = 1;
    useSpecial(s, 'tarBarrel', { x: 280, y: 240 });
    expect(s.zones.map((z) => [z.id, z.type])).toEqual([
      [0, 'tarBarrel'],
      [1, 'fireArrows'],
      [2, 'tarBarrel'],
    ]);
    const hp = s.enemies[0].hp;
    const distance = s.enemies[0].distance;
    ticks(s, 60);
    expect(hp - s.enemies[0].hp).toBeCloseTo(52, 9);
    // 35 px/s at 0.5 for 60 ticks: 17.5 px, not less.
    expect(s.enemies[0].distance - distance).toBeCloseTo(17.5, 9);
  });

  it('a flyer in a fire zone burns and in a tar zone is slowed', () => {
    const s = inWave(7, [enemy(0, 'harpy', 300, 1000)], LINE);
    useSpecial(s, 'fireArrows', { x: 300, y: 240 });
    tick(s);
    s.specialCharges = 1;
    useSpecial(s, 'tarBarrel', { x: 300, y: 240 });
    tick(s);
    expect([s.enemies[0].burnDps, s.enemies[0].specialSlow]).toEqual([26, 0.5]);
  });

  it('the boss in a tar zone is slowed by his 0.3 cap, never more', () => {
    const s = inWave(10, [enemy(0, 'boss', 300)], LINE);
    useSpecial(s, 'tarBarrel', { x: 300, y: 240 });
    ticks(s, 60);
    expect(s.enemies[0].specialSlow).toBe(0.3);
    // 25 px/s at 0.7 for 60 ticks.
    expect(s.enemies[0].distance).toBeCloseTo(317.5, 9);
  });

  it('a zone burn kill is a special kill: bounty paid, cause special, no tower credited (even after a Fire Pot burn)', () => {
    const s = inWave(7, [{ ...enemy(0, 'goblin', 300, 1), burnDps: 5, burnTicksLeft: 100, burnOwner: { col: 5, row: 5 } }], LINE);
    s.phase = 'setup';
    expect(buildTower(s, { col: 5, row: 5 }, 'firepot').ok).toBe(true);
    s.phase = 'wave';
    const pot = s.towers[0];
    const gold = s.gold;
    useSpecial(s, 'fireArrows', { x: 300, y: 240 });
    expect(s.enemies[0].burnOwner).toBeUndefined();
    ticks(s, 3); // 26/60 a tick on 1 hp: dead on the third tick
    expect(s.enemies).toEqual([]);
    expect(pot.kills ?? 0).toBe(0);
    expect(s.events.filter((e) => e.kind === 'kill')).toEqual([{ kind: 'kill', enemyId: 0, enemyType: 'goblin', bounty: 2, cause: 'special' }]);
    // The bounty, then the wave clear bonus (the wave's last enemy).
    expect(s.gold).toBe(gold + ENEMY_STATS.goblin.bounty + 25);
  });

  it('the wave clear removes the zones', () => {
    const s = inWave(4, [enemy(0, 'goblin', 300, 1)], LINE);
    useSpecial(s, 'tarBarrel', { x: 600, y: 240 });
    s.enemies = [];
    tick(s);
    expect([s.phase, s.zones]).toEqual(['setup', []]);
  });
});

describe('radius', () => {
  it('is measured from the aimed point to the enemy position, inclusive at exactly 90 px and exclusive at 90.01 (keg)', () => {
    const at = (dx: number) => {
      const s = inWave(1, [enemy(0, 'troll')]);
      const p = enemyPosition(s.enemies[0], MAPS.meadow);
      return useSpecial(s, 'keg', { x: p.x + dx, y: p.y });
    };
    expect(at(90)).toMatchObject({ ok: true, hits: 1 });
    expect(at(90.01)).toMatchObject({ ok: true, hits: 0 });
  });

  it('Tar Barrel 100 and Fire Arrows 90, in the zone too', () => {
    const s = inWave(7, [enemy(0, 'troll', 400, 1000), enemy(1, 'troll', 400.01, 1000)], LINE);
    expect(useSpecial(s, 'tarBarrel', { x: 300, y: 240 })).toMatchObject({ hits: 1 });
    const fire = inWave(7, [enemy(0, 'troll', 400, 1000), enemy(1, 'troll', 400.01, 1000)], LINE);
    expect(useSpecial(fire, 'fireArrows', { x: 310, y: 240 })).toMatchObject({ hits: 1 });
  });
});

describe('the charge (milestone 30: ready at a wave start, recharges in wave time)', () => {
  it('ready at Start Wave; a use spends it and it is ready again 1200 wave ticks later', () => {
    const s = inWave(4, [enemy(0, 'troll', 0, 1e9)], LINE);
    expect([s.specialCharges, s.specialRechargeTicks]).toEqual([1, 0]);
    expect(useSpecial(s, 'keg', POINT).ok).toBe(true);
    expect([s.specialCharges, s.specialRechargeTicks]).toEqual([0, 1200]);
    expect(useSpecial(s, 'keg', POINT)).toEqual({ ok: false, reason: 'no-charge' });
    ticks(s, 1199);
    expect([s.specialCharges, s.specialRechargeTicks]).toEqual([0, 1]);
    tick(s);
    expect([s.specialCharges, s.specialRechargeTicks]).toEqual([1, 0]);
    expect(useSpecial(s, 'tarBarrel', POINT).ok).toBe(true);
  });

  it('C9: only the barrel makes every special wait beyond the ordinary refill', () => {
    const point = { x: 300, y: 240 };
    for (const special of SPECIAL_TYPES) {
      const state = inWave(7, [enemy(0, 'troll')], LINE);
      expect(useSpecial(state, special, point).ok, special).toBe(true);
      if (special === 'tarBarrel') {
        expect(state.specialRechargeTicks).toBeGreaterThan(SPECIAL_RECHARGE_TICKS);
        expect(state.specialRechargeTicks).toBeLessThanOrEqual(3 * SPECIAL_RECHARGE_TICKS);
      } else {
        expect(state.specialRechargeTicks, special).toBe(SPECIAL_RECHARGE_TICKS);
      }
    }
    const longTrail = { ...LINE, path: [{ x: 0, y: 240 }, { x: 10000, y: 240 }] };
    const state = inWave(7, [enemy(0, 'troll')], longTrail);
    expect(useSpecial(state, 'tarBarrel', point).ok).toBe(true);
    ticks(state, BARREL_RECHARGE_TICKS - 1);
    for (const special of SPECIAL_TYPES) {
      expect(useSpecial(state, special, point)).toEqual({ ok: false, reason: 'no-charge' });
    }
    tick(state);
    expect(useSpecial(state, 'keg', point).ok).toBe(true);
  });

  it.each([false, true])('C9: an early call preserves the full remaining barrel wait (Quick Hands %s)', quick => {
    const state = inWave(7, [enemy(0, 'troll')], LINE);
    if (quick) state.boons = ['quickHands'];
    expect(useSpecial(state, 'tarBarrel', POINT).ok).toBe(true);
    const duration = Math.round(BARREL_RECHARGE_TICKS * (quick ? 0.57 : 1));
    expect(state.specialRechargeTicks).toBe(duration);
    ticks(state, 30);
    expect(callNextWave(state).ok).toBe(true);
    expect([state.specialCharges, state.specialRechargeTicks]).toEqual([0, duration - 30]);
    expect(useSpecial(state, 'keg', POINT)).toEqual({ ok: false, reason: 'no-charge' });
  });

  it('C9: setup and a reward pick preserve a barrel wait until the next combat tick', () => {
    const state = inWave(10, [], LINE);
    expect(useSpecial(state, 'tarBarrel', POINT).ok).toBe(true);
    tick(state);
    expect(state.phase).toBe('setup');
    expect(pickBoon(state, 'quickHands').ok).toBe(true);
    ticks(state, 2000);
    expect([state.specialCharges, state.specialRechargeTicks]).toEqual([0, BARREL_RECHARGE_TICKS - 1]);
    expect(startWave(state).ok).toBe(true);
    expect([state.specialCharges, state.specialRechargeTicks]).toEqual([0, BARREL_RECHARGE_TICKS - 1]);
    tick(state);
    expect(state.specialRechargeTicks).toBe(BARREL_RECHARGE_TICKS - 2);
  });

  it('C9: automatic dispatch carries the paused wait into its first combat tick', () => {
    const wave = { groups: [{ type: 'goblin' as const, count: 1, interval: 1, delay: 0 }] };
    const state = createGame({ level: { ...LEVELS[0], waves: [wave, wave, wave],
      allowedSpecials: ['tarBarrel'], taxes: { noLoitering: 1 }, rewardWaves: [] } });
    startWave(state);
    tick(state);
    expect(useSpecial(state, 'tarBarrel', POINT).ok).toBe(true);
    state.enemies = [];
    tick(state);
    expect(state.phase).toBe('setup');
    ticks(state, 60);
    expect([state.phase, state.wave, state.specialCharges, state.specialRechargeTicks])
      .toEqual(['wave', 2, 0, BARREL_RECHARGE_TICKS - 1]);
    tick(state);
    expect(state.specialRechargeTicks).toBe(BARREL_RECHARGE_TICKS - 2);
  });

  it('C9: a barrel spent on the last wave still has to refill in endless', () => {
    const state = inWave(20, [], LINE);
    expect(useSpecial(state, 'tarBarrel', POINT).ok).toBe(true);
    tick(state);
    expect(state.phase).toBe('won');
    expect(continueEndless(state).ok).toBe(true);
    expect(startWave(state).ok).toBe(true);
    expect([state.wave, state.specialCharges, state.specialRechargeTicks]).toEqual([21, 0, BARREL_RECHARGE_TICKS - 1]);
    expect(useSpecial(state, 'keg', POINT)).toEqual({ ok: false, reason: 'no-charge' });
  });

  it('a refused second use changes nothing', () => {
    const s = inWave(4, [enemy(0, 'troll')]);
    useSpecial(s, 'keg', POINT);
    const hp = s.enemies[0].hp;
    expect(useSpecial(s, 'tarBarrel', POINT)).toEqual({ ok: false, reason: 'no-charge' });
    expect(s.enemies[0]).toMatchObject({ hp, slowTicksLeft: 0 });
    expect(s.zones).toEqual([]);
    expect(kinds(s.events)).toEqual(['special']);
  });

  it('does not recharge in setup, and the next Start Wave makes it ready at once', () => {
    const s = inWave(1, [enemy(0, 'goblin', AT, 1)]);
    expect(useSpecial(s, 'keg', POINT)).toMatchObject({ ok: true, kills: 1 });
    tick(s); // the wave clears
    expect([s.phase, s.specialCharges, s.specialRechargeTicks]).toEqual(['setup', 0, 0]);
    ticks(s, 2000);
    expect(s.specialCharges).toBe(0);
    startWave(s);
    expect([s.specialCharges, s.specialRechargeTicks]).toEqual([1, 0]);
  });

  it('an early call makes it ready at once, mid-recharge', () => {
    const s = createGame();
    s.lives = 1000; // test setup: no towers
    startWave(s);
    while (s.waveTick <= lastSpawnTick(1)) tick(s);
    expect(useSpecial(s, 'keg', { x: 10, y: 10 }).ok).toBe(true);
    expect(s.specialRechargeTicks).toBe(1200);
    expect(callNextWave(s).ok).toBe(true);
    expect([s.specialCharges, s.specialRechargeTicks]).toEqual([1, 0]);
  });

  it('locked specials, setup, outside the map and a finished game are refused', () => {
    expect(useSpecial(inWave(3, [enemy(0, 'troll')]), 'tarBarrel', POINT)).toEqual({ ok: false, reason: 'locked' });
    expect(useSpecial(inWave(6, [enemy(0, 'troll')]), 'fireArrows', POINT)).toEqual({ ok: false, reason: 'locked' });
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
    expect(useSpecial(s, 'keg', { x: MAPS.meadow.width, y: MAPS.meadow.height })).toMatchObject({ ok: true });
    s.phase = 'lost';
    s.specialCharges = 1;
    expect(useSpecial(s, 'keg', POINT)).toEqual({ ok: false, reason: 'game-over' });
  });
});

describe('kills', () => {
  it('pays the bounty once, emits kill with cause special, removes the enemy at once, and the wave clears on the next tick', () => {
    const s = inWave(1, [enemy(0, 'goblin')]);
    const gold = s.gold;
    const bounty = ENEMY_STATS.goblin.bounty;
    expect(useSpecial(s, 'keg', POINT)).toEqual({ ok: true, hits: 1, kills: 1, gold: gold + bounty });
    expect(s.enemies).toEqual([]);
    expect(s.events).toEqual([
      { kind: 'special', type: 'keg', x: AT, y: 240, radius: 90, hits: 1 },
      { kind: 'kill', enemyId: 0, enemyType: 'goblin', bounty, cause: 'special' },
    ]);
    tick(s);
    expect(s.phase).toBe('setup');
    expect(s.gold).toBe(gold + bounty + 25);
  });

  it('a boss killed by a special emits bossDown with cause special', () => {
    const s = inWave(10, [enemy(0, 'boss', AT, 20)]);
    useSpecial(s, 'keg', POINT);
    expect(s.events.slice(1)).toEqual([
      { kind: 'kill', enemyId: 0, enemyType: 'boss', bounty: 150, cause: 'special' },
      { kind: 'bossDown', enemyId: 0, enemyType: 'boss', cause: 'special' },
    ]);
  });
});

describe('the gold cheat (grantCheatGold)', () => {
  it('adds 500 gold, marks the game cheated and emits cheat, in setup and in a wave', () => {
    const s = createGame();
    const gold = s.gold;
    expect(grantCheatGold(s)).toEqual({ ok: true, gold: gold + CHEAT_GOLD });
    expect([s.gold, s.cheated, s.events]).toEqual([gold + 500, true, [{ kind: 'cheat', gold: 500 }]]);
    startWave(s);
    expect(grantCheatGold(s)).toEqual({ ok: true, gold: gold + 1000 });
  });

  it('is refused once the game is won or lost, changing nothing', () => {
    for (const phase of ['won', 'lost'] as const) {
      const s = createGame();
      s.phase = phase;
      const before = structuredClone(s);
      expect(grantCheatGold(s)).toEqual({ ok: false, reason: 'game-over' });
      expect(s).toEqual(before);
    }
  });
});

describe('after the win', () => {
  it('the win tick keeps its shots for one draw; the next tick clears them and nothing else changes', () => {
    const s = createGame();
    s.phase = 'won';
    s.shots = [{ cell: { col: 1, row: 1 }, tower: 'cannon', targetId: 3, from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, splashRadius: 40 }];
    s.events = [{ kind: 'won' }];
    const before = structuredClone(s);
    tick(s);
    expect(s.shots).toEqual([]);
    expect({ ...s, shots: before.shots }).toEqual(before);
  });
});

describe('headless: timed special actions', () => {
  it('a timed special fires when the wave tick counter reaches atWaveTick', () => {
    const script = Object.assign([[]], {
      timed: [[{ type: 'special' as const, special: 'keg' as SpecialType, x: 200, y: 200, atWaveTick: 123 }]],
    });
    const run = playScripted(script);
    const fired = run.log.filter((l) => l.action === 'special');
    expect(fired).toEqual([expect.objectContaining({ action: 'special', special: 'keg', waveTick: 123, result: expect.objectContaining({ ok: true }) })]);
  });
});
