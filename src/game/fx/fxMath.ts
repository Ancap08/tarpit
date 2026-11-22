// Milestone 31 (effects): the maths behind the effects, with no Phaser, so
// unit tests pin it. Effects are drawing only: the simulation is instant-hit
// and applies damage on the tick it fires; what is drawn here takes a little
// time. Times are game milliseconds (1000 / 60 per simulation tick, so 2x and
// 3x speed shorten them in real time), except where a name says "real".

import type { EnemyType, Point, TowerType } from '../../sim';

/** How long each tower's projectile takes to reach the point the simulation recorded (game ms). */
export const TRAVEL_MS: Readonly<Record<TowerType, number>> = {
  musketeer: 110,
  firepot: 150,
  longbow: 220,
  tarpit: 240,
  cannon: 260,
  mortar: 320,
};

/** Arc height as a share of the flight distance, and its floor and ceiling in px (0 = straight). */
export const ARC: Readonly<Record<TowerType, { share: number; min: number; max: number }>> = {
  musketeer: { share: 0, min: 0, max: 0 },
  firepot: { share: 0, min: 0, max: 0 },
  longbow: { share: 0.08, min: 0, max: 10 },
  tarpit: { share: 0.2, min: 6, max: 24 },
  cannon: { share: 0.15, min: 6, max: 22 },
  mortar: { share: 0.45, min: 40, max: 90 },
};

/** Arc height in px for a flight of `distance` px. */
export function arcHeight(tower: TowerType, distance: number): number {
  const a = ARC[tower];
  if (a.share === 0) return 0;
  return Math.min(a.max, Math.max(a.min, a.share * distance));
}

export interface ArcPoint {
  /** Where the projectile is drawn. */
  x: number;
  y: number;
  /** Its shadow on the ground (the straight line from muzzle to target). */
  groundX: number;
  groundY: number;
  /** Direction of travel on screen, radians (for arrows and shells). */
  angle: number;
}

/** Screen-up in world coordinates for the landscape layout (screen y grows down). */
const UP: Point = { x: 0, y: -1 };

/**
 * Position at `t` in [0, 1] along a parabola from `from` to `to` that rises
 * `height` px above the straight line at its middle. It rises along `up`,
 * the world direction of the top of the screen (milestone 32b: the turned
 * portrait map passes its own, so an arc still rises up the screen).
 */
