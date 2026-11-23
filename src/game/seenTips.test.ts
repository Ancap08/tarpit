import { describe, expect, it } from 'vitest';
import { LEVELS } from '../sim';
import { LEVEL_TIPS } from './names';
import { SEEN_TIPS_KEY, SeenTipsStore } from './seenTips';

describe('campaign tips', () => {
  it('gives every campaign level one to three short lines', () => {
    expect(Object.keys(LEVEL_TIPS).map(Number)).toEqual(LEVELS.map(level => level.id));
    for (const lines of Object.values(LEVEL_TIPS)) {
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.length).toBeLessThanOrEqual(3);
      for (const line of lines) {
        expect(line.trim().length).toBeGreaterThan(0);
        expect(line.length).toBeLessThanOrEqual(60);
      }
    }
  });

  it('remembers each level across visits and respects a cleared record', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    const first = new SeenTipsStore(() => storage);
    const next = new SeenTipsStore(() => storage);
    first.mark(1);
    expect(next.has(1)).toBe(true);
    expect(next.has(2)).toBe(false);
    next.mark(2);
    expect(first.has(2)).toBe(true);
    expect(first.has(1)).toBe(true);
    expect([...values.keys()]).toEqual([SEEN_TIPS_KEY]);
    values.clear();
    expect(first.has(1)).toBe(false);
  });

  it('ignores malformed storage and keeps valid IDs in mixed records', () => {
    let raw = '{';
    const store = new SeenTipsStore(() => ({ getItem: () => raw, setItem: () => {} }));
    expect(store.has(1)).toBe(false);
    raw = 'null';
    expect(store.has(1)).toBe(false);
    raw = '[1,"2",999]';
    expect(store.has(1)).toBe(true);
    expect(store.has(2)).toBe(false);
    expect(store.has(999)).toBe(false);
  });

  it('remembers acknowledged tips if storage is blocked', () => {
    const store = new SeenTipsStore(() => { throw new Error('blocked'); });
    expect(store.has(1)).toBe(false);
    store.mark(1);
    expect(store.has(1)).toBe(true);
  });
});
