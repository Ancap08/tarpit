import { extendPortraitGround } from '../draw/groundFringe';
import Phaser from 'phaser';
import { cellKey, type Tower, type GameState, type MapDef, type Point, type TowerType } from '../../sim';
import { blinking, STILL_T } from '../decor/motion';
import { PLACING_ALPHA, type DecorState } from '../decor/livingMap';
import { decorFor, hiddenGrowth, type Growth } from '../decor/recipe';
import type { TowerPose } from '../draw/towers';
import { arcHeight, arcPosition } from '../fx/fxMath';
import type { Layout } from '../layout';
import type { GameClock } from '../loop';
import { paintedSheetMissing } from '../names';
import { bearingFrame, footDepth, TOWER_PREVIEW_FRAME, towerArt } from './frames';
import type { PaintedAssets, PaintedName, PaintedSheet } from './loading';
import { NOTICE_WIDTH, SIEGE_MACHINE_KEY } from '../draw/siegeMachines';
import { PAINTED_SHOTS } from './sharp';

type Image = Phaser.GameObjects.Image;
type Sprite = Phaser.GameObjects.Sprite;

const FALLBACK: PaintedSheet = {
  key: 'painted:sharp:fallback', frameSize: [16, 24], anchor: [8, 22], density: 1,
  frames: 1, bodyBounds: [[2, 2, 14, 22]],
};
const reported = new Set<PaintedName>();

export function paintedFrame<T extends string | number>(texture: Phaser.Textures.Texture, frame: T): T | 0 {
  return texture.key === FALLBACK.key ? 0 : frame;
}

export interface PaintedState {
  active: boolean;
  density: 1 | 2 | null;
  sprites: { key: string; frame: number; x: number; y: number; visible: boolean }[];
}

export function growthArt(g: Growth): PaintedName {
  if (g.kind === 'bush') return g.variant === 1 ? 'bush' : 'berry-bush';
  if (g.shape === 'conifer') return 'spruce';
  if (g.shape === 'sapling') return 'birch';
  return 'oak';
}

