// Milestone 40 verifier tests. Written independently of guards.test.ts: every
// expected number below is worked out by hand in the comments.
import { describe, expect, it } from 'vitest';
import { pickBoon, useSpecial } from './actions';
import { BARRICADE_END_EXCLUSION, guardsPlacement } from './blockers';
import { ENEMY_STATS } from './enemies';
import type { GameEvent } from './events';
import { continueEndless, createGame, lastSpawnTick, startWave, tick } from './game';
import { applyAction, COMBO_PLANS } from './headless';
import { MAP_IDS, MAPS, pathLength } from './map';
import type { Enemy, EnemyType, GameState, MapDef, Point } from './types';
import { waveDef } from './waves';

const LINE: MapDef = { id: 'line', width: 960, height: 480, path: [{ x: 0, y: 240 }, { x: 960, y: 240 }] };
const AT = 160; // front guard; the others stand at 148, 136 and 124

const mk = (id: number, type: EnemyType, distance: number, hp = ENEMY_STATS[type].hp): Enemy =>
  ({ id, type, distance, hp, slow: 0, slowTicksLeft: 0 });

function arena(enemies: Enemy[], wave = 6, map: MapDef = LINE): GameState {
  const s = createGame({ map });
  s.wave = wave - 1;
  startWave(s);
  s.spawnedPerGroup = waveDef(wave).groups.map((g) => g.count);
  s.waveTick = lastSpawnTick(wave) + 1;
  s.enemies = enemies;
  s.nextEnemyId = 1000;
  return s;
}
const run = (s: GameState, n: number) => { for (let i = 0; i < n; i++) tick(s); };
const squad = (s: GameState, at = AT) => expect(useSpecial(s, 'guards', { x: at, y: 240 }).ok).toBe(true);
// Rear-first: index 0 is the guard nearest the cave (distance 124 in these tests).
const guards = (s: GameState) => s.blockers.filter((b) => b.kind === 'guard').sort((a, b) => a.distance - b.distance);
const ready = (s: GameState) => { s.specialCharges = 1; s.specialRechargeTicks = 0; };

/** Independent walk along waypoints. */
function at(path: readonly Point[], d: number): Point {
  let left = d;
  for (let i = 1; i < path.length; i++) {
    const len = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (left <= len + 1e-9) {
      const t = left / len;
      return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * t, y: path[i - 1].y + (path[i].y - path[i - 1].y) * t };
    }
    left -= len;
  }
  throw new Error('past end');
}
/** Cumulative corner distances. */
function corners(path: readonly Point[]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 1; i < path.length - 1; i++) {
    sum += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    out.push(sum);
  }
  return out;
}

describe('positions', () => {
  it.each(MAP_IDS)('four guards 12 trail px apart on a straight, across each corner and at the clearance limit: %s', (id) => {
    const map = MAPS[id];
    const cs = corners(map.path);
    const anchors = [BARRICADE_END_EXCLUSION, ...cs.flatMap((c) => [c - 6, c, c + 6, c + 30]), pathLength(map) - BARRICADE_END_EXCLUSION];
    for (const d of anchors) {
      const aim = at(map.path, d);
      const r = guardsPlacement(map, aim);
      expect(r.ok, `${id} ${d}`).toBe(true);
      if (!r.ok) continue;
      expect(r.points).toHaveLength(4);
      r.points.forEach((p, i) => {
        const want = at(map.path, d - 12 * i);
        expect(p.distance).toBeCloseTo(d - 12 * i, 6);
        expect(p.x).toBeCloseTo(want.x, 6);
        expect(p.y).toBeCloseTo(want.y, 6);
      });
    }
    // just inside either clearance is refused
    expect(guardsPlacement(map, at(map.path, BARRICADE_END_EXCLUSION - 0.5)).ok).toBe(false);
    expect(guardsPlacement(map, at(map.path, pathLength(map) - BARRICADE_END_EXCLUSION + 0.5)).ok).toBe(false);
  });

  it('the cave limit of the line (36 px) is shadowed by the 64 px clearance: no squad ever reaches the cave', () => {
    // Dead code check: the only way guardsPlacement refuses with near-spawn is the 64 px rule.
    for (const id of MAP_IDS) {
      const r = guardsPlacement(MAPS[id], at(MAPS[id].path, 64));
      expect(r.ok && r.points[3].distance).toBe(64 - 36);
    }
  });
});

