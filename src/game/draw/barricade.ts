import type Phaser from 'phaser';
import { isFlying, positionAlongPath, type GameEvent, type GameState, type Point } from '../../sim';
import { knockPx } from '../fx/fxMath';
import { fontPx, type Layout } from '../layout';
import { heldCountText } from '../names';
import { COLORS, FONT, TEXT } from '../palette';
import { RING_RADIUS, spriteLift } from './enemies';
import { PATH_WIDTH } from './map';

const WOOD = 0x986338;
const LIGHT_WOOD = 0xe2b779;
const DARK_WOOD = 0x42291c;
const IRON = 0x343438;
const BOLT = 0xd9d2b8;
export const HELD_DRAW_CAP = 36;
const CROWD_COLUMNS = [0, -16, 16];
const HALF_WIDTH = PATH_WIDTH / 2 + 3;
const HIT_MS = 180;
const CRASH_MS = 520;
const ATTACK_BEAT_MS = 480;

type Spot = Point & { angle: number };
type Break = Extract<GameEvent, { kind: 'blockerBreak' }>;
type BlockerView = Spot & { hp: number; maxHp: number };
export type BlockedPosition = Point & { distance: number; lunge: number; depth: number };
export type BlockedPositions = ReadonlyMap<number, BlockedPosition>;

function acrossBarricade(p: Spot, side: number, along = 0): Point {
  const dx = Math.cos(p.angle);
  const dy = Math.sin(p.angle);
  return { x: p.x - dy * side + dx * along, y: p.y + dx * side + dy * along };
}

function beam(g: Phaser.GameObjects.Graphics, a: Point, b: Point, width: number, color: number, alpha = 1): void {
  g.lineStyle(width, color, alpha).lineBetween(a.x, a.y, b.x, b.y);
}

export function drawBarricadeAim(g: Phaser.GameObjects.Graphics, pointer: Point, valid: Spot | null): void {
  if (valid) {
    if (Math.hypot(valid.x - pointer.x, valid.y - pointer.y) > 7) {
      beam(g, pointer, valid, 4, COLORS.aimCrossDark, 0.65);
      beam(g, pointer, valid, 2, COLORS.dragLine, 0.85);
    }
    g.lineStyle(4, COLORS.aimCrossDark, 0.75).strokeCircle(pointer.x, pointer.y, 7);
    g.lineStyle(2, COLORS.dragLine, 0.9).strokeCircle(pointer.x, pointer.y, 7);
    const a = acrossBarricade(valid, -HALF_WIDTH);
    const b = acrossBarricade(valid, HALF_WIDTH);
    beam(g, a, b, 10, COLORS.aimCrossDark);
    beam(g, a, b, 6, COLORS.cellOk);
    g.fillStyle(COLORS.dragLine).fillCircle(a.x, a.y, 4).fillCircle(b.x, b.y, 4);
  } else {
    g.lineStyle(6, COLORS.aimCrossDark).strokeCircle(pointer.x, pointer.y, 11);
    g.lineStyle(3, COLORS.cellBad).strokeCircle(pointer.x, pointer.y, 11);
    beam(g, { x: pointer.x - 7, y: pointer.y + 7 }, { x: pointer.x + 7, y: pointer.y - 7 }, 3, COLORS.cellBad);
  }
}

export class BarricadeEffects {
  private readonly count: Phaser.GameObjects.Text;
  private age = 0;
  private hitAt = -Infinity;
  private strikes = new Map<number, number>();
  private broken: { at: number; spot: Break } | null = null;

  constructor(scene: Phaser.Scene, private readonly layout: Layout) {
    this.count = scene.add.text(0, 0, '', {
      fontFamily: FONT, fontStyle: 'bold', fontSize: fontPx(layout, 14),
      color: TEXT.towerLabel, backgroundColor: TEXT.towerLabelBg, padding: { x: 3, y: 1 },
    }).setOrigin(0, 0.5).setVisible(false);
  }

