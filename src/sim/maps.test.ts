// Milestone 27: the map travels with the game.
import { describe, expect, it } from 'vitest';
import { buildTower, moveTower, useSpecial } from './actions';
import { enemyPosition } from './combat';
import { ENEMY_STATS } from './enemies';
import { MEADOW_COMBO_NORMAL } from './fixtures/meadowComboNormal';
import { continueEndless, createGame, startWave, tick, TICKS_PER_SECOND } from './game';
import {
  buildableCells,
  cellCenter,
  cellFromKey,
  cellKey,
  distanceToPath,
  GRID_COLS,
  GRID_ROWS,
  isBuildable,
  isBuildableTerrain,
  MIN_PATH_CLEARANCE,
  terrainBlock,
  type Cell,
} from './grid';
import {
  COMBO_PLAN,
  COMBO_PLANS,
  comboBuild,
  lazyBuild,
  noTowers,
  playScripted,
  TRAIL_CELL_ORDER,
  trailCellOrder,
} from './headless';
import { cottageFor, DEFAULT_MAP, isMapId, MAP_IDS, MAPS, pathLength, positionAlongPath, resolveMap, RIVER } from './map';
import type { MapDef, Point, Rect } from './types';

/** A straight test map: the path runs along row 7 from the left edge to the right edge. */
const STRAIGHT: MapDef = { id: 'straight', width: 960, height: 480, path: [{ x: 0, y: 240 }, { x: 960, y: 240 }] };

describe('the game carries its map (milestone 27)', () => {
  it('createGame defaults to Meadow, the same object as MAPS.meadow', () => {
    expect(DEFAULT_MAP).toBe('meadow');
    expect(createGame().map).toBe(MAPS.meadow);
    expect(createGame({ map: 'meadow' }).map).toBe(MAPS.meadow);
    expect(MAPS.meadow.id).toBe('meadow');
  });

  it('a test may pass its own MapDef: building and movement follow it', () => {
    expect(isBuildable(createGame(), { col: 15, row: 7 })).toBe(true);
    const s = createGame({ map: STRAIGHT });
    expect(s.map).toBe(STRAIGHT);
    expect(resolveMap(STRAIGHT)).toBe(STRAIGHT);
    // (15,7) is buildable on Meadow but on this map's path; (5,3) is clear of it.
    expect(isBuildable(s, { col: 15, row: 7 })).toBe(false);
    expect(buildTower(s, { col: 15, row: 7 }, 'musketeer')).toEqual({ ok: false, reason: 'not-buildable' });
    expect(isBuildable(s, { col: 5, row: 3 })).toBe(true);
    s.lives = 1000;
    startWave(s);
    tick(s); // spawn
    for (let i = 0; i < 60; i++) tick(s);
    expect(enemyPosition(s.enemies[0], s.map)).toEqual({ x: 60, y: 240 }); // a Goblin, 60 px/s, after 60 ticks
    expect(pathLength(s.map)).toBe(960);
  });

  it('the buildable mask is computed once per map object', () => {
    expect(buildableCells(MAPS.meadow)).toBe(buildableCells(MAPS.meadow));
    expect(buildableCells(STRAIGHT)).toBe(buildableCells(STRAIGHT));
    expect(buildableCells(STRAIGHT)).not.toBe(buildableCells(MAPS.meadow));
  });
});

const ALL = MAP_IDS.map((id) => MAPS[id]);

/** Distance from point p to the box r (0 inside it). */
function distToRect(p: Point, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy);
}