export function arcPosition(from: Point, to: Point, t: number, height: number, up: Point = UP): ArcPoint {
  const u = Math.min(1, Math.max(0, t));
  const groundX = from.x + (to.x - from.x) * u;
  const groundY = from.y + (to.y - from.y) * u;
  const lift = 4 * height * u * (1 - u);
  // d/du of (ground + up * lift) = d + up * 4h(1 - 2u).
  const rise = 4 * height * (1 - 2 * u);
  const vx = to.x - from.x + up.x * rise;
  const vy = to.y - from.y + up.y * rise;
  return { x: groundX + up.x * lift, y: groundY + up.y * lift, groundX, groundY, angle: Math.atan2(vy, vx) };
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  else if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

/** Barrel turn rate (radians per game second): about 570 degrees a second. */
export const TURN_RATE = 10;

/** Turn `current` toward `target` by at most `maxStep` radians, the short way round. */
export function turnStep(current: number, target: number, maxStep: number): number {
  const diff = wrapAngle(target - current);
  if (Math.abs(diff) <= maxStep) return wrapAngle(target);
  return wrapAngle(current + Math.sign(diff) * maxStep);
}

/** How far each barrel kicks back when it fires (px); 0 for towers with no barrel. */
export const RECOIL_PX: Readonly<Record<TowerType, number>> = { musketeer: 3, cannon: 4, longbow: 2, mortar: 4, tarpit: 0, firepot: 0 };
/** Recoil: out over KICK_MS, back over the rest of RECOIL_MS (game ms). */
export const RECOIL_MS = 160;
const KICK_MS = 30;

/** Recoil offset in px `ms` after firing (0 before and after). */
export function recoilOffset(ms: number, kickPx: number): number {
  if (ms < 0 || ms >= RECOIL_MS || kickPx === 0) return 0;
  if (ms < KICK_MS) return (kickPx * ms) / KICK_MS;
  const u = (ms - KICK_MS) / (RECOIL_MS - KICK_MS);
  return kickPx * (1 - u) * (1 - u);
}

export type PopKind = 'build' | 'upgrade' | 'sell';
/** Length of a build, upgrade or sell pop (real ms, so setup pops show at any speed). */
export const POP_MS: Readonly<Record<PopKind, number>> = { build: 280, upgrade: 320, sell: 240 };

/**
 * A tower's drawn scale `ms` into a pop: build grows from 0.5 past 1.15 and
 * settles at 1, upgrade bounces 1 -> 1.2 -> 1, sell shrinks to 0. Outside
 * the pop it is 1 (sell: 0 after).
 */
export function popScale(kind: PopKind, ms: number): number {
  const d = POP_MS[kind];
  if (ms < 0) return kind === 'build' ? 0.5 : 1;
  if (ms >= d) return kind === 'sell' ? 0 : 1;
  const u = ms / d;
  // Sell: a small swell over the first third, then a shrink to nothing.
  if (kind === 'sell') return u < 1 / 3 ? 1 + 0.15 * Math.sin(u * 3 * Math.PI) : 1 - (u - 1 / 3) / (2 / 3);
  if (kind === 'build') return u < 0.4 ? 0.5 + (0.65 * u) / 0.4 : 1.15 - (0.15 * (u - 0.4)) / 0.6;
  return 1 + 0.2 * Math.sin(u * Math.PI);
}

/** Hit knock: px away from the shot, fading over KNOCK_MS (real ms). */
export const KNOCK_MS = 120;
export function knockPx(type: EnemyType): number {
  return type === 'boss' || type === 'troll' ? 1 : 2;
}
/** The knock offset `ms` after a hit, as a share of its full size. */
export function knockShare(ms: number): number {
  if (ms < 0 || ms >= KNOCK_MS) return 0;
  return 1 - ms / KNOCK_MS;
}
/** Unit vector from `from` to `to` (0, 0 when they meet). */
export function awayFrom(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  return len < 1e-6 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
}

/** Death puff per enemy: particle count and size (the boss also gets the big burst). */
export function deathPuff(type: EnemyType): { count: number; scale: number } {
  switch (type) {
    case 'boss':
      return { count: 24, scale: 2.4 };
    case 'troll':
      return { count: 14, scale: 1.7 };
    case 'shieldbearer':
      return { count: 9, scale: 1.2 };
    default:
      return { count: 6, scale: 1 };
  }
}

/** Caps on live effects: beyond them the oldest is recycled. */
export const CAPS = {
  projectiles: 96,
  impacts: 48,
  goldLabels: 10,
  /** Per particle emitter (dust, smoke, sparks). */
  particles: 120,
} as const;

/**
 * A fixed set of `cap` slots. acquire() returns a free slot, or when all are
 * in use the one acquired longest ago (it is recycled). Nothing allocates
 * after construction.
 */
export class SlotPool {
  private readonly bornAt: number[];
  private readonly used: boolean[];
  private stamp = 0;
  private live = 0;

  constructor(readonly cap: number) {
    this.bornAt = new Array<number>(cap).fill(0);
    this.used = new Array<boolean>(cap).fill(false);
  }

  /** A slot to fill, and whether it was taken from a live (recycled) entry. */
  acquire(): { slot: number; recycled: boolean } {
    let oldest = 0;
    for (let i = 0; i < this.cap; i++) {
      if (!this.used[i]) return this.take(i, false);
      if (this.bornAt[i] < this.bornAt[oldest]) oldest = i;
    }
    return this.take(oldest, true);
  }

  private take(i: number, recycled: boolean): { slot: number; recycled: boolean } {
    if (!recycled) this.live += 1;
    this.used[i] = true;
    this.bornAt[i] = ++this.stamp;
    return { slot: i, recycled };
  }

  release(slot: number): void {
    if (!this.used[slot]) return;
    this.used[slot] = false;
    this.live -= 1;
  }

  inUse(slot: number): boolean {
    return this.used[slot];
  }

  get count(): number {
    return this.live;
  }
}

/** Gold labels: kills this close in space and time share one label. */
export const GOLD_GROUP_MS = 350;
export const GOLD_GROUP_PX = 56;
/** A gold label lives this long after its last kill, rising GOLD_RISE_PX (real ms). */
export const GOLD_LIFE_MS = 900;
export const GOLD_RISE_PX = 26;

export interface GoldLabel {
  x: number;
  y: number;
  amount: number;
  bornMs: number;
  lastMs: number;
  /** The boss's bounty: drawn large, never grouped with other kills. */
  big: boolean;
}

/**
 * Groups kill bounties into floating labels. add() returns the slot whose
 * label shows the sum: a live label born within GOLD_GROUP_MS and within
 * GOLD_GROUP_PX of the kill absorbs it; otherwise a new slot (recycling the
 * oldest at the cap).
 */
export class GoldGroups {
  readonly labels: (GoldLabel | null)[];
  private readonly pool: SlotPool;

  constructor(cap: number = CAPS.goldLabels) {
    this.pool = new SlotPool(cap);
    this.labels = new Array<GoldLabel | null>(cap).fill(null);
  }

  add(x: number, y: number, amount: number, nowMs: number, big = false): { slot: number; merged: boolean } {
    for (let i = 0; i < this.labels.length && !big; i++) {
      const l = this.labels[i];
      if (l && !l.big && nowMs - l.bornMs <= GOLD_GROUP_MS && Math.hypot(l.x - x, l.y - y) <= GOLD_GROUP_PX) {
        l.amount += amount;
        l.lastMs = nowMs;
        return { slot: i, merged: true };
      }
    }
    const { slot } = this.pool.acquire();
    this.labels[slot] = { x, y, amount, bornMs: nowMs, lastMs: nowMs, big };
    return { slot, merged: false };
  }

  /** Drop labels whose life is over; returns the slots freed. */
  expire(nowMs: number): number[] {
    const freed: number[] = [];
    for (let i = 0; i < this.labels.length; i++) {
      const l = this.labels[i];
      if (l && nowMs - l.lastMs >= GOLD_LIFE_MS) {
        this.labels[i] = null;
        this.pool.release(i);
        freed.push(i);
      }
    }
    return freed;
  }

  get count(): number {
    return this.pool.count;
  }
}

/** A gold label's rise (px above its start) and opacity `ms` after it was born, for a label last fed at `lastMs - bornMs`. */
export function goldLabelLook(ms: number, fedMs: number): { rise: number; alpha: number } {
  const life = fedMs + GOLD_LIFE_MS;
  const u = Math.min(1, Math.max(0, ms / life));
  const fadeFrom = life - 300;
  const alpha = ms <= fadeFrom ? 1 : Math.max(0, (life - ms) / 300);
  return { rise: GOLD_RISE_PX * u, alpha };
}

/** Banners: on screen this long, fading in and out over BANNER_FADE_MS (real ms). */
export const BANNER_MS = 1500;
export const BANNER_FADE_MS = 200;
/** A banner that a newer one supersedes ends at most this long after. */
export const BANNER_CUT_MS = 250;

export interface Banner {
  text: string;
  sub: string;
  big: boolean;
}

interface Showing extends Banner {
  startMs: number;
  endMs: number;
}

/**
 * One banner on screen at a time and at most one waiting. A banner pushed
 * while another shows cuts the current one short (BANNER_CUT_MS) and
 * replaces anything already waiting, so early calls never stack banners.
 */
export class BannerQueue {
  private showing: Showing | null = null;
  private waiting: Banner | null = null;

  push(banner: Banner, nowMs: number): void {
    this.update(nowMs);
    if (this.showing === null) {
      this.showing = { ...banner, startMs: nowMs, endMs: nowMs + BANNER_MS };
      return;
    }
    this.showing.endMs = Math.min(this.showing.endMs, nowMs + BANNER_CUT_MS);
    this.waiting = banner;
  }

  /** Drop everything (the game ended). */
  clear(): void {
    this.showing = null;
    this.waiting = null;
  }

  /** Advance to `nowMs`: an ended banner gives way to the waiting one. */
  update(nowMs: number): void {
    if (this.showing !== null && nowMs >= this.showing.endMs) {
      const next = this.waiting;
      this.waiting = null;
      this.showing = next === null ? null : { ...next, startMs: nowMs, endMs: nowMs + BANNER_MS };
    }
  }

  /** The banner to draw at `nowMs` and its opacity, or null. */
  current(nowMs: number): { banner: Banner; alpha: number } | null {
    this.update(nowMs);
    const s = this.showing;
    if (s === null) return null;
    const alpha = Math.min(1, (nowMs - s.startMs) / BANNER_FADE_MS, (s.endMs - nowMs) / BANNER_FADE_MS);
    return { banner: { text: s.text, sub: s.sub, big: s.big }, alpha: Math.max(0, alpha) };
  }

  get pending(): number {
    return this.waiting === null ? 0 : 1;
  }
}

/** Boss entrance: the map darkens to DARKEN_ALPHA and back over DARKEN_MS (real ms). */
export const DARKEN_MS = 1400;
export const DARKEN_ALPHA = 0.45;
export function darkenAlpha(ms: number): number {
  if (ms < 0 || ms >= DARKEN_MS) return 0;
  const u = ms / DARKEN_MS;
  return DARKEN_ALPHA * (u < 0.2 ? u / 0.2 : u > 0.7 ? (1 - u) / 0.3 : 1);
}

/** Exit: the cottage glows red and the Lives number flashes for EXIT_FLASH_MS (real ms). */
export const EXIT_FLASH_MS = 600;
/** Strength 1 -> 0 of a flash `ms` into a flash of length `durMs`. */
export function flashFade(ms: number, durMs: number): number {
  if (ms < 0 || ms >= durMs) return 0;
  return 1 - ms / durMs;
}

/**
 * Shakes (real ms, amplitude px). Off under reduced motion. Only the map
 * shakes (GameScene splits off a still HUD camera while one runs).
 */
export const SHAKE = {
  bossEntrance: { ms: 400, px: 5 },
  bossDeath: { ms: 600, px: 8 },
  keg: { ms: 220, px: 6 },
} as const;

/**
 * The map camera's scroll `ms` into a shake of `durMs` and `px`: x in
 * [-px, px], y in [-px, 0] (never positive, so the view never slides down
 * onto the HUD's rows), easing out to 0, and exactly 0 outside the shake.
 * Deterministic (sines, no random).
 */
export function shakeOffset(ms: number, durMs: number, px: number): { x: number; y: number } {
  if (ms < 0 || ms >= durMs || px === 0) return { x: 0, y: 0 };
  const a = px * (1 - ms / durMs);
  const t = ms / 1000;
  const x = Math.round(a * Math.sin(t * 2 * Math.PI * 23) * Math.cos(t * 2 * Math.PI * 7));
  const y = -Math.round(a * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 19 + 1)));
  return { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y };
}

/** The boss's death burst: rings started this far apart (game ms), each lasting BOSS_RING_MS, out to these radii. */
export const BOSS_RING_DELAYS = [0, 160, 320] as const;
export const BOSS_RING_RADII = [80, 120, 160] as const;
export const BOSS_RING_MS = 900;

/** Lives number shake on an exit: px left-right, off under reduced motion. */
export function livesShake(ms: number): number {
  const f = flashFade(ms, EXIT_FLASH_MS);
  return f === 0 ? 0 : Math.round(3 * f * Math.sin((ms / 1000) * 2 * Math.PI * 18));
}
