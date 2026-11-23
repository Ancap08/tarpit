// Special attack effects (milestone 25b, reworked in milestone 30 so a
// player can see a special land):
//   keg         a flash and a ring expanding to the radius (0.4 s), a short
//               map-only shake (fx/effects.ts, milestone 31) and a scorch mark fading over 2 s
//   tarBarrel   a splash ring (0.3 s), then the tar puddle of its zone
//   fireArrows  8 arrows falling into the circle (0.4 s), then the burning
//               patch of its zone
// and a small label at the spot for 1.5 s: "3 hit" or "Missed" (names.ts).
// The puddle and the patch are drawn from the simulation's zones
// (state.zones), for exactly as long as the zone works, fading over its last
// second. Effect ages count real milliseconds in play (advance(), from the
// frame time, so they last as long at 2x); in test mode they count 1000/60
// ms per simulation tick instead, so a frame after step(n) is always the
// same, and nothing fades or flickers (full strength until it ends).

import type Phaser from 'phaser';
import type { GameEvent, GameState, SpecialType, Zone } from '../../sim';
import { LANDSCAPE, type Layout } from '../layout';
import { specialResultText } from '../names';
import { COLORS, FONT, TEXT } from '../palette';

/** How long each part lasts, in ms. */
export const BLAST_MS: Readonly<Record<Exclude<SpecialType, 'barricade'>, number>> = { keg: 400, tarBarrel: 300, fireArrows: 400 };
export const SCORCH_MS = 2000;
export const LABEL_MS = 1500;
/** Ages are sums of 1000/60 in test mode: compare with this slack so 90 ticks is exactly 1.5 s. */
const EPS = 1e-6;
/** The keg's filled flash lasts this long. */
const KEG_FLASH_MS = 200;
/** Fire arrows: how many, how long each streak, how far they fall. */
const ARROWS = 8;
const ARROW_LENGTH = 12;
const ARROW_FALL = 60;
/** A zone fades out over its last 60 ticks (1 s). */
const ZONE_FADE_TICKS = 60;
/** Flame tongues drawn in a fire patch, and blobs in a tar puddle. */
const FLAMES = 12;
/** Light arcs round a tar puddle's edge. */
const SHEEN_ARCS = 9;
const BLOBS = 5;

interface Blast {
  type: Exclude<SpecialType, 'barricade'>;
  x: number;
  y: number;
  radius: number;
  ageMs: number;
}

interface Scorch {
  x: number;
  y: number;
  radius: number;
  ageMs: number;
}

interface Label {
  text: Phaser.GameObjects.Text;
  y0: number;
  ageMs: number;
}

/** A label's position and words, for tests (ui().special.labels). */
export interface SpecialLabelInfo {
  text: string;
  x: number;
  y: number;
}

