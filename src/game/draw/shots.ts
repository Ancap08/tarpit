// Shot effects. The simulation is hitscan; the renderer keeps each shot for a
// few ticks and fades it out. Lifetimes count simulation ticks, so test-mode
// frames are deterministic and 2x speed fades twice as fast.

import type Phaser from 'phaser';
import type { Shot, TowerType } from '../../sim';
import type { PaintedSkin } from '../skin/painted';
import { COLORS } from '../palette';
import { MUZZLE } from './towers';

/** Ticks each shot effect stays on screen, fading out. */
export const SHOT_LIFETIME: Record<TowerType, number> = { musketeer: 6, cannon: 10, tarpit: 10, longbow: 4, mortar: 12, firepot: 8 };
const LIFETIME = SHOT_LIFETIME;

/** Mortar flash: a short thick dark line out of the tube mouth. */
const MORTAR_FLASH_LENGTH = 14;

interface ShotFx {
  shot: Shot;
  ticksLeft: number;
}

/** `d` px from the tower centre towards the target (the centre if the target is closer). */
function along(shot: Shot, d: number): { x: number; y: number } {
  const { from, to } = shot;
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len <= d) return from;
  const k = d / len;
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}

/** Where a tracer starts: the barrel tip (or bow, tube mouth), aimed at the target. */
function muzzle(shot: Shot): { x: number; y: number } {
  return along(shot, MUZZLE[shot.tower]);
}

export class ShotEffects {
  private fx: ShotFx[] = [];

  /** Call once after every simulation tick with that tick's shots. */
  afterTick(newShots: readonly Shot[]): void {
    for (const f of this.fx) f.ticksLeft -= 1;
    this.fx = this.fx.filter((f) => f.ticksLeft > 0);
    for (const shot of newShots) this.fx.push({ shot, ticksLeft: LIFETIME[shot.tower] });
  }

  /** Number of effects still visible (for tests). */
  get count(): number {
    return this.fx.length;
  }

  draw(g: Phaser.GameObjects.Graphics, painted?: PaintedSkin): void {
    for (const { shot, ticksLeft } of this.fx) {
      const a = ticksLeft / LIFETIME[shot.tower];
      const { to } = shot;
      const from = muzzle(shot);
      if (painted?.frozenShot(shot.tower, from, to, 1 - a)) continue;
      switch (shot.tower) {
        case 'musketeer':
          g.lineStyle(2.5, COLORS.musketTracer, a);
          g.lineBetween(from.x, from.y, to.x, to.y);
          break;
        case 'cannon':
          g.fillStyle(COLORS.cannonSplash, 0.35 * a);
          g.fillCircle(to.x, to.y, shot.splashRadius ?? 0);
          g.lineStyle(2, COLORS.cannonSplash, 0.9 * a);
          g.strokeCircle(to.x, to.y, shot.splashRadius ?? 0);
          g.lineStyle(4, COLORS.cannonTracer, a);
          g.lineBetween(from.x, from.y, to.x, to.y);
          break;
        case 'tarpit':
          g.fillStyle(COLORS.tarSplat, 0.8 * a);
          g.fillCircle(to.x, to.y, 7);
          g.fillCircle(to.x - 6, to.y + 4, 4);
          g.fillCircle(to.x + 6, to.y - 3, 3);
          g.fillCircle(to.x + 3, to.y + 6, 3);
          break;
        case 'longbow':
          g.lineStyle(1.5, COLORS.arrowTracer, a);
          g.lineBetween(from.x, from.y, to.x, to.y);
          break;
        case 'mortar': {
          // The shell arcs out of sight: a splash at the target and a dark
          // flash out of the tube, no line between them.
          g.fillStyle(COLORS.mortarSplash, 0.4 * a);
          g.fillCircle(to.x, to.y, shot.splashRadius ?? 0);
          g.lineStyle(2.5, COLORS.mortarSplash, 0.95 * a);
          g.strokeCircle(to.x, to.y, shot.splashRadius ?? 0);
          const tip = along(shot, MUZZLE.mortar + MORTAR_FLASH_LENGTH);
          g.lineStyle(6, COLORS.mortarFlash, a);
          g.lineBetween(from.x, from.y, tip.x, tip.y);
          break;
        }
        case 'firepot':
          g.lineStyle(2.5, COLORS.fireFlash, a);
          g.lineBetween(from.x, from.y, to.x, to.y);
          g.fillStyle(COLORS.fireBurst, 0.85 * a);
          g.fillCircle(to.x, to.y, 8);
          g.fillStyle(COLORS.fireBurstCore, a);
          g.fillCircle(to.x, to.y, 4);
          break;
      }
    }
  }
}
