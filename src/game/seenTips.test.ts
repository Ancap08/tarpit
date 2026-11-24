import { describe, expect, it } from 'vitest';
import { LEVELS } from '../sim';
import { levelTips } from './names';
import { SEEN_BROADSIDES_KEY, SEEN_TIPS_KEY, SeenBroadsidesStore, SeenTipsStore } from './seenTips';

describe('campaign tips', () => {
  it.each([false, true])('gives every campaign level one to three short lines (touch=%s)', touch => {
    for (const level of LEVELS) {
      const lines = levelTips(level.id, touch);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.length).toBeLessThanOrEqual(3);
      for (const line of lines) {
        expect(line.trim().length).toBeGreaterThan(0);
        expect(line.length).toBeLessThanOrEqual(61);
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

describe('campaign broadsides', () => {
  it('repairs a corrupt record on the next display and preserves either valid marker', () => {
    const values = new Map([[SEEN_BROADSIDES_KEY, '{']]);
    const storage = () => ({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    const store = new SeenBroadsidesStore(storage);
    expect(store.has('ending')).toBe(false);
    store.mark('opening');
    const next = new SeenBroadsidesStore(storage);
    expect(next.has('opening')).toBe(true);
    values.set(SEEN_BROADSIDES_KEY, '["opening",1,"typo"]');
    expect(next.has('ending')).toBe(false);
    next.mark('ending');
    expect(values.get(SEEN_BROADSIDES_KEY)).toBe('["opening","ending"]');
    expect(values.has(SEEN_TIPS_KEY)).toBe(false);
  });

  it('remembers a displayed broadside through a storage failure', () => {
    const store = new SeenBroadsidesStore(() => { throw new Error('unavailable'); });
    store.mark('ending');
    expect(store.has('ending')).toBe(true);
    expect(store.has('opening')).toBe(false);
  });
});
