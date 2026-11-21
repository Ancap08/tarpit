import { describe, expect, it } from 'vitest';
import { labelText } from './labels';

describe('tower labels', () => {
  it('names each tower type and marks upgrades with "+"', () => {
    expect(labelText({ type: 'musketeer', upgraded: false })).toBe('Musket');
    expect(labelText({ type: 'cannon', upgraded: false })).toBe('Cannon');
    expect(labelText({ type: 'tarpit', upgraded: false })).toBe('Tar');
    expect(labelText({ type: 'musketeer', upgraded: true })).toBe('Musket+');
    expect(labelText({ type: 'tarpit', upgraded: true })).toBe('Tar+');
  });
});
