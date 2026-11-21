// Shot effects. The simulation is hitscan; the renderer keeps each shot for a
// few ticks and fades it out. Lifetimes count simulation ticks, so test-mode
// frames are deterministic and 2x speed fades twice as fast.

import type Phaser from 'phaser';
import type { Shot, TowerType } from '../../sim';
import { COLORS } from '../palette';
import { BARREL_LENGTH } from './towers';

const LIFETIME: Record<TowerType, number> = { musketeer: 6, cannon: 10, tarpit: 10 };

interface ShotFx {
  shot: Shot;
  ticksLeft: number;
}

/** Where a tracer starts: the barrel tip, aimed at the target. */
function muzzle(shot: Shot): { x: number; y: number } {
  const { from, to } = shot;
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len <= BARREL_LENGTH) return from;
  const k = BARREL_LENGTH / len;
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
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

  draw(g: Phaser.GameObjects.Graphics): void {
    for (const { shot, ticksLeft } of this.fx) {
      const a = ticksLeft / LIFETIME[shot.tower];
      const { to } = shot;
      const from = muzzle(shot);
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
      }
    }
  }
}