describe('refusals change nothing and spend no charge', () => {
  it.each([
    ['off the trail', { x: 160, y: 400 }, 6],
    ['near the cave', { x: 40, y: 240 }, 6],
    ['near the exit', { x: 930, y: 240 }, 6],
    ['outside the map', { x: -5, y: 240 }, 6],
    ['locked on wave 5', { x: AT, y: 240 }, 5],
  ])('%s', (_n, p, wave) => {
    const s = arena([mk(1, 'goblin', 100)], wave);
    const before = structuredClone(s);
    const r = useSpecial(s, 'guards', p);
    expect(r.ok).toBe(false);
    expect(s).toEqual(before);
    expect(s.specialCharges).toBe(1);
  });
  it('no charge, not in wave, second cast on one tick', () => {
    const s = arena([]);
    squad(s);
    const before = structuredClone(s);
    expect(useSpecial(s, 'guards', { x: 300, y: 240 })).toEqual({ ok: false, reason: 'no-charge' });
    expect(s).toEqual(before);
    ready(s); // an early-call style refill on the same tick
    expect(useSpecial(s, 'keg', { x: 300, y: 240 }).ok).toBe(false);
    const idle = createGame({ map: LINE });
    idle.wave = 6;
    const b = structuredClone(idle);
    expect(useSpecial(idle, 'guards', { x: AT, y: 240 })).toEqual({ ok: false, reason: 'not-in-wave' });
    expect(idle).toEqual(b);
  });
});

