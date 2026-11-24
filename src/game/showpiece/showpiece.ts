// This module, its atlas URLs and both renderers enter the game only after
// Play on a qualifying Meadow visit. The regular game retains Painted's UI.
import type Phaser from 'phaser';
import type { GameState, Shot } from '../../sim';
import type { GameScene } from '../GameScene';
import type { Layout } from '../layout';
import { SHOWPIECE_DETAIL } from '../names';
import { DetailGovernor, type Detail } from './governor';
import { MeadowCamera } from './camera';
import { loadPasture, Pasture } from './pasture';
import { ShowpieceBattle } from './battle';

export { loadPasture };

// Rotation rebuilds the display around the same level. Play again creates a new state.
const governors = new WeakMap<GameState, DetailGovernor>();

export class Showpiece {
  readonly battle: ShowpieceBattle;
  readonly camera: MeadowCamera;
  private readonly pasture: Pasture;
  private readonly quality: DetailGovernor;
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly cpu = { frames: 0, pastureMs: 0, battleMs: 0, cameraMs: 0 };
  private label?: HTMLOutputElement;
  private readonly visibilityChanged = () => this.quality.resetWindow();
  private time = 0;
  private labelTier = -1;

  constructor(scene: GameScene, layout: Layout, density: 1 | 2, zones: Phaser.GameObjects.Graphics, private readonly frozen: boolean) {
    const query = new URLSearchParams(location.search);
    const perf = query.get('perf') === '1';
    const pin = perf ? query.get('showpieceTier') : null;
    this.quality = governors.get(scene.state) ?? new DetailGovernor(pin !== null && /^[012]$/.test(pin) ? Number(pin) as Detail : undefined);
    this.quality.resetWindow();
    governors.set(scene.state, this.quality);
    this.camera = new MeadowCamera(scene, layout);
    this.pasture = new Pasture(scene, layout, density, zones);
    this.battle = new ShowpieceBattle(scene, layout, zones, frozen);
    this.battle.blast = () => {
      if (this.calm) return;
      this.camera.blast(this.time);
      this.pasture.cannon();
    };
    document.addEventListener('visibilitychange', this.visibilityChanged);
    if (perf) {
      this.label = document.createElement('output');
      this.label.style.cssText = 'position:fixed;right:2px;top:2px;color:white;background:#19211ee6;font:11px monospace;padding:2px 4px;pointer-events:none';
      document.body.append(this.label);
    }
  }

  private get calm(): boolean { return this.frozen || this.reduced.matches; }

  frame(now: number, delta: number): void {
    if (!this.frozen) this.quality.sample(now);
    if (!this.calm) this.time += Math.min(delta, 100);
  }

  shots(shots: readonly Shot[]): void { this.battle.onTick(shots); }

  draw(state: GameState, placing: boolean, cameraFree: boolean): void {
    const tier = this.quality.tier;
    const calm = this.calm;
    let start = this.label ? performance.now() : 0;
    this.pasture.draw(state, calm ? 0 : this.time, tier, placing, calm);
    if (this.label) {
      const end = performance.now();
      this.cpu.pastureMs += end - start;
      start = end;
    }
    this.battle.draw(state, tier, calm, placing);
    if (this.label) {
      const end = performance.now();
      this.cpu.battleMs += end - start;
      start = end;
    }
    this.camera.draw(state, this.time, cameraFree && !calm && tier > 0);
    if (this.label) {
      this.cpu.cameraMs += performance.now() - start;
      this.cpu.frames++;
      if (this.labelTier !== tier) this.label.textContent = SHOWPIECE_DETAIL[tier];
      this.labelTier = tier;
    }
  }

  snapshot() {
    return { ...this.battle.snapshot(), pasture: { ...this.pasture.costs }, tier: this.quality.tier, calm: this.calm, timeMs: this.calm ? 0 : this.time, zoom: this.camera.zoom, cpu: { ...this.cpu } };
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.label?.remove();
    this.camera.close();
    this.pasture.destroy();
    this.battle.destroy();
  }
}
