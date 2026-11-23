import { describe, expect, it } from 'vitest';
import { BOONS, boonOptions, type Rect } from '../../sim';
import { LANDSCAPE, PORTRAIT } from '../layout';
import { BOON_NAMES, boonDescription, heldBoonsText, MONO_ADVANCE, rewardTitle } from '../names';
import { heldBoonLayout, rewardLayout } from './boonLayout';

const inside = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

function lineCount(text: string, font: number, width: number): number {
  const capacity = Math.floor(width / (font * MONO_ADVANCE));
  let lines = 1;
  let used = 0;
  for (const word of text.split(' ')) {
    if (used > 0 && used + word.length + 1 > capacity) {
      lines += 1;
      used = word.length;
    } else used += used === 0 ? word.length : word.length + 1;
  }
  return lines;
}

describe('boon UI', () => {
  it.each([LANDSCAPE, PORTRAIT])('fits three independent cards and their live effect text in $kind', (layout) => {
    const geo = rewardLayout(layout);
    expect(geo.cards).toHaveLength(3);
    for (const [i, card] of geo.cards.entries()) {
      expect(inside(layout.map, card)).toBe(true);
      const scale = layout.kind === 'portrait' ? 664 / PORTRAIT.height : 1;
      expect(Math.min(card.width, card.height) * scale).toBeGreaterThanOrEqual(44);
      if (i === 0) continue;
      const previous = geo.cards[i - 1];
      if (layout.kind === 'portrait') expect(card.y).toBeGreaterThan(previous.y + previous.height);
      else expect(card.x).toBeGreaterThan(previous.x + previous.width);
    }
    for (const { id } of Object.values(BOONS)) {
      expect(BOON_NAMES[id].length * geo.name.font * MONO_ADVANCE).toBeLessThan(geo.textWidth);
      expect(geo.description.font).toBeGreaterThanOrEqual(18);
      expect(lineCount(boonDescription(id), geo.description.font, geo.textWidth)).toBeLessThanOrEqual(2);
    }
  });

  it.each([
    [LANDSCAPE, 960, 580], [LANDSCAPE, 1024, 768], [LANDSCAPE, 844, 390],
    [PORTRAIT, 390, 844], [PORTRAIT, 390, 763], [PORTRAIT, 390, 664],
  ] as const)('fits three separate 44 CSS px reward targets and a tooltip at %s %ix%i', (layout, width, height) => {
    const geo = heldBoonLayout(layout, { width, height });
    const scale = Math.min(width / geo.canvasWidth, height / layout.height);
    const inRow = geo.canvasWidth === layout.width;
    expect(geo.slots).toHaveLength(3);
    for (const [i, slot] of geo.slots.entries()) {
      expect(inside({ x: 0, y: 0, width: geo.canvasWidth, height: layout.height }, slot)).toBe(true);
      expect(Math.min(slot.width, slot.height) * scale).toBeGreaterThanOrEqual(44);
      if (inRow) {
        expect(slot.y).toBeGreaterThan(layout.map.height);
        expect(slot.x + slot.width).toBeLessThan(904); // mute
        if (i > 0) expect(slot.x).toBeGreaterThan(geo.slots[i - 1].x + geo.slots[i - 1].width);
      } else {
        expect(slot.x).toBeGreaterThan(layout.width); // clear of the map and every control
        if (i > 0) expect(slot.y).toBeGreaterThan(geo.slots[i - 1].y + geo.slots[i - 1].height);
      }
    }
    expect(inside(layout.map, geo.tooltip)).toBe(true);
    for (const { id } of Object.values(BOONS)) {
      expect(lineCount(boonDescription(id), geo.descriptionFont, geo.tooltip.width - 28)).toBeLessThanOrEqual(2);
    }
  });

  it('describes all nine effects in player language', () => {
    expect(Object.values(BOONS).map(({ id }) => boonDescription(id))).toEqual([
      'Cannons and Mortars reach 30% farther',
      'Longbows hit 25% harder',
      '100 gold right now',
      'Tar slows enemies twice as long',
      'Fire burns 80% hotter',
      'Specials come back 38% sooner',
      '3 more lives',
      'Every tower fires 10% faster',
      'Explosions are 40% bigger',
    ]);
  });

  it('shows the cleared wave and the names of chosen rewards', () => {
    expect(heldBoonsText([])).toBe('');
    expect(heldBoonsText(boonOptions(5))).toBe('Rewards: Long Barrels · Keen Arrows · War Chest');
    expect(rewardTitle(15)).toContain('15');
  });
});