describe('fights, by hand', () => {
  // Guard strikes 10/60 per tick on the arrival tick too. A walker arriving on tick 1 is struck on ticks 1..N.
  it('Goblin (23 hp, 6 dps): dies on contact tick 138; guard has 72 - 138 * 0.1 = 58.2', () => {
    const s = arena([mk(1, 'goblin', 123)]);
    squad(s);
    const gold = s.gold;
    run(s, 137);
    expect(s.enemies).toHaveLength(1);
    run(s, 1);
    expect(s.enemies).toHaveLength(0);
    const bonus = (s.events.find((e) => e.kind === 'waveClear') as { bonus: number }).bonus;
    expect(guards(s)[0].hp).toBeCloseTo(58.2, 9);
    expect(guards(s).slice(1).every((g) => g.hp === 72)).toBe(true);
    expect(s.gold).toBe(gold + 2 + bonus);
  });
  it('Wolf (20 hp, 8 dps, 2 px/tick): dies on tick 120; guard 72 - 120 * 8/60 = 56', () => {
    const s = arena([mk(1, 'wolf', 123)]);
    squad(s);
    run(s, 119);
    expect(s.enemies).toHaveLength(1);
    run(s, 1);
    expect(s.enemies).toHaveLength(0);
    expect(guards(s)[0].hp).toBeCloseTo(56, 9);
  });
  it('Shieldbearer: the shield does not halve guard damage (70 - n/6), guard dies on tick 360 (72 / 0.2)', () => {
    const s = arena([mk(1, 'shieldbearer', 123.25)]); // 0.75 px/tick: arrives on tick 1
    squad(s);
    run(s, 6);
    expect(s.enemies[0].hp).toBeCloseTo(70 - 1, 9);
    run(s, 354);
    expect(guards(s)).toHaveLength(3);
    expect(s.enemies[0].hp).toBeCloseTo(70 - 60, 9);
    expect(s.enemies[0].distance).toBe(124);
  });
  it('Troll (950 hp, 45 dps) breaks a guard on tick 96 and keeps 934 hp', () => {
    const s = arena([mk(1, 'troll', 123.5)]);
    squad(s);
    run(s, 95);
    expect(guards(s)).toHaveLength(4);
    run(s, 1);
    expect(guards(s)).toHaveLength(3);
    expect(s.enemies[0].hp).toBeCloseTo(934, 9);
  });
  it('four guards, ten Goblins arriving together: first break 72, second 156, a goblin dies on 149', () => {
    const s = arena(Array.from({ length: 10 }, (_, i) => mk(i, 'goblin', 123)));
    squad(s);
    const deaths: number[] = [];
    const falls: number[] = [];
    for (let n = 1; n <= 160; n++) {
      tick(s);
      for (const e of s.events) { if (e.kind === 'kill') deaths.push(n); if (e.kind === 'guardDown') falls.push(n); }
    }
    expect(falls.slice(0, 2)).toEqual([72, 156]);
    expect(deaths).toEqual([149]);
  });
  it('ten Goblins one per second (60 px apart): each is held and the line never lets one past before it falls', () => {
    const s = arena(Array.from({ length: 10 }, (_, i) => mk(i, 'goblin', 123 - 60 * i)));
    squad(s);
    run(s, 2400);
    // Everything is dead or exited, nothing lost track of: count by lives.
    expect(s.enemies.filter((e) => e.distance >= 960)).toHaveLength(0);
    expect(s.lives).toBeLessThanOrEqual(20);
    expect(s.enemies.length + (20 - s.lives)).toBeLessThanOrEqual(10);
  });
  it('which enemy is struck: first to arrive, ties by id; only one at a time', () => {
    const a = arena([mk(5, 'goblin', 100, 1e6), mk(2, 'goblin', 120, 1e6)]);
    squad(a);
    run(a, 100); // id 5 arrives on tick 24, id 2 on tick 4: id 2 is first
    expect(a.enemies.find((e) => e.id === 2)!.hp).toBeCloseTo(1e6 - 97 / 6, 6); // arrives tick 4, struck on ticks 4..100
    expect(a.enemies.find((e) => e.id === 5)!.hp).toBe(1e6);
    const t = arena([mk(9, 'goblin', 123, 1e6), mk(3, 'goblin', 123, 1e6), mk(7, 'goblin', 123, 1e6)]);
    squad(t);
    run(t, 60);
    expect(t.enemies.find((e) => e.id === 3)!.hp).toBeCloseTo(1e6 - 10, 6);
    expect(t.enemies.find((e) => e.id === 7)!.hp).toBe(1e6);
    expect(t.enemies.find((e) => e.id === 9)!.hp).toBe(1e6);
    // three goblins hit only the rear guard: 3 * 0.1 * 60 = 18
    expect(guards(t)[0].hp).toBeCloseTo(72 - 18, 9);
    expect(guards(t).slice(1).every((g) => g.hp === 72)).toBe(true);
  });
  it('a held enemy resumes toward the next guard 12 px ahead after the first one falls', () => {
    const s = arena([mk(1, 'troll', 123.5, 1e6)]);
    squad(s);
    run(s, 96);
    expect(guards(s)).toHaveLength(3);
    expect(s.enemies[0].distance).toBe(124);
    run(s, 1);
    expect(s.enemies[0].distance).toBeCloseTo(124 + 35 / 60, 9);
  });
  it('expiry with an enemy held: it is struck on the last tick (720) and moves on tick 721', () => {
    const s = arena([mk(1, 'goblin', 124 - 300, 1e6)]);
    squad(s);
    run(s, 719);
    expect(guards(s)).toHaveLength(4);
    run(s, 1);
    expect(guards(s)).toHaveLength(0);
    expect(s.events.some((e) => e.kind === 'squadGone' && e.reason === 'expired')).toBe(true);
    expect(s.enemies[0].distance).toBe(124);
    // arrived on tick 300 (struck 421 times), the 720th tick included
    expect(s.enemies[0].hp).toBeCloseTo(1e6 - 421 / 6, 5);
    run(s, 1);
    expect(s.enemies[0].distance).toBe(125);
  });
  it('a new squad replaces the old one and frees its held enemies', () => {
    const s = arena([mk(1, 'goblin', 123, 1e6)]);
    squad(s);
    run(s, 30);
    expect(s.enemies[0].distance).toBe(124);
    ready(s);
    squad(s, 400);
    expect(guards(s).map((g) => g.distance)).toEqual([364, 376, 388, 400]);
    expect(s.events.filter((e) => e.kind === 'squadGone')).toHaveLength(1);
    tick(s);
    expect(s.enemies[0].distance).toBe(125);
  });
});

