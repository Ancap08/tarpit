import type Phaser from 'phaser';
import type { GameState, MapDef, Rect } from '../../sim';
import type { Layout } from '../layout';
import { COLORS } from '../palette';
import type { PaintedSkin } from '../skin/painted';
import { smokePuff } from './motion';
import { TOWN_CONDITIONS, townCondition, type TownCondition } from './townCondition';

type Graphics = Phaser.GameObjects.Graphics;

/** The last two columns above the road contain the four refused landmark cells on every map. */
function townBounds(map: MapDef, layout: Layout): Rect {
  const exit = map.path[map.path.length - 1];
  const center = layout.toScreen({ x: exit.x - 32, y: exit.y - 43 });
  const width = layout.turned ? 42 : 62;
  const height = layout.turned ? 62 : 42;
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

export class Town {
  readonly layer: Phaser.GameObjects.Container;
  readonly bounds: Rect;
  private readonly image?: Phaser.GameObjects.Image;
  private readonly classic?: Graphics;
  private readonly smoke: Graphics;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private condition?: TownCondition;
  private changedAt = -Infinity;
  private lastSmokeTime = NaN;
  readonly smokeAlpha: number[] = [];

  constructor(scene: Phaser.Scene, map: MapDef, private readonly layout: Layout, private readonly test: boolean, painted?: PaintedSkin) {
    this.bounds = townBounds(map, layout);
    const { x, y, width, height } = this.bounds;
    this.layer = scene.add.container();
    if (painted) {
      this.image = painted.image('town').setPosition(x + width / 2, y + height / 2).setName('town:map');
      this.layer.add(this.image);
      painted.placeTown(this.layer);
    } else {
      this.classic = scene.add.graphics().setName('town:map');
      this.layer.add(this.classic);
    }
    this.smoke = scene.add.graphics().setName('town:smoke');
    this.layer.add(this.smoke);
  }

  snapshot() {
    return { condition: this.condition, bounds: this.bounds };
  }

  update(state: GameState, now: number): void {
    const condition = townCondition(state);
    const changed = condition !== this.condition;
    if (changed) {
      if (this.condition) this.changedAt = now;
      this.condition = condition;
      const frame = TOWN_CONDITIONS.indexOf(condition);
      this.image?.setFrame(frame + (this.layout.turned ? 7 : 0));
      this.drawClassic(frame);
    }
    const t = this.test || this.reduced.matches ? 0 : now;
    const age = now - this.changedAt;
    if (changed || t !== this.lastSmokeTime || this.changedAt !== -Infinity) {
      this.lastSmokeTime = t;
      this.drawSmoke(condition, t, age);
      if (age >= 360) this.changedAt = -Infinity;
    }
  }

  private drawClassic(frame: number): void {
    const g = this.classic;
    if (!g) return;
    const { x, y, width, height } = this.bounds;
    const cx = x + width * 0.43, base = y + height - 3;
    const roof = base - 15;
    g.clear();
    g.fillStyle(COLORS.cottageChimney).fillRect(cx + 4, roof - 13, 5, 10);
    g.fillStyle(COLORS.cottageWall).fillRect(cx - 12, roof, 24, 15);
    g.fillStyle(COLORS.cottageRoof).fillTriangle(cx - 15, roof, cx + 15, roof, cx, roof - 13);
    g.fillStyle(COLORS.cottageDoor).fillRect(cx - 3, base - 9, 6, 9);
    g.fillStyle(frame > 1 ? 0x503b32 : 0xffdd86).fillRect(cx - 9, roof + 3, 5, 5);
    const pole = x + width - 12;
    const top = frame === 2 ? base - 19 : base - 34;
    g.fillStyle(0x604526).fillRect(pole - 1, base - 35, 2, 35);
    g.fillStyle(frame === 3 ? 0xa22b22 : 0x236579).fillRect(pole + 1, top, 10, frame === 3 ? 14 : 8);
    g.fillStyle(0xf3c254).fillCircle(pole + 6, top + 4, 2);
  }

  private drawSmoke(condition: TownCondition, t: number, age: number): void {
    const g = this.smoke.clear();
    const { x, y, width, height } = this.bounds;
    const frame = TOWN_CONDITIONS.indexOf(condition);
    const chimneyX = this.image ? this.image.x + (this.layout.turned ? 11 : 12) : x + width * 0.43 + 6;
    const chimneyY = this.image ? this.image.y - (this.layout.turned ? 14 : 15) : y + height - 31;
    this.smokeAlpha.length = 0;
    for (let i = 0; i < 4; i++) {
      const puff = smokePuff(i, t);
      const r = (1.6 + Math.min(2, frame) * 1.6) * puff.scale;
      const alpha = puff.alpha * (frame === 0 ? 0.7 : 2);
      this.smokeAlpha.push(alpha);
      const px = Math.max(x + r, chimneyX - puff.dx * (frame + 1));
      const py = Math.max(y + r, chimneyY + puff.dy * 0.5);
      const smokeColor = [0xece0c9, 0xa08767, 0x484344, 0x484344][frame];
      g.fillStyle(smokeColor, alpha).fillCircle(px, py, r);
    }
    if (age < 360) {
      const progress = this.reduced.matches ? 0.5 : age / 360;
      for (const offset of [-1, 0, 1]) {
        const px = x + width / 2 + offset * (6 + 8 * progress);
        const py = y + height - 6 - 5 * progress;
        g.fillStyle(0xf5ddae, 0.85 * (1 - age / 360)).fillCircle(px, py, 2 + progress * 2);
      }
    }
  }
}