/** Fixed pseudo-random numbers in [0, 1) for zone `id`'s decoration (no Math.random: frames stay the same). */
function jitter(id: number, i: number): number {
  const v = Math.sin((id + 1) * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

export class SpecialEffects {
  private blasts: Blast[] = [];
  private scorches: Scorch[] = [];
  private labels: Label[] = [];
  private timeMs = 0;

  /** `frozen` (test mode): no fading or flicker; ages still count, by simulation tick. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly frozen: boolean,
    private readonly layout: Layout = LANDSCAPE,
  ) {}

  /** A special landed: its `special` event. */
  add(e: Extract<GameEvent, { kind: 'special' }>): void {
    if (e.type === 'barricade') return;
    this.blasts.push({ type: e.type, x: e.x, y: e.y, radius: e.radius, ageMs: 0 });
    if (e.type === 'keg') this.scorches.push({ x: e.x, y: e.y, radius: e.radius * 0.7, ageMs: 0 });
    this.addLabel(e, specialResultText(e.hits), e.hits > 0);
  }

  /** A result stays upright and inside the map, including refusals near its edges. */
  addLabel(world: { x: number; y: number }, message: string, good: boolean): void {
    const p = this.layout.toScreen(world);
    const map = this.layout.map;
    const text = this.scene.add
      .text(p.x, p.y, message, {
        fontFamily: FONT,
        fontSize: '18px',
        fontStyle: 'bold',
        color: good ? TEXT.specialHit : TEXT.specialMiss,
        stroke: '#14161a',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(5);
    const half = text.width / 2 + 6;
    const y0 = Math.max(map.y + text.height + 24, p.y - 6);
    text.setPosition(Math.max(map.x + half, Math.min(map.x + map.width - half, p.x)), y0);
    this.labels.push({ text, y0, ageMs: 0 });
  }

  /** Let `ms` pass: in play once per frame with the frame time; in test mode 1000/60 per tick. */
  advance(ms: number): void {
    this.timeMs += ms;
    for (const b of this.blasts) b.ageMs += ms;
    for (const s of this.scorches) s.ageMs += ms;
    for (const l of this.labels) l.ageMs += ms;
    this.blasts = this.blasts.filter((b) => b.ageMs < BLAST_MS[b.type] - EPS);
    this.scorches = this.scorches.filter((s) => s.ageMs < SCORCH_MS - EPS);
    this.labels = this.labels.filter((l) => {
      if (l.ageMs < LABEL_MS - EPS) return true;
      l.text.destroy();
      return false;
    });
    for (const l of this.labels) {
      if (this.frozen) continue;
      const t = l.ageMs / LABEL_MS;
      l.text.setY(l.y0 - 18 * t);
      l.text.setAlpha(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    }
  }

  /** Effects still showing: blasts, scorch marks and labels (for tests). */
  get count(): number {
    return this.blasts.length + this.scorches.length + this.labels.length;
  }

  /** The labels showing now. */
  labelInfo(): SpecialLabelInfo[] {
    return this.labels.map((l) => ({ text: l.text.text, x: l.text.x, y: l.text.y }));
  }

  /** On the ground, under towers and enemies: scorch marks, then the zones. */
  drawGround(g: Phaser.GameObjects.Graphics, state: GameState): void {
    for (const s of this.scorches) {
      const a = this.frozen ? 1 : 1 - s.ageMs / SCORCH_MS;
      g.fillStyle(COLORS.scorch, 0.55 * a);
      g.fillCircle(s.x, s.y, s.radius);
      g.fillStyle(COLORS.scorch, 0.4 * a);
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3 + 0.3;
        g.fillCircle(s.x + Math.cos(ang) * s.radius * 0.9, s.y + Math.sin(ang) * s.radius * 0.9, s.radius * 0.22);
      }
    }
    for (const z of state.zones) this.drawZone(g, z);
  }

  private drawZone(g: Phaser.GameObjects.Graphics, z: Zone): void {
    const fade = Math.min(1, z.ticksLeft / ZONE_FADE_TICKS);
    if (z.type === 'tarBarrel') {
      g.fillStyle(COLORS.tarPuddle, 0.5 * fade);
      g.fillCircle(z.x, z.y, z.radius);
      g.fillStyle(COLORS.tarPuddle, 0.45 * fade);
      for (let i = 0; i < BLOBS; i++) {
        const ang = jitter(z.id, i) * Math.PI * 2;
        const r = z.radius * (0.25 + 0.5 * jitter(z.id, i + 10));
        g.fillCircle(z.x + Math.cos(ang) * r, z.y + Math.sin(ang) * r, z.radius * (0.15 + 0.1 * jitter(z.id, i + 20)));
      }
      g.lineStyle(3, COLORS.tarPuddleEdge, 0.8 * fade);
      g.strokeCircle(z.x, z.y, z.radius);
      // A wet sheen (milestone 30 follow-up): a light rim broken into uneven
      // arcs just outside the edge, and two glints inside, so the puddle
      // reads on grass and trail and does not look like the aim circle.
      g.lineStyle(2.5, COLORS.tarSheen, 0.85 * fade);
      for (let i = 0; i < SHEEN_ARCS; i++) {
        const a0 = ((i + 0.15 * jitter(z.id, i + 30)) * 2 * Math.PI) / SHEEN_ARCS;
        const a1 = a0 + ((0.45 + 0.3 * jitter(z.id, i + 40)) * 2 * Math.PI) / SHEEN_ARCS;
        g.beginPath();
        g.arc(z.x, z.y, z.radius + 2, a0, a1);
        g.strokePath();
      }
      g.lineStyle(3, COLORS.tarSheen, 0.6 * fade);
      g.beginPath();
      g.arc(z.x - z.radius * 0.25, z.y - z.radius * 0.3, z.radius * 0.35, Math.PI * 1.05, Math.PI * 1.45);
      g.strokePath();
      g.fillStyle(COLORS.tarSheen, 0.55 * fade);
      g.fillCircle(z.x + z.radius * 0.3, z.y - z.radius * 0.45, 4);
      return;
    }
    g.fillStyle(COLORS.firePatch, 0.3 * fade);
    g.fillCircle(z.x, z.y, z.radius);
    g.lineStyle(3, COLORS.fireFlame, 0.85 * fade);
    g.strokeCircle(z.x, z.y, z.radius);
    for (let i = 0; i < FLAMES; i++) {
      const ang = jitter(z.id, i) * Math.PI * 2;
      const r = z.radius * Math.sqrt(jitter(z.id, i + 10)) * 0.85;
      const x = z.x + Math.cos(ang) * r;
      const y = z.y + Math.sin(ang) * r;
      const flicker = this.frozen ? 1 : 0.75 + 0.25 * Math.sin(this.timeMs / 90 + i * 1.7);
      const h = 14 * flicker;
      g.fillStyle(i % 3 === 0 ? COLORS.fireBurstCore : COLORS.fireFlame, 0.9 * fade);
      // Flames point up the screen in any layout (milestone 32b).
      const foot = this.layout.offset({ x, y }, 0, 4);
      const [a, b, c] = [this.layout.offset(foot, -5, 0), this.layout.offset(foot, 5, 0), this.layout.offset(foot, 0, -h)];
      g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
    }
  }

  /** Above the enemies: the landing blasts. */
  draw(g: Phaser.GameObjects.Graphics): void {
    for (const f of this.blasts) {
      const life = BLAST_MS[f.type];
      const t = f.ageMs / life; // 0 when fired
      const a = this.frozen ? 1 : 1 - t;
      switch (f.type) {
        case 'keg': {
          if (f.ageMs < KEG_FLASH_MS) {
            g.fillStyle(COLORS.fireBurstCore, 0.6 * (this.frozen ? 1 : 1 - f.ageMs / KEG_FLASH_MS));
            g.fillCircle(f.x, f.y, f.radius * 0.8);
          }
          g.lineStyle(5, COLORS.specialKeg, a);
          g.strokeCircle(f.x, f.y, Math.max(4, f.radius * Math.min(1, (t + 0.1) / 0.6)));
          break;
        }
        case 'tarBarrel':
          g.lineStyle(4, COLORS.tarSplat, a);
          g.strokeCircle(f.x, f.y, f.radius * Math.min(1, 0.5 + t));
          break;
        case 'fireArrows': {
          const fall = Math.min(1, (t + 0.1) / 0.7);
          g.lineStyle(2, COLORS.arrowTracer, 1);
          for (let i = 0; i < ARROWS; i++) {
            const ang = (i * 2 * Math.PI) / ARROWS + 0.4;
            const r = f.radius * (i % 2 === 0 ? 0.6 : 0.3);
            // The arrows fall down the screen in any layout (milestone 32b).
            const head = this.layout.offset({ x: f.x + Math.cos(ang) * r, y: f.y + Math.sin(ang) * r }, 0, -ARROW_FALL * (1 - fall));
            const tail = this.layout.offset(head, -3, -ARROW_LENGTH);
            g.lineBetween(tail.x, tail.y, head.x, head.y);
          }
          break;
        }
      }
    }
  }
}
