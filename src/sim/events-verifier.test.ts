import { applyScriptBoon } from './headless';
// Verifier (milestone 16): independent probes of state.events.
import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower } from './actions';
import { burnEnemies, fireTowers } from './combat';
import type { GameEvent } from './events';
import { createGame, startWave, tick, WAVE_CLEAR_BONUS } from './game';
import type { Cell } from './grid';
import { WAVES } from './waves';
import type { Enemy, EnemyType, GameState, TowerType } from './types';

const P: Cell = { col: 6, row: 7 }; // right of path segment y = 240; enemy at distance d <= 160 is at (d,240)

function enemy(id: number, distance: number, over: Partial<Enemy> = {}, type: EnemyType = 'goblin'): Enemy {
  const hp = ({ goblin: 30, wolf: 28, troll: 700, harpy: 40, shieldbearer: 120, boss: 4000, grumblemaw: 5600 } as const)[type];
  return { id, type, hp, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0, ...over };
}

function arena(enemies: Enemy[], towers: [Cell, TowerType][]): GameState {
  const s = createGame();
  s.gold = 10_000;
  s.phase = 'wave';
  s.wave = 1;
  s.spawnedPerGroup = [20]; // wave 1 fully spawned (20 Goblins since milestone 25c)
  s.enemies = enemies;
  s.nextEnemyId = 100;
  for (const [cell, type] of towers) buildTower(s, cell, type);
  s.events = [];
  return s;
}

/** Play every wave with a strong defence, logging every event exactly once per tick or action. */
function playLogged(towers: [number, number, TowerType][], upto = 20): { log: GameEvent[]; s: GameState; ticksAfterWon: GameEvent[] } {
  const s = createGame();
  s.gold = 100_000;
  s.lives = 1000;
  for (const [col, row, type] of towers) {
    buildTower(s, { col, row }, type);
    upgradeTower(s, { col, row });
  }
  const log: GameEvent[] = [];
  // The list persists through setup (until the next tick), so take only unseen entries.
  let list: GameEvent[] | null = null;
  let seen = 0;
  const take = () => {
    if (s.events !== list) { list = s.events; seen = 0; }
    log.push(...s.events.slice(seen));
    seen = s.events.length;
  };
  take();
  for (let w = 1; w <= upto && s.phase === 'setup'; w++) {
    applyScriptBoon(s);
    take();
    expect(startWave(s).ok).toBe(true);
    take();
    for (let i = 0; i < 60 * 600 && (s.phase as string) === 'wave'; i++) {
      tick(s);
      take();
    }
  }
  tick(s); // tick after the end changes nothing; the list stays
  return { log, s, ticksAfterWon: [...s.events] };
}

const DEFENCE: [number, number, TowerType][] = [
  [6, 5, 'longbow'], [17, 6, 'mortar'], [14, 8, 'firepot'], [14, 6, 'tarpit'], [6, 7, 'cannon'], [7, 5, 'musketeer'],
  [10, 8, 'firepot'], [10, 6, 'cannon'], [12, 8, 'musketeer'],
  // Milestone 22: anti-air for the Harpy waves, so the defence still wins.
  [9, 5, 'longbow'], [17, 8, 'longbow'],
  // Milestone 25c second pass (900 hp Trolls): three more upgraded Longbows so it still wins.
  [16, 8, 'longbow'], [9, 6, 'longbow'], [16, 9, 'longbow'],
];

