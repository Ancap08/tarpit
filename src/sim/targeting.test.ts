// Targeting modes (milestone 24, docs/SCOPE-v4.md "Targeting modes"): first
// (furthest along the path), last (closest to the spawn), strongest (most
// current hp). Ties: first and last to the lower id; strongest to the
// furthest along the path, then the lower id. Every mode applies after the
// eligibility rules (range, the Mortar's minimum range, flying).
import { describe, expect, it } from 'vitest';
import { MAPS } from './map';
import { buildTower, sellTower, setTargeting, towerAt } from './actions';
import { enemyPosition, findTarget, fireTowers } from './combat';
import { createGame } from './game';
import { cellCenter, type Cell } from './grid';
import { comboBuild, comboStrongest, INFORMATIONAL, playScripted } from './headless';
import type { Enemy, EnemyType, GameState, TargetingMode, TowerType } from './types';
import { TARGETING_MODES } from './types';

const A: Cell = { col: 2, row: 5 }; // centre (80,176)

function enemy(id: number, distance: number, type: EnemyType = 'goblin', hp?: number): Enemy {
  const fullHp = ({ goblin: 30, wolf: 28, troll: 500, harpy: 40, shieldbearer: 120, boss: 4000 } as const)[type];
  return { id, type, hp: hp ?? fullHp, distance, slow: 0, slowTicksLeft: 0 };
}

/** Mid-wave-1 state with every wave enemy spawned and one tower at A in `mode`. */
function arena(enemies: Enemy[], type: TowerType, mode: TargetingMode): GameState {
  const s = createGame();
  s.gold = 10_000;
  s.phase = 'wave';
  s.wave = 1;
  s.spawnedPerGroup = [20]; // wave 1 fully spawned (20 Goblins since milestone 25c)
  s.enemies = enemies;
  s.nextEnemyId = 100;
  expect(buildTower(s, A, type).ok).toBe(true);
  expect(setTargeting(s, A, mode)).toEqual({ ok: true });
  s.gold = 0;
  return s;
}

const pick = (enemies: Enemy[], type: TowerType, mode: TargetingMode) => {
  const s = arena(enemies, type, mode);
  return findTarget(s, s.towers[0])?.id;
};

const distFromA = (d: number) => {
  const p = enemyPosition(enemy(0, d), MAPS.meadow);
  const c = cellCenter(A);
  return Math.hypot(p.x - c.x, p.y - c.y);
};

describe('geometry used by these tests', () => {
  it('distances from A (80,176) to path distances 50..250 and 75..450', () => {
    // Musketeer range 110, Cannon 90, Mortar 70..220.
    expect([50, 125, 150, 200, 250].map((d) => Math.round(distFromA(d) * 10) / 10)).toEqual([70.7, 78.2, 94.8, 83.5, 84.1]);
    expect([75, 100, 400, 450].map((d) => Math.round(distFromA(d) * 10) / 10)).toEqual([64.2, 67.1, 193.3, 239.7]);
  });
});

describe('each mode among three enemies with distinct path distance and hp', () => {
  // Musketeer at A, all three in range: id 0 at 50 with 10 hp, id 1 at 150
  // with 30 hp, id 2 at 250 with 20 hp.
  const three = () => [enemy(0, 50, 'goblin', 10), enemy(1, 150, 'goblin', 30), enemy(2, 250, 'goblin', 20)];

  it('first takes the furthest along the path (id 2)', () => {
    expect(pick(three(), 'musketeer', 'first')).toBe(2);
  });

  it('last takes the closest to the spawn (id 0)', () => {
    expect(pick(three(), 'musketeer', 'last')).toBe(0);
  });

  it('strongest takes the most hp (id 1)', () => {
    expect(pick(three(), 'musketeer', 'strongest')).toBe(1);
  });

  it('the shot hits the chosen enemy (fireTowers, hit event)', () => {
    for (const [mode, id] of [['first', 2], ['last', 0], ['strongest', 1]] as const) {
      const s = arena(three(), 'musketeer', mode);
      fireTowers(s);
      expect(s.events.filter((e) => e.kind === 'hit').map((e) => e.enemyId), mode).toEqual([id]);
    }
  });

  it('a new tower is first: same pick as an explicit first', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    expect(s.towers[0].targeting).toBe('first');
  });
});

describe('ties', () => {
  it('first: equal distance goes to the lower id', () => {
    expect(pick([enemy(5, 150), enemy(3, 150), enemy(4, 100)], 'musketeer', 'first')).toBe(3);
  });

  it('last: equal distance goes to the lower id', () => {
    expect(pick([enemy(5, 50), enemy(3, 50), enemy(4, 200)], 'musketeer', 'last')).toBe(3);
  });

  it('strongest: equal hp goes to the furthest along the path', () => {
    // ids 0 and 1 both have 30 hp; id 1 is further. id 2 is furthest but weaker.
    expect(pick([enemy(0, 100), enemy(1, 200), enemy(2, 250, 'goblin', 20)], 'musketeer', 'strongest')).toBe(1);
  });

  it('strongest: equal hp and equal distance go to the lower id', () => {
    expect(pick([enemy(7, 200), enemy(4, 200), enemy(5, 100)], 'musketeer', 'strongest')).toBe(4);
  });

  it('strongest with every hp equal is the same pick as first', () => {
    const es = () => [enemy(0, 50), enemy(1, 150), enemy(2, 250), enemy(3, 250)];
    expect(pick(es(), 'musketeer', 'strongest')).toBe(pick(es(), 'musketeer', 'first'));
    expect(pick(es(), 'musketeer', 'strongest')).toBe(2);
  });
});