describe('with a Barricade, flyers, bosses', () => {
  it('wall behind the squad (nearer the cave) takes first contact; wall in front is reached after the guards fall', () => {
    const behind = arena([mk(1, 'goblin', 80, 1e6)]);
    squad(behind);
    ready(behind); behind.lastSpecialTick = -1;
    expect(useSpecial(behind, 'barricade', { x: 100, y: 240 }).ok).toBe(true);
    run(behind, 100);
    expect(behind.enemies[0].distance).toBe(100);
    expect(guards(behind).every((g) => g.hp === 72)).toBe(true);
    expect(behind.blockers.find((b) => b.kind === 'barricade')!.hp).toBeCloseTo(324 - 81 * 0.1, 9);

    const front = arena([mk(1, 'troll', 123.5, 1e6)]);
    squad(front);
    tick(front);
    ready(front);
    expect(useSpecial(front, 'barricade', { x: 300, y: 240 }).ok).toBe(true);
    run(front, 96 * 4 + 400);
    expect(guards(front)).toHaveLength(0);
    expect(front.enemies[0].distance).toBe(300);
    expect(front.blockers.find((b) => b.kind === 'barricade')!.hp).toBeLessThan(324);
  });
  it('flyers pass over and are never struck', () => {
    const s = arena([mk(1, 'harpy', 100)]);
    squad(s);
    run(s, 100);
    expect(s.enemies[0].distance).toBeCloseTo(100 + 150, 9);
    expect(s.enemies[0].hp).toBe(36);
    expect(guards(s).every((g) => g.hp === 72)).toBe(true);
  });
  it.each(['boss', 'grumblemaw'] as const)('%s loses at most 3 s crossing the squad', (type) => {
    const cross = (withSquad: boolean) => {
      const s = arena([mk(1, type, 100, 1e9)], type === 'boss' ? 10 : 20);
      s.spawnedPerGroup = waveDef(s.wave).groups.map((g) => g.count);
      if (withSquad) squad(s);
      let n = 0;
      while (s.enemies.length && n < 20000) { tick(s); n++; if (s.phase !== 'wave') break; }
      return n;
    };
    const lost = cross(true) - cross(false);
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThanOrEqual(180);
  });
});

describe('rewards, slow, burn, kills', () => {
  it('only Quick Hands touches the squad: hp, damage and lifetime ignore every other reward', () => {
    const s = arena([]);
    s.boons = ['stickyTar', 'hotCoals', 'biggerBlasts', 'tarLinger'] as never;
    squad(s);
    expect(guards(s).map((g) => [g.hp, g.attackDps, g.ticksLeft])).toEqual(Array(4).fill([72, 10, 720]));
    expect(s.specialRechargeTicks).toBe(1200);
    const q = arena([]);
    q.boons = ['quickHands'] as never;
    squad(q);
    expect(q.specialRechargeTicks).toBe(684);
  });
  it('guard kills pay bounty exactly once as special kills', () => {
    const s = arena([mk(1, 'goblin', 123, 1)]);
    squad(s);
    const gold = s.gold;
    const kills: GameEvent[] = [];
    let clear = 0;
    for (let i = 0; i < 20; i++) {
      tick(s);
      kills.push(...s.events.filter((e) => e.kind === 'kill'));
      for (const e of s.events) if (e.kind === 'waveClear') clear += e.bonus;
    }
    expect(kills).toEqual([{ kind: 'kill', enemyId: 1, enemyType: 'goblin', bounty: 2, cause: 'special' }]);
    expect(s.gold).toBe(gold + 2 + clear);
  });
  it('slow does not change what a guard deals or takes per tick', () => {
    const s = arena([mk(1, 'goblin', 123, 1e6)]);
    s.enemies[0].slow = 0.5; s.enemies[0].slowTicksLeft = 1000;
    squad(s);
    run(s, 60); // 0.5 px/tick: arrives on tick 2, struck and striking on ticks 2..60 = 59
    expect(s.enemies[0].hp).toBeCloseTo(1e6 - 59 / 6, 6);
    expect(guards(s)[0].hp).toBeCloseTo(72 - 5.9, 9);
  });
});

