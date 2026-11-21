import { describe, expect, it } from 'vitest';
import { labelAbove, labelText, labelX } from './labels';

describe('tower labels', () => {
  it('names each tower type and marks upgrades with "+"', () => {
    expect(labelText({ type: 'musketeer', upgraded: false })).toBe('Musket');
    expect(labelText({ type: 'cannon', upgraded: false })).toBe('Cannon');
    expect(labelText({ type: 'tarpit', upgraded: false })).toBe('Tar');
    expect(labelText({ type: 'musketeer', upgraded: true })).toBe('Musket+');
    expect(labelText({ type: 'tarpit', upgraded: true })).toBe('Tar+');
  });
});

describe('label placement', () => {
  it('goes below the tower on rows 0 to 13 and above it on row 14, so it never reaches the HUD', () => {
    expect(labelAbove(13 * 32 + 16)).toBe(false); // label 454..470
    expect(labelAbove(14 * 32 + 16)).toBe(true); // below would be 486..502
  });
});

describe('label x', () => {
  it('centres on the tower, shifted inside the map at the edges', () => {
    expect(labelX(240, 50)).toBe(240);
    expect(labelX(16, 50)).toBe(25);
    expect(labelX(944, 30)).toBe(944);
    expect(labelX(944, 60)).toBe(930);
  });
});
