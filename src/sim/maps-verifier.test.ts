// Milestone 27, independent verifier (Claude Fable): map data recomputed from
// scratch, the refusal order, the mask cache across maps, and sim probes on
// every map. Nothing here uses grid.ts's distance or overlap helpers to
// decide what is expected.
import { describe, expect, it } from 'vitest';
import { buildTower, moveTower, towerAt, useSpecial } from './actions';
import { enemyPosition } from './combat';
import { ENEMY_STATS } from './enemies';
import { callNextWave, continueEndless, createGame, startWave, tick } from './game';
import { buildableCells, isBuildable, isBuildableTerrain, terrainBlock } from './grid';
import {
  COMBO_PLANS,
  comboBuild,
  endlessIdle,
  lazyBuild,
  longbowSpam,
  noAntiAir,
  noTowers,
  playScripted,
  trailCellOrder,
} from './headless';
import { MAP_IDS, MAPS, pathLength, type MapId } from './map';
import type { Enemy, EnemyType, GameState, MapDef, Point, Rect } from './types';

const WAYPOINTS: Record<MapId, number[][]> = {
  meadow: [[0, 240], [160, 240], [160, 96], [420, 96], [420, 384], [680, 384], [680, 192], [960, 192]],
  switchback: [[0, 96], [560, 96], [560, 192], [320, 192], [320, 288], [560, 288], [560, 384], [960, 384]],
  riverbend: [[0, 384], [300, 384], [300, 96], [660, 96], [660, 384], [960, 384]],
};
const LENGTH: Record<MapId, number> = { meadow: 1584, switchback: 1728, riverbend: 1536 };
const BUILDABLE: Record<MapId, number> = { meadow: 344, switchback: 334, riverbend: 312 };
const NEW_MAPS = ['switchback', 'riverbend'] as const;

/** My own point-to-segment distance (projection clamped to the segment). */
function segDist(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const l2 = vx * vx + vy * vy;
  let t = l2 === 0 ? 0 : ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return Math.sqrt((p.x - a.x - vx * t) ** 2 + (p.y - a.y - vy * t) ** 2);
}
function pathDist(p: Point, path: readonly Point[]): number {
  let d = Infinity;
  for (let i = 1; i < path.length; i++) d = Math.min(d, segDist(p, path[i - 1], path[i]));
  return d;
}
const overlap = (col: number, row: number, r: Rect) =>
  col * 32 < r.x + r.width && r.x < col * 32 + 32 && row * 32 < r.y + r.height && r.y < row * 32 + 32;

type Why = 'path' | 'landmark' | 'water' | undefined;
/** Expected block per cell, key row * 30 + col, from the waypoints and boxes alone. */
function ownMask(path: readonly Point[], landmarks: readonly Rect[], water: readonly Rect[]): Why[] {
  const out: Why[] = [];
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 30; col++) {
      const centre = { x: col * 32 + 16, y: row * 32 + 16 };
      let why: Why;
      if (pathDist(centre, path) < 36) why = 'path';
      else if (landmarks.some((r) => overlap(col, row, r))) why = 'landmark';
      else if (water.some((r) => overlap(col, row, r))) why = 'water';
      out.push(why);
    }
  }
  return out;
}
function expectedMask(id: MapId): Why[] {
  const path = WAYPOINTS[id].map(([x, y]) => ({ x, y }));
  const exit = path[path.length - 1];
  const cottage = { x: exit.x - 52, y: exit.y - 61, width: 36, height: 37 };
  return ownMask(path, [cottage], id === 'riverbend' ? [{ x: 416, y: 160, width: 128, height: 320 }] : []);
}

