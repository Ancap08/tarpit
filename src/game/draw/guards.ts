import type Phaser from 'phaser';
import type { GameEvent, GameState, Point } from '../../sim';
import { GUARD_COUNT } from '../../sim/blockers';
import { BAR_HEIGHT, BAR_WIDTH } from './enemies';
import type { Layout } from '../layout';
import { COLORS } from '../palette';
import type { PaintedSkin } from '../skin/painted';

type Graphics = Phaser.GameObjects.Graphics;
type Image = Phaser.GameObjects.Image;
const ORIGIN = { x: 0, y: 0 };
type Guard = Extract<GameState['blockers'][number], { kind: 'guard' }>;
type Pose = 'idle' | 'strike' | 'fall' | 'leave';
type GuardSpot = Pick<Guard, 'id' | 'x' | 'y' | 'angle'>;

export interface DrawnGuard {
  id: number;
  point: Point;
  hp: number;
  maxHp: number;
  hpBar: (Point & { width: number; height: number; fillWidth: number }) | null;
  animation: Pose;
  texture: string | null;
  frame: number | null;
}

const STRIKE_MS = 145;
const STRIKE_BEAT_MS = 410;
const FALL_MS = 410;
const LEAVE_MS = 590;
export const GUARD_ACROSS_OFFSET = 10;
export const GUARD_ALONG_OFFSET = 5;
const CLASSIC_SCALE = 1.35;

/** A stable slot for all poses, including after another guard falls. */
export function guardFoot(p: Point & { angle: number }, id: number): Point {
  const slot = id % GUARD_COUNT;
  const across = (slot % 2 === 0 ? -1 : 1) * GUARD_ACROSS_OFFSET;
  const along = GUARD_ALONG_OFFSET * (1 - 2 * slot / (GUARD_COUNT - 1));
  const dx = Math.cos(p.angle);
  const dy = Math.sin(p.angle);
  return { x: p.x + dx * along - dy * across, y: p.y + dy * along + dx * across };
}
const PALETTE = {
  edge: 0x252727, metal: 0xe3dbbd, body: 0x3c7895, shield: 0x416b96, shaft: 0xb38b59,
};

export function drawGuardsAim(g: Graphics, pointer: Point, marks: readonly Point[]): void {
  if (marks.length === 0) {
    g.lineStyle(5, COLORS.aimCrossDark).strokeCircle(pointer.x, pointer.y, 11);
    g.lineStyle(3, COLORS.cellBad).strokeCircle(pointer.x, pointer.y, 11);
    g.lineBetween(pointer.x - 7, pointer.y + 7, pointer.x + 7, pointer.y - 7);
    return;
  }
  g.lineStyle(3, COLORS.aimCrossDark).strokeCircle(pointer.x, pointer.y, 4);
  g.lineStyle(1, COLORS.dragLine).strokeCircle(pointer.x, pointer.y, 4);
  for (const p of marks) {
    g.fillStyle(COLORS.aimCrossDark, 0.9).fillCircle(p.x, p.y, 6);
    g.lineStyle(2, COLORS.cellOk).strokeCircle(p.x, p.y, 4);
    g.fillStyle(COLORS.dragLine).fillCircle(p.x, p.y, 2);
  }
}

function line(g: Graphics, x: number, y: number, toX: number, toY: number, color: number, width: number): void {
  g.lineStyle(width, color).lineBetween(x, y, toX, toY);
}

