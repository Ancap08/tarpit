// Milestone 27: the map travels with the game.
import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { enemyPosition } from './combat';
import { createGame, startWave, tick } from './game';
import { buildableCells, isBuildable } from './grid';
import { DEFAULT_MAP, MAPS, pathLength, resolveMap } from './map';
import type { MapDef } from './types';

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