  advance(ms: number): void {
    this.age += ms;
    for (const [id, at] of this.strikes) if (this.age - at >= HIT_MS) this.strikes.delete(id);
    if (this.broken && this.age - this.broken.at >= CRASH_MS) this.broken = null;
  }

  onEvents(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.kind === 'special' && e.type === 'barricade') {
        this.hitAt = -Infinity;
        this.strikes.clear();
      } else if (e.kind === 'blockerHit') {
        this.hitAt = this.age;
        this.strikes.set(e.enemyId, this.age);
      } else if (e.kind === 'blockerBreak') {
        this.broken = { at: this.age, spot: e };
      }
    }
  }

  /** Render anchors for stopped walkers. All combat still uses their simulation coordinates. */
  stoppedPositions(state: GameState, motion: boolean): BlockedPositions | undefined {
    const wall = state.blocker;
    if (!wall) return undefined;
    const stopped = new Map<number, BlockedPosition>();
    const held = state.enemies.filter(e => !isFlying(e) && e.distance === wall.distance);
    held.sort((a, b) => RING_RADIUS[b.type] - RING_RADIUS[a.type]);
    const wallY = this.layout.toScreen(wall).y;
    for (const [i, enemy] of held.entries()) {
      // Fill the three front places first. Extra walkers share the rear rank.
      const side = CROWD_COLUMNS[i % CROWD_COLUMNS.length];
      const lunge = motion ? 7 * this.strike(enemy.id) : 0;
      const distance = wall.distance - (i < CROWD_COLUMNS.length ? 12 : 28) + lunge;
      const rank = positionAlongPath(state.map, distance);
      const angle = Math.atan2(wall.y - rank.y, wall.x - rank.x);
      const foot = acrossBarricade({ ...rank, angle }, side);
      // Bound the visible centre, including boss lift and room for hit recoil.
      // Portrait rotates world offsets without changing their length.
      const lift = spriteLift(enemy.type);
      const roomForLift = HELD_DRAW_CAP - knockPx(enemy.type) - Math.hypot(foot.x - wall.x, foot.y - wall.y);
      const anchor = this.layout.offset(foot, 0, Math.max(0, lift - roomForLift));
      stopped.set(enemy.id, { ...anchor, distance, lunge, depth: wallY + RING_RADIUS[enemy.type] });
    }
    return stopped;
  }

  private strike(id: number): number {
    if (!this.strikes.has(id)) return 0;
    return this.hitPulse(id * 87);
  }

  wallShake(motion: boolean): number {
    if (!motion || this.age - this.hitAt >= HIT_MS) return 0;
    const pulse = this.hitPulse(0);
    return 3 * pulse * Math.cos(this.age / 14);
  }

  private hitPulse(offset: number): number {
    const phase = ((this.age + offset) % ATTACK_BEAT_MS) / HIT_MS;
    return phase < 1 ? Math.sin(Math.PI * phase) : 0;
  }

  get crash(): Point | null {
    return this.broken?.spot ?? null;
  }

  drawWall(g: Phaser.GameObjects.Graphics, wall: BlockerView, layout: Layout, motion: boolean): void {
    const p = layout.offset(wall, this.wallShake(motion), 0);
    const left = acrossBarricade({ ...p, angle: wall.angle }, -HALF_WIDTH);
    const right = acrossBarricade({ ...p, angle: wall.angle }, HALF_WIDTH);
    beam(g, left, right, 13, DARK_WOOD, 0.48);
    for (const y of [-6, -14]) {
      const a = layout.offset(left, 0, y);
      const b = layout.offset(right, 0, y);
      beam(g, a, b, 9, DARK_WOOD);
      beam(g, a, b, 6, WOOD);
      beam(g, layout.offset(a, 0, -2), layout.offset(b, 0, -2), 2, LIGHT_WOOD);
    }
    for (const side of [-1, 1]) {
      for (const along of [-4, 4]) {
        const foot = acrossBarricade({ ...p, angle: wall.angle }, side * (HALF_WIDTH - 5), along);
        const top = layout.offset(foot, -side * 2, -20);
        beam(g, foot, top, 9, DARK_WOOD);
        beam(g, foot, top, 6, LIGHT_WOOD);
        const strap = layout.offset(top, side, 9);
        beam(g, layout.offset(strap, -4, 0), layout.offset(strap, 4, 0), 4, IRON);
        g.fillStyle(BOLT).fillCircle(strap.x, strap.y, 1.2);
      }
    }
    if (this.age - this.hitAt < HIT_MS && (!motion || this.hitPulse(0) > 0.5)) {
      const spark = layout.offset(p, 0, -11);
      g.fillStyle(LIGHT_WOOD).fillCircle(spark.x, spark.y, 4);
    }
  }

  drawHp(g: Phaser.GameObjects.Graphics, wall: BlockerView | null, layout: Layout, held: number): void {
    this.count.setVisible(held > 3 && wall !== null);
    if (!wall) return;
    if (this.count.visible) this.count.setText(heldCountText(held));
    const { x, y } = layout.toScreen(wall);
    const width = 42;
    const badgeWidth = this.count.visible ? this.count.width + 4 : 0;
    const totalWidth = width + badgeWidth;
    const along = layout.screenDir(Math.cos(wall.angle), Math.sin(wall.angle));
    const vertical = Math.abs(along.y) > Math.abs(along.x);
    const mapLeft = layout.map.x + 4;
    const mapRight = layout.map.x + layout.map.width - totalWidth - 4;
    // Along a horizontal stretch, extend the count toward the exit so the
    // badge stays clear of the crowd.
    const placeLeft = vertical ? x - 28 - totalWidth >= mapLeft : along.x < 0;
    const side = placeLeft ? -1 : 1;
    const offset = vertical ? 28 : -width / 2;
    const ideal = placeLeft ? x - offset - totalWidth : x + offset;
    const groupLeft = Math.max(mapLeft, Math.min(mapRight, ideal));
    const left = groupLeft + (placeLeft ? badgeWidth : 0);
    const margin = this.count.visible ? this.count.height / 2 : 4;
    const top = Math.max(layout.map.y + margin, y - (vertical ? 20 : 46));
    if (this.count.visible) this.count.setPosition(placeLeft ? groupLeft : left + width + 4, top + 3);
    if (vertical) {
      const edge = x + side * (HALF_WIDTH - 2);
      beam(g, { x: edge, y: y - 12 }, { x: side < 0 ? left + width : left, y: top + 3 }, 2, DARK_WOOD);
    }
    const fill = Math.max(0, wall.hp / wall.maxHp);
    g.fillStyle(DARK_WOOD).fillRoundedRect(left - 2, top - 2, width + 4, 10, 3);
    g.fillStyle(IRON).fillRect(left, top, width, 6);
    g.fillStyle(fill <= 1 / 3 ? COLORS.cellBad : COLORS.cellOk).fillRect(left, top, width * fill, 6);
  }

  drawCrash(g: Phaser.GameObjects.Graphics, layout: Layout, motion: boolean): void {
    if (!this.broken) return;
    const { at, spot } = this.broken;
    const t = motion ? (this.age - at) / CRASH_MS : 0.35;
    const alpha = motion ? 1 - t : 1;
    for (let i = 0; i < 7; i++) {
      const side = i - 3;
      const p = acrossBarricade(spot, side * (5 + 9 * t), (i % 2 === 0 ? -1 : 1) * (3 + 18 * t));
      const a = layout.offset(p, 0, -22 * Math.sin(t * Math.PI));
      const b = layout.offset(a, 7 - side, side * 2 + 2);
      beam(g, a, b, 7, DARK_WOOD, alpha);
      beam(g, a, b, 4, LIGHT_WOOD, alpha);
    }
    for (const side of [-1, 1]) {
      const puff = acrossBarricade(spot, side * (9 + 18 * t));
      g.fillStyle(LIGHT_WOOD, 0.35 * alpha).fillCircle(puff.x, puff.y, 9 + 12 * t);
    }
  }
}
