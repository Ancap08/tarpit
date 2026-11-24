import Phaser from 'phaser';
import { cellKey, type Tower, type GameState, type MapDef, type Point, type TowerType } from '../../sim';
import { blinking, MOTION_COUNTS, smokePuff, STILL_T } from '../decor/motion';
import { COLORS } from '../palette';
import { PLACING_ALPHA, type DecorState } from '../decor/livingMap';
import { decorFor, hiddenGrowth, type Growth } from '../decor/recipe';
import type { TowerPose } from '../draw/towers';
import { arcHeight, arcPosition } from '../fx/fxMath';
import type { Layout } from '../layout';
import type { GameClock } from '../loop';
import { bearingFrame, footDepth, TOWER_PREVIEW_FRAME, towerArt } from './frames';
import type { PaintedAssets, PaintedName } from './loading';

type Image = Phaser.GameObjects.Image;
type Sprite = Phaser.GameObjects.Sprite;
const shots = { musketeer: 'cannonball', cannon: 'cannonball', mortar: 'mortar-shell', tarpit: 'tar-glob', longbow: 'arrow', firepot: 'flame' } as const;

export interface PaintedState {
  active: boolean;
  density: 1 | 2 | null;
  sprites: { key: string; frame: number; x: number; y: number; visible: boolean }[];
}

function growthArt(g: Growth): PaintedName {
  if (g.kind === 'bush') return g.variant === 1 ? 'bush' : 'berry-bush';
  if (g.shape === 'conifer') return 'spruce';
  if (g.shape === 'sapling') return 'birch';
  return 'oak';
}

