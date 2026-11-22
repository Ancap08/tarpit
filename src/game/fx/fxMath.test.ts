import { describe, expect, it } from 'vitest';
import type { TowerType } from '../../sim';
import {
  arcHeight,
  arcPosition,
  BANNER_CUT_MS,
  BANNER_FADE_MS,
  BANNER_MS,
  BannerQueue,
  CAPS,
  darkenAlpha,
  DARKEN_ALPHA,
  DARKEN_MS,
  deathPuff,
  GOLD_GROUP_MS,
  GOLD_GROUP_PX,
  GOLD_LIFE_MS,
  GoldGroups,
  goldLabelLook,
  KNOCK_MS,
  knockShare,
  livesShake,
  popScale,
  POP_MS,
  RECOIL_MS,
  RECOIL_PX,
  recoilOffset,
  SlotPool,
  TRAVEL_MS,
  TURN_RATE,
  turnStep,
  wrapAngle,
} from './fxMath';

const banner = (text: string) => ({ text, sub: '', big: false });

describe('travel times and arcs', () => {
  it('every tower takes 0.1 to 0.4 s and the mortar is the slowest', () => {
    for (const t of Object.keys(TRAVEL_MS) as TowerType[]) {
      expect(TRAVEL_MS[t]).toBeGreaterThanOrEqual(100);
      expect(TRAVEL_MS[t]).toBeLessThanOrEqual(400);
      expect(TRAVEL_MS[t]).toBeLessThanOrEqual(TRAVEL_MS.mortar);
    }
  });

  it('the musket and fire fly straight, the cannon arcs low and the mortar high', () => {
    expect(arcHeight('musketeer', 200)).toBe(0);
    expect(arcHeight('firepot', 200)).toBe(0);
    expect(arcHeight('cannon', 100)).toBe(15);
    expect(arcHeight('cannon', 1000)).toBe(22);
    expect(arcHeight('mortar', 20)).toBe(40);
    expect(arcHeight('mortar', 1000)).toBe(90);
    expect(arcHeight('mortar', 150)).toBeGreaterThan(arcHeight('cannon', 150) * 2);
  });

  it('starts at the muzzle, ends at the recorded point and peaks at the middle', () => {
    const from = { x: 10, y: 100 };
    const to = { x: 110, y: 100 };
    expect(arcPosition(from, to, 0, 40)).toMatchObject({ x: 10, y: 100 });
    expect(arcPosition(from, to, 1, 40)).toMatchObject({ x: 110, y: 100 });
    const mid = arcPosition(from, to, 0.5, 40);
    expect(mid).toMatchObject({ x: 60, y: 60, groundX: 60, groundY: 100 });
    // Heading up at the start, level at the top, down at the end.
    expect(arcPosition(from, to, 0, 40).angle).toBeLessThan(0);
    expect(mid.angle).toBeCloseTo(0, 10);
    expect(arcPosition(from, to, 1, 40).angle).toBeGreaterThan(0);
    // t is clamped: a late frame draws it at the target.
    expect(arcPosition(from, to, 1.7, 40)).toMatchObject({ x: 110, y: 100 });
  });

  it('a straight shot has no lift', () => {
    const p = arcPosition({ x: 0, y: 0 }, { x: 30, y: 40 }, 0.25, 0);
    expect(p).toMatchObject({ x: 7.5, y: 10, groundX: 7.5, groundY: 10 });
    expect(p.angle).toBeCloseTo(Math.atan2(40, 30), 10);
  });
});

