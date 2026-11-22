// Special attack effects (milestone 25b), the same list pattern as shot
// effects (shots.ts): each effect lives a few simulation ticks and fades.
//   keg         a filled flash for the first ticks and a ring expanding to
//               the radius
//   tarBarrel   a dark splat circle fading over 0.5 s (30 ticks)
//   fireArrows  8 short streaks falling into the circle, then an orange flash
// Enemies then show the existing tar and burn rings (draw/enemies.ts). In
// test mode effects are instant: nothing is added, so frames show only the
// result (hurt, tarred or burning enemies), like the frozen sprites.

import type Phaser from 'phaser';
import type { SpecialType } from '../../sim';
import { COLORS } from '../palette';

/** Ticks each special effect stays on screen. */
export const SPECIAL_FX_LIFETIME: Readonly<Record<SpecialType, number>> = { keg: 24, tarBarrel: 30, fireArrows: 24 };
/** The keg's filled flash lasts this many ticks. */
const KEG_FLASH_TICKS = 12;
/** Fire arrows fall during the first half of the effect, then flash. */
const ARROWS = 8;
const ARROW_LENGTH = 12;
const ARROW_FALL = 60;

interface SpecialFx {
  type: SpecialType;
  x: number;
  y: number;
  radius: number;
  ticksLeft: number;
}

export class SpecialEffects {
  private fx: SpecialFx[] = [];

  /** `instant` (test mode): effects are never shown. */
  constructor(private readonly instant: boolean) {}

  /** A special was fired at (x, y). */
  add(type: SpecialType, x: number, y: number, radius: number): void {
    if (this.instant) return;
    this.fx.push({ type, x, y, radius, ticksLeft: SPECIAL_FX_LIFETIME[type] });
  }

  /** Call once after every simulation tick. */
  afterTick(): void {
    if (this.fx.length === 0) return;
    for (const f of this.fx) f.ticksLeft -= 1;
    this.fx = this.fx.filter((f) => f.ticksLeft > 0);
  }

  /** Number of effects still visible (for tests). */
  get count(): number {
    return this.fx.length;
  }

  draw(g: Phaser.GameObjects.Graphics): void {
    for (const f of this.fx) {
      const life = SPECIAL_FX_LIFETIME[f.type];
      const age = life - f.ticksLeft; // 0 on the frame it was fired
      const a = f.ticksLeft / life;
      switch (f.type) {
        case 'keg': {
          if (age < KEG_FLASH_TICKS) {
            g.fillStyle(COLORS.fireBurstCore, 0.55 * (1 - age / KEG_FLASH_TICKS));
            g.fillCircle(f.x, f.y, f.radius * 0.8);
          }
          g.lineStyle(4, COLORS.specialKeg, a);
          g.strokeCircle(f.x, f.y, Math.max(4, f.radius * Math.min(1, (age + 1) / (life * 0.6))));
          break;
        }
        case 'tarBarrel':
          g.fillStyle(COLORS.specialTar, 0.55 * a);
          g.fillCircle(f.x, f.y, f.radius);
          g.fillStyle(COLORS.tarSplat, 0.7 * a);
          g.fillCircle(f.x - f.radius * 0.3, f.y + f.radius * 0.2, f.radius * 0.25);
          g.fillCircle(f.x + f.radius * 0.35, f.y - f.radius * 0.15, f.radius * 0.2);
          break;
        case 'fireArrows': {
          const half = life / 2;
          if (age < half) {
            const t = (age + 1) / half; // 0..1: how far the arrows have fallen
            g.lineStyle(2, COLORS.arrowTracer, 1);
            for (let i = 0; i < ARROWS; i++) {
              const ang = (i * 2 * Math.PI) / ARROWS + 0.4;
              const r = f.radius * (i % 2 === 0 ? 0.6 : 0.3);
              const tx = f.x + Math.cos(ang) * r;
              const ty = f.y + Math.sin(ang) * r;
              const y = ty - ARROW_FALL * (1 - t);
              g.lineBetween(tx - 3, y - ARROW_LENGTH, tx, y);
            }
          } else {
            const k = f.ticksLeft / half;
            g.fillStyle(COLORS.fireBurst, 0.45 * k);
            g.fillCircle(f.x, f.y, f.radius);
            g.lineStyle(2, COLORS.specialFire, k);
            g.strokeCircle(f.x, f.y, f.radius);
          }
          break;
        }
      }
    }
  }
}
