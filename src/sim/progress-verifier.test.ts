// Verifier (milestone 41, fourth pass): saved progress opens a prefix, never loses stars, survives junk.
import { describe, expect, it } from 'vitest';
import { mergeProgress, parseProgress, serializeProgress, unlockedLevel, type CampaignProgress } from './campaignProgress';

const open = (progress: CampaignProgress, upTo = 12) => Array.from({ length: upTo }, (_, i) => i + 1).filter(id => unlockedLevel(progress, id));

describe('campaign progress, hostile cases', () => {
  it('opens only a prefix when saved wins have gaps, and a later fill opens what the gap hid', () => {
    const gapped = parseProgress(serializeProgress({ 1: 3, 3: 2, 4: 1, 7: 3 }));
    expect(open(gapped)).toEqual([1, 2]);
    expect(open(mergeProgress(gapped, 2, 1))).toEqual([1, 2, 3, 4, 5]);
    expect(open({})).toEqual([1]);
    expect(open({ 2: 3 })).toEqual([1]);
  });

  it('never lowers best stars and ignores invalid stars', () => {
    let progress: CampaignProgress = { 1: 2 };
    for (const stars of [1, 0, -1, 4, NaN, 2.5, Infinity]) progress = mergeProgress(progress, 1, stars);
    expect(progress).toEqual({ 1: 2 });
    expect(mergeProgress(progress, 1, 3)).toEqual({ 1: 3 });
    expect(mergeProgress(progress, 0, 3)).toBe(progress);
    expect(mergeProgress(progress, 1.5, 3)).toBe(progress);
    expect(mergeProgress(progress, -2, 3)).toBe(progress);
  });

  it.each([
    'not json', '', '{', 'null', '[]', '1', '"x"', '{"v":3,"stars":{"1":3}}', '{"v":1}', '{"v":1,"stars":[3]}',
    '{"v":1,"stars":null}', '{"v":1,"stars":{"__proto__":3,"constructor":2,"1":"3","2":0,"3":4,"01":3,"1e0":3,"-1":3,"0":3}}',
  ])('parses %s without throwing and never grants a bogus level', (raw) => {
    const progress = parseProgress(raw);
    for (const [key, stars] of Object.entries(progress)) {
      expect(Number.isSafeInteger(Number(key)) && Number(key) >= 1).toBe(true);
      expect([1, 2, 3]).toContain(stars);
    }
    expect(open(progress, 3)[0]).toBe(1);
    expect(Object.getPrototypeOf(progress)).toBe(Object.prototype);
  });

  it('treats non-string input and non-level ids as empty and locked', () => {
    for (const raw of [undefined, null]) expect(parseProgress(raw)).toEqual({});
    for (const id of [0, -1, 1.5, NaN, Infinity]) expect(unlockedLevel({ 1: 3 }, id)).toBe(false);
  });
});
