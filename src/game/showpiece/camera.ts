import type Phaser from 'phaser';
import type { GameState, Point } from '../../sim';
import type { Layout } from '../layout';

export class MeadowCamera {
  private view?: Phaser.Cameras.Scene2D.Camera;
  private first = -Infinity;
  private blastAt = -Infinity;
  private seen = false;

  constructor(private readonly scene: Phaser.Scene, private readonly layout: Layout) {}

  blast(now: number): void {
    // A battery firing together makes one kick. Leave some stillness between volleys.
    if (now - this.blastAt > 1200) this.blastAt = now;
  }

  draw(state: GameState, now: number, moving: boolean): void {
    if (!this.seen && state.enemies.length) {
      this.first = now;
      this.seen = true;
    }
    const intro = (now - this.first) / 2300;
    const kick = (now - this.blastAt) / 270;
    const push = intro >= 0 && intro < 1 ? Math.sin(Math.PI * intro) ** 2 : 0;
    const impact = kick >= 0 && kick < 1 ? Math.sin(Math.PI * kick) * (1 - kick) : 0;
    const zoom = 1 + push * 0.048 + impact * 0.019;
    if (!moving || zoom <= 1.0001 || state.phase !== 'wave' || this.scene.cameras.main.width !== this.scene.scale.width || this.scene.cameras.main.height !== this.scene.scale.height) {
      this.close();
      return;
    }
    const m = this.layout.map;
    if (!this.view) {
      // Only the map is re-framed. The HUD and its hit areas stay on the main camera.
      this.view = this.scene.cameras.add(m.x, m.y, m.width, m.height, false, 'meadow');
      this.view.inputEnabled = false;
    }
    const dx = impact > 0 ? impact * 2 * Math.sin(16 * kick) : 0;
    const dy = impact > 0 ? impact * Math.cos(20 * kick) : 0;
    this.view.setScroll(m.x + dx, m.y + dy).setZoom(zoom);
  }

  private active(): Phaser.Cameras.Scene2D.Camera {
    return this.view ?? this.scene.cameras.main;
  }

  mapInput(p: Point): Point {
    return this.layout.inMap(p.x, p.y) ? this.active().getWorldPoint(p.x, p.y) : p;
  }

  displayed(p: Point): Point {
    const cam = this.active();
    // Both Meadow and Painted blast cameras are axis aligned. Using the
    // same inverse as pointer input includes Phaser's rounded viewport origin.
    const origin = cam.getWorldPoint(0, 0);
    return { x: (p.x - origin.x) * cam.zoomX, y: (p.y - origin.y) * cam.zoomY };
  }

  get zoom(): number { return this.view?.zoom ?? 1; }

  close(): void {
    if (this.view) this.scene.cameras.remove(this.view);
    this.view = undefined;
  }
}
