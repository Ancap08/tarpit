// Enemies: since milestone 16 the bodies are sprites (anim/enemySprites.ts).
// This file draws what goes with them: a soft ground shadow under each flyer
// (milestone 22), a tar ring when slowed and an orange
// ring when burning (outside the tar ring when both apply), under the sprite
// as a halo, and an hp bar above the sprite when hurt, on a layer over all
// sprites so a following enemy never hides one. The rings stay because
// Phaser tints are WebGL-only: in test mode (Canvas) they are the only
// status cue, and in play they back up the tint.
//
// Milestone 23, the boss: a larger ground shadow at his feet, rings
// centred on his body (drawn `lift` px above his path position), and no
// small hp bar (the HUD boss bar shows his hp).

import type Phaser from 'phaser';
import { ENEMY_STATS, enemyPosition, type Enemy, type EnemyType, type GameState } from '../../sim';
import { SHEETS } from '../anim/sheets';
import { COLORS } from '../palette';

/** Status ring base radius per type: just outside the sprite's body. */
export const RING_RADIUS: Record<EnemyType, number> = { goblin: 14, wolf: 12, troll: 21, harpy: 14, shieldbearer: 14, boss: 38 };

/** Half the sprite's drawn height: the hp bar sits above this. */
export function spriteHalfHeight(type: EnemyType): number {
  return (SHEETS[type].frameHeight * SHEETS[type].scale) / 2;
}

/** Pixels a flying sprite is drawn above its path position (sheets.ts lift); 0 for walkers. */
export function spriteLift(type: EnemyType): number {
  return SHEETS[type].lift ?? 0;
}

/**
 * Harpy ground shadow: a soft dark ellipse on the path under the flyer, an
 * outer 24 x 9 at 15% and an inner 16 x 6 at 20% (so 32% at the core), 3 px
 * below its path position.
 */
export const SHADOW = { offsetY: 3, outer: { w: 24, h: 9, alpha: 0.15 }, inner: { w: 16, h: 6, alpha: 0.2 } } as const;

/**
 * Boss ground shadow (milestone 23): the same two soft ellipses, sized to
 * his 2x feet: outer 72 x 20 at 15%, inner 52 x 14 at 20%, 4 px below his
 * path position (his feet are 6 px below it).
 */
export const BOSS_SHADOW = { offsetY: 4, outer: { w: 72, h: 20, alpha: 0.15 }, inner: { w: 52, h: 14, alpha: 0.2 } } as const;

/** The ground shadow for this type, or null for walkers that have none. */
export function shadowOf(type: EnemyType): typeof SHADOW | typeof BOSS_SHADOW | null {
  if (type === 'boss') return BOSS_SHADOW;
  return ENEMY_STATS[type].flying ? SHADOW : null;
}

/** Ground shadows for every flying enemy and the boss, drawn on the ground under all sprites. */
export function drawShadows(g: Phaser.GameObjects.Graphics, state: GameState): void {
  for (const enemy of state.enemies) {
    const shadow = shadowOf(enemy.type);
    if (!shadow) continue;
    const { x, y } = enemyPosition(enemy);
    for (const e of [shadow.outer, shadow.inner]) {
      g.fillStyle(COLORS.shadow, e.alpha);
      g.fillEllipse(x, y + shadow.offsetY, e.w, e.h);
    }
  }
}

// Hp bar: a 30 x 4 fill inside a 1 px dark border, above the enemy, only when hurt.
const BAR_WIDTH = 30;
const BAR_HEIGHT = 4;
const BAR_GAP = 4;

/** Green at half or more, orange below half, red below a quarter. */
export function hpColor(fraction: number): number {
  if (fraction < 0.25) return COLORS.hpLow;
  if (fraction < 0.5) return COLORS.hpMid;
  return COLORS.hpFill;
}

/**
 * Status rings around an enemy, as offsets from its body radius: tar at +3
 * when slowed, burn at +3 alone or +6 (outside the tar ring) when both.
 */
export function statusRings(enemy: Pick<Enemy, 'slowTicksLeft' | 'burnTicksLeft'>): { color: number; offset: number }[] {
  const tarred = enemy.slowTicksLeft > 0;
  const burning = (enemy.burnTicksLeft ?? 0) > 0;
  const rings: { color: number; offset: number }[] = [];
  if (tarred) rings.push({ color: COLORS.tarRing, offset: 3 });
  if (burning) rings.push({ color: COLORS.burnRing, offset: tarred ? 6 : 3 });
  return rings;
}

/**
 * Tar and burn rings for every walking enemy, drawn under the sprites,
 * centred on the drawn body (the boss's is `lift` px up). Flyers never get
 * rings (they cannot be tarred or burned).
 */
export function drawStatusRings(g: Phaser.GameObjects.Graphics, state: GameState): void {
  for (const enemy of state.enemies) {
    if (ENEMY_STATS[enemy.type].flying) continue;
    const { x, y } = enemyPosition(enemy);
    for (const ring of statusRings(enemy)) {
      g.lineStyle(3, ring.color, 1);
      g.strokeCircle(x, y - spriteLift(enemy.type), RING_RADIUS[enemy.type] + ring.offset);
    }
  }
}

/** Hp bars for hurt enemies, drawn over the sprites. Not for the boss: the HUD boss bar shows his. */
export function drawHpBars(g: Phaser.GameObjects.Graphics, state: GameState): void {
  for (const enemy of state.enemies) {
    const maxHp = ENEMY_STATS[enemy.type].hp;
    if (enemy.hp < maxHp && enemy.type !== 'boss') {
      const { x, y } = enemyPosition(enemy);
      const fraction = Math.max(0, enemy.hp) / maxHp;
      const left = Math.round(x - BAR_WIDTH / 2);
      const top = Math.round(y - spriteLift(enemy.type) - spriteHalfHeight(enemy.type) - BAR_GAP - BAR_HEIGHT - 1);
      g.fillStyle(COLORS.hpBorder, 1);
      g.fillRect(left - 1, top - 1, BAR_WIDTH + 2, BAR_HEIGHT + 2);
      g.fillStyle(hpColor(fraction), 1);
      g.fillRect(left, top, Math.max(1, Math.round(BAR_WIDTH * fraction)), BAR_HEIGHT);
    }
  }
}
