// Milestone 39 verifier tests. Written independently of blockers.test.ts: the
// expected numbers below are worked out by hand in the comments.
import { describe, expect, it } from 'vitest';
import { buildTower, useSpecial } from './actions';
import { BARRICADE_END_EXCLUSION, BARRICADE_HP, BARRICADE_SNAP_RADIUS, barricadePlacement } from './blockers';
import { measureBarricadePoint } from './barricadeSweep';
import { applyBurn, applySpecialSlow, findTarget } from './combat';
import { ENEMY_STATS } from './enemies';
import { balanceRun, playWithStats } from './balanceRuns';
import { comboBarricade } from './headless';
import { callNextWave, continueEndless, createGame, lastSpawnTick, startWave, tick } from './game';
import { MAP_IDS, MAPS, pathLength, positionAlongPath } from './map';
import type { Enemy, EnemyType, GameState, MapDef, Point } from './types';
import { waveDef } from './waves';

const LINE: MapDef = { id: 'line', width: 960, height: 480, path: [{ x: 0, y: 240 }, { x: 960, y: 240 }] };
const AT = 160;

function mk(id: number, type: EnemyType, distance: number): Enemy {
  return { id, type, distance, hp: ENEMY_STATS[type].hp, slow: 0, slowTicksLeft: 0 };
}

/** A wave-3 game on a straight line with only `enemies` alive and nothing left to spawn. */
function arena(enemies: Enemy[], wave = 3): GameState {
  const s = createGame({ map: LINE });
  s.wave = wave - 1;
  startWave(s);
  s.spawnedPerGroup = waveDef(wave).groups.map((g) => g.count);
  s.waveTick = lastSpawnTick(wave) + 1;
  s.enemies = enemies;
  s.nextEnemyId = 1000;
  return s;
}

function run(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) tick(s);
}

/** Ticks until the wall is gone, counting the breaking tick. */
function breakTick(enemies: Enemy[]): number {
  const s = arena(enemies);
  expect(useSpecial(s, 'barricade', { x: AT, y: 240 }).ok).toBe(true);
  for (let n = 1; n < 20000; n++) {
    tick(s);
    if (s.blocker === null) return n;
  }
  throw new Error('wall never broke');
}