export class PaintedSkin {
  readonly standing: Phaser.GameObjects.Layer;
  readonly air: Phaser.GameObjects.Layer;
  readonly shadows: Phaser.GameObjects.Layer;
  private readonly ground: Image;
  private readonly cave: Image;
  private readonly chimney: Point;
  private readonly smoke: Phaser.GameObjects.Graphics;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private drawnTime = Number.NaN;
  private readonly growth: { g: Growth; image: Image }[];
  private readonly towers = new Map<number, Image>();
  private readonly effects: Phaser.GameObjects.Layer;
  private readonly pieces: Image[] = [];
  private used = 0;
  private hidden = new Set<number>();
  private alpha = 1;
  private ghost?: Image;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly assets: PaintedAssets,
    private readonly layout: Layout,
    private readonly map: MapDef,
    private readonly testMode: boolean,
    private readonly clock: GameClock,
  ) {
    this.ground = layout.placeWorld(scene.add.image(0, 0, assets.groundKey, 0).setOrigin(0).setScale(1 / assets.density));
    this.shadows = scene.add.layer();
    this.standing = scene.add.layer();
    this.air = scene.add.layer();
    this.effects = scene.add.layer();
    const place = (name: PaintedName, world: Point, frame = 0) => {
      const p = layout.toScreen(world);
      const image = this.image(name, frame).setPosition(p.x, p.y).setDepth(footDepth(world, layout));
      this.standing.add(image);
      return image;
    };
    const spawn = map.path[0];
    this.cave = place('cave', { x: spawn.x + 22, y: spawn.y }, layout.turned ? 1 : 0);
    const box = map.landmarks![0];
    const cottage = place('cottage', { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    // Centre of the chimney opening in the 1x frame, relative to its ground anchor.
    this.chimney = { x: cottage.x + 11, y: cottage.y - 22 };
    this.smoke = scene.add.graphics().setDepth(cottage.depth + 0.1);
    this.standing.add(this.smoke);
    this.growth = decorFor(map).growth.map(g => {
      const name = growthArt(g);
      return { g, image: place(name, g, name === 'oak' ? g.id % 4 : 0) };
    });
  }

  /** Put zones over the board, and under its shadows and standing pieces. */
  placeGround(zones: Phaser.GameObjects.Graphics): void {
    this.scene.children.moveTo(zones, this.scene.children.getIndex(this.ground) + 1);
  }

  pose<T extends Image | Sprite>(obj: T, name: PaintedName, frame: number): T {
    const sheet = this.assets.sheets[name];
    if (obj.texture.key !== sheet.key) obj.setTexture(sheet.key, frame);
    else if (Number(obj.frame.name) !== frame) obj.setFrame(frame);
    obj.setOrigin(sheet.anchor[0] / sheet.frameSize[0], sheet.anchor[1] / sheet.frameSize[1]);
    obj.setScale(1 / this.assets.density);
    return obj;
  }

  image(name: PaintedName, frame = 0): Image {
    return this.pose(this.scene.add.image(0, 0, this.assets.sheets[name].key, frame), name, frame);
  }

  update(state: GameState, placing: boolean): void {
    const t = this.testMode || this.reducedMotion.matches ? STILL_T : this.clock.nowMs;
    if (t !== this.drawnTime) {
      this.drawnTime = t;
      this.cave.setFrame((this.layout.turned ? 1 : 0) + (blinking(t) ? 2 : 0));
      this.smoke.clear();
      for (let i = 0; i < MOTION_COUNTS.smokePuffs; i++) {
        const puff = smokePuff(i, t);
        this.smoke.fillStyle(COLORS.chimneySmoke, puff.alpha);
        this.smoke.fillCircle(this.chimney.x + puff.dx, this.chimney.y + puff.dy, 6 * puff.scale);
      }
    }
    const occupied = new Set(state.towers.map(t => cellKey(t.cell)));
    for (const [id, image] of this.towers) {
      if (occupied.has(id)) continue;
      image.destroy();
      this.towers.delete(id);
    }
    this.hidden = new Set(hiddenGrowth(this.growth.map(v => v.g), state.towers.map(t => t.cell)));
    this.alpha = placing ? PLACING_ALPHA : 1;
    for (const { g, image } of this.growth) image.setVisible(!this.hidden.has(g.id)).setAlpha(this.alpha);
  }

  snapshot(): DecorState {
    return {
      mapId: this.map.id, growth: this.growth.map(({ g }) => ({ id: g.id, kind: g.kind, ...g.cell, x: g.x, y: g.y })),
      hidden: [...this.hidden], growthAlpha: this.alpha, puffs: 0,
      still: this.testMode || this.reducedMotion.matches, t: this.drawnTime,
      moving: {
        clouds: [], flow: null, bird: null, butterfly: null, sway: 0,
        smoke: Array.from({ length: MOTION_COUNTS.smokePuffs }, (_, i) => smokePuff(i, this.drawnTime).alpha),
        eyesOpen: !blinking(this.drawnTime),
      },
    };
  }

  private towerPiece(image: Image, type: TowerType, p: Point, pose: TowerPose, alpha: number): void {
    const screen = this.layout.toScreen(p);
    const dir = this.layout.screenDir(Math.cos(pose.angle), Math.sin(pose.angle));
    this.pose(image, towerArt(type), bearingFrame(pose.angle, this.layout))
      .setPosition(screen.x - dir.x * pose.recoil, screen.y - dir.y * pose.recoil)
      .setScale(pose.scale / this.assets.density).setAlpha(alpha).setDepth(footDepth(p, this.layout));
  }

  readonly towerBody = (tower: Tower, p: Point, pose: TowerPose, alpha: number): void => {
    const id = cellKey(tower.cell);
    let image = this.towers.get(id);
    if (!image) {
      image = this.image(towerArt(tower.type));
      this.standing.add(image);
      this.towers.set(id, image);
    }
    this.towerPiece(image, tower.type, p, pose, alpha);
  };

  clearGhost(): void { this.ghost?.setVisible(false); }

  drawGhost(type: TowerType, p: Point, alpha: number): void {
    if (!this.ghost) {
      this.ghost = this.image(towerArt(type));
      this.standing.add(this.ghost);
    }
    const screen = this.layout.toScreen(p);
    this.pose(this.ghost, towerArt(type), TOWER_PREVIEW_FRAME)
      .setPosition(screen.x, screen.y).setAlpha(alpha).setDepth(footDepth(p, this.layout)).setVisible(true);
  }

  towerIcon(type: TowerType, maxWidth: number, maxHeight: number): Image {
    const name = towerArt(type);
    const sheet = this.assets.sheets[name];
    const [left, top, right, bottom] = sheet.bodyBounds![TOWER_PREVIEW_FRAME];
    const [width, height] = sheet.frameSize;
    const scale = Math.min(maxWidth / (right - left), maxHeight / (bottom - top));
    return this.image(name, TOWER_PREVIEW_FRAME)
      .setOrigin((left + right) / (2 * width), (top + bottom) / (2 * height))
      .setScale(scale);
  }

  beginEffects(): void { this.used = 0; }

  private effect(name: PaintedName): Image {
    let image = this.pieces[this.used];
    if (!image) {
      image = this.image(name);
      this.effects.add(image);
      this.pieces.push(image);
    }
    this.used++;
    return this.pose(image, name, 0).setVisible(true).setRotation(0);
  }

  frozenShot(type: TowerType, from: Point, to: Point, progress: number): void {
    const height = arcHeight(type, Math.hypot(to.x - from.x, to.y - from.y));
    const p = arcPosition(from, to, progress, height, this.layout.up);
    this.projectile(type, p, p.angle);
  }

  projectile(type: TowerType, position: Point, angle: number): void {
    const p = this.layout.toScreen(position);
    const image = this.effect(shots[type]).setPosition(p.x, p.y);
    if (type === 'longbow' || type === 'firepot') image.setRotation(angle + (this.layout.turned ? Math.PI : Math.PI / 2));
  }

  sold(type: TowerType, p: Point, pose: TowerPose): void {
    this.towerPiece(this.effect(towerArt(type)), type, p, pose, 1);
  }

  endEffects(): void {
    for (let i = this.used; i < this.pieces.length; i++) this.pieces[i].setVisible(false);
  }

  state(): PaintedState {
    const objects = [this.ground, ...this.standing.list, ...this.shadows.list, ...this.air.list, ...this.effects.list];
    return { active: true, density: this.assets.density, sprites: objects.flatMap(obj => {
      if (!(obj instanceof Phaser.GameObjects.Image || obj instanceof Phaser.GameObjects.Sprite)) return [];
      return [{ key: obj.texture.key, frame: Number(obj.frame.name), x: obj.x, y: obj.y, visible: obj.visible }];
    }) };
  }
}