describe('map data (milestone 27)', () => {
  it('three maps in title order, each registered under its own id', () => {
    expect(MAP_IDS).toEqual(['meadow', 'switchback', 'riverbend']);
    for (const id of MAP_IDS) expect(MAPS[id].id).toBe(id);
    expect(isMapId('riverbend')).toBe(true);
    expect(isMapId('desert')).toBe(false);
    expect(isMapId(undefined)).toBe(false);
  });

  it('the waypoints the coordinator chose, and their lengths', () => {
    const xy = (m: MapDef) => m.path.map((p) => [p.x, p.y]);
    expect(xy(MAPS.meadow)).toEqual([[0, 240], [160, 240], [160, 96], [420, 96], [420, 384], [680, 384], [680, 192], [960, 192]]);
    expect(xy(MAPS.switchback)).toEqual([[0, 96], [560, 96], [560, 192], [320, 192], [320, 288], [560, 288], [560, 384], [960, 384]]);
    expect(xy(MAPS.riverbend)).toEqual([[0, 384], [300, 384], [300, 96], [660, 96], [660, 384], [960, 384]]);
    expect(ALL.map((m) => pathLength(m))).toEqual([1584, 1728, 1536]);
  });

  for (const map of ALL) {
    describe(map.id, () => {
      it('path 1500 to 1800 px, every waypoint inside the 960 x 480 map, axis-aligned segments', () => {
        expect(map.width).toBe(960);
        expect(map.height).toBe(480);
        expect(pathLength(map)).toBeGreaterThanOrEqual(1500);
        expect(pathLength(map)).toBeLessThanOrEqual(1800);
        for (const p of map.path) {
          expect(p.x >= 0 && p.x <= map.width && p.y >= 0 && p.y <= map.height, JSON.stringify(p)).toBe(true);
        }
        for (let i = 1; i < map.path.length; i++) {
          const [a, b] = [map.path[i - 1], map.path[i]];
          expect(a.x === b.x || a.y === b.y, `segment ${i}`).toBe(true);
          expect(a.x !== b.x || a.y !== b.y, `segment ${i} has length`).toBe(true);
        }
      });

      it('spawns on the left edge and exits on the right edge', () => {
        expect(map.path[0].x).toBe(0);
        expect(map.path[map.path.length - 1].x).toBe(map.width);
      });

      it("one landmark, the cottage, at Meadow's offset from the exit, inside the map and off the path strip", () => {
        const exit = map.path[map.path.length - 1];
        expect(map.landmarks).toEqual([cottageFor(exit)]);
        const c = cottageFor(exit);
        expect({ dx: c.x - exit.x, dy: c.y - exit.y, w: c.width, h: c.height }).toEqual({ dx: -52, dy: -61, w: 36, h: 37 });
        expect(c.x >= 0 && c.y >= 0 && c.x + c.width <= map.width && c.y + c.height <= map.height).toBe(true);
        // Nearest path centreline point at least 20 px (half the strip) from the box: sample the centreline every px.
        let nearest = Infinity;
        for (let d = 0; d <= pathLength(map); d++) nearest = Math.min(nearest, distToRect(positionAlongPath(map, d), c));
        expect(nearest).toBeGreaterThan(20);
      });

      it('36 px rule: no buildable cell centre is closer than 36 px to the path centreline', () => {
        const mask = buildableCells(map);
        for (let key = 0; key < GRID_COLS * GRID_ROWS; key++) {
          if (mask[key]) expect(distanceToPath(cellCenter(cellFromKey(key)), map), `cell ${key}`).toBeGreaterThanOrEqual(MIN_PATH_CLEARANCE);
        }
      });
    });
  }

  it('buildable counts: Meadow 344 of 450 (unchanged), Switchback 334, Riverbend 312', () => {
    expect(ALL.map((m) => buildableCells(m).filter(Boolean).length)).toEqual([344, 334, 312]);
  });

  it('only Riverbend has water', () => {
    expect(MAPS.meadow.water).toBeUndefined();
    expect(MAPS.switchback.water).toBeUndefined();
    expect(MAPS.riverbend.water).toEqual([RIVER]);
    expect(RIVER).toEqual({ x: 416, y: 160, width: 128, height: 320 });
  });
});

