// Event reactions for enemy sprites (milestone 16), and the cursor that hands
// each simulation event to the renderer exactly once.
//
//   hit     white flash for 80 ms (WebGL tint fill)
//   kill    the sprite stops, shrinks to 0 and fades over 250 ms, plus a
//           6-particle dust burst
//   burn    orange tint pulse while burnTicksLeft > 0, a small flame particle
//           every few frames
//   slowed  dark tar tint while slowTicksLeft > 0
//   exit    the sprite is removed at once
//
// Test mode (?test=1) has no tweens and no particles: a killed enemy's sprite
// is removed at once, tints are set without a pulse, and the hit flag lasts
// until the next tick. Phaser tints are WebGL-only, so in test mode (Canvas)
// tints change nothing on screen: the status rings (draw/enemies.ts) carry
// tar and burn there, and in play both show.

import type Phaser from 'phaser';
import type { GameEvent, GameState } from '../../sim';

/**
 * Hands out each entry of state.events once. `tick` replaces the array, so a
 * new array means a new tick; actions append to the current one between
 * ticks. Call `take` after every tick and after every action.
 */
export class EventCursor {
  private list: GameEvent[] | null = null;
  private seen = 0;

  /** The events not handed out yet, and whether they start a new tick's list. */
  take(state: GameState): { events: GameEvent[]; newTick: boolean } {
    const newTick = state.events !== this.list;
    if (newTick) {
      this.list = state.events;
      this.seen = 0;
    }
    const events = state.events.slice(this.seen);
    this.seen = state.events.length;
    return { events, newTick };
  }
}

export const HIT_FLASH_MS = 80;
export const DEATH_MS = 250;
/** Redraws between flame particles on a burning enemy (play only). */
export const FLAME_EVERY = 6;

/** Multiply tints: tar darkens, burn pulses towards orange. */
export const TINT = { none: 0xffffff, tar: 0x7a6a5c, burn: 0xff8a3a, flash: 0xffffff } as const;

function lerpColor(a: number, b: number, t: number): number {
  const ch = (shift: number) => {
    const x = (a >> shift) & 0xff;
    const y = (b >> shift) & 0xff;
    return Math.round(x + (y - x) * t) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}

/**
 * The status tint for an enemy, or null for none. `pulse` in [0, 1] is how
 * far towards orange a burning enemy is (test mode passes a fixed 1).
 */
export function statusTint(burning: boolean, slowed: boolean, pulse: number): number | null {
  const base = slowed ? TINT.tar : TINT.none;
  if (burning) return lerpColor(base, TINT.burn, Math.min(1, Math.max(0, pulse)));
  return slowed ? base : null;
}

/** Harpy bob in play (milestone 22): amplitude in px and period in ms. Test mode has no bob. */
export const BOB_PX = 2;
export const BOB_MS = 900;

/** Vertical bob offset at scene time `ms` for the enemy with this id (ids desync the bobs). */
export function bobOffset(ms: number, id: number): number {
  return Math.round(BOB_PX * Math.sin(((ms + id * 157) / BOB_MS) * 2 * Math.PI));
}

/** Burn pulse at time `ms`: 0..1 and back, about three times a second. */
export function burnPulse(ms: number): number {
  return 0.5 + 0.5 * Math.sin((ms / 1000) * 2 * Math.PI * 3);
}

const DUST_KEY = 'fx-dust';
const FLAME_KEY = 'fx-flame';

/** Particle emitters for play mode: the death dust and the burn flames. */
export class Particles {
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly flame: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    if (!scene.textures.exists(DUST_KEY)) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(0xd8c8a8, 1).fillCircle(3, 3, 3).generateTexture(DUST_KEY, 6, 6);
      g.clear().fillStyle(0xffb03a, 1).fillRect(0, 0, 3, 3).generateTexture(FLAME_KEY, 3, 3);
      g.destroy();
    }
    this.dust = scene.add.particles(0, 0, DUST_KEY, {
      emitting: false,
      lifespan: 320,
      speed: { min: 25, max: 55 },
      scale: { start: 1, end: 0.2 },
      alpha: { start: 0.8, end: 0 },
    });
    this.flame = scene.add.particles(0, 0, FLAME_KEY, {
      emitting: false,
      lifespan: 380,
      speedY: { min: -40, max: -20 },
      speedX: { min: -6, max: 6 },
      alpha: { start: 1, end: 0 },
      tint: [0xffd23a, 0xff7a1a],
    });
  }

  puff(x: number, y: number): void {
    this.dust.explode(6, x, y);
  }

  flicker(x: number, y: number): void {
    this.flame.emitParticleAt(x, y, 1);
  }
}