describe('turning', () => {
  it('wraps angles into (-PI, PI]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(0.5)).toBe(0.5);
  });

  it('turns by at most the step, then lands exactly on the target', () => {
    expect(turnStep(0, 1, 0.25)).toBeCloseTo(0.25, 12);
    expect(turnStep(0, -1, 0.25)).toBeCloseTo(-0.25, 12);
    expect(turnStep(0.9, 1, 0.25)).toBe(1);
  });

  it('turns the short way across the PI seam', () => {
    const a = turnStep(3.0, -3.0, 0.1);
    expect(a).toBeCloseTo(3.1, 12);
    expect(turnStep(a, -3.0, 0.2)).toBeCloseTo(-3.0, 12);
  });

  it('a half turn at TURN_RATE takes several frames at 60 fps', () => {
    const perFrame = TURN_RATE / 60;
    let a = 0;
    let frames = 0;
    while (a !== wrapAngle(Math.PI) && frames < 100) {
      a = turnStep(a, Math.PI, perFrame);
      frames++;
    }
    expect(frames).toBeGreaterThanOrEqual(15);
    expect(frames).toBeLessThanOrEqual(25);
  });
});

describe('recoil, pops and knocks', () => {
  it('kicks out fast and settles back by RECOIL_MS', () => {
    const k = RECOIL_PX.cannon;
    expect(recoilOffset(-1, k)).toBe(0);
    expect(recoilOffset(0, k)).toBe(0);
    expect(recoilOffset(30, k)).toBe(k);
    expect(recoilOffset(80, k)).toBeGreaterThan(0);
    expect(recoilOffset(80, k)).toBeLessThan(k);
    expect(recoilOffset(RECOIL_MS, k)).toBe(0);
    expect(recoilOffset(30, RECOIL_PX.firepot)).toBe(0);
  });

  it('a build pop grows past full size and settles at 1; a sell shrinks to 0', () => {
    expect(popScale('build', 0)).toBe(0.5);
    expect(popScale('build', 0.4 * POP_MS.build)).toBeCloseTo(1.15, 10);
    for (let ms = 0; ms < POP_MS.build; ms += 5) expect(popScale('build', ms)).toBeLessThanOrEqual(1.15 + 1e-9);
    expect(popScale('build', POP_MS.build)).toBe(1);
    expect(popScale('upgrade', POP_MS.upgrade / 2)).toBeCloseTo(1.2, 10);
    expect(popScale('upgrade', POP_MS.upgrade)).toBe(1);
    expect(popScale('sell', POP_MS.sell / 6)).toBeCloseTo(1.15, 10);
    expect(popScale('sell', POP_MS.sell - 1)).toBeLessThan(0.05);
    expect(popScale('sell', POP_MS.sell)).toBe(0);
  });

  it('a knock fades to nothing over KNOCK_MS', () => {
    expect(knockShare(0)).toBe(1);
    expect(knockShare(KNOCK_MS / 2)).toBe(0.5);
    expect(knockShare(KNOCK_MS)).toBe(0);
  });

  it('death puffs grow with the enemy', () => {
    expect(deathPuff('goblin').count).toBeLessThan(deathPuff('troll').count);
    expect(deathPuff('troll').count).toBeLessThan(deathPuff('boss').count);
    expect(deathPuff('troll').scale).toBeLessThan(deathPuff('boss').scale);
  });
});

describe('SlotPool', () => {
  it('hands out free slots, then recycles the oldest at the cap', () => {
    const pool = new SlotPool(3);
    expect([pool.acquire(), pool.acquire(), pool.acquire()].map((a) => a.slot)).toEqual([0, 1, 2]);
    expect(pool.count).toBe(3);
    expect(pool.acquire()).toEqual({ slot: 0, recycled: true });
    expect(pool.acquire()).toEqual({ slot: 1, recycled: true });
    expect(pool.count).toBe(3);
    pool.release(2);
    expect(pool.count).toBe(2);
    expect(pool.acquire()).toEqual({ slot: 2, recycled: false });
  });

  it('never holds more than its cap under a flood', () => {
    const pool = new SlotPool(CAPS.projectiles);
    for (let i = 0; i < 1000; i++) pool.acquire();
    expect(pool.count).toBe(CAPS.projectiles);
    pool.release(5);
    pool.release(5);
    expect(pool.count).toBe(CAPS.projectiles - 1);
  });
});