describe('water (milestone 27): Riverbend river', () => {
  const river: Cell[] = [];
  for (let row = 5; row <= 14; row++) for (let col = 13; col <= 16; col++) river.push({ col, row });
  const inRiver = (c: Cell) => c.col >= 13 && c.col <= 16 && c.row >= 5;
  const dry: MapDef = { ...MAPS.riverbend, id: 'riverbend-dry', water: undefined };

  it('exactly the 40 river cells (columns 13 to 16, rows 5 to 14) are blocked by water', () => {
    expect(river).toHaveLength(40);
    const water: number[] = [];
    for (let key = 0; key < GRID_COLS * GRID_ROWS; key++) if (terrainBlock(cellFromKey(key), MAPS.riverbend) === 'water') water.push(key);
    expect(water).toEqual(river.map(cellKey).sort((a, b) => a - b));
  });

  it('the river never touches the path: without it the same cells are buildable', () => {
    for (const c of river) expect(isBuildableTerrain(c, dry), JSON.stringify(c)).toBe(true);
  });

  it('nothing else changes: every other cell is the same with or without the river', () => {
    const wet = buildableCells(MAPS.riverbend);
    const bare = buildableCells(dry);
    for (let key = 0; key < GRID_COLS * GRID_ROWS; key++) {
      const c = cellFromKey(key);
      expect(wet[key], `cell ${key}`).toBe(inRiver(c) ? false : bare[key]);
      if (!inRiver(c)) expect(terrainBlock(c, MAPS.riverbend)).toBe(terrainBlock(c, dry));
    }
    expect(bare.filter(Boolean).length - wet.filter(Boolean).length).toBe(40);
  });

  it('build and move refuse a river cell with the water reason; the path and the cottage keep not-buildable', () => {
    const s = createGame({ map: 'riverbend' });
    for (const c of river) expect(buildTower(s, c, 'longbow'), JSON.stringify(c)).toEqual({ ok: false, reason: 'water' });
    expect(buildTower(s, { col: 9, row: 2 }, 'longbow')).toEqual({ ok: false, reason: 'not-buildable' }); // top run
    expect(buildTower(s, { col: 28, row: 10 }, 'longbow')).toEqual({ ok: false, reason: 'not-buildable' }); // cottage
    expect(buildTower(s, { col: 30, row: 0 }, 'longbow')).toEqual({ ok: false, reason: 'not-buildable' }); // off the grid
    expect(terrainBlock({ col: 9, row: 2 }, s.map)).toBe('path');
    expect(terrainBlock({ col: 28, row: 10 }, s.map)).toBe('landmark');
    expect(buildTower(s, { col: 12, row: 8 }, 'longbow')).toMatchObject({ ok: true });
    expect(moveTower(s, { col: 12, row: 8 }, { col: 13, row: 8 })).toEqual({ ok: false, reason: 'water' });
    expect(moveTower(s, { col: 12, row: 8 }, { col: 11, row: 8 })).toMatchObject({ ok: true });
    expect(s.events.filter((e) => e.kind === 'build' || e.kind === 'move')).toHaveLength(2);
    expect(s.gold).toBe(createGame({ map: 'riverbend' }).gold - 40);
  });

  it('a cell touching the river edge from outside is buildable: left bank, right bank, above the pool', () => {
    for (const c of [{ col: 12, row: 8 }, { col: 17, row: 8 }, { col: 14, row: 4 }, { col: 12, row: 14 }, { col: 17, row: 14 }]) {
      expect(isBuildableTerrain(c, MAPS.riverbend), JSON.stringify(c)).toBe(true);
    }
  });

  it('water blocks only building: a shot crosses the river, a special lands on it', () => {
    const s = createGame({ map: 'riverbend' });
    // A Mortar on the left bank at (11,8), centre (368, 272), and a Goblin on the top run at (480, 96),
    // 208.6 px away (Mortar range 70 to 220): the line between them passes (416, 196.6), inside the river.
    s.gold = 1000;
    expect(buildTower(s, { col: 11, row: 8 }, 'mortar')).toMatchObject({ ok: true });
    startWave(s);
    tick(s);
    s.enemies[0].distance = 300 + 288 + 180;
    expect(enemyPosition(s.enemies[0], s.map)).toEqual({ x: 480, y: 96 });
    tick(s);
    expect(s.shots.map((shot) => shot.targetId)).toEqual([0]);
    // The Powder Keg (unlocked on wave 1) aimed at the middle of the river is accepted.
    expect(useSpecial(s, 'keg', { x: 480, y: 320 })).toMatchObject({ ok: true, hits: 0 });
  });
});

describe('Switchback: the rows between two lanes (milestone 27)', () => {
  const lanes = (map: MapDef) =>
    map.path.slice(1).map((b, i) => [map.path[i], b] as const).filter(([a, b]) => a.y === b.y);
  const near = (c: Cell) =>
    lanes(MAPS.switchback).filter(([a, b]) => distanceToPath(cellCenter(c), { id: 'lane', width: 960, height: 480, path: [a, b] }) <= 48).length;

  it('row 4, columns 10 to 15, and row 7, columns 11 to 17: every cell is buildable and within 48 px of two lanes', () => {
    const cells = [...[10, 11, 12, 13, 14, 15].map((col) => ({ col, row: 4 })), ...[11, 12, 13, 14, 15, 16, 17].map((col) => ({ col, row: 7 }))];
    for (const c of cells) {
      expect(isBuildableTerrain(c, MAPS.switchback), JSON.stringify(c)).toBe(true);
      expect(near(c), JSON.stringify(c)).toBe(2);
    }
  });

  it('those are all such cells: the turn cells next to them are path, and row 10 has none', () => {
    // Row 4 between the y 96 and y 192 lanes (x 320..560): (16,4) and (17,4) are within 36 px of the x 560 turn.
    // Row 7 between y 192 and y 288 (x 320..560): (10,7) is within 36 px of the x 320 turn.
    for (const c of [{ col: 16, row: 4 }, { col: 17, row: 4 }, { col: 10, row: 7 }]) expect(terrainBlock(c, MAPS.switchback)).toBe('path');
    // Row 10 lies under the y 288 lane (x 320..560) but the y 384 lane starts at x 560: no buildable row 10 cell
    // is within 48 px of two lanes (the waypoints were fixed by the coordinator; see the milestone 27 DEVLOG).
    for (let col = 0; col < GRID_COLS; col++) {
      const c = { col, row: 10 };
      if (isBuildableTerrain(c, MAPS.switchback)) expect(near(c), `col ${col}`).toBeLessThan(2);
    }
  });
});

