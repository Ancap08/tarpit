import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { createGame, ENEMY_STATS, type Enemy, type EnemyType } from '../../sim';
import { COLORS } from '../palette';
import { BOSS_SHADOW, drawHpBars, drawShadows, drawStatusRings, hpColor, SHADOW, spriteLift, statusRings } from './enemies';

describe('hp bar colour', () => {
  it('is green from full down to half, orange below half, red below a quarter', () => {
    expect(hpColor(1)).toBe(COLORS.hpFill);
    expect(hpColor(0.5)).toBe(COLORS.hpFill);
    expect(hpColor(0.49)).toBe(COLORS.hpMid);
    expect(hpColor(0.25)).toBe(COLORS.hpMid);
    expect(hpColor(0.24)).toBe(COLORS.hpLow);
    expect(hpColor(0)).toBe(COLORS.hpLow);
  });
});

describe('status rings', () => {
  it('shows tar, burn, or both with the orange burn ring outside the tar ring', () => {
    expect(statusRings({ slowTicksLeft: 0 })).toEqual([]);
    expect(statusRings({ slowTicksLeft: 0, burnTicksLeft: 0 })).toEqual([]);
    expect(statusRings({ slowTicksLeft: 5 })).toEqual([{ color: COLORS.tarRing, offset: 3 }]);
    expect(statusRings({ slowTicksLeft: 0, burnTicksLeft: 9 })).toEqual([{ color: COLORS.burnRing, offset: 3 }]);
    expect(statusRings({ slowTicksLeft: 5, burnTicksLeft: 9 })).toEqual([
      { color: COLORS.tarRing, offset: 3 },
      { color: COLORS.burnRing, offset: 6 },
    ]);
  });
});

describe('flyers (milestone 22)', () => {
  /** A Graphics stand-in that records what was drawn. */
  function fakeGraphics() {
    const calls: string[] = [];
    const g = {
      lineStyle: () => g,
      fillStyle: (_c: number, a: number) => (calls.push(`fill ${a}`), g),
      strokeCircle: (x: number, y: number, r: number) => (calls.push(`ring ${x},${y},${r}`), g),
      fillEllipse: (x: number, y: number, w: number, h: number) => (calls.push(`ellipse ${x},${y},${w},${h}`), g),
    };
    return { g: g as unknown as Phaser.GameObjects.Graphics, calls };
  }
  const at = (type: EnemyType, distance: number, extra: Partial<Enemy> = {}): Enemy => ({
    id: 0, type, hp: ENEMY_STATS[type].hp, distance, slow: 0, slowTicksLeft: 0, ...extra,
  });

  it('a Harpy gets a two-ellipse ground shadow 3 px below its path position, and tar and burn rings on its body when a special set them (milestone 25b)', () => {
    const s = { ...createGame(), enemies: [at('harpy', 100, { slowTicksLeft: 5, burnTicksLeft: 5 })] };
    const shadow = fakeGraphics();
    drawShadows(shadow.g, s);
    // Path distance 100 is (100,240).
    expect(shadow.calls).toEqual([`fill ${SHADOW.outer.alpha}`, 'ellipse 100,243,24,9', `fill ${SHADOW.inner.alpha}`, 'ellipse 100,243,16,6']);
    const rings = fakeGraphics();
    drawStatusRings(rings.g, s);
    // Drawn 16 px up (its lift): tar ring 14 + 3, burn ring outside it 14 + 6.
    expect(rings.calls).toEqual(['ring 100,224,17', 'ring 100,224,20']);
  });

  it('walkers get no shadow; a Shieldbearer still gets its tar ring', () => {
    const s = { ...createGame(), enemies: [at('shieldbearer', 100, { slowTicksLeft: 5 })] };
    const shadow = fakeGraphics();
    drawShadows(shadow.g, s);
    expect(shadow.calls).toEqual([]);
    const rings = fakeGraphics();
    drawStatusRings(rings.g, s);
    expect(rings.calls).toEqual(['ring 100,240,17']);
  });

  it('the boss (milestone 23) gets a wide ground shadow 4 px below his path position and rings centred on his body 30 px up', () => {
    const s = { ...createGame(), enemies: [at('boss', 100, { slowTicksLeft: 5, burnTicksLeft: 5, hp: 3000 })] };
    const shadow = fakeGraphics();
    drawShadows(shadow.g, s);
    expect(shadow.calls).toEqual([`fill ${BOSS_SHADOW.outer.alpha}`, 'ellipse 100,244,72,20', `fill ${BOSS_SHADOW.inner.alpha}`, 'ellipse 100,244,52,14']);
    const rings = fakeGraphics();
    drawStatusRings(rings.g, s);
    expect(rings.calls).toEqual(['ring 100,210,41', 'ring 100,210,44']);
    expect(spriteLift('boss')).toBe(30);
  });

  it('the boss has no small hp bar (the HUD boss bar shows his hp)', () => {
    const rects = (enemies: Enemy[]) => {
      let n = 0;
      const g = { fillStyle: () => g, fillRect: () => ((n += 1), g) };
      drawHpBars(g as unknown as Phaser.GameObjects.Graphics, { ...createGame(), enemies });
      return n;
    };
    expect(rects([at('goblin', 50, { hp: 10 })])).toBe(2); // border and fill
    expect(rects([at('boss', 100, { hp: 10 })])).toBe(0);
  });

  it("a Harpy's hp bar sits above its lifted sprite", () => {
    expect(spriteLift('harpy')).toBe(16);
    expect(spriteLift('goblin')).toBe(0);
  });
});
