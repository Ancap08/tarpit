// Enemies: since milestone 16 the bodies are sprites (anim/enemySprites.ts).
// This file draws what goes with them: a tar ring when slowed and an orange
// ring when burning (outside the tar ring when both apply), under the sprite
// as a halo, and an hp bar above the sprite when hurt, on a layer over all
// sprites so a following enemy never hides one. The rings stay because
// Phaser tints are WebGL-only: in test mode (Canvas) they are the only
// status cue, and in play they back up the tint.

import type Phaser from 'phaser';
import { ENEMY_STATS, enemyPosition, type Enemy, type EnemyType, type GameState } from '../../sim';
import { SHEETS } from '../anim/sheets';
import { COLORS } from '../palette';

/** Status ring base radius per type: just outside the sprite's body. */
export const RING_RADIUS: Record<EnemyType, number> = { goblin: 14, wolf: 12, troll: 21 };

/** Half the sprite's drawn height: the hp bar sits above this. */
export function spriteHalfHeight(type: EnemyType): number {
  return (SHEETS[type].frameHeight * SHEETS[type].scale) / 2;
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

/** Tar and burn rings for every enemy, drawn under the sprites. */
export function drawStatusRings(g: Phaser.GameObjects.Graphics, state: GameState): void {
  for (const enemy of state.enemies) {
    const { x, y } = enemyPosition(enemy);
    for (const ring of statusRings(enemy)) {
      g.lineStyle(3, ring.color, 1);
      g.strokeCircle(x, y, RING_RADIUS[enemy.type] + ring.offset);
    }
  }
}

/** Hp bars for hurt enemies, drawn over the sprites. */
export function drawHpBars(g: Phaser.GameObjects.Graphics, state: GameState): void {
  for (const enemy of state.enemies) {
    const maxHp = ENEMY_STATS[enemy.type].hp;
    if (enemy.hp < maxHp) {
      const { x, y } = enemyPosition(enemy);
      const fraction = Math.max(0, enemy.hp) / maxHp;
      const left = Math.round(x - BAR_WIDTH / 2);
      const top = Math.round(y - spriteHalfHeight(enemy.type) - BAR_GAP - BAR_HEIGHT - 1);
      g.fillStyle(COLORS.hpBorder, 1);
      g.fillRect(left - 1, top - 1, BAR_WIDTH + 2, BAR_HEIGHT + 2);
      g.fillStyle(hpColor(fraction), 1);
      g.fillRect(left, top, Math.max(1, Math.round(BAR_WIDTH * fraction)), BAR_HEIGHT);
    }
  }
}