describe('movement on every map (milestone 27)', () => {
  for (const map of ALL) {
    it(`${map.id}: a Goblin walks spawn to exit in pathLength / speed seconds`, () => {
      const s = createGame({ map });
      s.lives = 1000;
      startWave(s);
      tick(s); // enemy 0 spawns at distance 0
      expect(s.enemies[0].id).toBe(0);
      const speed = ENEMY_STATS.goblin.speed;
      const ticks = (pathLength(map) / speed) * TICKS_PER_SECOND;
      let exitedAfter = -1;
      let lastX = 0;
      let leftward = 0;
      for (let n = 1; n <= ticks + 1 && exitedAfter < 0; n++) {
        tick(s);
        if (s.events.some((e) => e.kind === 'exit' && e.enemyId === 0)) exitedAfter = n;
        else {
          const e0 = s.enemies.find((e) => e.id === 0)!;
          const p = enemyPosition(e0, s.map);
          if (p.x < lastX) leftward += 1;
          lastX = p.x;
          // Always on the path centreline.
          expect(distanceToPath(p, map)).toBeLessThan(1e-9);
        }
      }
      expect(exitedAfter).toBe(ticks);
      // Switchback's y 192 lane runs right to left (240 px at 1 px per tick); the others never do.
      expect(leftward).toBe(map.id === 'switchback' ? 240 : 0);
    });
  }

  it('Switchback leftward lane: 20 px into it the path point is (540, 192), and (320, 192) at its end', () => {
    expect(positionAlongPath(MAPS.switchback, 560 + 96 + 20)).toEqual({ x: 540, y: 192 });
    expect(positionAlongPath(MAPS.switchback, 560 + 96 + 240)).toEqual({ x: 320, y: 192 });
  });
});

// Milestone 27 pinned this final state against main to prove the map
// refactor left Meadow alone. Milestone 28 changed the combo's specials, so
// the fixture is now the milestone 28 game: a whole-state pin of the combo
// build on Meadow, Normal (rewrite it from a dump when a game number moves).
describe('Meadow combo game, whole final state (milestone 27 fixture, rewritten in 28 and 30)', () => {
  it('a full comboBuild game on Normal ends in the fixture state, apart from the map field', () => {
    const { state } = playScripted(comboBuild());
    const { map, ...rest } = state;
    expect(map).toBe(MAPS.meadow);
    expect(rest).toEqual(MEADOW_COMBO_NORMAL);
  });

  it('the trail order and plan for Meadow are the Meadow constants', () => {
    expect(trailCellOrder(MAPS.meadow)).toBe(TRAIL_CELL_ORDER);
    expect(COMBO_PLANS.meadow).toBe(COMBO_PLAN);
    expect(comboBuild().mapId).toBeUndefined();
  });
});

describe('the new maps in headless play (milestone 27)', () => {
  for (const id of ['switchback', 'riverbend'] as const) {
    it(`${id}: comboBuild is deterministic, wins on Normal, and Keep going starts wave 11`, () => {
      const script = comboBuild('normal', id);
      expect(script.mapId).toBe(id);
      expect(script.timed!.flat().every((a) => a.type === 'special')).toBe(true);
      const a = playScripted(script);
      const b = playScripted(comboBuild('normal', id));
      expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
      expect(a.state.map.id).toBe(id);
      expect(a.log.filter((step) => 'result' in step && !step.result.ok)).toEqual([]);
      expect(a.state.phase).toBe('won');
      // Every plan cell is buildable on its map.
      for (const action of COMBO_PLANS[id]) if (action.type === 'build') expect(isBuildableTerrain(action.cell, MAPS[id])).toBe(true);
      const s = a.state;
      expect(continueEndless(s)).toEqual({ ok: true, wave: 10 });
      expect(startWave(s)).toEqual({ ok: true, wave: 11 });
      for (let i = 0; i < 600; i++) tick(s);
      expect(s.phase).toBe('wave');
      expect(s.enemies.length).toBeGreaterThan(0);
    });

    it(`${id}: noTowers loses on Normal and lazyBuild does not win`, () => {
      expect(playScripted(noTowers('normal', id)).state.phase).toBe('lost');
      const lazy = lazyBuild('normal', id);
      expect(lazy.mapId).toBe(id);
      expect(playScripted(lazy).state.phase).toBe('lost');
    });

    it(`${id}: the trail order is that map's, on buildable cells`, () => {
      const order = trailCellOrder(MAPS[id]);
      expect(order.length).toBeGreaterThan(10);
      for (const c of order) expect(isBuildableTerrain(c, MAPS[id])).toBe(true);
      expect(order).not.toEqual(TRAIL_CELL_ORDER);
    });
  }
});
