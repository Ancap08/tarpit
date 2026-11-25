import { describe, expect, it } from 'vitest';
import { createGame, buildTower, ENEMY_STATS, MAP_IDS, MAPS, positionAlongPath, startWave, tick, type EnemyType } from '../../sim';
import { BOB_PX, bobOffset, EventCursor, statusTint, TINT } from './effects';
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
    expect(facingAt(MAPS.meadow, 0, 1)).toBe('right');
    expect(facingAt(MAPS.meadow, 100, 1)).toBe('right');
    expect(facingAt(MAPS.meadow, 160, 1)).toBe('right'); // on the corner: the last tick was still rightward
    expect(facingAt(MAPS.meadow, 161.5, 1)).toBe('up');
    expect(facingAt(MAPS.meadow, 160 + 144 + 10, 1)).toBe('right');
    expect(facingAt(MAPS.meadow, 160 + 144 + 260 + 10, 1)).toBe('down');
  });

  it('every segment of every map (milestone 27): an enemy faces the way that segment runs, at every speed', () => {
    const seen = new Set<string>();
    for (const id of MAP_IDS) {
      const map = MAPS[id];
      let start = 0;
      for (let i = 1; i < map.path.length; i++) {
        const [a, b] = [map.path[i - 1], map.path[i]];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const want = b.x > a.x ? 'right' : b.x < a.x ? 'left' : b.y < a.y ? 'up' : 'down';
        seen.add(want);
        for (const type of Object.keys(ENEMY_STATS) as EnemyType[]) {
          const step = ENEMY_STATS[type].speed / 60;
          // From one full step into the segment to its end (the tick that lands on the next corner still counts).
          for (let d = start + step; d <= start + len; d += step) {
            expect(facingAt(map, d, step), `${id} segment ${i} ${type} at ${d}`).toBe(want);
          }
        }
        start += len;
      }
      // Before moving, an enemy faces the way the path starts: right on every map.
      expect(facingAt(map, 0, 1)).toBe('right');
      expect(positionAlongPath(map, 1).x).toBe(1);
    }
    // Switchback's y 192 lane is the first leftward segment on any map.
    expect([...seen].sort()).toEqual(['down', 'left', 'right', 'up']);
  });

  it('on a leftward segment every sprite shows a left-facing frame: own left frames, or right frames mirrored', () => {
    const facing = facingAt(MAPS.switchback, 560 + 96 + 100, 1);
    expect(facing).toBe('left');
    for (const type of Object.keys(SHEETS) as (keyof typeof SHEETS)[]) {
      const left = SHEETS[type].walk.left;
      const right = SHEETS[type].walk.right;
      // Either distinct left frames (not mirrored) or the right frames mirrored. Never right frames unmirrored.
      const sameFrames = JSON.stringify(left.frames) === JSON.stringify(right.frames);
      expect(sameFrames ? left.flipX && !right.flipX : !left.flipX, type).toBe(true);
    }
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

  it('milestone 22: Harpy (BlueBat) and Shieldbearer (Knight) are four-way 16 x 16 sheets at 2x; only the Harpy is lifted', () => {
    for (const type of ['harpy', 'shieldbearer'] as const) {
      expect(SHEETS[type]).toMatchObject({ key: type, frameWidth: 16, frameHeight: 16, scale: 2, sideOnly: false });
      expect(SHEETS[type].walk.left).toEqual({ frames: [2, 6, 10, 14], flipX: false });
      expect(SHEETS[type].walk.right).toEqual({ frames: [3, 7, 11, 15], flipX: false });
      expect(walkAnimKey(type, 'down')).toBe(`${type}-walk-down`);
    }
    expect(SHEETS.harpy.lift).toBe(16);
    expect(SHEETS.harpy.deadFrame).toBeUndefined();
    expect(SHEETS.shieldbearer.lift ?? 0).toBe(0);
    expect(SHEETS.shieldbearer.deadFrame).toBe(24);
  });
});

describe('boss sheet (milestone 23)', () => {
  it('DemonCyclop: six 50 x 50 front-view frames at 2x and 8 fps, mirrored for left only, lifted 30 px, with a Hit flash frame', () => {
    const boss = SHEETS.boss;
    expect(boss).toMatchObject({ key: 'boss', frameWidth: 50, frameHeight: 50, scale: 2, sideOnly: true, lift: 30, fps: 8 });
    const cycle = [0, 1, 2, 3, 4, 5];
    expect(boss.walk.left).toEqual({ frames: cycle, flipX: true });
    for (const f of ['right', 'up', 'down'] as const) expect(boss.walk[f]).toEqual({ frames: cycle, flipX: false });
    expect(walkAnimKey('boss', 'up')).toBe('boss-walk');
    expect(boss.hitFlash).toMatchObject({ key: 'boss-hit', frameWidth: 50, frameHeight: 50, frame: 0 });
    expect(boss.deadFrame).toBeUndefined();
  });
});

describe('harpy bob', () => {
  it('stays within BOB_PX of the lifted position and is not the same for every id', () => {
    const offsets = Array.from({ length: 60 }, (_, i) => bobOffset(i * 37, 3));
    expect(Math.max(...offsets.map(Math.abs))).toBe(BOB_PX);
    expect(offsets.every(Number.isInteger)).toBe(true);
    expect(bobOffset(0, 0)).not.toBe(bobOffset(0, 1));
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