function soldier(g: Graphics, p: Point, facing: Point, pose: Pose, t: number, motion: boolean, mirror: boolean): void {
  const fall = pose === 'fall';
  const leave = pose === 'leave';
  const stride = leave && motion ? Math.sin(t * 8 * Math.PI) * 2 : 0;
  const lean = fall ? 9 * (motion ? Math.min(1, t * 2.5) : 1) : 0;
  const h = fall ? 20 - lean * 1.6 : 20;
  const x = p.x + lean;
  const y = p.y;
  g.fillStyle(PALETTE.edge, 0.28).fillEllipse(p.x, y, fall ? 29 : 20, 8);
  line(g, x - 2, y - h / 2, p.x - 4 + stride, y, PALETTE.edge, 4);
  line(g, x + 2, y - h / 2, p.x + 4 - stride, y, PALETTE.edge, 4);
  g.fillStyle(PALETTE.edge).fillEllipse(x, y - h * 0.57, 15, 16);
  g.fillStyle(PALETTE.body).fillEllipse(x, y - h * 0.58, 12, 13);
  g.fillStyle(PALETTE.edge).fillCircle(x, y - h, 6);
  g.fillStyle(PALETTE.metal).fillCircle(x + 0.9 * facing.x, y - h - 1, 4.5);
  g.fillStyle(0xb83d38).fillEllipse(x, y - h - 5, 4, 5);
  line(g, x - 4, y - h + 1, x + 4, y - h + 1, PALETTE.edge, 2);
  const side = Math.abs(facing.x) < 0.25 ? (mirror ? -1 : 1) : Math.sign(facing.x);
  const reach = pose === 'strike' ? 8 : 0;
  const sx = x + side * 7;
  const sy = y - h * 0.6;
  const tipX = sx + facing.x * (13 + reach);
  const tipY = sy + facing.y * (11 + reach) - (leave && t < 0.27 ? 13 : 5);
  if (!fall) {
    line(g, sx - facing.x * 8, sy - facing.y * 6 + 4, tipX, tipY, PALETTE.edge, 4);
    line(g, sx - facing.x * 8, sy - facing.y * 6 + 4, tipX, tipY, PALETTE.shaft, 2);
    const angle = Math.atan2(tipY - sy, tipX - sx);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    g.fillStyle(PALETTE.metal).fillTriangle(tipX + 3 * dx, tipY + 3 * dy,
      tipX - 2 * dx - 2.5 * dy, tipY - 2 * dy + 2.5 * dx,
      tipX - 2 * dx + 2.5 * dy, tipY - 2 * dy - 2.5 * dx);
  }
  const shieldX = x - 6 * side;
  g.fillStyle(PALETTE.edge).fillEllipse(shieldX, sy + 2, 11, 14);
  g.fillStyle(PALETTE.shield).fillEllipse(shieldX, sy + 2, 8, 11);
  g.fillStyle(PALETTE.metal).fillCircle(shieldX, sy + 1, 2);
}

/** Live guards hold their formation. Only departing figures walk out of their slot. */
export class GuardEffects {
  private age = 0;
  private readonly strikes = new Map<number, number>();
  private readonly departing = new Map<number, { guard: GuardSpot; pose: 'fall' | 'leave'; start: number }>();
  private readonly bodies = new Map<number, Graphics | Image>();
  private drawn: DrawnGuard[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: Layout,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly painted?: PaintedSkin,
  ) {}

  advance(ms: number): void {
    this.age += ms;
    for (const [id, at] of this.strikes) if (this.age - at >= STRIKE_BEAT_MS) this.strikes.delete(id);
    for (const [id, cue] of this.departing) {
      if (this.age - cue.start < (cue.pose === 'fall' ? FALL_MS : LEAVE_MS)) continue;
      this.departing.delete(id);
    }
  }

  onEvents(events: readonly GameEvent[]): void {
    for (const event of events) {
      if (event.kind === 'guardStrike') {
        // Damage ticks are constant during contact. Use short beats for the pose.
        if (!this.strikes.has(event.guardId)) this.strikes.set(event.guardId, this.age);
      } else if (event.kind === 'guardDown') {
        this.strikes.delete(event.guardId);
        this.departing.set(event.guardId, { guard: { ...event, id: event.guardId }, pose: 'fall', start: this.age });
      } else if (event.kind === 'squadGone' && event.reason !== 'destroyed') {
        for (const guard of event.guards) {
          this.strikes.delete(guard.id);
          this.departing.set(guard.id, { guard, pose: 'leave', start: this.age });
        }
      }
    }
  }

  snapshot(): DrawnGuard[] {
    return this.drawn;
  }

  draw(bars: Graphics, state: GameState, motion: boolean): void {
    this.drawn = [];
    for (const blocker of state.blockers) {
      if (blocker.kind !== 'guard') continue;
      const pose = motion && this.age - (this.strikes.get(blocker.id) ?? -Infinity) < STRIKE_MS ? 'strike' : 'idle';
      this.drawOne(bars, blocker, pose, 0, motion, blocker);
    }
    for (const { guard, pose, start } of this.departing.values()) {
      const t = (this.age - start) / (pose === 'fall' ? FALL_MS : LEAVE_MS);
      this.drawOne(bars, guard, pose, t, motion);
    }
    for (const [id, object] of this.bodies) {
      if (this.drawn.some(guard => guard.id === id)) continue;
      object.destroy();
      this.bodies.delete(id);
    }
  }

