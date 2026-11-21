// Milestone 10 verifier probes. Written independently of newTowers.test.ts:
// every expected value is derived by hand in the comments, and the tests go
// through the public tick() so the step order is exercised too.
//
// Geometry: the path's first segment runs along y = 240 from x 0 to 160, so an
// enemy at path distance d <= 160 is at (d, 240). Cell P (col 6, row 7) has
// centre (208, 240); cell Q (col 7, row 7) has centre (240, 240).
import { describe, expect, it } from "vitest";
import { buildTower, upgradeTower } from "./actions";
import { cellCenter, type Cell } from "./grid";
import { createGame, tick } from "./game";
import type { Enemy, EnemyType, GameState, TowerType } from "./types";

const P: Cell = { col: 6, row: 7 };
const Q: Cell = { col: 7, row: 7 };

const FULL_HP: Record<EnemyType, number> = { goblin: 30, wolf: 28, troll: 500, harpy: 40, shieldbearer: 120 };

function mk(
  id: number,
  distance: number,
  type: EnemyType = "goblin",
  over: Partial<Enemy> = {},
): Enemy {
  return {
    id,
    type,
    hp: FULL_HP[type],
    distance,
    slow: 0,
    slowTicksLeft: 0,
    burnDps: 0,
    burnTicksLeft: 0,
    ...over,
  };
}

/** Wave 1, every enemy of the wave marked as spawned (so nothing spawns). */
function arena(enemies: Enemy[]): GameState {
  const s = createGame();
  s.phase = "wave";
  s.wave = 1;
  s.spawnedPerGroup = [8];
  s.enemies = enemies;
  s.nextEnemyId = 100;
  return s;
}

function place(
  s: GameState,
  cell: Cell,
  type: TowerType,
  upgraded = false,
): void {
  s.gold = 10_000;
  expect(buildTower(s, cell, type).ok).toBe(true);
  if (upgraded) expect(upgradeTower(s, cell).ok).toBe(true);
}

/** Frozen enemy: slow 1 for a very long time means speed * (1 - 1) = 0 per tick. */
const frozen = (e: Enemy): Enemy =>
  Object.assign(e, { slow: 1, slowTicksLeft: 1_000_000 });

/** A far-away dummy (distance 0, at (0,240)) keeps the wave from clearing. Pinned by `run`. */
const dummy = () => mk(99, 0);

/**
 * Tick `n` times. Each tick first resets enemy `pin.id` to path distance
 * `pin.d`; the tick then moves it by speed/60 (1 px for a goblin), so it is
 * at pin.d + 1 when burn and towers look at it. The dummy is pinned at 0.
 */
function run(
  s: GameState,
  n: number,
  pin?: { id: number; d: number },
  onTick?: (i: number) => void,
): void {
  for (let i = 1; i <= n; i++) {
    for (const e of s.enemies) {
      if (pin && e.id === pin.id) e.distance = pin.d;
      if (e.id === 99) e.distance = 0;
    }
    tick(s);
    onTick?.(i);
  }
}

