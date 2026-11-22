import { describe, expect, it } from 'vitest';
import { dropsBefore, MAX_VOICES, MIN_REPEAT_LEVEL, Mixer, RECENT_MS, repeatLevel, THIN_MS } from './mixer';

describe('repeatLevel', () => {
  it('is full for a first start and falls as recent starts rise, never under the floor', () => {
    expect(repeatLevel(0)).toBe(1);
    expect(repeatLevel(1)).toBeCloseTo(0.8);
    expect(repeatLevel(4)).toBeCloseTo(0.5);
    for (let n = 1; n < 50; n++) expect(repeatLevel(n)).toBeLessThanOrEqual(repeatLevel(n - 1));
    expect(repeatLevel(1000)).toBe(MIN_REPEAT_LEVEL);
  });
});

describe('thinning', () => {
  it('drops the same sound started again within THIN_MS, keeps it after', () => {
    const m = new Mixer();
    expect(m.request('hit', 0, 20, 0).action).toBe('play');
    expect(m.request('hit', 0, 20, THIN_MS - 1).action).toBe('thin');
    expect(m.request('hit', 0, 20, THIN_MS).action).toBe('play');
  });

  it('does not thin different sounds', () => {
    const m = new Mixer();
    expect(m.request('a', 1, 100, 0).action).toBe('play');
    expect(m.request('b', 1, 100, 0).action).toBe('play');
  });

  it('lowers the level with the recent count and recovers after RECENT_MS', () => {
    const m = new Mixer();
    const levels: number[] = [];
    for (let i = 0; i < 6; i++) {
      const d = m.request('shot', 1, 50, i * THIN_MS);
      if (d.action === 'play') levels.push(d.level);
    }
    expect(levels).toEqual([0, 1, 2, 3, 4, 5].map(repeatLevel));
    const later = m.request('shot', 1, 50, 5 * THIN_MS + RECENT_MS);
    expect(later.action === 'play' && later.level).toBe(1);
  });

  it('is decided in the times given (real ms), whatever the game speed', () => {
    // At 3x three times the shots arrive per real second; the window is the same.
    const m = new Mixer();
    let played = 0;
    for (let t = 0; t < 1000; t += 1000 / 180) if (m.request('shot', 1, 80, t).action === 'play') played += 1;
    expect(played).toBeLessThanOrEqual(Math.ceil(1000 / THIN_MS));
    expect(played).toBeGreaterThan(1000 / THIN_MS / 2);
  });
});

describe('voice cap', () => {
  it('never has more than MAX_VOICES live', () => {
    const m = new Mixer();
    for (let i = 0; i < 100; i++) m.request(`s${i}`, i % 3, 1000, i);
    expect(m.live(100).length).toBe(MAX_VOICES);
  });

  it('a higher priority pushes out the lowest-ranked voice', () => {
    const m = new Mixer(3);
    m.request('tick', 0, 1000, 0);
    m.request('shot', 1, 1000, 1);
    m.request('ui', 3, 1000, 2);
    const d = m.request('boss', 5, 1000, 3);
    expect(d.action).toBe('play');
    expect(d.action === 'play' && d.evict).toBe(1);
    expect(m.live(4).map((v) => v.name).sort()).toEqual(['boss', 'shot', 'ui']);
  });

  it('a lower priority than every live voice is dropped at the cap', () => {
    const m = new Mixer(2);
    m.request('boss', 5, 1000, 0);
    m.request('win', 5, 1000, 1);
    expect(m.request('hit', 0, 20, 2).action).toBe('cap');
  });

  it('at equal priority the quietest, then the oldest, goes first', () => {
    const a = { id: 1, name: 'a', priority: 1, level: 0.5, startMs: 10, endMs: 100 };
    const b = { id: 2, name: 'b', priority: 1, level: 1, startMs: 0, endMs: 100 };
    const c = { id: 3, name: 'c', priority: 1, level: 1, startMs: 5, endMs: 100 };
    expect(dropsBefore(a, b)).toBe(true);
    expect(dropsBefore(b, c)).toBe(true);
    expect(dropsBefore(c, b)).toBe(false);
    expect(dropsBefore({ ...b, priority: 0 }, a)).toBe(true);
  });

  it('voices that ended free their slot', () => {
    const m = new Mixer(1);
    m.request('a', 1, 100, 0);
    expect(m.request('b', 0, 100, 50).action).toBe('cap');
    expect(m.request('b', 0, 100, 100).action).toBe('play');
  });
});
