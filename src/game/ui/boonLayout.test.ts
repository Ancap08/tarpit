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
      expect(lineCount(boonDescription(id), geo.description.font, geo.textWidth)).toBe(1);
    }
  });

  it.each([LANDSCAPE, PORTRAIT])('fits the icons in the $kind HUD and the tooltip beside them', (layout) => {
    const geo = heldBoonLayout(layout);
    expect(geo.slots).toHaveLength(3);
    for (const slot of geo.slots) {
      expect(inside({ x: 0, y: 0, width: layout.width, height: layout.height }, slot)).toBe(true);
      if (layout.kind === 'portrait') expect(slot.y + slot.height).toBeLessThan(layout.map.y);
      else expect(slot.y).toBeGreaterThan(layout.map.y + layout.map.height);
    }
    expect(inside(layout.map, geo.tooltip)).toBe(true);
    for (const { id } of Object.values(BOONS)) {
      expect(lineCount(boonDescription(id), geo.descriptionFont, geo.tooltip.width - 28)).toBeLessThanOrEqual(2);
    }
  });

  it('derives shown gains and grants from the simulation definitions', () => {
    for (const { id, value } of Object.values(BOONS)) {
      const amount = id === 'warChest' || id === 'stoneWalls' ? value : Math.round(Math.abs(value - 1) * 100);
      expect(boonDescription(id)).toContain(String(amount));
    }
    expect(heldBoonsText([])).toBe('');
    expect(heldBoonsText(boonOptions(5))).toBe('Boons: Long Barrels · Keen Arrows · War Chest');
    expect(rewardTitle(15)).toContain('15');
  });
});
