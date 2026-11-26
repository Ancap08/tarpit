import type Phaser from 'phaser';
import type { GameState, MapDef, Rect } from '../../sim';
import type { Layout } from '../layout';
import { endKind, type EndKind } from '../ui/endText';
import { COLORS } from '../palette';
import type { PaintedSkin } from '../skin/painted';
import { CoinSacks } from './coinSacks';
import { smokePuff } from './motion';
import { TOWN_CONDITIONS, townCondition, type TownCondition } from './townCondition';

type Graphics = Phaser.GameObjects.Graphics;

/** The last two columns above the road contain the four refused landmark cells on every map. */
export function townBounds(map: MapDef, layout: Layout): Rect {
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
  private readonly cheers: Graphics;
  private hats: Phaser.GameObjects.Image[] = [];
  private hoist?: Phaser.GameObjects.Image;
  private outcome: EndKind | null = null;
  private outcomeAt = 0;
  private still?: boolean;
  private bannerRaised = false;
  readonly sacks: CoinSacks;
  private readonly smoke: Graphics;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private condition?: TownCondition;
  private changedAt = -Infinity;
  private lastSmokeTime = NaN;
  readonly smokeAlpha: number[] = [];

  constructor(scene: Phaser.Scene, map: MapDef, private readonly layout: Layout, private readonly test: boolean, private readonly painted?: PaintedSkin) {
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
    this.cheers = scene.add.graphics().setName('town:cheer');
    this.layer.add(this.cheers);
    this.sacks = new CoinSacks(scene, this.layer, painted);
  }

  snapshot() {
    return { condition: this.condition, outcome: this.outcome, sacks: this.sacks.snapshot(), bounds: this.bounds };
  }

  update(state: GameState, now: number): void {
    this.sacks.draw(this.bounds, this.layout.turned, now, this.reduced.matches);
    const condition = townCondition(state);
    const outcome = endKind(state);
    const still = this.test || this.reduced.matches;
    const changed = condition !== this.condition || outcome !== this.outcome || still !== this.still;
    this.still = still;
    if (outcome !== this.outcome) this.outcomeAt = now;
    this.outcome = outcome;
    if (changed) {
      if (this.condition && condition !== this.condition) this.changedAt = now;
      this.condition = condition;
      const frame = TOWN_CONDITIONS.indexOf(condition);
      const pose = outcome === 'won' && frame < 3 ? frame + 4 : frame;
      if (this.image) this.painted?.pose(this.image, 'town', pose + (this.layout.turned ? 7 : 0));
      this.cheers.clear();
      for (const hat of this.hats) hat.setVisible(false);
      this.hoist?.setVisible(false);
      this.bannerRaised = false;
      this.drawClassic(frame);
    }
    const elapsed = now - this.outcomeAt;
    if (outcome === 'won' && (changed || !still)) this.drawCheer(still ? 0.42 : (elapsed % 1300) / 1300);
    if (outcome === 'lost' && !still && !this.bannerRaised) this.raiseBanner(elapsed);
    const t = still ? 0 : now;
    const age = now - this.changedAt;
    if (changed || t !== this.lastSmokeTime || this.changedAt !== -Infinity) {
      this.lastSmokeTime = t;
      this.drawSmoke(condition, t, outcome && still ? Infinity : age);
      if (age >= 360) this.changedAt = -Infinity;
    }
  }

  private raiseBanner(elapsed: number): void {
    const lift = 12 * Math.max(0, 1 - elapsed / 650);
    this.bannerRaised = lift === 0;
    if (!this.image || !this.painted) {
      this.drawClassic(3, lift);
      return;
    }
    if (lift > 0) {
      const frame = this.layout.turned ? 2 : 0;
      this.painted.pose(this.image, 'royal-hoist', frame);
      if (!this.hoist) {
        this.hoist = this.painted.image('royal-hoist', frame + 1).setName('town:map');
        this.layer.add(this.hoist);
      }
      this.hoist.setPosition(this.image.x, this.image.y + lift).setVisible(true);
    } else if (this.hoist?.visible) {
      this.hoist.setVisible(false);
      this.painted.pose(this.image, 'town', this.layout.turned ? 10 : 3);
    }
  }

  private drawCheer(phase: number): void {
    const g = this.cheers.clear();
    const { x, y, width, height } = this.bounds;
    const base = y + height - 2;
    if (this.image && this.painted) {
      for (let i = 0; i < 2; i++) {
        let hat = this.hats[i];
        if (!hat) {
          hat = this.painted.image('tossed-hat', (this.layout.turned ? 2 : 0) + i).setName('town:cheer');
          this.layer.add(hat);
          this.hats.push(hat);
        }
        const arc = this.test || this.reduced.matches ? 0 : Math.sin(Math.PI * ((phase + 0.35 * i) % 1));
        hat.setPosition(this.image.x + arc * (i ? -2 : 2), this.image.y - arc * 8).setVisible(true);
      }
      return;
    }
    for (let i = 0; i < 2; i++) {
      const p = (phase + 0.35 * i) % 1;
      const cx = x + width * (0.24 + i * 0.49);
      const hatY = base - 14 - 12 * Math.sin(Math.PI * p);
      g.fillStyle(i ? 0x396682 : 0x497958).fillRect(cx - 2, base - 7, 4, 7);
      g.fillStyle(i ? 0xd39d70 : 0xb5774e).fillCircle(cx, base - 9, 2.5);
      g.lineStyle(1.8, 0x5d4433).lineBetween(cx - 1, base - 5, cx - 5, base - 10)
          .lineBetween(cx + 1, base - 5, cx + 5, base - 10);
      g.fillStyle(i ? 0x68402e : 0xce9350).fillEllipse(cx, hatY - 1, 5, 4);
      g.fillStyle(i ? 0xc69a66 : 0xffce75).fillEllipse(cx, hatY + 1, 9, 2);
    }
  }

  private drawClassic(frame: number, bannerDrop = 0): void {
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
    const top = (frame === 2 && this.outcome !== 'won' ? base - 19 : base - 34) + bannerDrop;
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
