// Enemies: since milestone 16 the bodies are sprites (anim/enemySprites.ts).
// This file draws what goes with them: a soft ground shadow under each flyer
// (milestone 22), a tar ring when slowed (flyers too since milestone 25b) and an orange
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
import { ENEMY_STATS, enemyMaxHp, enemyPosition, isBoss, isTarred, type Enemy, type EnemyType, type GameState } from '../../sim';
import type { PaintedBody } from '../anim/enemySprites';
import { SHEETS } from '../anim/sheets';
import { LANDSCAPE, type Layout } from '../layout';
import { COLORS } from '../palette';

/** Status ring base radius per type: just outside the sprite's body. */
export const RING_RADIUS: Record<EnemyType, number> = { goblin: 14, wolf: 12, troll: 21, harpy: 14, shieldbearer: 14, boss: 38, grumblemaw: 57 };

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
const GRUMBLEMAW_SHADOW = { offsetY: 6, outer: { w: 108, h: 30, alpha: 0.15 }, inner: { w: 78, h: 21, alpha: 0.2 } } as const;
export function shadowOf(type: EnemyType): typeof SHADOW | typeof BOSS_SHADOW | typeof GRUMBLEMAW_SHADOW | null {
  if (type === 'grumblemaw') return GRUMBLEMAW_SHADOW;
  if (type === 'boss') return BOSS_SHADOW;
  return ENEMY_STATS[type].flying ? SHADOW : null;
}