describe("verifier: Mortar minimum range", () => {
  it("(a) fires at exactly 70 px, not at 69 px", () => {
    // Mortar on P (208,240). Enemy at (138,240): 208 - 138 = 70 exactly -> fires.
    // Enemy at (139,240): 69 -> inside the minimum, no shot, hp untouched.
    for (const [d, fires] of [
      [138, true],
      [139, false],
      [137, true], // 71
    ] as const) {
      const s = arena([frozen(mk(1, d, "troll"))]);
      place(s, P, "mortar");
      expect(cellCenter(P)).toEqual({ x: 208, y: 240 });
      tick(s);
      expect(s.shots.length, `distance ${d}`).toBe(fires ? 1 : 0);
      expect(s.enemies[0].hp).toBe(fires ? 500 - 45 : 500);
    }
  });

  it("(b) splash reaches enemies inside the minimum range; the target is 100 px away", () => {
    // Mortar on P (208,240), min 70, range 220, splash 60, damage 45. Frozen trolls on y = 240:
    //   T d=100: 108 from P, the only enemy in [70,220] that is furthest along -> target.
    //   B d=150: 58 from P (inside min, not targetable), 50 from T <= 60 -> splash.
    //   C d=140: 68 from P (inside min), 40 from T -> splash.
    //   E d=160: 48 from P (inside min), exactly 60 from T -> splash (inclusive).
    //   D d=29 : 179 from P (in range, behind T), 71 from T -> untouched.
    // (A target 30 px from the tower cannot exist: buildable cells are >= 36 px from the path.)
    const s = arena(
      [100, 150, 140, 160, 29].map((d, i) => frozen(mk(i + 1, d, "troll"))),
    );
    place(s, P, "mortar");
    tick(s);
    expect(s.shots).toHaveLength(1);
    expect(s.shots[0].targetId).toBe(1);
    expect(s.shots[0].splashRadius).toBe(60);
    expect(Object.fromEntries(s.enemies.map((e) => [e.id, e.hp]))).toEqual({
      1: 455,
      2: 455,
      3: 455,
      4: 455,
      5: 500,
    });
  });
});

describe("verifier: Fire Pot burn arithmetic", () => {
  /** Goblin pinned within Fire Pot range on Q: at (151,240) after the tick's move, 89 px from (240,240). */
  const PIN = { id: 1, d: 150 };

  it("(c) 30 hp goblin, no tar: dies 216 ticks after the first hit", () => {
    // Impacts at ticks 1, 76, 151 (cooldown round(60/0.8) = 75); impact 4 each.
    // Burn 5/s = 1/12 hp per tick, damaging from the tick after each impact.
    // After impact 3 (tick 151): hp = 30 - 3*4 - 150*(1/12) = 30 - 12 - 12.5 = 5.5.
    // 5.5 / (1/12) = 66 more burn ticks -> dies on tick 151 + 66 = 217 = 1 + 216.
    // Check: 12 impact + 216/12 = 18 burn = 30 total. The 4th impact (tick 226) never comes.
    const s = arena([mk(1, 150), dummy()]);
    place(s, Q, "firepot");
    const fireTicks: number[] = [];
    let death = 0;
    run(s, 230, PIN, (i) => {
      if (s.shots.length) fireTicks.push(i);
      if (!death && !s.enemies.some((e) => e.id === 1)) death = i;
    });
    expect(fireTicks).toEqual([1, 76, 151]);
    expect(death).toBe(217);
    expect(death - fireTicks[0]).toBe(216);
  });

  it("(c2) one tick before: alive with 1/12 hp left", () => {
    const s = arena([mk(1, 150), dummy()]);
    place(s, Q, "firepot");
    run(s, 216, PIN);
    const g = s.enemies.find((e) => e.id === 1)!;
    expect(g.hp).toBeCloseTo(1 / 12, 9);
    run(s, 1, PIN);
    expect(s.enemies.some((e) => e.id === 1)).toBe(false);
  });

  it("(d) permanent tar doubles burn: dies 132 ticks after the first hit", () => {
    // Burn 10/s effective = 1/6 hp per tick. Impacts at ticks 1 and 76.
    // After impact 1: 30 - 4 = 26. By tick 76's burn step: 75 ticks * 1/6 = 12.5 -> 13.5; impact 2 -> 9.5.
    // 9.5 / (1/6) = 57 more ticks -> dies on tick 76 + 57 = 133 = 1 + 132.
    // Check: 8 impact + 132/6 = 22 burn = 30 total. The 3rd impact (tick 151) never comes.
    const s = arena([
      mk(1, 150, "goblin", { slowTicksLeft: 1_000_000 }),
      dummy(),
    ]);
    place(s, Q, "firepot");
    const fireTicks: number[] = [];
    let death = 0;
    run(s, 160, PIN, (i) => {
      if (s.shots.length) fireTicks.push(i);
      if (!death && !s.enemies.some((e) => e.id === 1)) death = i;
    });
    expect(fireTicks).toEqual([1, 76]);
    expect(death).toBe(133);
    expect(death - fireTicks[0]).toBe(132);
  });
});