describe('events verifier', () => {
  it('(a) a Cannon splash on 3 enemies emits 3 hits, same cell and damage', () => {
    // Cannon centre (208,240), range 90: goblins at (140..150,240) are 58-68 px away; all within 40 px splash of each other.
    const s = arena([enemy(0, 140), enemy(1, 145), enemy(2, 150)], [[P, 'cannon']]);
    fireTowers(s);
    const hits = s.events.filter((e) => e.kind === 'hit');
    expect(hits).toHaveLength(3);
    expect(s.events).toHaveLength(3);
    expect(new Set(hits.map((h) => JSON.stringify([h.kind === 'hit' && h.cell, h.kind === 'hit' && h.damage])))).toEqual(
      new Set([JSON.stringify([{ col: 6, row: 7 }, 25])]),
    );
    expect(hits.map((h) => (h.kind === 'hit' ? h.enemyId : -1)).sort()).toEqual([0, 1, 2]);
  });

  it('(b) burn kill has cause burn; across a full game each enemy is killed or exits exactly once', () => {
    const one = arena([enemy(0, 100, { hp: 0.01, burnDps: 5, burnTicksLeft: 10 })], []);
    burnEnemies(one);
    expect(one.events.map((e) => e.kind)).toEqual(['burn', 'kill']);
    expect(one.events[1]).toMatchObject({ kind: 'kill', enemyId: 0, cause: 'burn', enemyType: 'goblin' });

    const { log, s } = playLogged(DEFENCE);
    const spawns = log.filter((e) => e.kind === 'spawn');
    const kills = log.filter((e) => e.kind === 'kill');
    const exits = log.filter((e) => e.kind === 'exit');
    expect(s.enemies).toHaveLength(0);
    expect(spawns.length).toBe(WAVES.reduce((n, w) => n + w.groups.reduce((m, g) => m + g.count, 0), 0) + 8 * log.filter((e) => e.kind === 'packCall').length);
    expect(kills.length).toBe(spawns.length - exits.length);
    const ids = [...kills, ...exits].map((e) => (e as { enemyId: number }).enemyId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(kills.some((e) => e.kind === 'kill' && e.cause === 'burn')).toBe(true);
    expect(kills.some((e) => e.kind === 'kill' && e.cause === 'shot')).toBe(true);
  });

  it('(c) waveClear carries the bonus; won is emitted once, on the winning tick', () => {
    const { log, s, ticksAfterWon } = playLogged(DEFENCE);
    expect(s.phase).toBe('won');
    const clears = log.filter((e) => e.kind === 'waveClear');
    expect(clears.map((e) => (e.kind === 'waveClear' ? e.wave : 0))).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(clears.every((e) => e.kind === 'waveClear' && e.bonus === WAVE_CLEAR_BONUS)).toBe(true);
    expect(log.filter((e) => e.kind === 'won')).toHaveLength(1);
    const idxWon = log.findIndex((e) => e.kind === 'won');
    expect(log[idxWon - 1]).toMatchObject({ kind: 'waveClear', wave: 20 });
    expect(log.filter((e) => e.kind === 'lost')).toHaveLength(0);
    // Documented: ticking a won game leaves the last list, so a naive per-tick reader would see 'won' again.
    expect(ticksAfterWon.map((e) => e.kind)).toContain('won');
  });

  it('(d) slowed only when the slow applies: weaker on stronger emits nothing, equal and stronger emit', () => {
    const run = (slow: number) => {
      const s = arena([enemy(0, 140, { slow, slowTicksLeft: 100 })], [[P, 'tarpit']]);
      fireTowers(s);
      return s.events.map((e) => e.kind);
    };
    expect(run(0.6)).toEqual(['hit']); // tarpit base slow 0.4 < 0.6
    expect(run(0.4)).toEqual(['hit', 'slowed']); // equal replaces
    expect(run(0.2)).toEqual(['hit', 'slowed']);
    expect(run(0)).toEqual(['hit', 'slowed']);
  });

  it('(e) wave 3 spawn events: 22 Goblin and 12 Wolf (milestone 25c), ids 0..33 once each', () => {
    const s = createGame();
    s.wave = 2;
    startWave(s);
    const spawns: GameEvent[] = [];
    for (let i = 0; i < 60 * 40; i++) {
      tick(s);
      spawns.push(...s.events.filter((e) => e.kind === 'spawn'));
    }
    const count = (t: EnemyType) => spawns.filter((e) => e.kind === 'spawn' && e.enemyType === t).length;
    expect(count('goblin')).toBe(22);
    expect(count('wolf')).toBe(12);
    expect(spawns.map((e) => (e.kind === 'spawn' ? e.enemyId : -1))).toEqual([...Array(34).keys()]);
  });

  it('(f) a setup-phase tick has empty events; action events survive until the next tick only', () => {
    const s = createGame();
    s.gold = 1000;
    tick(s);
    expect(s.events).toEqual([]);
    buildTower(s, P, 'musketeer');
    upgradeTower(s, P);
    expect(s.events.map((e) => e.kind)).toEqual(['build', 'upgrade']);
    tick(s);
    expect(s.events).toEqual([]);
  });
});
