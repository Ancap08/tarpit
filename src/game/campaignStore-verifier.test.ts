// Verifier tests for the campaign progress store (milestone 41a).
import { describe, expect, it } from 'vitest';
import { unlockedLevel } from '../sim';
import { CampaignProgressStore } from './campaignProgress';
import type { StorageLike } from './highScore';

describe('verifier: campaign progress store', () => {
  function storage(over: Partial<StorageLike> = {}): StorageLike & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v),
      ...over,
    } as StorageLike & { data: Map<string, string> };
  }

  it('store keeps best, records zero-star wins, survives throwing getStorage, getItem and setItem', () => {
    const ok = storage();
    const store = new CampaignProgressStore(() => ok);
    expect(store.record(1, 2)).toBe(true);
    expect(store.record(1, 1)).toBe(false);
    expect(store.record(1, 0)).toBe(false);
    expect(store.record(1, 3)).toBe(true);
    expect(new CampaignProgressStore(() => ok).table()).toEqual({ 1: 3 });

    const boom = () => { throw new Error('denied'); };
    const throwing: [string, () => StorageLike | undefined][] = [
      ['getStorage throws', boom],
      ['getItem throws', () => storage({ getItem: boom })],
      ['setItem throws', () => storage({ setItem: boom })],
      ['no storage', () => undefined],
    ];
    for (const [, get] of throwing) {
      const s = new CampaignProgressStore(get);
      expect(() => s.table()).not.toThrow();
      expect(s.record(1, 2)).toBe(true);
      expect(s.table()).toEqual({ 1: 2 });
      expect(s.record(1, 3)).toBe(true);
      expect(s.table()).toEqual({ 1: 3 });
      expect(s.record(2, 0)).toBe(true);
      expect(unlockedLevel(s.table(), 3)).toBe(true);
      expect(unlockedLevel(s.table(), 2)).toBe(true);
    }
    const garbage = storage();
    garbage.data.set('tarpit.campaign', '{"v":1,"stars":{"__proto__":{"1":3}}}');
    expect(new CampaignProgressStore(() => garbage).table()).toEqual({});
  });
});