export class PaintedSkin {
  readonly standing: Phaser.GameObjects.Layer;
  readonly air: Phaser.GameObjects.Layer;
  readonly shadows: Phaser.GameObjects.Layer;
  private readonly ground?: Image;
  private readonly cave?: Image;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private drawnTime = Number.NaN;
  private readonly growth: { g: Growth; image: Image }[];
  private readonly towers = new Map<number, Image>();
  readonly effects: Phaser.GameObjects.Layer;
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
    scenery = true,
    extendGround = false,
  ) {
    if (assets.groundKey) {
      this.ground = extendGround && layout.turned
        ? extendPortraitGround(scene, layout, scene.textures.get(assets.groundKey).getSourceImage() as HTMLImageElement, assets.density)
        : layout.placeWorld(scene.add.image(0, 0, assets.groundKey, 0).setOrigin(0).setScale(1 / assets.density));
      this.ground.setVisible(scenery);
    }
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
    if (scenery) this.cave = place('cave', { x: spawn.x + 22, y: spawn.y }, layout.turned ? 1 : 0);
    this.growth = (scenery ? decorFor(map).growth : []).map(g => {
      const name = growthArt(g);
      return { g, image: place(name, g, name === 'oak' ? g.id % 4 : 0) };
    });
  }

  placeTown(layer: Phaser.GameObjects.Container): void {
    if (this.ground) this.scene.children.moveTo(layer, this.scene.children.getIndex(this.ground) + 1);
  }

  /** Put zones over the board, and under its shadows and standing pieces. */
  placeGround(zones: Phaser.GameObjects.Graphics): void {
    this.scene.children.moveTo(zones, this.ground ? this.scene.children.getIndex(this.ground) + 1 : 0);
  }

  /** Kept separate from UI icons, which show the original paint on every field. */
  worldTexture?: (key: string) => string;
  siegeNotices = false;

  private unlock?: Promise<void>;
  unlockTowers(): void {
    if (this.unlock || !this.assets.sharp?.onDemand) return;
    const controller = new AbortController();
    const abort = () => controller.abort();
    this.scene.events.once('shutdown', abort);
    this.unlock = this.assets.sharp.onDemand(controller.signal).finally(() => {
      this.scene.events.off('shutdown', abort);
      this.unlock = undefined;
    });
  }

  private installed(sheet: PaintedSheet | undefined): PaintedSheet | undefined {
    return sheet && this.scene.textures.exists(sheet.key) ? sheet : undefined;
  }

  private reportMissing(name: PaintedName): void {
    if (reported.has(name)) return;
    reported.add(name);
    console.warn(paintedSheetMissing(name));
  }

  sheet(name: PaintedName): PaintedSheet {
    const sheet = this.installed(this.assets.sheets[name]) ?? this.installed(this.assets.sharp?.icons[name]);
    if (sheet) return sheet;
    this.reportMissing(name);
    const { textures } = this.scene;
    if (!textures.exists(FALLBACK.key)) {
      const [width, height] = FALLBACK.frameSize;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ink = canvas.getContext('2d');
      if (ink) {
        ink.fillStyle = '#423a35';
        ink.fillRect(2, 2, 12, 20);
        ink.fillStyle = '#c6b9a6';
        ink.fillRect(3, 3, 10, 18);
      }
      textures.create(FALLBACK.key, canvas)?.add(0, 0, 0, 0, width, height);
    }
    return FALLBACK;
  }

  pose<T extends Image | Sprite>(obj: T, name: PaintedName, frame: number, world = true,
    sheet = this.sheet(name)): T {
    if (sheet.frames === 1) frame = 0;
    const key = world ? this.worldTexture?.(sheet.key) ?? sheet.key : sheet.key;
    if (obj.texture.key !== key) obj.setTexture(key, frame);
    else if (Number(obj.frame.name) !== frame) obj.setFrame(frame);
    obj.setOrigin(sheet.anchor[0] / sheet.frameSize[0], sheet.anchor[1] / sheet.frameSize[1]);
    obj.setScale(1 / (sheet.density ?? this.assets.density));
    return obj;
  }

  image(name: PaintedName, frame = 0): Image {
    const sheet = this.sheet(name);
    return this.pose(this.scene.add.image(0, 0, sheet.key, 0), name, frame, true, sheet);
  }

  update(state: GameState, placing: boolean): void {
    const t = this.testMode || this.reducedMotion.matches ? STILL_T : this.clock.nowMs;
    if (t !== this.drawnTime) {
      this.drawnTime = t;
      if (this.cave) this.cave.setFrame(paintedFrame(this.cave.texture, (this.layout.turned ? 1 : 0) + (blinking(t) ? 2 : 0)));

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
        smoke: [],
        eyesOpen: !blinking(this.drawnTime),
      },
    };
  }

  private towerPiece(image: Image, type: TowerType, p: Point, pose: TowerPose, alpha: number): void {
    const screen = this.layout.toScreen(p);
    const dir = this.layout.screenDir(Math.cos(pose.angle), Math.sin(pose.angle));
    const art = towerArt(type);
    this.pose(image, art, bearingFrame(pose.angle, this.layout))
      .setPosition(screen.x - dir.x * pose.recoil, screen.y - dir.y * pose.recoil)
      .setScale(pose.scale / (this.sheet(art).density ?? this.assets.density)).setAlpha(alpha).setDepth(footDepth(p, this.layout));
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
    const sheet = this.installed(this.assets.sharp?.icons[name]) ?? this.sheet(name);
    const frame = sheet.frames === 1 ? 0 : TOWER_PREVIEW_FRAME;
    const [left, top, right, bottom] = sheet.bodyBounds![frame];
    const [width, height] = sheet.frameSize;
    const scale = Math.min(maxWidth / (right - left), maxHeight / (bottom - top));
    const icon = this.scene.add.image(0, 0, sheet.key, frame);
    return this.pose(icon, name, frame, false, sheet)
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

  frozenShot(type: TowerType, from: Point, to: Point, progress: number): boolean {
    const height = arcHeight(type, Math.hypot(to.x - from.x, to.y - from.y));
    const p = arcPosition(from, to, progress, height, this.layout.up);
    return this.projectile(type, p, p.angle);
  }

  projectile(type: TowerType, position: Point, angle: number): boolean {
    const p = this.layout.toScreen(position);
    const notice = type === 'mortar' && this.siegeNotices;
    const name = notice && this.assets.sharp ? 'notice' : PAINTED_SHOTS[type];
    if (!this.installed(this.assets.sheets[name])) {
      // The caller already has a plain tracer. A pending cheat download is
      // expected, but a sheet still missing after it finishes is diagnostic.
      if (this.assets.sharp && !this.unlock) this.reportMissing(name);
      return false;
    }
    const image = this.effect(name).setPosition(p.x, p.y);
    if (notice) {
      if (!this.assets.sharp) image.setTexture(SIEGE_MACHINE_KEY, 'notice');
      image.setOrigin(.5).setDisplaySize(NOTICE_WIDTH, NOTICE_WIDTH * 2 / 3)
        .setRotation(angle + (this.layout.turned ? Math.PI / 2 : 0));
    }
    if (type === 'longbow' || type === 'firepot') image.setRotation(angle + (this.layout.turned ? Math.PI : Math.PI / 2));
    return true;
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
