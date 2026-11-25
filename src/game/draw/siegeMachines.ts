import type Phaser from 'phaser';
import type { Point } from '../../sim';
import { RAM_FIRST_SLAM_MS, RAM_SLAM_MS, REPAIR_STRIKES_MS } from '../keep/siegeTiming';

export const SIEGE_MACHINE_KEY = 'keep:siege-machines';
export const SIEGE_MACHINE_FRAMES = ['ram0', 'ram1', 'ram2', 'ram3', 'notice', 'repair0', 'repair1', 'debris'] as const;
const RAM_FRAMES = SIEGE_MACHINE_FRAMES.slice(0, 4);
export const BARBICAN_SIZE = { width: 224, height: 174, sillY: 174 * 116 / 140 };
export const RAM_ORIGIN_Y = .84;
export const RAM_SIZE = { width: 88, height: 88 * 2 / 3 };
export const NOTICE_WIDTH = 34;

export interface GateMoment {
  type: 'damage' | 'repair' | 'fall';
  elapsedMs: number;
}

const DAMAGE_MS = 540;
const REPAIR_MS = 1050;
const FALL_MS = 980;
const SHUDDER_MS = 260;
const LEAF_MS = 570;

export function gateMomentDuration(type: GateMoment['type']): number {
  switch (type) {
    case 'damage': return DAMAGE_MS;
    case 'repair': return REPAIR_MS;
    case 'fall': return FALL_MS;
  }
}

/** The sill stays fixed in the rules. The stonework only rocks on impact. */
export function updateGatePose(image: Phaser.GameObjects.Image, moment: GateMoment | undefined, reduced: boolean): void {
  if (reduced || !moment || moment.type === 'repair' || moment.elapsedMs >= SHUDDER_MS) {
    image.setRotation(0);
    return;
  }
  const t = moment.elapsedMs / SHUDDER_MS;
  const rock = Math.sin(t * Math.PI * 6) * (1 - t);
  const strength = moment.type === 'fall' ? 1.8 : 1;
  image.setPosition(image.x + 3.5 * rock * strength, image.y);
  image.setRotation(.017 * rock * strength);
}

interface GateTile {
  frame: 'repair0' | 'repair1' | 'debris';
  x: number;
  y: number;
  width: number;
  height: number;
  originY: number;
  angle: number;
  alpha: number;
}

function repairStrike(elapsedMs: number): number {
  for (let i = REPAIR_STRIKES_MS.length - 1; i >= 0; i--) {
    if (elapsedMs >= REPAIR_STRIKES_MS[i]) return elapsedMs - REPAIR_STRIKES_MS[i];
  }
  return Infinity;
}

/** One sprite suffices for either the crew or the broken leaf, above the gate plate. */
export function gateMomentTile(sill: Point, moment: GateMoment, reduced: boolean): GateTile | undefined {
  const elapsed = moment.elapsedMs;
  if (moment.type === 'repair' && elapsed < REPAIR_MS) {
    return {
      frame: reduced || repairStrike(elapsed) <= 112 ? 'repair0' : 'repair1',
      x: sill.x, y: sill.y + 3, width: 106, height: 106 * 2 / 3, originY: .89,
      angle: 0, alpha: reduced ? 1 : Math.min(1, (REPAIR_MS - elapsed) / 180),
    };
  }
  if (moment.type === 'fall' && !reduced && elapsed < LEAF_MS) {
    const t = elapsed / LEAF_MS;
    return {
      frame: 'debris',
      x: sill.x + t * 11, y: sill.y - 8 + t * t * 25,
      width: 112, height: 112 * 2 / 3 * (1 - .68 * t * t), originY: .76,
      angle: .23 * t, alpha: Math.min(1, (1 - t) * 3.8),
    };
  }
}