  private drawOne(bars: Graphics, guard: GuardSpot, pose: Pose, t: number, motion: boolean, live?: Guard): void {
    // The path tangent points downstream. Reverse it for idle/strike; depart downstream.
    const salute = pose === 'leave' && (!motion || t < 0.27);
    const sign = pose === 'leave' && !salute ? 1 : -1;
    const facing = this.layout.screenDir(sign * Math.cos(guard.angle), sign * Math.sin(guard.angle));
    const p = this.layout.toScreen(guardFoot(guard, guard.id));
    const walk = pose === 'leave' && motion ? 30 * Math.max(0, (t - 0.27) / 0.73) : 0;
    const at = { x: p.x + walk * facing.x, y: p.y + walk * facing.y };
    const alpha = live ? 1 : motion ? Math.min(1, 2 * (1 - t)) : 0.7;
    let obj = this.bodies.get(guard.id);
    if (!obj) {
      obj = this.painted ? this.painted.image('guard') : this.scene.add.graphics().setScale(CLASSIC_SCALE);
      this.layer.add(obj);
      this.bodies.set(guard.id, obj);
    }
    obj.setPosition(at.x, at.y).setDepth(at.y).setAlpha(alpha);
    let texture: string | null = null;
    let frame: number | null = null;
    let barLift = Math.ceil(28 * CLASSIC_SCALE) + BAR_HEIGHT + 3;
    if (this.painted) {
      const image = obj as Image;
      const bearing = (Math.round(Math.atan2(facing.x, -facing.y) / (Math.PI / 2)) + 4) % 4;
      const outfit = guard.id % GUARD_COUNT;
      this.painted.pose(image, 'guard', outfit * 8 + bearing * 2 + (pose === 'strike' || (motion && salute) ? 1 : 0));
      image.setRotation(pose === 'fall' ? (motion ? Math.min(1, t * 2.5) : 1) * 1.28 : 0);
      texture = image.texture.key;
      frame = Number(image.frame.name);
      const sheet = this.painted.sheet('guard');
      barLift = Math.ceil((sheet.anchor[1] - sheet.bodyBounds![frame][1]) / this.painted.assets.density) + BAR_HEIGHT + 3;
    } else {
      soldier((obj as Graphics).clear(), ORIGIN, facing, pose, motion ? t : 0, motion, guard.id % 2 === 0);
    }
    const point = { x: obj.x, y: obj.y };
    // Keep the bars outside both files, so a foreground bar cannot cover a rear helmet.
    const centre = this.layout.toScreen(guard);
    const vertical = Math.abs(facing.x) < Math.abs(facing.y);
    const width = BAR_WIDTH + 2;
    // Give same-side bars a visible gap on a horizontal trail.
    const barCentreX = point.x + (point.x - centre.x) / 2;
    const left = vertical ? point.x + (point.x > centre.x ? 13 : -13 - width) : barCentreX - width / 2;
    const top = vertical ? point.y - 21 : point.y > centre.y ? point.y + 5 : point.y - barLift;
    const bar = live ? {
      x: Math.max(0, Math.min(this.layout.width - width, Math.round(left))),
      y: Math.max(this.layout.map.y, Math.min(this.layout.map.y + this.layout.map.height - BAR_HEIGHT - 2, Math.round(top))),
      width, height: BAR_HEIGHT + 2, fillWidth: Math.max(1, Math.round(BAR_WIDTH * live.hp / live.maxHp)),
    } : null;
    if (bar) {
      bars.fillStyle(PALETTE.edge).fillRect(bar.x, bar.y, bar.width, bar.height);
      bars.fillStyle(COLORS.cellOk).fillRect(bar.x + 1, bar.y + 1, bar.fillWidth, BAR_HEIGHT);
    }
    this.drawn.push({ id: guard.id, point, hp: live?.hp ?? 0, maxHp: live?.maxHp ?? 0, hpBar: bar, animation: pose, texture, frame });
  }
}
