// Milestone 26 verifier: malformed and hostile stored values for the high
// score, and what a save does to data it did not understand.
import { afterEach, describe, expect, it } from 'vitest';
import { bestFor, HIGH_SCORE_KEY, HighScoreStore, mergeBest, parseBest, serializeBest, type StorageLike } from './highScore';

const wrap = (best: unknown, v: unknown = 1) => JSON.stringify({ v, best });

function memoryStorage(initial?: string): StorageLike & { value: string | null; writes: number } {
  return {
    value: initial ?? null,
    writes: 0,
    getItem() {
      return this.value;
    },
    setItem(_k: string, v: string) {
      this.value = v;
      this.writes += 1;
    },
  };
}

afterEach(() => {
  // No test may leave anything on Object.prototype.
  expect(Object.keys(Object.prototype)).toEqual([]);
  expect(({} as Record<string, unknown>).normal).toBeUndefined();
  expect(({} as Record<string, unknown>).meadow).toBeUndefined();
});

describe('verifier: parseBest never throws and gives a clean table', () => {
  const junk: unknown[] = [
    '',
    ' ',
    'null',
    'undefined',
    'NaN',
    '12',
    '"12"',
    'true',
    '[]',
    '[1,2,3]',
    '{',
    '{"v":1}',
    '{"v":1,"best":null}',
    '{"v":1,"best":[]}',
    '{"v":1,"best":"meadow"}',
    '{"v":"1","best":{"meadow":{"normal":5}}}',
    '{"v":2,"best":{"meadow":{"normal":5}}}',
    '{"best":{"meadow":{"normal":5}}}',
    '{"v":1,"best":{"meadow":[5]}}',
    '{"v":1,"best":{"meadow":null}}',
    '{"v":1,"best":{"meadow":7}}',
    '{"v":1,"best":{"meadow":{"normal":"12"}}}',
    '{"v":1,"best":{"meadow":{"normal":-3}}}',
    '{"v":1,"best":{"meadow":{"normal":0}}}',
    '{"v":1,"best":{"meadow":{"normal":2.5}}}',
    '{"v":1,"best":{"meadow":{"normal":1e400}}}',
    '{"v":1,"best":{"meadow":{"normal":9007199254740993}}}',
    '{"v":1,"best":{"meadow":{"normal":null}}}',
    '{"v":1,"best":{"meadow":{"normal":{"valueOf":1}}}}',
    '{"v":1,"best":{"meadow":{"normal":[12]}}}',
    '{"v":1,"best":{"meadow":{"normal":true}}}',
    '{"v":1,"best":{"meadow":{"insane":12}}}',
    '{"v":1,"best":{"meadow":{"toString":12,"constructor":3,"__proto__":{"normal":99}}}}',
    '{"v":1,"best":{"__proto__":{"normal":99}}}',
    '{"__proto__":{"v":1,"best":{"meadow":{"normal":99}}}}',
    null,
    undefined,
    12 as unknown,
    {} as unknown,
  ];
  it.each(junk.map((j) => [j]))('%j gives an empty table', (raw) => {
    const table = parseBest(raw as string);
    expect(table).toEqual({});
    expect(Object.getPrototypeOf(table)).toBe(Object.prototype);
    expect(bestFor(table, 'meadow', 'normal')).toBeUndefined();
  });

  it('a level inherited through a stored __proto__ is not read as a score', () => {
    const t = parseBest('{"v":1,"best":{"meadow":{"__proto__":{"normal":99},"easy":3}}}');
    expect(t).toEqual({ meadow: { easy: 3 } });
    expect(bestFor(t, 'meadow', 'normal')).toBeUndefined();
  });

  it('constructor, toString and hasOwnProperty as map ids are plain entries and do not break lookups', () => {
    const t = parseBest(wrap({ constructor: { normal: 4 }, toString: { hard: 2 }, hasOwnProperty: { easy: 1 }, meadow: { normal: 12 } }));
    expect(t).toEqual({ constructor: { normal: 4 }, toString: { hard: 2 }, hasOwnProperty: { easy: 1 }, meadow: { normal: 12 } });
    expect(bestFor(t, 'meadow', 'normal')).toBe(12);
    expect(bestFor(t, 'constructor', 'normal')).toBe(4);
    expect(bestFor({}, 'constructor', 'normal')).toBeUndefined();
    expect(bestFor({}, 'toString', 'normal')).toBeUndefined();
    expect(parseBest(serializeBest(t))).toEqual(t);
    expect(mergeBest(t, 'meadow', 'normal', 13).meadow).toEqual({ normal: 13 });
  });

  it('good parts survive next to bad parts', () => {
    const t = parseBest(wrap({ meadow: { easy: 3, normal: '12', hard: -1, extra: 9 }, river: 5, bend: { hard: 2 } }));
    expect(t).toEqual({ meadow: { easy: 3 }, bend: { hard: 2 } });
  });

  it('a 5 MB string, valid or not, parses without throwing', () => {
    const big = 'x'.repeat(5 * 1024 * 1024);
    expect(parseBest(big)).toEqual({});
    expect(parseBest(`{"v":1,"best":{"meadow":{"normal":7}},"pad":"${big}"}`)).toEqual({ meadow: { normal: 7 } });
    expect(parseBest('['.repeat(200_000))).toEqual({}); // deep nesting: JSON.parse throws RangeError or SyntaxError, both caught
  });

  it('the largest safe integer is accepted as a score (nothing caps it); one past it is not', () => {
    expect(parseBest(wrap({ meadow: { normal: Number.MAX_SAFE_INTEGER } }))).toEqual({ meadow: { normal: Number.MAX_SAFE_INTEGER } });
    expect(parseBest(wrap({ meadow: { normal: 2 ** 53 } }))).toEqual({});
  });
});

