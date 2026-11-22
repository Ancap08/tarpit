import { describe, expect, it } from 'vitest';
import { bestFor, HIGH_SCORE_KEY, HighScoreStore, mergeBest, parseBest, serializeBest, type StorageLike } from './highScore';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('parseBest (milestone 26)', () => {
  it('reads the stored shape', () => {
    expect(parseBest('{"v":1,"best":{"meadow":{"easy":12,"normal":10}}}')).toEqual({ meadow: { easy: 12, normal: 10 } });
  });

  it('keeps other map ids for later maps', () => {
    expect(parseBest('{"v":1,"best":{"meadow":{"hard":3},"switchback":{"normal":7}}}')).toEqual({ meadow: { hard: 3 }, switchback: { normal: 7 } });
  });

  it.each([null, undefined, '', 'not json', '{', '[]', '"x"', '12', 'null', '{"best":{"meadow":{"normal":4}}}', '{"v":2,"best":{"meadow":{"normal":4}}}', '{"v":1}', '{"v":1,"best":[]}', '{"v":1,"best":"x"}'])(
    'malformed %j gives an empty table',
    (raw) => {
      expect(parseBest(raw)).toEqual({});
    },
  );

  it('drops the bad parts and keeps the good ones', () => {
    const raw = JSON.stringify({
      v: 1,
      extra: true,
      best: {
        meadow: { easy: -3, normal: 4.5, hard: 7, nightmare: 99, junk: 'x' },
        river: { normal: '12' },
        bad: 5,
        list: [1, 2],
        nul: null,
        zero: { easy: 0, normal: 2 },
        huge: { easy: 1e300, normal: Number.MAX_SAFE_INTEGER },
      },
    });
    expect(parseBest(raw)).toEqual({ meadow: { hard: 7 }, zero: { normal: 2 }, huge: { normal: Number.MAX_SAFE_INTEGER } });
  });

  it('ignores a __proto__ map id', () => {
    const t = parseBest('{"v":1,"best":{"__proto__":{"normal":3}}}');
    expect(Object.getPrototypeOf(t)).toBe(Object.prototype);
    expect(bestFor(t, '__proto__', 'normal')).toBeUndefined();
  });
});

describe('mergeBest and serializeBest (milestone 26)', () => {
  it('keeps the larger score and copies the table', () => {
    const t = { meadow: { normal: 10 } };
    expect(mergeBest(t, 'meadow', 'normal', 12)).toEqual({ meadow: { normal: 12 } });
    expect(mergeBest(t, 'meadow', 'normal', 8)).toEqual({ meadow: { normal: 10 } });
    expect(mergeBest(t, 'meadow', 'easy', 3)).toEqual({ meadow: { normal: 10, easy: 3 } });
    expect(mergeBest(t, 'other', 'hard', 1)).toEqual({ meadow: { normal: 10 }, other: { hard: 1 } });
    expect(t).toEqual({ meadow: { normal: 10 } });
  });

  it('ignores scores that are not whole numbers of at least 1', () => {
    for (const bad of [0, -1, 2.5, Number.NaN, Infinity]) expect(mergeBest({}, 'meadow', 'normal', bad)).toEqual({});
  });

  it('serializes to the stored shape and round-trips', () => {
    const t = { meadow: { easy: 12, normal: 10 } };
    expect(serializeBest(t)).toBe('{"v":1,"best":{"meadow":{"easy":12,"normal":10}}}');
    expect(parseBest(serializeBest(t))).toEqual(t);
  });

  it('bestFor reads one entry', () => {
    const t = { meadow: { easy: 12 } };
    expect(bestFor(t, 'meadow', 'easy')).toBe(12);
    expect(bestFor(t, 'meadow', 'hard')).toBeUndefined();
    expect(bestFor(t, 'river', 'easy')).toBeUndefined();
  });
});

describe('HighScoreStore (milestone 26)', () => {
  it('records a new best under tarpit.best, keyed by map then level', () => {
    const storage = new MemoryStorage();
    const store = new HighScoreStore(() => storage);
    expect(store.best('normal')).toBeUndefined();
    expect(store.record('normal', 6)).toBe(true);
    expect(store.record('normal', 4)).toBe(false);
    expect(store.record('normal', 6)).toBe(false);
    expect(store.record('normal', 11)).toBe(true);
    expect(store.best('normal')).toBe(11);
    expect(store.best('easy')).toBeUndefined();
    expect(HIGH_SCORE_KEY).toBe('tarpit.best');
    expect(storage.getItem('tarpit.best')).toBe('{"v":1,"best":{"meadow":{"normal":11}}}');
  });

  it('a new store reads what an earlier one wrote (a page reload)', () => {
    const storage = new MemoryStorage();
    new HighScoreStore(() => storage).record('hard', 3);
    expect(new HighScoreStore(() => storage).best('hard')).toBe(3);
  });

  it('a malformed stored value reads as no score and is replaced by the next best', () => {
    const storage = new MemoryStorage();
    storage.setItem('tarpit.best', '{oops');
    const store = new HighScoreStore(() => storage);
    expect(store.best('normal')).toBeUndefined();
    expect(store.record('normal', 2)).toBe(true);
    expect(storage.getItem('tarpit.best')).toBe('{"v":1,"best":{"meadow":{"normal":2}}}');
  });

  it('keeps other maps and levels when it writes', () => {
    const storage = new MemoryStorage();
    storage.setItem('tarpit.best', '{"v":1,"best":{"river":{"easy":9},"meadow":{"hard":2}}}');
    new HighScoreStore(() => storage).record('normal', 5);
    expect(parseBest(storage.getItem('tarpit.best'))).toEqual({ river: { easy: 9 }, meadow: { hard: 2, normal: 5 } });
  });

  it('never throws when storage is unavailable, and keeps the best in memory', () => {
    const throwing = new HighScoreStore(() => {
      throw new Error('SecurityError');
    });
    expect(throwing.best('normal')).toBeUndefined();
    expect(throwing.record('normal', 4)).toBe(true);
    expect(throwing.best('normal')).toBe(4);

    const none = new HighScoreStore(() => undefined);
    expect(none.record('easy', 2)).toBe(true);
    expect(none.best('easy')).toBe(2);
  });

  it('a full quota (setItem throws) keeps the best in memory', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const store = new HighScoreStore(() => storage);
    expect(store.record('hard', 7)).toBe(true);
    expect(store.best('hard')).toBe(7);
    expect(store.record('hard', 5)).toBe(false);
  });
});