describe('GoldGroups', () => {
  it('groups kills close in space and time into one label', () => {
    const g = new GoldGroups();
    const a = g.add(100, 100, 2, 0);
    const b = g.add(100 + GOLD_GROUP_PX - 1, 100, 2, GOLD_GROUP_MS - 1);
    expect(b).toEqual({ slot: a.slot, merged: true });
    expect(g.labels[a.slot]?.amount).toBe(4);
    expect(g.count).toBe(1);
  });

  it('starts a new label when the kill is too far away or too late', () => {
    const g = new GoldGroups();
    g.add(100, 100, 2, 0);
    expect(g.add(100 + GOLD_GROUP_PX + 1, 100, 2, 10).merged).toBe(false);
    expect(g.add(100, 100, 2, GOLD_GROUP_MS + 1).merged).toBe(false);
    expect(g.count).toBe(3);
  });

  it('a horde stays readable: never more labels than the cap', () => {
    const g = new GoldGroups();
    for (let i = 0; i < 200; i++) g.add((i * 97) % 900, (i * 53) % 450, 2, i * 5);
    expect(g.count).toBeLessThanOrEqual(CAPS.goldLabels);
  });

  it('labels expire GOLD_LIFE_MS after their last kill', () => {
    const g = new GoldGroups();
    const { slot } = g.add(0, 0, 2, 0);
    g.add(0, 0, 2, 200);
    expect(g.expire(GOLD_LIFE_MS)).toEqual([]);
    expect(g.expire(200 + GOLD_LIFE_MS)).toEqual([slot]);
    expect(g.count).toBe(0);
  });

  it('rises and fades out at the end of its life', () => {
    expect(goldLabelLook(0, 0)).toEqual({ rise: 0, alpha: 1 });
    expect(goldLabelLook(GOLD_LIFE_MS, 0).alpha).toBe(0);
    expect(goldLabelLook(GOLD_LIFE_MS, 0).rise).toBeGreaterThan(20);
  });
});

describe('BannerQueue', () => {
  it('shows a banner for BANNER_MS with a fade at each end', () => {
    const q = new BannerQueue();
    q.push(banner('Wave 1'), 0);
    expect(q.current(0)?.alpha).toBe(0);
    expect(q.current(BANNER_FADE_MS)?.alpha).toBe(1);
    expect(q.current(BANNER_MS / 2)?.banner.text).toBe('Wave 1');
    expect(q.current(BANNER_MS)).toBeNull();
  });

  it('a newer banner cuts the current one short and waits, never stacking', () => {
    const q = new BannerQueue();
    q.push(banner('Wave 3 cleared'), 0);
    q.push(banner('Wave 4'), 100);
    q.push(banner('Wave 4 cleared'), 120);
    q.push(banner('Wave 5'), 140);
    expect(q.pending).toBe(1);
    expect(q.current(200)?.banner.text).toBe('Wave 3 cleared');
    // The first push's cut (100 + 250) ends it; only the latest waits.
    expect(q.current(100 + BANNER_CUT_MS)?.banner.text).toBe('Wave 5');
    expect(q.pending).toBe(0);
    expect(q.current(100 + BANNER_CUT_MS + BANNER_MS)).toBeNull();
  });

  it('clear() drops everything', () => {
    const q = new BannerQueue();
    q.push(banner('a'), 0);
    q.push(banner('b'), 10);
    q.clear();
    expect(q.current(20)).toBeNull();
    expect(q.pending).toBe(0);
  });
});

describe('moments', () => {
  it('darkening rises, holds and clears within DARKEN_MS', () => {
    expect(darkenAlpha(-1)).toBe(0);
    expect(darkenAlpha(DARKEN_MS / 2)).toBe(DARKEN_ALPHA);
    expect(darkenAlpha(DARKEN_MS)).toBe(0);
  });

  it('the Lives shake is a few px and stops', () => {
    for (let ms = 0; ms < 700; ms += 7) expect(Math.abs(livesShake(ms))).toBeLessThanOrEqual(3);
    expect(livesShake(600)).toBe(0);
  });
});