describe('modes keep the eligibility rules', () => {
  it("last with a Mortar skips enemies inside its 70 px minimum range", () => {
    // 75 (64.2 px) and 100 (67.1 px) are inside; 125 (78.2 px) is the lowest eligible.
    const es = () => [enemy(0, 75), enemy(1, 100), enemy(2, 125), enemy(3, 400)];
    expect(pick(es(), 'mortar', 'last')).toBe(2);
    expect(pick(es(), 'mortar', 'first')).toBe(3);
  });

  it('strongest with a Mortar skips a stronger enemy inside the minimum range', () => {
    expect(pick([enemy(0, 75, 'troll'), enemy(1, 125)], 'mortar', 'strongest')).toBe(1);
  });

  it('modes never reach past the range', () => {
    // 450 is 239.7 px from A, past the Mortar's 220.
    expect(pick([enemy(0, 450, 'troll'), enemy(1, 125)], 'mortar', 'strongest')).toBe(1);
    // 304 = (160,96) is 113.1 px, past the Cannon's 105 (milestone 30).
    expect(pick([enemy(0, 304, 'troll'), enemy(1, 125)], 'cannon', 'strongest')).toBe(1);
  });

  it('strongest never picks a Harpy for a Cannon; a Musketeer does pick it', () => {
    // Harpy 40 hp at 125 (78.2 px), Goblin 20 hp at 200 (83.5 px): both inside the Cannon's 90.
    const es = () => [enemy(0, 125, 'harpy'), enemy(1, 200, 'goblin', 20)];
    expect(pick(es(), 'cannon', 'strongest')).toBe(1);
    expect(pick(es(), 'musketeer', 'strongest')).toBe(0);
  });

  it('splash follows the chosen target: a last-mode Cannon centres its splash on the closest-to-spawn enemy', () => {
    // 50 and 125 are 75 px apart along a straight run (y 240): outside a 40 px splash of each other.
    const s = arena([enemy(0, 50), enemy(1, 125)], 'cannon', 'last');
    fireTowers(s);
    expect(s.shots[0].targetId).toBe(0);
    expect(s.events.filter((e) => e.kind === 'hit').map((e) => e.enemyId)).toEqual([0]);
  });
});

describe('setTargeting', () => {
  it('sets the mode in setup and in a wave, emitting a targeting event', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    expect(setTargeting(s, A, 'last')).toEqual({ ok: true });
    expect(towerAt(s, A)?.targeting).toBe('last');
    expect(s.events.at(-1)).toEqual({ kind: 'targeting', cell: A, mode: 'last' });
    s.phase = 'wave';
    expect(setTargeting(s, A, 'strongest')).toEqual({ ok: true });
    expect(towerAt(s, A)?.targeting).toBe('strongest');
    expect(s.events.at(-1)).toEqual({ kind: 'targeting', cell: A, mode: 'strongest' });
  });

  it("refuses with 'no-tower' on an empty cell and 'game-over' once won or lost", () => {
    const s = createGame();
    expect(setTargeting(s, A, 'last')).toEqual({ ok: false, reason: 'no-tower' });
    buildTower(s, A, 'musketeer');
    for (const phase of ['won', 'lost'] as const) {
      s.phase = phase;
      const before = s.events.length;
      expect(setTargeting(s, A, 'last')).toEqual({ ok: false, reason: 'game-over' });
      expect(s.events.length).toBe(before);
      expect(towerAt(s, A)?.targeting).toBe('first');
    }
  });

  it('a sell and rebuild resets the mode to first', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer');
    setTargeting(s, A, 'strongest');
    sellTower(s, A);
    buildTower(s, A, 'musketeer');
    expect(towerAt(s, A)?.targeting).toBe('first');
  });

  it('the cycle order is first, last, strongest', () => {
    expect(TARGETING_MODES).toEqual(['first', 'last', 'strongest']);
  });
});

describe('comboStrongest (informational)', () => {
  it('follows COMBO_PLAN, with a strongest target action after every build', () => {
    const strong = comboStrongest();
    // Same purchases in the same order as comboBuild, cut short when it loses (the waves they land in may differ).
    const bought = strong.flat().filter((a) => a.type !== 'target');
    expect(bought).toEqual(comboBuild().flat().slice(0, bought.length));
    for (const wave of strong) {
      wave.forEach((a, i) => {
        if (a.type === 'build') expect(wave[i + 1]).toEqual({ type: 'target', cell: a.cell, mode: 'strongest' });
      });
    }
    // Milestone 25b added comboWithKegs; milestone 28 removed it.
    expect(INFORMATIONAL).toEqual({ comboStrongest });
  });

  it('runs with every action accepted, identically twice', () => {
    const a = playScripted(comboStrongest());
    const b = playScripted(comboStrongest());
    expect(a.log.filter((l) => 'result' in l && !l.result.ok)).toEqual([]);
    expect(b.state).toEqual(a.state);
    expect(a.state.towers.every((t) => t.targeting === 'strongest')).toBe(true);
  });

  it("result (no target, pinned so a change shows): lost on wave 7, 0 lives, 60 gold", () => {
    const s = playScripted(comboStrongest()).state;
    expect(`${s.phase} on wave ${s.wave}, ${s.lives} lives, ${s.gold} gold`).toBe('lost on wave 7, 0 lives, 60 gold');
  });
});
