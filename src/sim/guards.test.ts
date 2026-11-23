import { describe, expect, it } from 'vitest';
import { useSpecial } from './actions';
import { GUARD_HP, GUARD_LIFETIME_TICKS, guardsPlacement } from './blockers';
import { ENEMY_STATS } from './enemies';
import { callNextWave, continueEndless, createGame, lastSpawnTick, startWave, tick } from './game';
import type { Enemy, EnemyType, GameState, MapDef } from './types';
import { waveDef } from './waves';

const LINE: MapDef = { id: 'line', width: 960, height: 480, path: [{ x: 0, y: 240 }, { x: 960, y: 240 }] };
const AIM = { x: 160, y: 240 };
const FIRST = 124;

function enemy(id: number, type: EnemyType, distance = FIRST, hp = ENEMY_STATS[type].hp): Enemy {
  return { id, type, distance, hp, slow: 0, slowTicksLeft: 0 };
}

function arena(enemies: Enemy[] = [], wave = 6, map = LINE): GameState {
  const state = createGame({ map });
  state.wave = wave - 1;
  expect(startWave(state).ok).toBe(true);
  state.spawnedPerGroup = waveDef(wave).groups.map((group) => group.count);
  state.waveTick = lastSpawnTick(wave) + 1;
  state.enemies = enemies;
  state.nextEnemyId = Math.max(-1, ...enemies.map((entry) => entry.id)) + 1;
  return state;
}

function advance(state: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) tick(state);
}

function cast(state: GameState, point = AIM): void {
  expect(useSpecial(state, 'guards', point)).toEqual({ ok: true, hits: 0, kills: 0, gold: state.gold });
}

describe('Guards placement and shared charge', () => {
  it('snaps the anchor and traces 12 px intervals backward around a bend', () => {
    const bend = { ...LINE, path: [{ x: 0, y: 240 }, { x: 160, y: 240 }, { x: 160, y: 480 }] };
    const state = arena([], 6, bend);
    cast(state, { x: 165, y: 260 });
    expect(state.blockers).toEqual([
      { x: 160, y: 260, distance: 180, angle: Math.PI / 2 },
      { x: 160, y: 248, distance: 168, angle: Math.PI / 2 },
      { x: 156, y: 240, distance: 156, angle: 0 },
      { x: 144, y: 240, distance: 144, angle: 0 },
    ].map((point, id) => ({
      ...point, id, kind: 'guard', hp: GUARD_HP, maxHp: GUARD_HP, attackDps: 10, ticksLeft: GUARD_LIFETIME_TICKS,
    })));
    expect(state.events.at(-1)).toEqual({ kind: 'squadPlaced', guards: state.blockers });
    expect(state.zones).toEqual([]);
    expect(guardsPlacement(LINE, { x: 63, y: 240 })).toMatchObject({ ok: false, reason: 'near-spawn' });
    const nearSpawn = guardsPlacement(LINE, { x: 64, y: 200 });
    expect(nearSpawn.ok && nearSpawn.points.map((point) => point.distance)).toEqual([64, 52, 40, 28]);
    expect(guardsPlacement(LINE, { x: 896, y: 240 }).ok).toBe(true);
  });

  it('refuses without spending the charge, changing the wall or replacing the squad', () => {
    const locked = arena([], 5);
    const active = arena([enemy(0, 'troll', 700)]);
    expect(useSpecial(active, 'barricade', { x: 500, y: 240 }).ok).toBe(true);
    expect(callNextWave(active).ok).toBe(true);
    tick(active);
    cast(active);
    tick(active);
    const charged = structuredClone(active);
    charged.specialCharges = 1;
    for (const [state, aim, reason] of [
      [locked, AIM, 'locked'],
      [active, AIM, 'no-charge'],
      [charged, { x: -1, y: 240 }, 'out-of-bounds'],
      [charged, { x: 160, y: 199 }, 'off-trail'],
      [charged, { x: 63, y: 240 }, 'near-spawn'],
      [charged, { x: 897, y: 240 }, 'near-exit'],
    ] as const) {
      const before = structuredClone(state);
      expect(useSpecial(state, 'guards', aim)).toEqual({ ok: false, reason });
      expect(state).toEqual(before);
    }
    const wall = charged.blockers.find((blocker) => blocker.kind === 'barricade');
    const old = charged.blockers.filter((blocker) => blocker.kind === 'guard');
    cast(charged, { x: 280, y: 240 });
    expect(charged.blockers.find((blocker) => blocker.kind === 'barricade')).toBe(wall);
    expect(charged.blockers.filter((blocker) => blocker.kind === 'guard').map((guard) => guard.id)).toEqual([4, 5, 6, 7]);
    expect(charged.events).toContainEqual({ kind: 'squadGone', guards: old, reason: 'replaced' });
  });

  it.each([[false, 1200], [true, 684]] as const)('G6: Quick Hands %s refills after %i ticks', (quickHands, recharge) => {
    const long = { ...LINE, width: 2400, path: [LINE.path[0], { x: 2400, y: 240 }] };
    const state = arena([enemy(0, 'troll', 300)], 6, long);
    if (quickHands) state.boons = ['quickHands'];
    cast(state);
    expect(state.specialCharges).toBe(0);
    expect(state.specialRechargeTicks).toBe(recharge);
    expect(useSpecial(state, 'keg', AIM)).toEqual({ ok: false, reason: 'no-charge' });
    advance(state, recharge - 1);
    expect(state.specialCharges).toBe(0);
    expect(state.specialRechargeTicks).toBe(1);
    tick(state);
    expect(state.specialCharges).toBe(1);
    expect(state.specialRechargeTicks).toBe(0);
  });

  it.each([
    ['guards', 'guards'], ['guards', 'barricade'], ['barricade', 'guards'], ['keg', 'guards'], ['guards', 'keg'],
  ] as const)('blocks %s followed by %s in the same tick even after a legal early call', (first, second) => {
    const state = arena([enemy(0, 'troll', 300)]);
    expect(useSpecial(state, first, AIM).ok).toBe(true);
    expect(callNextWave(state).ok).toBe(true);
    const before = structuredClone(state);
    expect(useSpecial(state, second, AIM)).toEqual({ ok: false, reason: 'no-charge' });
    expect(state).toEqual(before);
    tick(state);
    expect(useSpecial(state, second, AIM).ok).toBe(true);
  });
});