describe('verifier: merge and the store', () => {
  it('merge keeps the larger and ignores bad scores; the input table is not changed', () => {
    const t = { meadow: { normal: 12 } };
    for (const bad of [11, 12, 0, -1, 2.5, NaN, Infinity, 2 ** 53, '13' as unknown as number]) {
      expect(mergeBest(t, 'meadow', 'normal', bad)).toEqual({ meadow: { normal: 12 } });
    }
    expect(mergeBest(t, 'meadow', 'normal', 13)).toEqual({ meadow: { normal: 13 } });
    expect(mergeBest(t, 'meadow', 'hard', 1)).toEqual({ meadow: { normal: 12, hard: 1 } });
    expect(t).toEqual({ meadow: { normal: 12 } });
  });

  it('mergeBest with the map id __proto__ pollutes nothing global', () => {
    const out = mergeBest({}, '__proto__', 'normal', 5);
    expect(({} as Record<string, unknown>).normal).toBeUndefined();
    expect(Object.keys(out)).toEqual([]);
  });

  it('a save keeps other maps and levels already stored', () => {
    const st = memoryStorage(wrap({ meadow: { easy: 9, normal: 12 }, switchback: { hard: 4 } }));
    const store = new HighScoreStore(() => st);
    expect(store.record('normal', 13)).toBe(true);
    expect(JSON.parse(st.value!)).toEqual({ v: 1, best: { meadow: { easy: 9, normal: 13 }, switchback: { hard: 4 } } });
  });

  it('rule as built: a save drops what parse did not understand (unknown levels, top-level keys, bad entries)', () => {
    const st = memoryStorage(JSON.stringify({ v: 1, best: { meadow: { normal: 3, nightmare: 40 }, broken: 7 }, settings: { muted: true } }));
    const store = new HighScoreStore(() => st);
    store.record('normal', 4);
    expect(JSON.parse(st.value!)).toEqual({ v: 1, best: { meadow: { normal: 4 } } });
  });

  it('rule as built: a stored version 2 reads as empty and the next clear overwrites it', () => {
    const st = memoryStorage(wrap({ meadow: { normal: 30 } }, 2));
    const store = new HighScoreStore(() => st);
    expect(store.best('normal')).toBeUndefined();
    expect(store.record('normal', 1)).toBe(true);
    expect(JSON.parse(st.value!)).toEqual({ v: 1, best: { meadow: { normal: 1 } } });
  });

  it('two tabs on one storage: each save re-reads, so neither loses the other’s best', () => {
    const st = memoryStorage();
    const a = new HighScoreStore(() => st);
    const b = new HighScoreStore(() => st);
    a.record('normal', 5);
    b.record('hard', 2);
    a.record('easy', 7); // tab A's memory has no hard score; the stored one must survive
    b.record('normal', 3); // lower than A's: no write
    expect(JSON.parse(st.value!)).toEqual({ v: 1, best: { meadow: { normal: 5, hard: 2, easy: 7 } } });
    expect(a.best('hard')).toBe(2);
    expect(b.best('normal')).toBe(5);
    expect(st.writes).toBe(3);
  });

  it('storage cleared by another tab: this tab still shows its best, and puts it back on its next new best only', () => {
    const st = memoryStorage();
    const a = new HighScoreStore(() => st);
    a.record('normal', 5);
    st.value = null; // cleared elsewhere
    expect(a.best('normal')).toBe(5);
    expect(a.record('normal', 5)).toBe(false);
    expect(st.value).toBeNull(); // informational: not written back until a higher score
    a.record('normal', 6);
    expect(JSON.parse(st.value!)).toEqual({ v: 1, best: { meadow: { normal: 6 } } });
  });

  it('getItem throws, setItem throws, the getter throws, storage is null: nothing throws and the session best holds', () => {
    const makers: (() => StorageLike | null | undefined)[] = [
      () => ({
        getItem() {
          throw new Error('SecurityError');
        },
        setItem() {},
      }),
      () => ({
        getItem: () => null,
        setItem() {
          throw new Error('QuotaExceededError');
        },
      }),
      () => {
        throw new Error('blocked');
      },
      () => null,
      () => undefined,
      () => ({ getItem: () => 12 as unknown as string, setItem() {} }),
    ];
    for (const get of makers) {
      const store = new HighScoreStore(get);
      expect(store.best('normal')).toBeUndefined();
      expect(store.record('normal', 3)).toBe(true);
      expect(store.record('normal', 2)).toBe(false);
      expect(store.best('normal')).toBe(3);
      expect(store.best('hard')).toBeUndefined();
    }
  });

  it('the key is tarpit.best', () => {
    expect(HIGH_SCORE_KEY).toBe('tarpit.best');
  });
});
