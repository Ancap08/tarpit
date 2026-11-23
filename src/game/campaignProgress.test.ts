import { describe, expect, it } from 'vitest';
import { mergeProgress, parseProgress, serializeProgress, unlockedLevel } from '../sim';
import { CAMPAIGN_PROGRESS_KEY, CampaignProgressStore } from './campaignProgress';

describe('campaign progress', () => {
  it('unlocks the next level on a win and retains only the best stars', () => {
    const empty = parseProgress(null);
    expect(unlockedLevel(empty, 1)).toBe(true);
    expect(unlockedLevel(empty, 2)).toBe(false);
    const progress = mergeProgress(empty, 1, 2);
    expect(unlockedLevel(progress, 2)).toBe(true);
    expect(unlockedLevel(progress, 3)).toBe(false);
    expect(empty).toEqual({});
    expect(mergeProgress(progress, 1, 1)).toEqual({ 1: 2 });
    expect(mergeProgress(progress, 2, 0)).toEqual({ 1: 2, 2: 0 });
    expect(mergeProgress(progress, 1, 3)).toEqual({ 1: 3 });
    expect(parseProgress(serializeProgress(progress))).toEqual(progress);
  });

  it('round-trips a zero-star win, opens only a prefix and keeps a later honest award', () => {
    const won = mergeProgress({}, 1, 0);
    const saved = parseProgress(serializeProgress({ ...won, 3: 0 }));
    expect(saved).toEqual({ 1: 0, 3: 0 });
    expect([1, 2, 3, 4].map(id => unlockedLevel(saved, id))).toEqual([true, true, false, false]);
    expect(unlockedLevel(mergeProgress(saved, 2, 0), 4)).toBe(true);
    const replay = mergeProgress(saved, 1, 3);
    expect(replay[1]).toBe(3);
    expect(mergeProgress(replay, 1, 0)).toBe(replay);
  });

  it('ignores corrupt records, unreadable JSON and unknown versions', () => {
    expect(parseProgress('oops')).toEqual({});
    expect(parseProgress('{"v":3,"stars":{"1":3}}')).toEqual({});
    expect(parseProgress('{"v":1,"stars":[1,2,3]}')).toEqual({});
    expect(parseProgress('{"v":1,"stars":{"01":3,"1":2,"0":3,"2":"3","3":4,"4":0,"5":1.5,"__proto__":3}}'))
      .toEqual({ 1: 2 });
  });

  it('reads durable stars on reload and merges another writer’s bests', () => {
    let value: string | null = null;
    const storage = {
      getItem: (key: string) => {
        expect(key).toBe(CAMPAIGN_PROGRESS_KEY);
        return value;
      },
      setItem: (key: string, next: string) => {
        expect(key).toBe(CAMPAIGN_PROGRESS_KEY);
        value = next;
      },
    };
    const store = new CampaignProgressStore(() => storage);
    expect(store.record(1, 2)).toBe(true);
    const reload = new CampaignProgressStore(() => storage);
    expect(reload.table()).toEqual({ 1: 2 });
    reload.record(1, 3);
    store.record(2, 1);
    expect(reload.table()).toEqual({ 1: 3, 2: 1 });
    expect(store.record(1, 1)).toBe(false);
  });

  it('keeps the best stars for the page when storage is blocked', () => {
    const inaccessible = new CampaignProgressStore(() => { throw Error('storage blocked'); });
    expect(inaccessible.record(1, 1)).toBe(true);
    expect(inaccessible.record(1, 2)).toBe(true);
    expect(inaccessible.record(1, 1)).toBe(false);
    expect(inaccessible.table()).toEqual({ 1: 2 });
  });
});

it('replaces both in-memory and saved stars when setting up a test screen', () => {
  let saved: string | null = null;
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => { saved = value; },
  };
  const store = new CampaignProgressStore(() => storage);
  store.record(1, 3);
  store.replaceForTest({ 1: 1, 2: 2 });
  expect(store.table()).toEqual({ 1: 1, 2: 2 });
  store.replaceForTest({});
  expect(store.table()).toEqual({});
  expect(new CampaignProgressStore(() => storage).table()).toEqual({});
});