describe('D. map data, recomputed', () => {
  for (const id of MAP_IDS) {
    it(`${id}: waypoints, length ${LENGTH[id]} (Manhattan sum), ${BUILDABLE[id]} buildable, mask equal cell by cell`, () => {
      const map = MAPS[id];
      expect(map.path.map((p) => [p.x, p.y])).toEqual(WAYPOINTS[id]);
      let len = 0;
      for (let i = 1; i < WAYPOINTS[id].length; i++) {
        len += Math.abs(WAYPOINTS[id][i][0] - WAYPOINTS[id][i - 1][0]) + Math.abs(WAYPOINTS[id][i][1] - WAYPOINTS[id][i - 1][1]);
      }
      expect(len).toBe(LENGTH[id]);
      expect(pathLength(map)).toBe(len);
      const want = expectedMask(id);
      expect(want.filter((w) => w === undefined)).toHaveLength(BUILDABLE[id]);
      const mask = buildableCells(map);
      expect(mask).toHaveLength(450);
      for (let key = 0; key < 450; key++) {
        const cell = { col: key % 30, row: Math.floor(key / 30) };
        expect(mask[key], `mask ${cell.col},${cell.row}`).toBe(want[key] === undefined);
        expect(terrainBlock(cell, map), `block ${cell.col},${cell.row}`).toBe(want[key]);
      }
    });

    it(`${id}: no buildable cell has its centre exactly on the 36 px limit by rounding luck (clearances are 48 px or more)`, () => {
      // Every lane is on a multiple of 16 px, so centres sit 16, 48, ... px away: the inclusive limit is never the decider.
      const path = MAPS[id].path;
      const mask = buildableCells(MAPS[id]);
      let nearest = Infinity;
      for (let key = 0; key < 450; key++) {
        if (mask[key]) nearest = Math.min(nearest, pathDist({ x: (key % 30) * 32 + 16, y: Math.floor(key / 30) * 32 + 16 }, path));
      }
      expect(nearest).toBeGreaterThanOrEqual(36);
    });

    it(`${id}: the cottage box is inside the map, clear of the path strip and of water; nothing buildable under the cave or the cottage`, () => {
      const map = MAPS[id];
      expect(map.landmarks).toHaveLength(1);
      const c = map.landmarks![0];
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.width).toBeLessThanOrEqual(960);
      expect(c.y + c.height).toBeLessThanOrEqual(480);
      // Box to path strip (20 px either side of the centreline): every box point is more than 20 px from the centreline.
      let nearest = Infinity;
      for (let x = c.x; x <= c.x + c.width; x++) for (let y = c.y; y <= c.y + c.height; y++) nearest = Math.min(nearest, pathDist({ x, y }, map.path));
      expect(nearest).toBeGreaterThan(20);
      for (const w of map.water ?? []) {
        expect(c.x < w.x + w.width && w.x < c.x + c.width && c.y < w.y + w.height && w.y < c.y + c.height).toBe(false);
      }
      // The cave is drawn as a 30 px disc on the spawn point (draw/map.ts spawnMarker): no buildable cell's square reaches it.
      const spawn = map.path[0];
      const mask = buildableCells(map);
      for (let key = 0; key < 450; key++) {
        if (!mask[key]) continue;
        const [x0, y0] = [(key % 30) * 32, Math.floor(key / 30) * 32];
        const nx = Math.max(x0, Math.min(spawn.x, x0 + 32));
        const ny = Math.max(y0, Math.min(spawn.y, y0 + 32));
        expect(Math.hypot(nx - spawn.x, ny - spawn.y), `cell ${key} under the cave`).toBeGreaterThanOrEqual(30);
        expect(overlap(key % 30, Math.floor(key / 30), c), `cell ${key} under the cottage`).toBe(false);
      }
    });
  }

  it('Riverbend: exactly the 40 cells of columns 13..16, rows 5..14 are refused as water, and no other cell on any map is', () => {
    for (const id of MAP_IDS) {
      const s = createGame({ map: id });
      const water: string[] = [];
      for (let row = -1; row <= 15; row++) {
        for (let col = -1; col <= 30; col++) {
          const r = buildTower(s, { col, row }, 'longbow');
          if (!r.ok && r.reason === 'water') water.push(`${col},${row}`);
          // A success is undone at once, so every cell is tried on an empty map with the same gold.
          if (r.ok) {
            s.towers.pop();
            s.gold += 40;
          }
        }
      }
      const want: string[] = [];
      if (id === 'riverbend') for (let row = 5; row <= 14; row++) for (let col = 13; col <= 16; col++) want.push(`${col},${row}`);
      expect(water, id).toEqual(want);
    }
  });

  it('refusal order: game-over, then terrain (path before landmark before water), then occupied, then gold', () => {
    // A map where one cell is path + landmark + water, one landmark + water, one water only.
    const box = { x: 0, y: 0, width: 960, height: 480 };
    const all: MapDef = { id: 'all', width: 960, height: 480, path: [{ x: 0, y: 240 }, { x: 960, y: 240 }], landmarks: [{ x: 320, y: 0, width: 32, height: 480 }], water: [box] };
    expect(terrainBlock({ col: 10, row: 7 }, all)).toBe('path'); // path, landmark and water
    expect(terrainBlock({ col: 10, row: 2 }, all)).toBe('landmark'); // landmark and water
    expect(terrainBlock({ col: 11, row: 2 }, all)).toBe('water');
    expect(terrainBlock({ col: 30, row: 2 }, all)).toBe('outside');
    expect(terrainBlock({ col: 1.5, row: 2 }, all)).toBe('outside');
    const s = createGame({ map: all });
    s.gold = 0;
    expect(buildTower(s, { col: 10, row: 7 }, 'longbow')).toEqual({ ok: false, reason: 'not-buildable' });
    expect(buildTower(s, { col: 10, row: 2 }, 'longbow')).toEqual({ ok: false, reason: 'not-buildable' });
    // Water wins over no gold; a tower forced onto a water cell (not reachable in play) still reports water, not occupied.
    expect(buildTower(s, { col: 11, row: 2 }, 'longbow')).toEqual({ ok: false, reason: 'water' });
    s.phase = 'lost';
    expect(buildTower(s, { col: 11, row: 2 }, 'longbow')).toEqual({ ok: false, reason: 'game-over' });

    const r = createGame({ map: 'riverbend' });
    r.gold = 40;
    expect(buildTower(r, { col: 12, row: 8 }, 'longbow')).toMatchObject({ ok: true });
    expect(r.gold).toBe(0);
    expect(buildTower(r, { col: 12, row: 8 }, 'longbow')).toEqual({ ok: false, reason: 'cell-occupied' }); // occupied before gold
    expect(buildTower(r, { col: 11, row: 8 }, 'longbow')).toEqual({ ok: false, reason: 'not-enough-gold' });
    expect(buildTower(r, { col: 13, row: 8 }, 'longbow')).toEqual({ ok: false, reason: 'water' }); // water before gold
    // Move: locked and no-tower come before the terrain reason.
    expect(moveTower(r, { col: 5, row: 0 }, { col: 13, row: 8 })).toEqual({ ok: false, reason: 'no-tower' });
    expect(moveTower(r, { col: 12, row: 8 }, { col: 13, row: 8 })).toEqual({ ok: false, reason: 'water' });
    expect(moveTower(r, { col: 12, row: 8 }, { col: 9, row: 8 })).toEqual({ ok: false, reason: 'not-buildable' }); // the climb
    startWave(r);
    expect(moveTower(r, { col: 12, row: 8 }, { col: 13, row: 8 })).toEqual({ ok: false, reason: 'not-in-setup' });
    expect(towerAt(r, { col: 12, row: 8 })).toBeDefined();
  });

  it('the mask cache never serves one map to another: games on all three maps, in every order, on fresh map objects', () => {
    const orders: MapId[][] = [
      ['meadow', 'switchback', 'riverbend'], ['meadow', 'riverbend', 'switchback'], ['switchback', 'meadow', 'riverbend'],
      ['switchback', 'riverbend', 'meadow'], ['riverbend', 'meadow', 'switchback'], ['riverbend', 'switchback', 'meadow'],
    ];
    for (const order of orders) {
      // Fresh copies, so each order starts with nothing cached for these objects.
      const games = order.map((id) => createGame({ map: structuredClone(MAPS[id]) as MapDef }));
      // Interleave the first reads, then read again in reverse.
      for (const pass of [games, [...games].reverse()]) {
        for (const g of pass) {
          const want = expectedMask(g.map.id as MapId);
          for (let key = 0; key < 450; key++) {
            const cell = { col: key % 30, row: Math.floor(key / 30) };
            if (isBuildable(g, cell) !== (want[key] === undefined)) throw new Error(`${order.join('>')}: ${g.map.id} cell ${key}`);
          }
        }
      }
      for (const g of games) expect(trailCellOrder(g.map)).toEqual(trailCellOrder(MAPS[g.map.id as MapId]));
    }
    // The registered objects too, and a clone of a running state keeps its own map.
    for (const id of MAP_IDS) {
      const s = structuredClone(createGame({ map: id }));
      expect(s.map).not.toBe(MAPS[id]);
      expect(buildableCells(s.map)).toEqual(buildableCells(MAPS[id]));
    }
  });

  it('a cell that is path on Meadow and grass on Riverbend (and the reverse) follows the game map', () => {
    // (2,7): on Meadow's first lane; grass on Riverbend and Switchback. (2,12): Riverbend's first lane; grass on Meadow.
    expect(buildTower(createGame({ map: 'meadow' }), { col: 2, row: 7 }, 'longbow')).toEqual({ ok: false, reason: 'not-buildable' });
    expect(buildTower(createGame({ map: 'riverbend' }), { col: 2, row: 7 }, 'longbow')).toMatchObject({ ok: true });
    expect(buildTower(createGame({ map: 'switchback' }), { col: 2, row: 7 }, 'longbow')).toMatchObject({ ok: true });
    expect(buildTower(createGame({ map: 'riverbend' }), { col: 2, row: 12 }, 'longbow')).toEqual({ ok: false, reason: 'not-buildable' });
    expect(buildTower(createGame({ map: 'meadow' }), { col: 2, row: 12 }, 'longbow')).toMatchObject({ ok: true });
    // Meadow's cottage cells (28,4), (29,4) are free on the new maps; theirs (28,10), (29,10) are free on Meadow.
    for (const id of NEW_MAPS) {
      expect(isBuildableTerrain({ col: 28, row: 4 }, MAPS[id])).toBe(true);
      expect(terrainBlock({ col: 28, row: 10 }, MAPS[id])).toBe('landmark');
      expect(terrainBlock({ col: 29, row: 10 }, MAPS[id])).toBe('landmark');
    }
    expect(isBuildableTerrain({ col: 28, row: 10 }, MAPS.meadow)).toBe(true);
  });
});

