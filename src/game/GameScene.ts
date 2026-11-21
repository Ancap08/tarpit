// The playing field: renders the simulation and runs it on a fixed step.
//
// Time: update() accumulates real time and runs one simulation tick per
// 1/60 s, times the speed (1x or 2x), at most MAX_TICKS_PER_FRAME per frame.
// In test mode (?test=1) update() runs no ticks; tests drive time with
// advance() through window.__tarpit.step().

import Phaser from 'phaser';
import { buildTower, createGame, sellTower, startWave, tick, TICKS_PER_SECOND, upgradeTower } from '../sim';
import type { BuildResult, GameState, SellResult, StartWaveResult, TowerType, UpgradeResult } from '../sim';
import { drawEnemies } from './draw/enemies';
import { drawMap } from './draw/map';
import { ShotEffects } from './draw/shots';
import { Aim, drawTowers } from './draw/towers';
import { Hud } from './hud';
import { isTestMode } from './testMode';

const STEP_MS = 1000 / TICKS_PER_SECOND;
const MAX_TICKS_PER_FRAME = 8;

export type Speed = 1 | 2;

export class GameScene extends Phaser.Scene {
  state: GameState = createGame();
  speed: Speed = 1;
  private accMs = 0;
  private dynamic!: Phaser.GameObjects.Graphics;
  private hud!: Hud;
  private shots = new ShotEffects();
  private aim = new Aim();
  private readonly autoTick = !isTestMode();

  constructor() {
    super('game');
  }

  create(): void {
    this.state = createGame();
    this.speed = 1;
    this.accMs = 0;
    this.shots = new ShotEffects();
    this.aim = new Aim();

    drawMap(this.add.graphics());
    this.dynamic = this.add.graphics();
    this.hud = new Hud(this, {
      onStartWave: () => this.startWave(),
      onToggleSpeed: () => this.setSpeed(this.speed === 1 ? 2 : 1),
    });
    this.redraw();
  }

  update(_time: number, delta: number): void {
    if (this.autoTick) {
      this.accMs += delta;
      const due = Math.floor(this.accMs / STEP_MS);
      this.accMs -= due * STEP_MS;
      // Dropping ticks beyond the cap (after a stall or a hidden tab) keeps
      // the game from spiralling; it simply runs slower for that frame.
      this.advance(Math.min(due * this.speed, MAX_TICKS_PER_FRAME), false);
    }
    this.redraw();
  }

  /** Run `n` simulation ticks, feeding each tick's shots to the effects. */
  advance(n: number, redraw = true): void {
    for (let i = 0; i < n; i++) {
      tick(this.state);
      for (const shot of this.state.shots) this.aim.pointAt(shot.spotId, shot.to);
      this.shots.afterTick(this.state.shots);
    }
    if (redraw) this.redraw();
  }

  startWave(): StartWaveResult {
    const result = startWave(this.state);
    this.redraw();
    return result;
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    this.redraw();
  }

  build(spotId: number, type: TowerType): BuildResult {
    const result = buildTower(this.state, spotId, type);
    this.redraw();
    return result;
  }

  upgrade(spotId: number): UpgradeResult {
    const result = upgradeTower(this.state, spotId);
    this.redraw();
    return result;
  }

  sell(spotId: number): SellResult {
    const result = sellTower(this.state, spotId);
    this.redraw();
    return result;
  }

  hudStrings() {
    return this.hud.strings();
  }

  hudRects() {
    return this.hud.rects();
  }

  redraw(): void {
    if (!this.dynamic) return;
    this.aim.prune(this.state);
    const g = this.dynamic;
    g.clear();
    drawTowers(g, this.state, this.aim);
    drawEnemies(g, this.state);
    this.shots.draw(g);
    this.hud.update(this.state, this.speed);
  }
}