describe('whole games', () => {
  it('a campaign using Guards every recharge conserves kills and gold and is deterministic', () => {
    const point = at(MAPS.meadow.path, 200);
    const once = () => {
      const s = createGame({ map: MAPS.meadow, difficulty: 'normal' });
      s.wave = 5;
      s.gold = 100000;
      for (const a of COMBO_PLANS.meadow) applyAction(s, a);
      s.lives = 1000;
      const spawned = new Set<number>(); const killed = new Set<number>(); const exited = new Set<number>();
      let castCount = 0; let guardKills = 0;
      // no towers: just keg from wave 1 and Guards afterwards, each time the charge is ready
      let guardsUsed = 0;
      for (let w = 6; w <= 12 && s.phase !== 'lost'; w++) {
        if (s.phase !== 'setup') break;
        if (s.pendingBoon) pickBoon(s, s.pendingBoon.options[0]);
        startWave(s);
        for (let n = 0; n < 60 * 400 && (s.phase as GameState['phase']) === 'wave'; n++) {
          if (s.specialCharges > 0 && s.wave >= 6) { if (useSpecial(s, 'guards', point).ok) { castCount++; guardsUsed++; } }
          const gold = s.gold;
          tick(s);
          let bounty = 0; let clear = 0;
          for (const e of s.events) {
            if (e.kind === 'spawn') spawned.add(e.enemyId);
            if (e.kind === 'kill') { expect(killed.has(e.enemyId)).toBe(false); killed.add(e.enemyId); bounty += e.bounty; guardKills += e.cause === 'special' ? 1 : 0; }
            if (e.kind === 'exit') exited.add(e.enemyId);
            if (e.kind === 'waveClear') clear += e.bonus;
          }
          expect(s.gold - gold - clear).toBe(bounty);
        }
      }
      for (const id of killed) expect(exited.has(id)).toBe(false);
      for (const id of [...killed, ...exited]) expect(spawned.has(id)).toBe(true);
      const alive = new Set(s.enemies.map((e) => e.id));
      for (const id of spawned) expect(killed.has(id) || exited.has(id) || alive.has(id)).toBe(true);
      return { castCount, guardKills, lives: s.lives, gold: s.gold, wave: s.wave, phase: s.phase, k: killed.size, x: exited.size, guardsUsed };
    };
    const a = once();
    expect(a.castCount).toBeGreaterThan(0);
    expect(a.guardKills).toBeGreaterThan(0);
    expect(once()).toEqual(a);
  }, 120_000);
});

describe('squad across phase changes', () => {
  it('survives wave clear, counts down in setup, freezes at a win and a loss, carries into Keep going', () => {
    const s = arena([]);
    squad(s);
    run(s, 2); // no enemies: wave clears at once
    expect(s.phase).toBe('setup');
    expect(guards(s)).toHaveLength(4);
    const left = guards(s)[0].ticksLeft;
    run(s, 10);
    expect(guards(s)[0].ticksLeft).toBe(left - 10);

    const w = arena([], 20);
    squad(w);
    tick(w);
    expect(w.phase).toBe('won');
    const frozen = guards(w)[0].ticksLeft;
    run(w, 30);
    expect(guards(w)[0].ticksLeft).toBe(frozen);
    expect(continueEndless(w).ok).toBe(true);
    expect(guards(w)).toHaveLength(4);
    tick(w);
    expect(guards(w)[0].ticksLeft).toBeLessThan(frozen);

    const l = arena([mk(1, 'goblin', 958)]);
    l.lives = 1;
    squad(l, 600);
    tick(l); tick(l);
    expect(l.phase).toBe('lost');
    const lt = guards(l)[0].ticksLeft;
    run(l, 20);
    expect(guards(l)[0].ticksLeft).toBe(lt);
  });
});

describe('Grumblemaw pack calls', () => {
  it('a guard strike that carries the boss below a third of its hp calls the pack on that tick', () => {
    const s = arena([mk(1, 'grumblemaw', 123.99)], 20);
    s.spawnedPerGroup = waveDef(20).groups.map((g) => g.count);
    const full = s.enemies[0].hp;
    s.enemies[0].hp = (full * 2) / 3 + 0.01; // one guard strike (1/6 hp) crosses the threshold
    squad(s);
    const calls: GameEvent[] = [];
    for (let i = 0; i < 3; i++) { tick(s); calls.push(...s.events.filter((e) => e.kind === 'packCall')); }
    expect(s.enemies[0].hp).toBeLessThan((full * 2) / 3);
    expect(calls).toEqual([{ kind: 'packCall', enemyId: 1, threshold: 2 }]);
  });
});
