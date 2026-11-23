import { describe, expect, it } from 'vitest';
import { measurePathEncounters } from './pathEncounter';

const measured = Object.fromEntries(measurePathEncounters().map((row) => [row.tower, row]));

describe('P3: the two branches favor different encounters', () => {
  it('Sharpshooter reaches the lone Troll, Volley clears the Goblins faster', () => {
    const result = measured.musketeer;
    expect(result.lone).toEqual([45, 0]); // One Sharpshooter shot; Volley is out of range.
    // A fires ticks 1,61,121,181,241. B fires every 21 ticks: 13 shots, two per Goblin.
    expect(result.pack).toEqual([5, 6]);
    expect(result.ok).toBe(true);
  });

  it('Quick Loader does more to one Troll, Heavy Shot catches the spaced Goblins', () => {
    const result = measured.cannon;
    expect(result.lone).toEqual([2 * 40, 3 * 40]); // B fires at ticks 1,61,121.
    // First target is at 100 px. Nine 8 px gaps span 72 px; only seven fit within 55.
    expect(result.pack).toEqual([10, 7]);
    expect(result.ok).toBe(true);
  });

  it('Deep Tar slows the lone Troll more, Wide Tar reaches outlying Goblins', () => {
    const result = measured.tarpit;
    expect(result.lone).toEqual([0.78, 0.64]);
    // All ten are beyond 105 px, inside 145 px. Wide Tar slows the front Goblin.
    expect(result.pack).toEqual([0, 1]);
    expect(result.ok).toBe(true);
  });

  it('War Bow lands a heavier hit on the lone Troll, Quick Draw clears the Goblins faster', () => {
    const result = measured.longbow;
    expect(result.lone).toEqual([16, 9]); // One shot each.
    // Five War Bow shots (two per Goblin) vs nine Quick Draw shots (three per Goblin).
    expect(result.pack).toEqual([2, 3]);
    expect(result.ok).toBe(true);
  });

  it('Siege Shell hits a lone Troll harder, Wide Burst catches the spaced Goblins', () => {
    const result = measured.mortar;
    expect(result.lone).toEqual([140, 80]); // One shot each.
    // Nine 14 px gaps span 126 px; a 70 px radius hits only the front six.
    expect(result.pack).toEqual([6, 10]);
    expect(result.ok).toBe(true);
  });

  it('Inferno deals more damage to a Troll held in range, Lasting Flames finishes passing Goblins', () => {
    const result = measured.firepot;
    // Both land three impacts and burn for 149 ticks; Inferno does 17 burn damage/s, Lasting Flames does 8.
    expect(result.lone[0]).toBeCloseTo(12 + 149 * 17 / 60);
    expect(result.lone[1]).toBeCloseTo(12 + 149 * 8 / 60);
    // Both firing windows are narrower than 60 px. Goblins spaced 90 px apart take one hit each.
    // Inferno leaves 23-4-17=2 HP. Lasting Flames has 8 s to deal the remaining 19 HP.
    expect(result.pack).toEqual([0, 10]);
    expect(result.ok).toBe(true);
  });
});
