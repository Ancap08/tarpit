import type Phaser from 'phaser';
import { isFlying, pathLength, trailPointAt, type GameState, type Point } from '../../sim';
import type { Layout } from '../layout';
import { INK_KEY, type ObjectInk } from './battleArt';

export const MARK_CAP = 64;
export const WEAR_BINS = 40;
type Stamp = 'coin' | 'hat' | 'page' | 'crater' | 'ash' | 'arrow' | 'skid';
interface Mark {
  kind: Stamp;
  start: Point;
  end: Point;
  born: number;
  lift: number;
  duration: number;
  turn: number;
}

// This data lives as long as its game, including during a portrait relayout.
// No Phaser objects, clocks, enemy IDs, or scene references survive a new game.
export class FieldMemory {
  readonly marks: Mark[] = [];
  readonly traffic = new Uint8Array(WEAR_BINS);
  revision = 0;
  private next = 0;
  add(mark: Mark): void {
    this.marks[this.next] = mark;
    this.next = (this.next + 1) % MARK_CAP;
    this.revision++;
  }
  tread(bin: number): void {
    if (bin >= 0 && bin < WEAR_BINS && this.traffic[bin] < 18) this.traffic[bin]++;
  }
}
const fields = new WeakMap<GameState, FieldMemory>();
export function memoryFor(state: GameState): FieldMemory {
  let field = fields.get(state);
  if (!field) {
    field = new FieldMemory();
    fields.set(state, field);
  }
  return field;
}

export class BattleField {
  private state?: GameState;
  private memory = new FieldMemory();
  private readonly marks: Phaser.GameObjects.Image[] = [];
  private readonly wear: Phaser.GameObjects.Image[] = [];
  private lastTick = -1;
  private length = 1;
  private lastRevision = -1;
  private animateUntil = 0;
  private detail = -1;

  constructor(private readonly scene: Phaser.Scene, private readonly layout: Layout, private readonly layer: Phaser.GameObjects.Layer) {}

  private attach(state: GameState): void {
    if (this.state === state) return;
    this.state = state;
    this.memory = memoryFor(state);
    this.length = pathLength(state.map);
    this.lastRevision = -1;
    this.lastTick = -1;
  }

  stamp(kind: Stamp, screen: Point, calm: boolean, seed: number, victory = false): void {
    const toss = kind === 'hat' || kind === 'coin' || kind === 'page';
    const side = seed % 2 ? -1 : 1;
    const drift = toss ? side * (8 + seed % 13) : 0;
    const m = this.layout.map;
    const end = {
      x: Math.max(m.x + 5, Math.min(m.x + m.width - 5, screen.x + drift)),
      y: Math.max(m.y + 6, Math.min(m.y + m.height - 4, screen.y + (toss ? 4 + seed % 6 : 0))),
    };
    const born = this.scene.game.loop.now;
    const duration = toss && !calm ? (victory ? 1200 : 480 + seed % 170) : 0;
    this.memory.add({
      kind, start: this.layout.toWorld(screen), end: this.layout.toWorld(end), born,
      duration, lift: 12 + seed % 9, turn: (toss ? 0.65 : 0.25) * side * ((seed % 9) / 8)
    });
    this.animateUntil = Math.max(this.animateUntil, born + duration);
  }

  draw(state: GameState, tier: number, calm: boolean, placing: boolean): void {
    this.attach(state);
    const now = this.scene.game.loop.now;
    if (this.detail !== tier || this.memory.revision !== this.lastRevision || this.animateUntil > 0) {
      for (let i = 0; i < this.memory.marks.length; ++i) {
        const mark = this.memory.marks[i];
        const visible = tier === 2 || i % (tier === 1 ? 2 : 3) === 0;
        if (!visible) {
          this.marks[i]?.setVisible(false);
          continue;
        }
        const image = this.marks[i] ??= this.image(mark.kind);
        const end = this.layout.toScreen(mark.end);
        let x = end.x, y = end.y, angle = mark.turn;
        if (!calm && mark.duration > 0 && now < mark.born + mark.duration) {
          const u = Math.max(0, (now - mark.born) / mark.duration);
          const start = this.layout.toScreen(mark.start);
          x = start.x + (end.x - start.x) * u;
          y = start.y + (end.y - start.y) * u - 4 * u * (1 - u) * mark.lift;
          angle += Math.PI * 2 * (1 - u) * (mark.turn < 0 ? -1 : 1);
        }
        if (image.frame.name !== mark.kind) image.setFrame(mark.kind);
        image.setPosition(x, y).setRotation(angle).setAlpha(mark.kind === 'skid' ? 0.65 : 0.9).setVisible(true);
      }
      this.lastRevision = this.memory.revision;
      this.detail = tier;
      if (now >= this.animateUntil) this.animateUntil = 0;
    }
    if (this.lastTick < 0 || state.tick - this.lastTick >= 12) {
      // Sample occupied stretches, even on a crowded bend. A stopped column
      // darkens only its own stretch and every counter saturates.
      const updateTraffic = this.lastTick >= 0;
      this.lastTick = state.tick;
      if (updateTraffic) {
        for (const e of state.enemies) {
          if (!isFlying(e)) this.memory.tread(Math.floor(e.distance / this.length * WEAR_BINS));
        }
      }
      for (let i = 0; i < WEAR_BINS; i++) {
        const amount = this.memory.traffic[i];
        if (!amount) continue;
        let image = this.wear[i];
        if (!image) {
          const p = trailPointAt(state.map, this.length * (i + 0.5) / WEAR_BINS);
          const offset = ((i % 2) * 2 - 1) * 10;
          const screen = this.layout.toScreen({ x: p.x - Math.sin(p.angle) * offset, y: p.y + Math.cos(p.angle) * offset });
          image = this.image('wear')
            .setPosition(screen.x, screen.y)
            .setRotation(p.angle + (this.layout.turned ? Math.PI / 2 : 0));
          this.wear[i] = image;
        }
        image.setAlpha(0.06 + amount / 18 * 0.39);
      }
    }
    this.layer.setAlpha(placing ? .34 : 1);
  }

  private image(kind: ObjectInk) {
    const img = this.scene.add.image(0, 0, INK_KEY, kind).setScale(0.5);
    this.layer.add(img);
    return img;
  }
  snapshot() {
    return {
      marks: this.memory.marks.length,
      markCap: MARK_CAP,
      trafficBins: this.memory.traffic.filter(n => n > 0).length,
      trafficCap: WEAR_BINS,
    };
  }
}
