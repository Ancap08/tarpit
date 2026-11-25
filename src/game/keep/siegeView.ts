import type Phaser from 'phaser';
import type { Phase, Point } from '../../sim';
import type { Layout } from '../layout';

const SETUP_SCALE = 1.15;
const BATTLE_SCALE = 1.50;
const SETTLE_MS = 1500;
const ROAD_FOOT_INSET = 24;

/** The portrait view opens on the keep, then makes more room for the crag
 * below it. Preserve the width of both approaches and keep their foot in
 * frame. The fixed controls use a second, unscaled camera. */
export class SiegeView {
  private readonly field: Phaser.Cameras.Scene2D.Camera;
  private readonly overlay: Phaser.Cameras.Scene2D.Camera;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private scale = SETUP_SCALE;
  private top = 0;
  private from = SETUP_SCALE;
  private to = SETUP_SCALE;
  private started = 0;

  constructor(scene: Phaser.Scene, private readonly layout: Layout, world: Phaser.GameObjects.GameObject[],
    private readonly frozen: boolean, phase: Phase, rebuilding: boolean) {
    this.field = scene.cameras.main.setOrigin(0);
    this.overlay = scene.cameras.add(0, 0, layout.width, layout.height, false, 'siege-hud');
    this.overlay.ignore(world);
    const moving = new Set(world);
    this.fix(scene.children.list.filter(object => !moving.has(object)));
    if (rebuilding && !this.frozen && !this.reduced.matches && phase === 'wave') {
      this.from = this.to = BATTLE_SCALE;
    }
    this.apply(this.to);
  }

  fix(objects: Phaser.GameObjects.GameObject[]): void {
    this.field.ignore(objects);
  }

  hideFixedFrom(camera: Phaser.Cameras.Scene2D.Camera, objects: Phaser.GameObjects.GameObject[]): void {
    camera.ignore(objects.filter(object => object.cameraFilter & this.field.id));
  }

  update(phase: Phase, time: number): void {
    const target = this.frozen || this.reduced.matches ? SETUP_SCALE
      : phase === 'wave' ? BATTLE_SCALE : phase === 'setup' ? SETUP_SCALE : this.to;
    if (target !== this.to) {
      this.from = this.scale;
      this.to = target;
      this.started = time;
    }
    if (this.frozen || this.reduced.matches) {
      this.apply(SETUP_SCALE);
      return;
    }
    if (this.scale === this.to) return;
    const t = Math.min(1, Math.max(0, (time - this.started) / SETTLE_MS));
    this.apply(this.from + (this.to - this.from) * t * t * (3 - 2 * t));
  }

  private apply(scale: number): void {
    this.scale = scale;
    const foot = this.layout.map.y + this.layout.map.height;
    this.top = foot * (1 - scale) - ROAD_FOOT_INSET;
    this.field.setZoom(1, scale).setScroll(0, -this.top / scale);
  }

  readonly displayed = ({ x, y }: Point): Point => ({ x, y: y * this.scale + this.top });

  input({ x, y }: Point): Point {
    return { x, y: (y - this.top) / this.scale };
  }

  get verticalScale(): number { return this.scale; }
}