describe('the blocking rule, by hand', () => {
  it('stops at the wall exactly, not before and not past, at normal speed and slowed', () => {
    const s = arena([mk(1, 'goblin', 100)]); // 60 px/s = 1 px/tick
    useSpecial(s, 'barricade', { x: AT, y: 240 });
    run(s, 59);
    expect(s.enemies[0].distance).toBe(159);
    run(s, 1);
    expect(s.enemies[0].distance).toBe(160); // arrives on tick 60 exactly
    run(s, 50);
    expect(s.enemies[0].distance).toBe(160);

    // slow 0.5: 0.5 px/tick, from 100 reaches 160 on tick 120 exactly
    const t = arena([mk(1, 'goblin', 100)]);
    useSpecial(t, 'barricade', { x: AT, y: 240 });
    applySpecialSlow(t.enemies[0], 0.5, 1000);
    run(t, 119);
    expect(t.enemies[0].distance).toBe(159.5);
    run(t, 1);
    expect(t.enemies[0].distance).toBe(160);
    run(t, 10);
    expect(t.enemies[0].distance).toBe(160);
  });

  it('a fast wolf that would overshoot by most of a step is clamped to the wall', () => {
    const s = arena([mk(1, 'wolf', 159.5)]); // 2 px/tick would reach 161.5
    useSpecial(s, 'barricade', { x: AT, y: 240 });
    tick(s);
    expect(s.enemies[0].distance).toBe(160);
  });

  it('several walkers arriving on different ticks: damage adds up per tick', () => {
    // Goblins at 150, 140, 130 reach 160 on ticks 10, 20, 30. Per tick: 0.1 each.
    // Ticks 10-19: 0.1, 20-29: 0.2, tick 30: 0.3 -> 1.0 + 2.0 + 0.3 = 3.3 hp lost after tick 30.
    const s = arena([mk(1, 'goblin', 150), mk(2, 'goblin', 140), mk(3, 'goblin', 130)]);
    useSpecial(s, 'barricade', { x: AT, y: 240 });
    run(s, 9);
    expect(s.blocker!.hp).toBe(BARRICADE_HP);
    run(s, 1);
    expect(s.blocker!.hp).toBeCloseTo(323.9, 9);
    run(s, 20);
    expect(s.blocker!.hp).toBeCloseTo(324 - 3.3, 9);
  });

  it('break ticks, worked out by hand', () => {
    // Troll 45/60 = 0.75 per tick: 431 ticks leave 0.75, the 432nd breaks it.
    expect(breakTick([mk(1, 'troll', AT)])).toBe(432);
    // Ten Goblins 1.0 per tick: tick 324 (K5).
    expect(breakTick(Array.from({ length: 10 }, (_, i) => mk(i + 1, 'goblin', AT)))).toBe(324);
    // Troll + 2 Goblins + Shieldbearer: (45+6+6+12)/60 = 1.15 per tick; 281 ticks = 323.15, 282 breaks.
    expect(breakTick([mk(1, 'troll', AT), mk(2, 'goblin', AT), mk(3, 'goblin', AT), mk(4, 'shieldbearer', AT)])).toBe(282);
    // Grumblefoot 300/60 = 5 per tick: 65. Grumblemaw 400/60: 49.
    expect(breakTick([mk(1, 'boss', AT)])).toBe(65);
    expect(breakTick([mk(1, 'grumblemaw', AT)])).toBe(49);
    // Lone Goblin 0.1 per tick: 3240 ticks. Lone Wolf 8/60: 2430 ticks.
    expect(breakTick([mk(1, 'goblin', AT)])).toBe(3240);
    expect(breakTick([mk(1, 'wolf', AT)])).toBe(2430);
    // A Harpy does nothing.
    const h = arena([mk(1, 'harpy', 100)]);
    useSpecial(h, 'barricade', { x: AT, y: 240 });
    run(h, 200);
    expect(h.blocker!.hp).toBe(BARRICADE_HP);
    expect(h.enemies[0].distance).toBeGreaterThan(AT);
  });

  it('enemies walk on the tick after the break, and every enemy was clamped on the break tick', () => {
    // Boss 5 + Goblin 0.1 = 5.1 per tick: 63 ticks = 321.3, 64 ticks = 326.4 -> breaks on tick 64.
    const s = arena([mk(1, 'boss', AT), mk(2, 'goblin', AT - 0.5)]);
    useSpecial(s, 'barricade', { x: AT, y: 240 });
    run(s, 64);
    expect(s.blocker).toBeNull();
    expect(s.enemies.map((e) => e.distance)).toEqual([AT, AT]);
    expect(s.events.filter((e) => e.kind === 'blockerBreak')).toHaveLength(1);
    tick(s);
    expect(s.enemies[0].distance).toBeCloseTo(AT + 25 / 60, 9);
    expect(s.enemies[1].distance).toBeCloseTo(AT + 1, 9);
  });

  it('an enemy already past is unaffected; one exactly on the point is held', () => {
    const s = arena([mk(1, 'goblin', AT + 0.001), mk(2, 'goblin', AT)]);
    useSpecial(s, 'barricade', { x: AT, y: 240 });
    tick(s);
    expect(s.enemies[0].distance).toBeCloseTo(AT + 1.001, 9);
    expect(s.enemies[1].distance).toBe(AT);
    expect(s.blocker!.hp).toBeCloseTo(323.9, 9);
  });

  it('flyers pass; ground walkers behind a flyer still stop', () => {
    const s = arena([mk(1, 'harpy', AT - 1), mk(2, 'goblin', AT - 1)]);
    useSpecial(s, 'barricade', { x: AT, y: 240 });
    run(s, 3);
    expect(s.enemies[0].distance).toBeCloseTo(AT - 1 + 4.5, 9);
    expect(s.enemies[1].distance).toBe(AT);
  });

  it('a stopped enemy keeps its timers running, can be killed once, and pays one bounty', () => {
    const s = arena([mk(1, 'goblin', AT)]);
    useSpecial(s, 'barricade', { x: AT, y: 240 });
    s.enemies[0].slow = 0.4;
    s.enemies[0].slowTicksLeft = 10;
    applySpecialSlow(s.enemies[0], 0.5, 7);
    run(s, 3);
    expect(s.enemies[0].slowTicksLeft).toBe(7);
    expect(s.enemies[0].specialSlowTicksLeft).toBe(4);
    run(s, 7);
    expect(s.enemies[0].slowTicksLeft).toBe(0);
    expect(s.enemies[0].slow).toBe(0);
    expect(s.enemies[0].specialSlow).toBe(0);
    const gold = s.gold;
    applyBurn(s.enemies[0], 3600, 60, 'special'); // 60 hp per tick: dead on the next tick
    tick(s);
    expect(s.enemies).toHaveLength(0);
    expect(s.gold).toBeGreaterThanOrEqual(gold + 2);
    expect(s.gold - gold).toBeLessThan(2 + 100);
    expect(s.events.filter((e) => e.kind === 'kill')).toHaveLength(1);
  });

  it('first, last and strongest order a stopped crowd by position then hp, not by wall', () => {
    const s = arena([mk(1, 'goblin', AT), mk(2, 'troll', AT), mk(3, 'goblin', AT - 20), mk(4, 'shieldbearer', AT - 20)]);
    s.gold = 1000;
    expect(buildTower(s, { col: 4, row: 5 }, 'musketeer').ok).toBe(true);
    const tower = s.towers[0];
    useSpecial(s, 'barricade', { x: AT, y: 240 });
    tower.targeting = 'first';
    expect(findTarget(s, tower)!.id).toBe(1); // two share the point: earlier in the list wins
    tower.targeting = 'last';
    expect(findTarget(s, tower)!.id).toBe(3);
    tower.targeting = 'strongest';
    expect(findTarget(s, tower)!.id).toBe(2);
  });

  it('replacement frees the old stack, which walks to the new wall', () => {
    const s = arena(Array.from({ length: 4 }, (_, i) => mk(i + 1, 'goblin', AT)));
    useSpecial(s, 'barricade', { x: AT, y: 240 });
    run(s, 5);
    s.specialCharges = 1; // skip the recharge
    s.specialRechargeTicks = 0;
    const r = useSpecial(s, 'barricade', { x: 300, y: 240 });
    expect(r.ok).toBe(true);
    expect(s.blocker).toMatchObject({ distance: 300, hp: 324 });
    run(s, 140);
    expect(s.enemies.map((e) => e.distance)).toEqual([300, 300, 300, 300]);
  });

  it('a flying-only wave and a wave with no walkers clear normally with a wall standing', () => {
    const s = arena([mk(1, 'harpy', 900)]);
    useSpecial(s, 'barricade', { x: AT, y: 240 });
    run(s, 30);
    expect(s.phase).toBe('wave');
  });

  it('the wall survives wave clear and stops the next wave (documented); won and lost leave it; Keep going keeps it', () => {
    const s = arena([mk(1, 'goblin', 900)]);
    useSpecial(s, 'barricade', { x: AT, y: 240 });
    applyBurn(s.enemies[0], 3600, 60, 'special');
    tick(s);
    expect(s.phase).toBe('setup');
    expect(s.blocker).not.toBeNull();
    const w20 = arena([], 20);
    useSpecial(w20, 'barricade', { x: AT, y: 240 });
    tick(w20);
    expect(w20.phase).toBe('won');
    expect(w20.blocker).not.toBeNull();
    expect(continueEndless(w20).ok).toBe(true);
    expect(w20.blocker).not.toBeNull();
  });

  it('a wall placed during an early-called wave works and a refill never double-places in one tick', () => {
    const s = arena([mk(1, 'troll', 700)]);
    useSpecial(s, 'barricade', { x: AT, y: 240 });
    expect(callNextWave(s).ok).toBe(true);
    expect(s.specialCharges).toBe(1);
    expect(useSpecial(s, 'barricade', { x: 200, y: 240 })).toEqual({ ok: false, reason: 'no-charge' });
    run(s, 1);
    expect(useSpecial(s, 'barricade', { x: 200, y: 240 }).ok).toBe(true);
  });
});