function enemy(id: number, type: EnemyType, distance: number, hp = 1e9): Enemy {
  return { id, type, hp, distance, slow: 0, slowTicksLeft: 0, specialSlow: 0, specialSlowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 };
}
/** A game in wave 1 with the wave's own spawns switched off, so only hand-placed enemies exist. */
function arena(map: MapId): GameState {
  const s = createGame({ map });
  s.gold = 100000;
  s.lives = 100000;
  startWave(s);
  s.spawnedPerGroup = s.spawnedPerGroup.map(() => 1e9);
  return s;
}

describe('E. sim probes on every map', () => {
  const TYPES = Object.keys(ENEMY_STATS) as EnemyType[];
  for (const id of MAP_IDS) {
    it(`${id}: every enemy type, flyers included, walks the same path in pathLength / speed seconds (within one tick) and costs its lives`, () => {
      for (const type of TYPES) {
        const s = arena(id);
        s.enemies.push(enemy(900, type, 0));
        const want = (LENGTH[id] / ENEMY_STATS[type].speed) * 60;
        let n = 0;
        let exited = -1;
        while (exited < 0 && n < want + 10) {
          const before = s.enemies[0] ? enemyPosition(s.enemies[0], s.map) : undefined;
          tick(s);
          n += 1;
          if (s.events.some((e) => e.kind === 'exit' && e.enemyId === 900)) exited = n;
          else {
            const p = enemyPosition(s.enemies[0], s.map);
            // On the centreline, and one step is never longer than speed / 60 (no jumps at corners).
            expect(pathDist(p, s.map.path)).toBeLessThan(1e-9);
            expect(Math.hypot(p.x - before!.x, p.y - before!.y)).toBeLessThanOrEqual(ENEMY_STATS[type].speed / 60 + 1e-9);
          }
        }
        expect(Math.abs(exited - want), `${type}: ${exited} ticks against ${want}`).toBeLessThanOrEqual(1);
        expect(s.lives).toBe(100000 - ENEMY_STATS[type].livesCost);
      }
    });
  }

  it('Switchback: a Longbow between two lanes shoots enemies on both; so does one in row 7', () => {
    for (const [cell, a, b] of [
      [{ col: 13, row: 4 }, 432, 560 + 96 + (560 - 432)], // (432,96) on lane 1 and (432,192) on lane 2
      [{ col: 14, row: 7 }, 560 + 96 + (560 - 464), 560 + 96 + 240 + 96 + (464 - 320)], // (464,192) and (464,288)
    ] as const) {
      const s = arena('switchback');
      expect(buildTower(s, cell, 'longbow')).toMatchObject({ ok: true });
      s.enemies.push(enemy(1, 'troll', a));
      tick(s);
      expect(s.shots.map((x) => x.targetId)).toEqual([1]);
      s.enemies = [enemy(2, 'troll', b)];
      tick(s);
      for (let i = 0; i < 60 && s.shots.length === 0; i++) tick(s);
      expect(s.shots.map((x) => x.targetId)).toEqual([2]);
      const p = enemyPosition(s.enemies[0], s.map);
      expect(Math.abs(p.y - (cell.row * 32 + 16))).toBeLessThanOrEqual(49);
    }
  });

  it('Switchback: Mortar splash and a Powder Keg reach across lanes (96 px apart is out of a 60 px splash, in of nothing; 40 px steps are)', () => {
    // Lanes are 96 px apart, so a 60 px splash centred on one lane does not reach the next lane's centreline;
    // it does reach round a U-turn: (560,150) on the drop and (530,192) on the next lane are 51.6 px apart.
    const s = arena('switchback');
    expect(buildTower(s, { col: 14, row: 11 }, 'mortar')).toMatchObject({ ok: true }); // centre (464,368)
    const first = enemy(1, 'troll', 560 + 96 + 30, 900); // (530,192): 188 px from the Mortar, the target (furthest along)
    const onDrop = enemy(2, 'troll', 560 + 54, 900); // (560,150)
    const farLane = enemy(3, 'troll', 530, 900); // (530,96), 96 px above the target: outside the splash
    s.enemies.push(first, onDrop, farLane);
    tick(s);
    expect(s.shots).toHaveLength(1);
    expect(s.shots[0].targetId).toBe(1);
    expect([first.hp, onDrop.hp, farLane.hp]).toEqual([855, 855, 900]);
    // The keg (70 px) aimed between two lanes 96 px apart hits both (48 px each).
    const k = arena('switchback');
    k.enemies.push(enemy(1, 'troll', 432), enemy(2, 'troll', 560 + 96 + 128), enemy(3, 'troll', 560 + 96 + 240 + 96 + 112));
    expect(useSpecial(k, 'keg', { x: 432, y: 144 })).toMatchObject({ ok: true, hits: 2 });
  });

  it('Switchback: a tar slow and a burn put on one lane are still on the enemy after the turn, and the burn kills it there', () => {
    const s = arena('switchback');
    // Tar Pit (17,1) centre (560,48): reaches the end of lane 1 and the top of the drop only.
    expect(buildTower(s, { col: 18, row: 1 }, 'tarpit')).toMatchObject({ ok: true }); // centre (592,48)
    const e = enemy(1, 'wolf', 555);
    s.enemies.push(e);
    tick(s);
    expect(e.slowTicksLeft).toBeGreaterThan(0);
    s.towers = [];
    const slowAt = e.slowTicksLeft;
    for (let i = 0; i < 10; i++) tick(s);
    // 10 ticks at 120 * 0.6 / 60 = 1.2 px: past the corner at 560 and onto the drop, still slowed.
    expect(e.distance).toBeGreaterThan(560);
    expect(enemyPosition(e, s.map).x).toBe(560);
    expect(e.slowTicksLeft).toBe(slowAt - 10);
    // Burn: Fire Arrows on lane 1, the wolf burns to death on the leftward lane.
    const b = arena('switchback');
    b.wave = 7;
    // 15 hp: the landing's 20/s special burn lasts 60 ticks (milestone 30) and kills it in 45.
    const w = enemy(1, 'troll', 540, 15);
    b.enemies.push(w);
    expect(useSpecial(b, 'fireArrows', { x: 540, y: 96 })).toMatchObject({ ok: true, hits: 1 });
    w.distance = 560 + 96 + 10; // carried onto the leftward lane with the burn on it
    let dead = false;
    for (let i = 0; i < 300 && !dead; i++) {
      tick(b);
      dead = b.events.some((ev) => ev.kind === 'kill');
    }
    expect(dead).toBe(true);
  });

  for (const id of NEW_MAPS) {
    it(`${id}: the plan uses only buildable, distinct cells; its special ticks are what the Meadow scan gives on this map`, () => {
      const plan = COMBO_PLANS[id];
      expect(plan).toHaveLength(COMBO_PLANS.meadow.length);
      // Role for role: the same action types and towers in the same order as Meadow's plan.
      expect(plan.map((a) => (a.type === 'build' ? a.tower : a.type))).toEqual(COMBO_PLANS.meadow.map((a) => (a.type === 'build' ? a.tower : a.type)));
      const want = expectedMask(id);
      const built = new Set<number>();
      for (const a of plan) {
        const key = a.cell.row * 30 + a.cell.col;
        if (a.type === 'build') {
          expect(want[key], `${a.cell.col},${a.cell.row}`).toBeUndefined();
          expect(built.has(key)).toBe(false);
          built.add(key);
        } else expect(built.has(key), `upgrade before build ${a.cell.col},${a.cell.row}`).toBe(true);
      }
    });
  }

  // Milestone 30: the cluster tick scan is gone with CLUSTER_POLICY_TICKS_BY_MAP
  // (endless waves fire by the special policy).

  // Milestone 28: the result pins of this table are cells of the balance
  // matrix (balance.suite.ts); what stays here is that each run records
  // the same script twice and refuses nothing, one test per map.
  for (const id of NEW_MAPS) {
    it(`${id}: noTowers, lazyBuild, longbowSpam, comboBuild and noAntiAir record the same script twice and refuse nothing`, () => {
      const make = { noTowers, lazyBuild, longbowSpam, comboBuild, noAntiAir };
      for (const [name, f] of Object.entries(make)) {
        const a = f('normal', id);
        expect(f('normal', id), `${id} ${name}`).toEqual(a);
        expect(a.mapId).toBe(id);
        const run = playScripted(a);
        expect(run.state.map.id).toBe(id);
        expect(run.log.filter((step) => 'result' in step && !step.result.ok), `${id} ${name}`).toEqual([]);
      }
    });
  }

  for (const id of NEW_MAPS) {
    it(`${id}: the boss walks the whole path and costs 5 lives; call early and endless work`, () => {
      // The boss: wave 10 with no towers on a huge life pool; it exits pathLength / 25 s after it spawns.
      const s = createGame({ map: id });
      s.lives = 100000;
      for (let w = 1; w < 10; w++) {
        startWave(s);
        while (s.phase === 'wave') tick(s);
      }
      startWave(s);
      let spawned = -1;
      let exited = -1;
      for (let n = 0; s.phase === 'wave' && n < 60 * 600; n++) {
        tick(s);
        if (spawned < 0 && s.enemies.some((e) => e.type === 'boss')) spawned = s.waveTick;
        if (s.events.some((e) => e.kind === 'bossDown')) exited = s.waveTick;
      }
      expect(Math.abs(exited - spawned - (LENGTH[id] / 25) * 60)).toBeLessThanOrEqual(1);
      expect(s.phase).toBe('won'); // lives were never the limit
      expect(continueEndless(s)).toEqual({ ok: true, wave: 10 });
      expect(startWave(s)).toEqual({ ok: true, wave: 11 });
      expect(s.map.id).toBe(id);

      // Call early: refused while spawning, accepted once the last enemy is out, and wave 2 walks the same map.
      const c = createGame({ map: id });
      c.lives = 100000;
      startWave(c);
      expect(callNextWave(c)).toEqual({ ok: false, reason: 'still-spawning' });
      let called = false;
      for (let n = 0; n < 60 * 120 && !called; n++) {
        tick(c);
        called = callNextWave(c).ok;
      }
      expect(called).toBe(true);
      expect(c.wave).toBe(2);
      for (let n = 0; n < 120; n++) tick(c);
      for (const e of c.enemies) expect(pathDist(enemyPosition(e, c.map), MAPS[id].path)).toBeLessThan(1e-9);

      // Endless: endlessIdle plays past wave 10 on this map and loses there.
      const run = playScripted(endlessIdle('normal', id));
      expect(run.state.map.id).toBe(id);
      expect(run.state.endless).toBe(true);
      expect(run.state.phase).toBe('lost');
      expect(run.state.wave).toBe(id === 'switchback' ? 17 : 15);
    });
  }
});