/** Small, deterministic dust and plank chips ride the same pausable clock. */
export function drawGateMoment(g: Phaser.GameObjects.Graphics, sill: Point, moment: GateMoment, reduced: boolean): void {
  if (reduced) return;
  const { x, y } = sill;
  const elapsed = moment.elapsedMs;
  if (moment.type === 'repair') {
    const strike = repairStrike(elapsed);
    if (strike > 142) return;
    const t = strike / 142;
    g.fillStyle(0xfbd698, (1 - t) * .85);
    for (let i = 0; i < 5; i++) {
      const angle = .28 + i * 1.18;
      const px = x + Math.cos(angle) * t * 15;
      const py = y - 20 + Math.sin(angle) * t * 10;
      g.fillCircle(px, py, 1.85 - t);
    }
    return;
  }
  const fell = moment.type === 'fall';
  const t = elapsed / gateMomentDuration(moment.type);
  if (t >= 1) return;
  const strength = fell ? 1 : .62;
  // The leaves topple first; the heaviest dust rolls outward along the sill.
  const clouds = fell ? 10 : 7;
  for (let i = 0; i < clouds; i++) {
    const travel = Math.max(0, t - (i % 3) * .07);
    const side = i % 2 === 0 ? -1 : 1;
    const px = x + side * (9 + i * 2 + travel * 66) * strength;
    const py = y + 2 - travel * (10 + i * 2.4) * strength;
    const radius = (6 + travel * 15 + (i % 3) * 2.5) * strength;
    const alpha = Math.sin(Math.PI * Math.min(1, travel * 1.42)) * .38 * strength;
    g.fillStyle(i % 3 === 0 ? 0xecce9f : 0xa8927b, alpha)
      .fillEllipse(px, py, radius * 2.5, radius * 1.55);
  }
  const debris = fell ? 8 : 4;
  for (let i = 0; i < debris; i++) {
    const flight = (elapsed - i * 16) / (fell ? 660 : 330);
    if (flight < 0 || flight >= 1) continue;
    const side = i % 2 === 0 ? -1 : 1;
    const px = x + side * (4 + i * 2.6 + flight * (19 + i * 4));
    const py = y - 12 - Math.sin(Math.PI * flight) * (8 + i * 3) + flight * 17;
    g.fillStyle(i % 2 === 0 ? 0xb88b69 : 0xf1c789, 1 - flight)
      .fillTriangle(px - 3, py, px + 4, py - 2.5, px + 2, py + 2.1);
  }
}

interface RamPoseInput {
  contactAgeMs?: number;
  distance: number;
  still: boolean;
  scale: number;
  /** Unit direction toward the gate in screen space. */
  approach: Point;
}

interface RamPose {
  frame: string;
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
}

/** Distance spins the wheels even in reverse. The thrust follows the knock's beat. */
export function ramPose({ contactAgeMs, distance, still, scale, approach }: RamPoseInput): RamPose {
  const frame = RAM_FRAMES[still ? 0 : Math.floor(Math.max(0, distance) / 5) % RAM_FRAMES.length];
  if (still || contactAgeMs === undefined) return { frame, dx: 0, dy: 0, scaleX: scale, scaleY: scale };
  const sinceFirst = contactAgeMs - RAM_FIRST_SLAM_MS;
  const sinceImpact = sinceFirst < 0 ? sinceFirst : sinceFirst % RAM_SLAM_MS;
  // Start the next windup before the modulo wraps at the next knock.
  const phase = sinceImpact > RAM_SLAM_MS - 260 ? sinceImpact - RAM_SLAM_MS : sinceImpact;
  const windup = phase < -105 && phase >= -260 ? -8 * Math.sin(Math.PI * .5 * (1 + (phase + 105) / 155)) : 0;
  const thrust = phase >= -105 && phase < 0 ? -8 + 20 * (1 + phase / 105) ** 2 : 0;
  const rebound = phase >= 0 && phase < 155 ? 12 * (1 - phase / 155) ** 2 : 0;
  const contact = phase >= 0 && phase < 125 ? 1 - phase / 125 : 0;
  const travel = windup + thrust + rebound;
  return {
    frame, dx: approach.x * travel, dy: approach.y * travel,
    scaleX: scale * (1 + .08 * contact), scaleY: scale * (1 - .12 * contact),
  };
}
