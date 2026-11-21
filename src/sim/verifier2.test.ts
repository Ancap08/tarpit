import { describe, expect, it } from 'vitest';
import { buildTower, sellTower, upgradeTower } from './actions';
import { fireTowers } from './combat';
import { createGame, startWave, tick } from './game';
import { playScripted, soundBuild } from './headless';
import type { Enemy, GameState, TowerType } from './types';

function goblin(id: number, distance: number, hp = 30): Enemy {
  return { id, type: 'goblin', hp, distance, slow: 0, slowTicksLeft: 0 };
}

/** Wave-1 state with all wave enemies "already spawned" so ticks add none. */
function arena(enemies: Enemy[], towers: [number, TowerType][]): GameState {
  const s = createGame();
  s.gold = 10_000;
  s.phase = 'wave';
  s.wave = 1;
  s.spawnedPerGroup = [8];
  s.enemies = enemies;
  for (const [spot, type] of towers) buildTower(s, spot, type);
  s.gold = 0;
  return s;
}

describe('verifier 2: combat', () => {
  it('an enemy killed by spot 2 is not shot again by spot 4 in the same tick', () => {
    // Path distance 434 = (290,96): 94 px from spot 2 (240,176) and from spot 4 (340,176).
    // Path distance 400 = (256,96): 81.6 px from spot 2, 116 px from spot 4 (out of range).
    const s = arena([goblin(0, 400), goblin(1, 434, 12)], [[2, 'musketeer'], [4, 'musketeer']]);
    fireTowers(s);
    expect(s.enemies.map((e) => [e.id, e.hp])).toEqual([[0, 30]]);
    expect(s.gold).toBe(4);
    expect(s.towers[0].cooldownTicks).toBe(60);
    // Spot 4 found no live target, so it did not fire and is still ready.
    expect(s.towers[1].cooldownTicks).toBe(0);
  });

  it('cannon splash kills in-radius enemies once, spares the one outside, and pays no bounty twice', () => {
    // Distances 370 (226,96), 400 (256,96), 420 (276,96). Target = 420 (87.7 px from spot 2).
    // 400 is 20 px from the target (hit); 370 is 50 px away (outside 40).
    const s = arena([goblin(0, 370), goblin(1, 400, 25), goblin(2, 420, 25)], [[2, 'cannon']]);
    fireTowers(s);
    expect(s.enemies.map((e) => [e.id, e.hp])).toEqual([[0, 30]]);
    expect(s.gold).toBe(8);
    // Goblin 0 (30 hp) is now the only target: 25 leaves 5, the next shot kills it.
    for (let i = 0; i < 240; i++) fireTowers(s);
    expect(s.enemies).toEqual([]);
    expect(s.gold).toBe(12); // 3 kills x 4, each paid exactly once
  });

  it('a lone goblin crossing spot 2 musketeer coverage dies on the 3rd shot; wave 1 leaks 6 of 8', () => {
    // First in range at path distance ~150.54 (x 150.5, y 240; 110 px from spot 2).
    // At 1 px/tick the goblin is first shot at distance 151, then 211 and 271 (3 x 12 = 36 >= 30).
    const s = arena([goblin(0, 0)], [[2, 'musketeer']]);
    const shotsAt: number[] = [];
    while (s.enemies.length > 0 && s.enemies[0].distance < 1584) {
      s.enemies[0].distance += 1;
      const hpBefore = s.enemies[0].hp;
      const d = s.enemies[0].distance;
      fireTowers(s);
      if (s.enemies.length === 0 || s.enemies[0].hp < hpBefore) shotsAt.push(d);
    }
    expect(shotsAt).toEqual([151, 211, 271]);
    expect(s.enemies).toEqual([]);
    expect(s.gold).toBe(4);

    // Whole of wave 1 with only this tower: observed 2 kills, 6 leaks.
    const g = createGame();
    buildTower(g, 2, 'musketeer');
    startWave(g);
    while (g.phase === 'wave') tick(g);
    expect(g.lives).toBe(14);
    expect(g.gold).toBe(100 - 50 + 2 * 4 + 25);
  });
});

describe('verifier 2: economy', () => {
  it('sell then rebuild on the same spot works', () => {
    const g = createGame();
    buildTower(g, 3, 'musketeer');
    expect(sellTower(g, 3)).toEqual({ ok: true, refund: 35, gold: 85 });
    const r = buildTower(g, 3, 'cannon');
    expect(r.ok).toBe(true);
    expect(g.gold).toBe(5);
    expect(g.towers).toEqual([{ spotId: 3, type: 'cannon', upgraded: false, cooldownTicks: 0, spent: 80 }]);
  });

  it.each([
    ['musketeer', 35],
    ['cannon', 60],
    ['tarpit', 50],
  ] as const)('%s upgrade succeeds with exactly %i gold and fails with one less', (type, cost) => {
    const g = createGame();
    buildTower(g, 1, type);
    g.gold = cost - 1;
    expect(upgradeTower(g, 1)).toEqual({ ok: false, reason: 'not-enough-gold' });
    expect(g.gold).toBe(cost - 1);
    expect(g.towers[0].upgraded).toBe(false);
    g.gold = cost;
    expect(upgradeTower(g, 1).ok).toBe(true);
    expect(g.gold).toBe(0);
    expect(g.towers[0].upgraded).toBe(true);
  });

  it.each([
    ['musketeer', 59],
    ['cannon', 98],
    ['tarpit', 77],
  ] as const)('selling an upgraded %s refunds %i', (type, refund) => {
    const g = createGame();
    g.gold = 1000;
    buildTower(g, 1, type);
    upgradeTower(g, 1);
    const before = g.gold;
    const r = sellTower(g, 1);
    expect(r).toMatchObject({ ok: true, refund });
    expect(g.gold - before).toBe(refund);
  });
});

describe('verifier 2: determinism', () => {
  it('soundBuild gives an identical final state and per-wave log on two runs', () => {
    const a = playScripted(soundBuild());
    const b = playScripted(soundBuild());
    expect(a.state).toEqual(b.state);
    expect(a.waves).toEqual(b.waves);
    expect(a.log).toEqual(b.log);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});
