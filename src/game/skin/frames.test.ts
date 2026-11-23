import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAPS } from '../../sim';
import { facingAt } from '../anim/facing';
import { LANDSCAPE, PORTRAIT } from '../layout';
import { bearingFrame, footDepth, walkFrame } from './frames';

describe('painted frames', () => {
  it('rounds to the nearest of 16 clockwise headings and wraps in both layouts', () => {
    for (const layout of [LANDSCAPE, PORTRAIT]) {
      for (let i = -32; i <= 32; i++) {
        const angle = (i - 4) * Math.PI / 8;
        const expected = (i + (layout.turned ? 4 : 0) + 32) % 16;
        for (const delta of [-0.49, 0, 0.49]) {
          expect(bearingFrame(angle + delta * Math.PI / 8, layout)).toBe(expected);
        }
      }
    }
  });

  it('walks one four-pose cycle in 24 game pixels, holds its pose at rest and freezes phase zero in tests', () => {
    expect([0, 5.99, 6, 12, 18, 24, 2400].map(d => walkFrame('right', d, false))).toEqual([4, 4, 5, 6, 7, 4, 4]);
    expect(walkFrame('left', 19, true)).toBe(12);
  });

  it('uses the layout to choose the direction row on every Meadow segment', () => {
    const distances = [80, 232, 434, 708, 982, 1208, 1444];
    for (const layout of [LANDSCAPE, PORTRAIT]) {
      const frames = distances.map(d => walkFrame(facingAt(MAPS.meadow, d, 1, layout), d, true));
      expect(frames).toEqual(layout.turned ? [8, 4, 8, 12, 8, 4, 8] : [4, 0, 4, 8, 4, 0, 4]);
    }
  });

  it('sorts scenery, towers and walkers by their ground point in the active layout', () => {
    const a = { x: 120, y: 160 };
    const b = { x: 300, y: 90 };
    expect(footDepth(a, LANDSCAPE)).toBeGreaterThan(footDepth(b, LANDSCAPE));
    expect(footDepth(a, PORTRAIT)).toBeLessThan(footDepth(b, PORTRAIT));
  });
});

const directory = new URL('../../../assets/art-painted/', import.meta.url);
const sheets = readdirSync(directory).filter(file => file.endsWith('.json'));
describe('shipped painted sheets', () => {
  it.each(sheets)('%s has its anchor and every frame inside the paired PNG', (file) => {
    const meta = JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
    const png = readFileSync(new URL(file.replace('.json', '.png'), directory));
    const [width, height] = meta.frameSize;
    const [x, y] = meta.anchor;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(width);
    expect(y).toBeLessThan(height);
    expect(png.readUInt32BE(16)).toBe(width * meta.columns);
    expect(png.readUInt32BE(20)).toBe(height * Math.ceil(meta.frameOrder.length / meta.columns));
    for (const [left, top, right, bottom] of meta.bodyBounds ?? []) {
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(right).toBeGreaterThan(left);
      expect(bottom).toBeGreaterThan(top);
      expect(right).toBeLessThanOrEqual(width);
      expect(bottom).toBeLessThanOrEqual(height);
    }
  });
});