/** Ground shadows for every flying enemy and the boss, drawn on the ground under all sprites. */
export function drawShadows(g: Phaser.GameObjects.Graphics, state: GameState, layout: Layout = LANDSCAPE): void {
  // `g` is world-space (milestone 32b): the offset is down the screen and the ellipse wide on screen in any layout.
  for (const enemy of state.enemies) {
    const shadow = shadowOf(enemy.type);
    if (!shadow) continue;
    const { x, y } = layout.offset(enemyPosition(enemy, state.map), 0, shadow.offsetY);
    for (const e of [shadow.outer, shadow.inner]) {
      const size = layout.ellipse(e.w, e.h);
      g.fillStyle(COLORS.shadow, e.alpha);
      g.fillEllipse(x, y, size.w, size.h);
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
export function statusRings(
  enemy: Pick<Enemy, 'slowTicksLeft' | 'specialSlowTicksLeft' | 'burnTicksLeft'>,
): { color: number; offset: number }[] {
  // Either slow channel (milestone 25c: tower or special) shows the tar ring.
  const tarred = isTarred(enemy);
  const burning = (enemy.burnTicksLeft ?? 0) > 0;
  const rings: { color: number; offset: number }[] = [];
  if (tarred) rings.push({ color: COLORS.tarRing, offset: 3 });
  if (burning) rings.push({ color: COLORS.burnRing, offset: tarred ? 6 : 3 });
  return rings;
}

/**
 * Tar and burn rings for every enemy that carries them, drawn under the
 * sprites, centred on the drawn body (the boss's and a flyer's are `lift`
 * px up). Towers never tar or burn a flyer, but a special can (milestone
 * 25b), so a Harpy shows the rings when its state says so.
 */
export function drawStatusRings(g: Phaser.GameObjects.Graphics, state: GameState, layout: Layout = LANDSCAPE): void {
  // `g` is world-space (milestone 32b): the lift is up the screen in any layout.
  for (const enemy of state.enemies) {
    const { x, y } = layout.offset(enemyPosition(enemy, state.map), 0, -spriteLift(enemy.type));
    for (const ring of statusRings(enemy)) {
      g.lineStyle(3, ring.color, 1);
      g.strokeCircle(x, y, RING_RADIUS[enemy.type] + ring.offset);
    }
  }
}

// The fill starts 1 px inside its dark outline. Adjacent outlined bars leave
// another pixel of clear ground between them. Prefer a free slot above.
interface Bar { left: number; top: number }

function freeTop(left: number, wanted: number, placed: Bar[], mapTop: number): number {
  const stride = BAR_HEIGHT + 3;
  const adjacent = placed.filter(b => Math.abs(b.left - left) < BAR_WIDTH + 3)
    .sort((a, b) => b.top - a.top);
  let top = Math.max(mapTop + 1, wanted);
  for (const b of adjacent) {
    if (Math.abs(b.top - top) < stride) top = b.top - stride;
  }
  if (top >= mapTop + 1) return top;
  top = mapTop + 1;
  for (let i = adjacent.length - 1; i >= 0; i--) {
    if (Math.abs(adjacent[i].top - top) < stride) top = adjacent[i].top + stride;
  }
  return top;
}

function drawBar(g: Phaser.GameObjects.Graphics, left: number, top: number, fraction: number): void {
  g.fillStyle(COLORS.hpBorder, 1);
  g.fillRect(left - 1, top - 1, BAR_WIDTH + 2, BAR_HEIGHT + 2);
  g.fillStyle(hpColor(fraction), 1);
  g.fillRect(left, top, Math.max(1, Math.round(BAR_WIDTH * fraction)), BAR_HEIGHT);
}

function paintedBars(g: Phaser.GameObjects.Graphics, state: GameState, layout: Layout,
  bodyTop: (id: number) => PaintedBody | undefined): void {
  const pieces = state.enemies.flatMap(enemy => {
    const body = bodyTop(enemy.id);
    return body ? [{ enemy, body }] : [];
  });
  const placed: Bar[] = [];
  // Place lower bars first so higher bars can move up without crossing owners.
  pieces.sort((a, b) => b.body.y - a.body.y);
  for (const { enemy, body } of pieces) {
    if (isBoss(enemy)) continue;
    const maxHp = enemy.maxHp ?? enemyMaxHp(enemy.type, state.difficulty);
    // A larger foreground miniature can completely mask a healthy smaller one.
    // Keep that enemy count visible with its own full bar during the overlap.
    if (enemy.hp >= maxHp && !pieces.some(({ body: front }) =>
      front.depth >= body.depth && front.width * front.height > 1.3 * body.width * body.height &&
      Math.abs(front.x - body.x) < front.width / 2 &&
      front.y <= body.y + body.height / 2 && front.y + front.height >= body.y + body.height / 2)) continue;
    const left = Math.max(1, Math.min(layout.width - BAR_WIDTH - 1, Math.round(body.x - BAR_WIDTH / 2)));
    const top = freeTop(left, Math.round(body.y - BAR_GAP - BAR_HEIGHT - 1), placed, layout.map.y);
    drawBar(g, left, top, Math.max(0, enemy.hp) / maxHp);
    placed.push({ left, top });
  }
}

/** Hp bars for hurt enemies, drawn over the sprites. Not for the boss: the HUD boss bar shows his. */
export function drawHpBars(g: Phaser.GameObjects.Graphics, state: GameState, layout: Layout = LANDSCAPE,
  bodyTop?: (id: number) => PaintedBody | undefined): void {
  if (bodyTop) return paintedBars(g, state, layout, bodyTop);
  // `g` is screen-space (milestone 32b): a bar stays level above its sprite in any layout.
  for (const enemy of state.enemies) {
    // Full hp on this level (milestone 25): Easy and Hard scale it; an
    // endless wave's enemy carries its own (milestone 26).
    const maxHp = enemy.maxHp ?? enemyMaxHp(enemy.type, state.difficulty);
    if (enemy.hp < maxHp && !isBoss(enemy)) {
      const { x, y } = layout.toScreen(enemyPosition(enemy, state.map));
      const fraction = Math.max(0, enemy.hp) / maxHp;
      const left = Math.round(x - BAR_WIDTH / 2);
      const top = Math.round(y - spriteLift(enemy.type) - spriteHalfHeight(enemy.type) - BAR_GAP - BAR_HEIGHT - 1);
      drawBar(g, left, top, fraction);
    }
  }
}