describe('B. archetypes and the map argument', () => {
  // Milestone 28: one test per archetype (the six together took over 5 s).
  for (const f of [noTowers, lazyBuild, longbowSpam, comboBuild, noAntiAir, endlessIdle]) {
    it(`the archetypes that take a map record it and play on it: ${f.name}`, () => {
      for (const id of NEW_MAPS) expect(f('normal', id).mapId, `${f.name} ${id}`).toBe(id);
      expect(f('normal').mapId, f.name).toBeUndefined();
      expect(f('normal', 'meadow').mapId, f.name).toBe('meadow');
    });
  }

  // Finding (verifier, low): ARCHETYPES and INFORMATIONAL are typed (difficulty, map) => WaveScript, but
  // soundBuild, soundBuildNoTar, hardBuild, comboStrongest and comboWithKegs dropped the map and returned a
  // Meadow script with no mapId, so `ARCHETYPES.hardBuild('hard', 'riverbend')` silently played Meadow.
  // Fixed in the milestone 27 follow-up (implementer): those five now throw for a map other than Meadow;
  // milestone 28 gave hardBuild a plan per map and removed comboWithKegs, so three refuse. This was an it.fails pin; it now checks that every entry given
  // a map either returns a script for that map or refuses it loudly, and that exactly those three refuse.
  it('every entry of ARCHETYPES and INFORMATIONAL given a map returns a script for that map or throws', async () => {
    const { ARCHETYPES, INFORMATIONAL } = await import('./headless');
    const wrong: string[] = [];
    const refused: string[] = [];
    for (const [name, f] of Object.entries({ ...ARCHETYPES, ...INFORMATIONAL })) {
      let script;
      try {
        script = f('normal', 'riverbend');
      } catch (e) {
        expect((e as Error).message, name).toBe(`${name} has a script for Meadow only, not for riverbend`);
        refused.push(name);
        continue;
      }
      if (script.mapId !== 'riverbend') wrong.push(name);
    }
    expect(wrong).toEqual([]);
    expect(refused.sort()).toEqual(['comboStrongest', 'soundBuild', 'soundBuildNoTar']);
    // Meadow, named or not, still gets its script from each of them.
    for (const name of refused) {
      const f = { ...ARCHETYPES, ...INFORMATIONAL }[name];
      expect(() => f('normal', 'meadow'), name).not.toThrow();
    }
  });
});