describe('G4: simultaneous contact and lifetime', () => {
  it.each([['goblin', 138, 6], ['wolf', 120, 8]] as const)(
    'a lone %s dies on contact tick %i and pays its bounty once', (type, killTick, attackDps) => {
      const state = arena([enemy(0, type), enemy(1, 'troll', 400)]);
      const gold = state.gold;
      cast(state);
      advance(state, killTick - 1);
      expect(state.enemies[0].distance).toBe(FIRST);
      expect(state.enemies[0].hp).toBeCloseTo(1 / 6, 10);
      expect(state.blockers.find((blocker) => blocker.distance === FIRST)?.hp)
        .toBeCloseTo(GUARD_HP - (killTick - 1) * attackDps / 60, 10);
      tick(state);
      expect(state.enemies.map((entry) => entry.id)).toEqual([1]);
      expect(state.events.filter((event) => event.kind === 'kill')).toEqual([
        { kind: 'kill', cause: 'special', enemyType: type, enemyId: 0, bounty: 2 },
      ]);
      expect(state.blockers.find((blocker) => blocker.distance === FIRST)?.hp)
        .toBeCloseTo(GUARD_HP - killTick * attackDps / 60, 10);
      expect(state.gold).toBe(gold + 2);
      tick(state);
      expect(state.gold).toBe(gold + 2);
    },
  );

  it('a Troll takes a last strike on each of the ticks that it breaks a guard', () => {
    const state = arena([enemy(0, 'troll')]);
    cast(state);
    const breakTick = Math.ceil(GUARD_HP / 0.75);
    advance(state, breakTick - 1);
    expect(state.blockers.find((blocker) => blocker.distance === FIRST)?.hp)
      .toBeCloseTo(GUARD_HP - (breakTick - 1) * 0.75, 10);
    tick(state);
    expect(state.blockers).toHaveLength(3);
    expect(state.enemies[0].distance).toBe(FIRST);
    expect(state.enemies[0].hp).toBeCloseTo(950 - breakTick / 6, 9);
    expect(state.events.map((event) => event.kind)).toEqual(['blockerHit', 'guardStrike', 'guardDown']);
    tick(state);
    expect(state.enemies[0].distance).toBeCloseTo(FIRST + 35 / 60, 10);
    // A 12 px gap takes 20 free movement ticks before the next attack.
    advance(state, 3 * (20 + breakTick) - 1);
    expect(state.blockers).toEqual([]);
    expect(state.enemies[0].distance).toBe(AIM.x);
    expect(state.enemies[0].hp).toBeCloseTo(950 - 4 * breakTick / 6, 9);
    expect(state.events.at(-1)).toMatchObject({ kind: 'squadGone', reason: 'destroyed' });
  });

  it('credits both lethal blows from the same tick', () => {
    const state = arena([enemy(0, 'troll', FIRST, 1 / 6)]);
    cast(state);
    state.blockers.find((blocker) => blocker.distance === FIRST)!.hp = 0.75;
    tick(state);
    expect(state.blockers).toHaveLength(3);
    expect(state.events.map((event) => event.kind)).toContain('guardDown');
    expect(state.events).toContainEqual({ kind: 'kill', cause: 'special', enemyType: 'troll', enemyId: 0, bounty: 8 });
    expect(state.enemies).toEqual([]);
  });

  it('ten simultaneous Goblins stack one damage per tick and all advance together after the break', () => {
    const state = arena(Array.from({ length: 10 }, (_, id) => enemy(id, 'goblin')));
    const initialGold = state.gold;
    cast(state);
    advance(state, GUARD_HP - 1);
    expect(state.blockers.find((blocker) => blocker.distance === FIRST)?.hp).toBe(1);
    tick(state);
    expect(state.enemies.map((entry) => entry.distance)).toEqual(Array(10).fill(FIRST));
    expect(state.events.filter((event) => event.kind === 'blockerHit')).toHaveLength(10);
    expect(state.events.filter((event) => event.kind === 'guardStrike')).toHaveLength(1);
    expect(state.enemies[0].hp).toBeCloseTo(23 - GUARD_HP / 6, 10);
    expect(state.enemies.slice(1).every((entry) => entry.hp === 23)).toBe(true);
    expect(state.blockers).toHaveLength(3);
    tick(state);
    expect(state.enemies.map((entry) => entry.distance)).toEqual(Array(10).fill(FIRST + 1));

    // Each gap adds 11 free ticks before the next contact. The second guard
    // lands 66 strikes to finish Goblin 0, then takes 7 more ticks to fall.
    // The third guard takes 80 ticks to fall to 9 Goblins. The fourth finishes
    // Goblin 1 after 51 strikes, then takes 33 more ticks to fall to 8 Goblins.
    const falls: [tick: number, x: number][] = [[72, 124]];
    const kills: [tick: number, id: number, bounty: number][] = [];
    const advances: [tick: number, distance: number][] = [[73, 125]];
    while (state.tick < 343) {
      const previous = state.events.find((event) => event.kind === 'guardDown');
      tick(state);
      const fall = state.events.find((event) => event.kind === 'guardDown');
      const kill = state.events.find((event) => event.kind === 'kill');
      if (fall) {
        falls.push([state.tick, fall.x]);
        expect(state.enemies.every((entry) => entry.distance === fall.x)).toBe(true);
      }
      if (kill) {
        expect(kill.cause).toBe('special');
        kills.push([state.tick, kill.enemyId, kill.bounty]);
      }
      if (previous) {
        const distance = previous.x + 1;
        advances.push([state.tick, distance]);
        expect(state.enemies.every((entry) => entry.distance === distance)).toBe(true);
      }
    }
    expect(falls).toEqual([[72, 124], [156, 136], [247, 148], [342, 160]]);
    expect(kills).toEqual([[149, 0, 2], [309, 1, 2]]);
    expect(advances).toEqual([[73, 125], [157, 137], [248, 149], [343, 161]]);
    expect(state.blockers).toEqual([]);
    expect(state.enemies.map((entry) => entry.id)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(state.enemies[0].hp).toBeCloseTo(17.5, 10);
    expect(state.enemies.slice(1).every((entry) => entry.hp === 23)).toBe(true);
    expect(state.gold).toBe(initialGold + 4);
  });

  it('chooses earliest contact, then lowest id for same-tick arrivals, then moves to the next contact', () => {
    const state = arena([enemy(0, 'goblin', FIRST - 2), enemy(4, 'goblin', FIRST, 1 / 3), enemy(2, 'goblin', FIRST, 1 / 3)]);
    cast(state);
    const targets = [];
    for (let i = 0; i < 5; i++) {
      tick(state);
      targets.push(state.events.find((event) => event.kind === 'guardStrike')?.enemyId);
    }
    expect(targets).toEqual([2, 2, 4, 4, 0]);
  });

  it('an expiring guard holds and strikes through its last tick, then releases its walker', () => {
    const state = arena([enemy(0, 'shieldbearer', 0, 300)]);
    // A Shieldbearer moves 0.75 px/tick and first reaches the guard on tick 714.
    const distance = 714 * 0.75;
    cast(state, { x: distance + 36, y: 240 });
    advance(state, GUARD_LIFETIME_TICKS - 1);
    expect(state.blockers.filter((blocker) => blocker.kind === 'guard').map((entry) => entry.ticksLeft)).toEqual([1, 1, 1, 1]);
    expect(state.enemies[0].distance).toBe(distance);
    tick(state);
    expect(state.blockers).toEqual([]);
    expect(state.events.map((event) => event.kind)).toEqual(['blockerHit', 'guardStrike', 'squadGone']);
    expect(state.events.at(-1)).toMatchObject({ reason: 'expired' });
    expect(state.enemies[0].hp).toBeCloseTo(300 - 7 / 6, 10);
    const gone = state.events.find((event) => event.kind === 'squadGone')!;
    expect(gone.guards.find((guard) => guard.distance === distance)?.hp).toBeCloseTo(GUARD_HP - 7 * 0.2, 10);
    expect(state.enemies[0].distance).toBe(distance);
    tick(state);
    expect(state.enemies[0].distance).toBe(distance + 0.75);
  });

  it.each([['boss', 2007, 2065], ['grumblemaw', 3584, 3626]] as const)(
    'bounds solo %s exit delay to 180 ticks', (type, plainTicks, guardedTicks) => {
      const baseline = arena([enemy(0, type, FIRST - 0.1)]);
      const guarded = structuredClone(baseline);
      cast(guarded);
      const gone = (state: GameState) => {
        let falls = 0;
        let destroyed = 0;
        while (state.phase === 'wave') {
          tick(state);
          falls += state.events.filter((event) => event.kind === 'guardDown').length;
          destroyed += state.events.filter((event) => event.kind === 'squadGone' && event.reason === 'destroyed').length;
        }
        return { tick: state.tick, falls, destroyed };
      };
      const plain = gone(baseline);
      const withGuards = gone(guarded);
      expect(withGuards.falls).toBe(4);
      expect(withGuards.destroyed).toBe(1);
      expect(plain.tick).toBe(plainTicks);
      expect(withGuards.tick).toBe(guardedTicks);
      expect(withGuards.tick - plain.tick).toBeGreaterThan(0);
      expect(withGuards.tick - plain.tick).toBeLessThanOrEqual(180);
      expect(guarded.lives).toBe(baseline.lives);
    },
  );

  it('ticks on setup, freezes on win, and resumes on Keep going', () => {
    const state = arena([], 20);
    cast(state);
    tick(state);
    expect(state.phase).toBe('won');
    const won = structuredClone(state);
    advance(state, GUARD_LIFETIME_TICKS);
    expect(state).toEqual(won);
    expect(continueEndless(state).ok).toBe(true);
    advance(state, GUARD_LIFETIME_TICKS - 2);
    expect(state.blockers).toHaveLength(4);
    tick(state);
    expect(state.blockers).toEqual([]);
    expect(state.events.at(-1)).toMatchObject({ kind: 'squadGone', reason: 'expired' });
    expect(startWave(state).ok).toBe(true);
    expect(state.wave).toBe(21);
    cast(state);
    expect(state.blockers).toHaveLength(4);
  });
});

describe('G5: coexistence and flyers', () => {
  it('gives a wall at the exact same trail distance priority until it breaks', () => {
    const state = arena([enemy(0, 'wolf', FIRST - 5)]);
    cast(state);
    expect(callNextWave(state).ok).toBe(true);
    tick(state);
    expect(useSpecial(state, 'barricade', { x: FIRST, y: 240 }).ok).toBe(true);
    const wall = state.blockers.find((blocker) => blocker.kind === 'barricade')!;
    wall.hp = 0.1;
    advance(state, 2);
    expect(state.enemies[0].distance).toBeCloseTo(FIRST, 10);
    expect(state.events.map((event) => event.kind)).toEqual(['blockerHit', 'blockerBreak']);
    tick(state);
    expect(state.enemies[0].distance).toBe(FIRST);
    expect(state.events.map((event) => event.kind)).toEqual(['blockerHit', 'guardStrike']);
  });

  it.each([true, false])('holds at the first distance regardless of wall placement order %s', (wallFirst) => {
    const state = arena([enemy(0, 'wolf', 93), enemy(1, 'wolf', FIRST - 3), enemy(2, 'wolf', 197)]);
    const wall = (x: number) => expect(useSpecial(state, 'barricade', { x, y: 240 }).ok).toBe(true);
    if (wallFirst) wall(96);
    else cast(state);
    expect(callNextWave(state).ok).toBe(true);
    tick(state);
    if (wallFirst) cast(state);
    else wall(200);
    tick(state);
    expect(state.enemies.slice(0, 3).map((entry) => entry.distance)).toEqual(
      wallFirst ? [96, FIRST, 201] : [97, FIRST, 200],
    );
    expect(state.blockers).toHaveLength(5);
  });

  it('a Harpy traverses the whole trail in the same 640 ticks with both blocker kinds', () => {
    const baseline = arena([enemy(0, 'harpy', 0)]);
    const guarded = structuredClone(baseline);
    expect(useSpecial(guarded, 'barricade', { x: 350, y: 240 }).ok).toBe(true);
    tick(baseline);
    tick(guarded);
    guarded.specialCharges = 1;
    cast(guarded);
    advance(baseline, 638);
    advance(guarded, 638);
    expect(guarded.enemies).toEqual(baseline.enemies);
    expect(guarded.blockers.every((blocker) => blocker.hp === blocker.maxHp)).toBe(true);
    tick(baseline);
    tick(guarded);
    expect(guarded.events).toEqual(baseline.events);
    expect(guarded.enemies).toEqual([]);
    expect(guarded.lives).toBe(baseline.lives);
  });

  it('replays multiple concurrent contacts deterministically and conserves enemies and bounty', () => {
    const state = arena([
      enemy(0, 'goblin', FIRST - 1), enemy(1, 'wolf', 136), enemy(2, 'goblin', 160, 2),
      enemy(3, 'harpy', 950), enemy(4, 'troll', 900),
    ]);
    cast(state);
    const replay = structuredClone(state);
    const initialGold = state.gold;
    const initialLives = state.lives;
    const spawnIds = state.enemies.map((entry) => entry.id);
    let bounty = 0;
    const gone: number[] = [];
    while (state.phase === 'wave') {
      tick(state);
      tick(replay);
      expect(state).toEqual(replay);
      for (const event of state.events) {
        if (event.kind === 'kill') {
          expect(event.cause).toBe('special');
          bounty += event.bounty;
          gone.push(event.enemyId);
        } else if (event.kind === 'exit') {
          gone.push(event.enemyId);
        }
      }
    }
    expect(gone.sort((a, b) => a - b)).toEqual(spawnIds);
    expect(state.gold - initialGold).toBe(bounty + 25);
    expect(state.lives).toBe(initialLives - 2);
  });
});
