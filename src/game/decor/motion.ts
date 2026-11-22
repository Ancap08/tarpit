// Milestone 34: where the map's moving things are at time t (ms). Pure and
// Phaser-free. The living map (decor/livingMap.ts) asks these with the
// scene clock in play, and with t = 0 (STILL_T) in test mode and under
// reduced motion, so those frames never change.

import type { MapDef, Point, Rect } from '../../sim';
import { hash01, seedOf } from './recipe';

/** The fixed frame shown in test mode and under reduced motion. */
export const STILL_T = 0;

/** Counts of the moving things (pooled; never more). */
export const MOTION_COUNTS = { clouds: 2, smokePuffs: 4, flowLines: 9, glints: 3, birds: 1, butterflies: 1, eyes: 2, puffs: 4 } as const;

/** Tree tops and swaying tufts: an offset of at most 1.5 px on a slow cycle, in 0.5 px steps. */
export function sway(t: number, phase: number): number {
  return Math.round(3 * Math.sin((t / 3400) * Math.PI * 2 + phase)) / 2;
}

/** Cloud shadow size (texture px) and drift speed (px per second, world +x). */
export const CLOUD = { w: 300, h: 180, speed: 6 } as const;

/** Cloud `i`'s centre on the world map at time t: drifting +x, wrapping round. */
export function cloudAt(map: MapDef, i: number, t: number): Point {
  const seed = seedOf(map.id);
  const span = map.width + CLOUD.w * 2;
  const x0 = hash01(seed, 9001, i) * span + i * (span / MOTION_COUNTS.clouds);
  const x = ((((x0 + (t / 1000) * CLOUD.speed * (0.8 + 0.2 * i)) % span) + span) % span) - CLOUD.w;
  const y = 60 + hash01(seed, 9002, i) * (map.height - 120);
  return { x, y };
}

/** Chimney smoke: puff i's rise (0..1 of its life), screen offset and look. */
export function smokePuff(i: number, t: number): { dx: number; dy: number; scale: number; alpha: number } {
  const period = 4800;
  const p = (((t + (i * period) / MOTION_COUNTS.smokePuffs) % period) + period) % period / period;
  return { dx: 5 * p + Math.sin(p * 5 + i) * 1.5, dy: -26 * p, scale: 0.45 + p * 0.9, alpha: 0.4 * (1 - p) * Math.min(1, p * 6) };
}

/** River flow line i: a short stroke drifting downstream (+y) at 16 px/s inside the box. */
export function flowLine(box: Rect, i: number, t: number): { x: number; y: number; len: number; alpha: number } {
  const n = MOTION_COUNTS.flowLines;
  const x = box.x + 18 + ((i * 37) % (box.width - 46));
  const span = box.height - 24 - 18;
  const y0 = (i / n) * span + ((i * 53) % 29);
  const y = box.y + 12 + ((((y0 + (t / 1000) * 16) % span) + span) % span);
  const edge = Math.min(y - box.y - 12, box.y + 12 + span - y);
  return { x, y, len: 12 + (i % 3) * 3, alpha: Math.max(0, Math.min(1, edge / 30)) * 0.55 };
}

/** River glint i: a small bright dot shown 600 ms of every 3.6 s cycle, at a new spot each cycle. */
export function glint(map: MapDef, box: Rect, i: number, t: number): { x: number; y: number; alpha: number } | null {
  const period = 3600;
  const shifted = t + i * 1300;
  const cycle = Math.floor(shifted / period);
  const into = shifted - cycle * period;
  if (into > 600) return null;
  const seed = seedOf(map.id);
  return {
    x: box.x + 10 + hash01(seed, 9101, cycle, i) * (box.width - 20),
    y: box.y + 14 + hash01(seed, 9102, cycle, i) * (box.height - 28),
    alpha: 0.8 * Math.sin((into / 600) * Math.PI),
  };
}

/** The cave's eyes are shut (a blink) at time t. Open at t = 0. */
export function blinking(t: number): boolean {
  return (t + 2000) % 5300 < 150 || (t + 4000) % 12100 < 140;
}

/** The bird: crosses the map high in 7 s, once every 23 s (not at t = 0). World point and wing phase, or null. */
export function birdAt(map: MapDef, t: number): { x: number; y: number; flap: number } | null {
  const period = 23000;
  const shifted = t - 9000;
  if (shifted < 0) return null;
  const cycle = Math.floor(shifted / period);
  const into = shifted - cycle * period;
  if (into > 7000) return null;
  const seed = seedOf(map.id);
  const p = into / 7000;
  const y0 = 40 + hash01(seed, 9201, cycle) * (map.height - 80);
  const y1 = 40 + hash01(seed, 9202, cycle) * (map.height - 80);
  const ltr = hash01(seed, 9203, cycle) < 0.5;
  const x = ltr ? -20 + p * (map.width + 40) : map.width + 20 - p * (map.width + 40);
  return { x, y: y0 + (y1 - y0) * p + Math.sin(p * Math.PI) * -20, flap: Math.sin(into / 110) };
}

/** The butterfly: flutters near a flower bed for 7 s, once every 17 s (not at t = 0). World point and wing phase, or null. */
export function butterflyAt(map: MapDef, beds: readonly Point[], t: number): { x: number; y: number; flap: number; alpha: number } | null {
  if (beds.length === 0) return null;
  const period = 17000;
  const shifted = t - 5000;
  if (shifted < 0) return null;
  const cycle = Math.floor(shifted / period);
  const into = shifted - cycle * period;
  if (into > 7000) return null;
  const bed = beds[Math.floor(hash01(seedOf(map.id), 9301, cycle) * beds.length)];
  const s = into / 1000;
  return {
    x: bed.x + Math.sin(s * 1.3 + cycle) * 14 + Math.sin(s * 3.1) * 3,
    y: bed.y + Math.sin(s * 1.9 + cycle * 2) * 9,
    flap: Math.abs(Math.sin(into / 70)),
    alpha: Math.min(1, into / 500, (7000 - into) / 500),
  };
}

/** A build puff over a hidden growth: 450 ms, its rings' radius and alpha, or null when over. */
export const PUFF_MS = 450;
export function puffLook(age: number): { r: number; alpha: number } | null {
  if (age < 0 || age > PUFF_MS) return null;
  const p = age / PUFF_MS;
  return { r: 6 + p * 12, alpha: 0.5 * (1 - p) };
}