describe("verifier: burn replacement, kills and ordering", () => {
  const PIN = { id: 1, d: 150 };

  it("(e) upgraded burn (8/s, 240 ticks) replaces a base one; a base burn does not replace an upgraded one", () => {
    // Case 1: base Fire Pot on Q hits on tick 1 -> burn 5, 180 ticks. Upgraded Fire Pot built on P
    // before tick 2 hits on tick 2 (cooldown starts 0): burn step first (179 left), then replace -> 8, 240.
    const s1 = arena([mk(1, 150), dummy()]);
    place(s1, Q, "firepot");
    run(s1, 1, PIN);
    expect([s1.enemies[0].burnDps, s1.enemies[0].burnTicksLeft]).toEqual([
      5, 180,
    ]);
    place(s1, P, "firepot", true);
    run(s1, 1, PIN);
    expect([s1.enemies[0].burnDps, s1.enemies[0].burnTicksLeft]).toEqual([
      8, 240,
    ]);

    // Case 2: upgraded on P hits on tick 1 -> 8, 240. Base on Q built before tick 2 also hits on
    // tick 2, but 5 < 8 so nothing changes: still 8, with the timer one lower (239), not refreshed to 180.
    const s2 = arena([mk(1, 150), dummy()]);
    place(s2, P, "firepot", true);
    run(s2, 1, PIN);
    expect([s2.enemies[0].burnDps, s2.enemies[0].burnTicksLeft]).toEqual([
      8, 240,
    ]);
    place(s2, Q, "firepot");
    run(s2, 1, PIN);
    expect(s2.shots.map((x) => x.cell)).toEqual([Q]); // the base pot did fire
    expect([s2.enemies[0].burnDps, s2.enemies[0].burnTicksLeft]).toEqual([
      8, 239,
    ]);
    // hp: 30 - 4 (tick 1) - 8/60 (burn, tick 2) - 4 (base impact) = 21.8666...
    expect(s2.enemies[0].hp).toBeCloseTo(30 - 4 - 8 / 60 - 4, 9);
  });

  it("(f) an impact that kills applies no burn and pays the bounty once", () => {
    // Goblin at 4 hp: impact 4 -> hp 0 -> dead before any burn is applied. Goblin bounty is 4.
    const g = mk(1, 150, "goblin", { hp: 4 });
    const s = arena([g, dummy()]);
    place(s, Q, "firepot");
    s.gold = 0;
    run(s, 1, PIN);
    expect(s.enemies.map((e) => e.id)).toEqual([99]);
    expect(s.gold).toBe(4);
    expect([g.burnDps, g.burnTicksLeft]).toEqual([0, 0]);
    run(s, 300, PIN); // the pot keeps firing at nothing; no second payment
    expect(s.gold).toBe(4);
  });

  it("(g) a burn death in the status step pays once and is gone before towers act", () => {
    // Musketeer on Q, enemy 89 px away. Burn 6/s = 0.1 hp per tick; hp is exactly 0.1,
    // so the burn step on the very first tick kills it. The Musketeer (cooldown 0) must not shoot a corpse.
    const burning = () =>
      mk(1, 150, "goblin", { hp: 0.1, burnDps: 6, burnTicksLeft: 50 });
    const s = arena([burning(), dummy()]);
    place(s, Q, "musketeer");
    s.gold = 0;
    run(s, 1, PIN);
    expect(s.enemies.map((e) => e.id)).toEqual([99]);
    expect(s.gold).toBe(4);
    expect(s.shots).toHaveLength(0);
    run(s, 100, PIN);
    expect(s.gold).toBe(4);

    // Control: the same enemy without a burn (hp 0.1) is shot on tick 1 by the same Musketeer.
    const c = arena([mk(1, 150, "goblin", { hp: 0.1 }), dummy()]);
    place(c, Q, "musketeer");
    c.gold = 0;
    run(c, 1, PIN);
    expect(c.shots).toHaveLength(1);
    expect(c.gold).toBe(4);
  });
});
