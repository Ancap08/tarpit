import { describe, expect, it } from 'vitest';
import { createGame, buildTower, startWave, tick } from '../../sim';
import { EventCursor, statusTint, TINT } from './effects';
import { facingAt, facingOf } from './facing';
import { SHEETS, walkAnimKey } from './sheets';

describe('facing', () => {
  it('follows the dominant axis of movement', () => {
    expect(facingOf(1, 0)).toBe('right');
    expect(facingOf(-1, 0.5)).toBe('left');
    expect(facingOf(0.2, -1)).toBe('up');
    expect(facingOf(0, 1)).toBe('down');
  });

  it('along the path: right from the spawn, up at x 160, right at y 96, down at x 420', () => {
    // Path: (0,240) -> (160,240) -> (160,96) -> (420,96) -> (420,384) ...
    expect(facingAt(0, 1)).toBe('right');
    expect(facingAt(100, 1)).toBe('right');
    expect(facingAt(160, 1)).toBe('right'); // on the corner: the last tick was still rightward
    expect(facingAt(161.5, 1)).toBe('up');
    expect(facingAt(160 + 144 + 10, 1)).toBe('right');
    expect(facingAt(160 + 144 + 260 + 10, 1)).toBe('down');
  });
});

describe('sheets', () => {
  it('four-way sheets walk down one column; the wolf frames face right and are mirrored only for left', () => {
    expect(SHEETS.goblin.walk.up.frames).toEqual([1, 5, 9, 13]);
    expect(SHEETS.troll.walk.right).toEqual({ frames: [3, 7, 11, 15], flipX: false });
    expect(SHEETS.wolf.walk.left).toEqual({ frames: [0, 1], flipX: true });
    expect(SHEETS.wolf.walk.right.flipX).toBe(false);
    expect(walkAnimKey('wolf', 'up')).toBe('wolf-walk');
    expect(walkAnimKey('goblin', 'up')).toBe('goblin-walk-up');
    expect([SHEETS.goblin.scale, SHEETS.wolf.scale, SHEETS.troll.scale]).toEqual([2, 2, 3]);
  });
});

describe('status tint', () => {
  it('none, tar, burn, and burn over tar', () => {
    expect(statusTint(false, false, 1)).toBeNull();
    expect(statusTint(false, true, 1)).toBe(TINT.tar);
    expect(statusTint(true, false, 1)).toBe(TINT.burn);
    expect(statusTint(true, false, 0)).toBe(TINT.none);
    expect(statusTint(true, true, 0)).toBe(TINT.tar);
  });
});

describe('EventCursor', () => {
  it('hands out each event once: action events between ticks, then a new tick list', () => {
    const s = createGame();
    s.gold = 1000;
    const c = new EventCursor();
    expect(c.take(s).events).toEqual([]);
    buildTower(s, { col: 6, row: 7 }, 'musketeer');
    expect(c.take(s)).toEqual({ events: [{ kind: 'build', cell: { col: 6, row: 7 }, tower: 'musketeer' }], newTick: false });
    startWave(s);
    expect(c.take(s).events).toEqual([{ kind: 'waveStart', wave: 1 }]);
    expect(c.take(s).events).toEqual([]);
    tick(s);
    expect(c.take(s)).toEqual({ events: [{ kind: 'spawn', enemyId: 0, enemyType: 'goblin' }], newTick: true });
    tick(s);
    expect(c.take(s)).toEqual({ events: [], newTick: true });
  });
});