describe('placement oracle on the three real maps', () => {
  // An independent nearest-point search: every segment, closest point, shortest gap, first segment on ties.
  function oracle(map: MapDef, aim: Point) {
    let best = { gap: Infinity, x: 0, y: 0, arc: 0, angle: 0 };
    let run = 0;
    for (let i = 1; i < map.path.length; i++) {
      const a = map.path[i - 1];
      const b = map.path[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const t = Math.min(len, Math.max(0, (aim.x - a.x) * ux + (aim.y - a.y) * uy));
      const x = a.x + ux * t;
      const y = a.y + uy * t;
      const gap = Math.hypot(aim.x - x, aim.y - y);
      if (gap < best.gap - 1e-9) best = { gap, x, y, arc: run + t, angle: Math.atan2(uy, ux) };
      run += len;
    }
    return best;
  }

  it.each(MAP_IDS)('snaps every aim on %s to the nearest centreline point with the right verdict', (id) => {
    const map = MAPS[id];
    const total = pathLength(map);
    let ok = 0;
    for (let x = 0; x <= 960; x += 6) {
      for (let y = 0; y <= 480; y += 6) {
        const want = oracle(map, { x, y });
        const got = barricadePlacement(map, { x, y });
        if (want.gap > BARRICADE_SNAP_RADIUS) {
          expect(got.ok, `${id} ${x},${y}`).toBe(false);
          continue;
        }
        const near = want.arc < BARRICADE_END_EXCLUSION || total - want.arc < BARRICADE_END_EXCLUSION;
        expect(got.ok, `${id} ${x},${y}`).toBe(!near);
        if (got.ok) {
          ok++;
          expect(got.point.x).toBeCloseTo(want.x, 6);
          expect(got.point.y).toBeCloseTo(want.y, 6);
          expect(got.point.distance).toBeCloseTo(want.arc, 6);
          expect(got.point.angle).toBeCloseTo(want.angle, 9);
        }
      }
    }
    expect(ok).toBeGreaterThan(500);
  });

  it.each(MAP_IDS)('every corner of %s snaps to the corner vertex when aimed from outside the bend', (id) => {
    const map = MAPS[id];
    for (let i = 1; i < map.path.length - 1; i++) {
      const c = map.path[i];
      const a = map.path[i - 1];
      const b = map.path[i + 1];
      // Aim 10 px along the bisector pointing away from both neighbours.
      const ax = c.x - a.x, ay = c.y - a.y, bx = c.x - b.x, by = c.y - b.y;
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      const out = { x: ax / la + bx / lb, y: ay / la + by / lb };
      const lo = Math.hypot(out.x, out.y);
      if (lo < 1e-9) continue; // a straight vertex
      const aim = { x: c.x + (out.x / lo) * 10, y: c.y + (out.y / lo) * 10 };
      const got = barricadePlacement(map, aim);
      if (!got.ok) continue; // within 64 px of an end
      expect(got.point.x).toBeCloseTo(c.x, 6);
      expect(got.point.y).toBeCloseTo(c.y, 6);
    }
  });

  it.each(MAP_IDS)('refusals on %s change nothing and spend no charge; a legal cast on the exact limits works', (id) => {
    const s = createGame({ map: id });
    s.wave = 2;
    startWave(s);
    const total = pathLength(s.map);
    const p0 = s.map.path[0];
    const before = structuredClone(s);
    for (const aim of [{ x: p0.x, y: p0.y }, { x: -5, y: 10 }, { x: 480, y: 479.9 }, { x: s.map.path[s.map.path.length - 1].x, y: s.map.path[s.map.path.length - 1].y }]) {
      const r = useSpecial(s, 'barricade', aim);
      expect(r.ok, `${aim.x},${aim.y}`).toBe(false);
      expect(s).toEqual(before);
    }
    expect(s.specialCharges).toBe(1);
    expect(total).toBeGreaterThan(2 * BARRICADE_END_EXCLUSION);
  });
});

describe('boss break times and rewards', () => {
  it('Quick Hands changes only the recharge, never the wall', () => {
    const s = arena([]);
    s.boons = ['quickHands', 'hotCoals', 'tarLinger'] as never;
    useSpecial(s, 'barricade', { x: AT, y: 240 });
    expect(s.blocker).toMatchObject({ hp: 324, maxHp: 324 });
    expect(s.specialRechargeTicks).toBe(684);
  });
});

describe('reuse and abuse probes', () => {
  it('G: a blocker at the exit distance does not hold anyone: the clamped walker counts as exited', () => {
    // movement.ts clamps to blocker.distance, but removeExitedEnemies treats distance >= exit as out.
    // A castle wall at the exit would need that rule changed (the Barricade itself is kept 64 px away).
    const s = arena([mk(1, 'goblin', 959)]);
    s.blocker = { x: 960, y: 240, distance: 960, angle: 0, hp: 324, maxHp: 324 };
    const lives = s.lives;
    tick(s);
    expect(s.lives).toBe(lives - 1);
    expect(s.enemies).toHaveLength(0);
  });

  it('E: one Goblin, Wolf or Shieldbearer can be held for ever by re-placing every recharge; a lone Troll cannot', () => {
    for (const [type, held] of [['goblin', true], ['wolf', true], ['shieldbearer', true], ['troll', false]] as const) {
      const s = arena([mk(1, type, AT - 1)]);
      s.waveTick = 0;
      s.spawnedPerGroup = waveDef(3).groups.map((g) => g.count);
      let breaks = 0;
      for (let i = 0; i < 6000; i++) {
        if (s.specialCharges > 0 && useSpecial(s, 'barricade', { x: AT, y: 240 }).ok) { /* refreshed at full hp */ }
        tick(s);
        breaks += s.events.filter((e) => e.kind === 'blockerBreak').length;
      }
      expect(s.enemies[0]?.distance === AT, type).toBe(held);
      expect(breaks > 0, type).toBe(!held);
    }
  });

  it('E: holding enemies does not block calling the next wave early', () => {
    const s = arena([mk(1, 'goblin', AT)]);
    useSpecial(s, 'barricade', { x: AT, y: 240 });
    s.waveTick = lastSpawnTick(3) + 1;
    expect(callNextWave(s).ok).toBe(true);
    expect(s.enemies[0].distance).toBe(AT);
  });
});

describe('K3 placement regressions', () => {
  // First best completed point on each 48 px grid. npm run sim checks every point.
  it.each([
    ['meadow', 'normal', 448, 'won', 4], ['meadow', 'hard', 64, 'lost', -3],
    ['switchback', 'normal', 448, 'won', 3], ['switchback', 'hard', 208, 'lost', 0],
    ['riverbend', 'normal', 400, 'won', 0], ['riverbend', 'hard', 64, 'lost', -1],
  ] as const)('%s %s at trail distance %i', (map, level, distance, phase, expectedGain) => {
    const baseline = balanceRun('comboBuild', map, level);
    const run = measureBarricadePoint(map, level, distance);
    expect(run.phase).toBe(phase);
    if (run.phase === 'held') throw new Error('Expected a completed campaign');
    const gain = run.lives - baseline.lives;
    expect(gain).toBe(expectedGain);
    expect(gain).toBeLessThanOrEqual(6);
    if (level === 'hard' && baseline.phase === 'lost') expect(run.phase).toBe('lost');
  });

  it('also fixes the original Meadow Hard gain of seven under the mixed-special policy', () => {
    const barricadePoint = positionAlongPath(MAPS.meadow, 1360);
    const script = comboBarricade('hard', 'meadow', undefined, undefined, { barricadePoint });
    const run = playWithStats(script, 'hard');
    expect(run.refused).toBe(0);
    expect(run.phase).toBe('won');
    expect(run.lives).toBe(7);
    expect(run.lives - balanceRun('comboBuild', 'meadow', 'hard').lives).toBeLessThanOrEqual(6);
  });
});
