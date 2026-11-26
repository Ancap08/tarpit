// Milestone 31 (effects): everything drawn in play that the simulation does
// not need. Drawing only: the simulation is instant-hit and has already
// applied damage when a shot is fired; here the shot is drawn as a
// projectile that takes TRAVEL_MS (game time) to reach the point the
// simulation recorded, and the impact, the enemy's hit flash and knock, a
// kill's death puff and its gold are drawn when it arrives. Towers turn
// toward their targets at a capped rate and kick back when they fire;
// build, upgrade and sell pop. Wave and boss moments get banners; the boss's
// entrance darkens the map and shakes the camera, his death bursts. An exit
// flashes the cottage and the Lives number.
//
// Test mode (?test=1) never creates this class: GameScene keeps the
// milestone 16 to 30 drawing there, so the screenshot baselines do not move.
// Reduced motion (prefers-reduced-motion: reduce): no camera shakes, no
// darkening or full-screen flash, no Lives shake; everything else stays.
// The maths (arcs, turn rate, recoil, pops, caps, gold grouping, banner
// queue) lives in fxMath.ts.
// Milestone 33: the sounds (audio/engine.ts) follow the same moments: a
// shot when fired, its impact, hit tick and death pop when the projectile
// lands, and every other event as it is routed here.

import type { PaintedSkin } from '../skin/painted';
import type Phaser from 'phaser';
import {
  ACT_ONE_LAST_WAVE,
  cellCenter,
  cellKey,
  cottageFor,
  enemyPosition,
  pathLength,
  positionAlongPath,
  type Cell,
  type Enemy,
  type EnemyType,
  type GameEvent,
  type GameState,
  type MapDef,
  type Point,
  type Shot,
  type TowerType,
  type UpgradePath,
} from '../../sim';
import type { EnemySprites } from '../anim/enemySprites';
import { sound } from '../audio/engine';
import { deathSound } from '../audio/recipes';
import { STEP_MS, type GameClock } from '../loop';
import { goldGainText } from '../names';
import { Moments } from './moments';
import type { Layout } from '../layout';
import { COLORS, HUD_FONT, TEXT } from '../palette';
import { CLEAN, SANS, skinFor } from '../ui/newTheme';
import { DeviceTextFit, placeFloatingText, textInset } from '../ui/deviceText';
import { Aim, drawTowerScaled, MUZZLE, type TowerPose } from '../draw/towers';
import {
  arcHeight,
  arcPosition,
  BOSS_RING_DELAYS,
  BOSS_RING_MS,
  BOSS_RING_RADII,
  CAPS,
  darkenAlpha,
  EXIT_FLASH_MS,
  flashFade,
  GoldGroups,
  goldLabelLook,
  livesShake,
  POP_MS,
  popScale,
  RECOIL_PX,
  recoilOffset,
  SHAKE,
  shakeOffset,
  SlotPool,
  TRAVEL_MS,
  TURN_RATE,
  turnStep,
  type PopKind,
} from './fxMath';

/** Impact lengths (game ms). */
const IMPACT_MS: Readonly<Record<ImpactKind, number>> = {
  splash: 380,
  tar: 420,
  fire: 300,
  muzzle: 100,
  bossRing: BOSS_RING_MS,
};
/** The boss's death flash over the whole map (real ms; off under reduced motion). */
const BOSS_FLASH_MS = 220;

type ImpactKind = 'splash' | 'tar' | 'fire' | 'muzzle' | 'bossRing';

interface Projectile {
  tower: TowerType;
  from: Point;
  to: Point;
  height: number;
  bornMs: number;
  travelMs: number;
}

interface Impact {
  kind: ImpactKind;
  x: number;
  y: number;
  radius: number;
  angle: number;
  color: number;
  bornMs: number;
}

/** Something that happens when a projectile lands (game ms). */
type Due =
  | { at: number; kind: 'hit'; id: number; from: Point; damage: number }
  | { at: number; kind: 'kill'; id: number; bounty: number; type: EnemyType }
  | { at: number; kind: 'bossDown'; id: number; large: boolean }
  | { at: number; kind: 'impact'; shot: Shot };

interface Pose {
  angle: number;
  targetAngle: number;
  targetId: number;
  firedMs: number;
  type: TowerType;
  upgraded: boolean;
  path?: UpgradePath;
  popKind: PopKind | null;
  popMs: number;
}

interface SellGhost {
  cell: Cell;
  type: TowerType;
  upgraded: boolean;
  path?: UpgradePath;
  angle: number;
  atMs: number;
}

/** What window.__tarpit.fx() reports in play (milestone 31 tests). */
export interface FxState {
  projectiles: number;
  impacts: number;
  goldLabels: string[];
  banner: string | null;
  bannerPending: number;
  reducedMotion: boolean;
  shakes: number;
  darkenings: number;
  darken: number;
  screenFlashes: number;
  bossEntrances: number;
  bossDeaths: number;
  exitFlashes: number;
  livesFlashing: boolean;
  pendingKills: number;
  gameMs: number;
  /** The map camera's scroll and whether the still HUD camera is split off (a shake is running). */
  camera: { x: number; y: number; split: boolean };
}

const SMOKE_KEY = 'fx-smoke';
const SPARK_KEY = 'fx-spark';

/** The Lives readout: GameScene passes Hud.livesFx. */
export type LivesFx = (flash: number, dx: number) => void;

export class Effects {
  showpiece?: import('../showpiece/battle').BattleObserver;
  /** Game clock: real ms times the speed, capped per frame like the tick loop. */
  private gameMs = 0;
  private readonly projectiles: (Projectile | null)[];
  private readonly projectilePool = new SlotPool(CAPS.projectiles);
  private readonly impacts: (Impact | null)[];
  private readonly impactPool = new SlotPool(CAPS.impacts);
  private due: Due[] = [];
  /** This tick's shots by tower cell, so its hit events find their projectile. */
  private tickShots = new Map<number, { arrive: number; shot: Shot }>();
  /** Enemies hit by a shot in flight in the current event batch: id -> arrival. */
  private tickHits = new Map<number, number>();
  private readonly poses = new Map<number, Pose>();
  private sells: SellGhost[] = [];
  private readonly startAim: Aim;
  private readonly gold = new GoldGroups();
  private readonly goldTexts: Phaser.GameObjects.Text[] = [];
  private readonly goldFit = [new DeviceTextFit(), new DeviceTextFit()];
  private veil!: Phaser.GameObjects.Graphics;
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly motionQuery: MediaQueryList | null;
  private darkenAt = -Infinity;
  private flashAt = -Infinity;
  private exitAt = -Infinity;
  private readonly cottage: Point;
  private readonly counts = { shakes: 0, darkenings: 0, screenFlashes: 0, bossEntrances: 0, bossDeaths: 0, exitFlashes: 0 };
  private lastLivesKey = '';
  private lastTurnMs: number | null = null;
  private shakeAt = -Infinity;
  private shakeMs = 0;
  private shakePx = 0;
  /** While a shake runs: the HUD's own still camera, so only the map shakes. */
  private hudCams: Phaser.Cameras.Scene2D.Camera[] = [];
  /** The map camera's scroll while a shake runs (its viewport's top-left corner, milestone 32b). */
  private mapScroll = { x: 0, y: 0 };
  private savedBg = '';
  private readonly clean: boolean;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sprites: EnemySprites,
    private readonly map: MapDef,
    private readonly livesFx: LivesFx,
    /** Milestone 32b: world-space drawing goes on Graphics the scene placed with it; particles and text are placed through it. */
    private readonly layout: Layout,
    private readonly clock: GameClock,
    private readonly mapBackground: string | number = COLORS.grass,
    private readonly settledCamera = false,
    private readonly hitNumber?: (point: Point, damage: number) => void,
  ) {
    this.clean = skinFor(scene) === 'battle';
    this.projectiles = new Array<Projectile | null>(CAPS.projectiles).fill(null);
    this.impacts = new Array<Impact | null>(CAPS.impacts).fill(null);
    this.startAim = new Aim(map);
    const exit = positionAlongPath(map, pathLength(map));
    const box = cottageFor(exit);
    // The glow's centre: 12 px above the cottage's base on the screen (milestone 32b: the cottage is drawn upright).
    const c = layout.toScreen({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    this.cottage = layout.turned ? layout.toWorld({ x: c.x, y: c.y + box.height / 2 - 12 }) : { x: box.x + box.width / 2, y: box.y + box.height - 12 };
    this.motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (!scene.textures.exists(SMOKE_KEY)) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(COLORS.smoke, 1).fillCircle(4, 4, 4).generateTexture(SMOKE_KEY, 8, 8);
      g.clear().fillStyle(0xffffff, 1).fillRect(0, 0, 3, 3).generateTexture(SPARK_KEY, 3, 3);
      g.destroy();
    }
    this.smoke = scene.add.particles(0, 0, SMOKE_KEY, {
      emitting: false,
      lifespan: 600,
      speedY: { min: -26, max: -10 },
      speedX: { min: -10, max: 10 },
      scale: { start: 0.6, end: 1.6 },
      alpha: { start: 0.55, end: 0 },
      maxAliveParticles: CAPS.particles,
    });
    this.dust = scene.add.particles(0, 0, 'fx-dust', {
      emitting: false,
      lifespan: 280,
      speed: { min: 20, max: 50 },
      scale: { start: 0.7, end: 0.1 },
      alpha: { start: 0.7, end: 0 },
      maxAliveParticles: CAPS.particles,
    });
    this.sparks = scene.add.particles(0, 0, SPARK_KEY, {
      emitting: false,
      lifespan: 500,
      speed: { min: 40, max: 140 },
      scale: { start: 1.2, end: 0.2 },
      alpha: { start: 1, end: 0 },
      tint: [COLORS.sparkle, COLORS.bossBurst, COLORS.bossBurstRing],
      maxAliveParticles: CAPS.particles,
    });
  }

  /**
   * The layers above every sprite and below the HUD: the darkening veil,
   * the gold labels and the banner. GameScene calls this after the flyers'
   * layer and before the HUD, so the HUD, panel and end screen cover them.
   */
  private moments!: Moments;

  createOverlays(): Moments {
    this.veil = this.scene.add.graphics();
    for (let i = 0; i < CAPS.goldLabels; i++) {
      this.goldTexts.push(
        this.scene.add
          .text(0, 0, '', { fontFamily: this.clean ? SANS : HUD_FONT, fontSize: this.clean && this.layout.turned ? '23px' : '15px', fontStyle: 'bold', color: this.clean ? CLEAN.gold : TEXT.goldGain, stroke: TEXT.fxStroke, strokeThickness: 3 })
          .setOrigin(0.5, 1)
          .setVisible(false),
      );
    }
    this.moments = new Moments(this.scene, this.layout, this.map);
    return this.moments;
  }

  /** A particle burst of `n` at world point `p`, moved (dx, dy) on the screen. */
  private burst(e: Phaser.GameObjects.Particles.ParticleEmitter, n: number, p: Point, dx = 0, dy = 0): void {
    const s = this.layout.toScreen(p);
    e.explode(n, s.x + dx, s.y + dy);
  }

  get reducedMotion(): boolean {
    return this.motionQuery?.matches ?? false;
  }

  private get realMs(): number {
    return this.clock.nowMs;
  }

  /** Let a frame pass: `deltaMs` of real time at `speed`, capped as the tick loop caps it. */
  advanceClock(deltaMs: number, speed: number): void {
    this.gameMs += Math.min(deltaMs * speed, 20 * STEP_MS);
  }

  /** Call after every simulation tick with that tick's shots (before its events). */
  onTick(shots: readonly Shot[]): void {
    this.tickShots.clear();
    for (const shot of shots) {
      const travel = TRAVEL_MS[shot.tower];
      const arrive = this.gameMs + travel;
      this.tickShots.set(cellKey(shot.cell), { arrive, shot });
      this.fire(shot);
      const from = muzzlePoint(shot);
      const { slot } = this.projectilePool.acquire();
      const dist = Math.hypot(shot.to.x - from.x, shot.to.y - from.y);
      this.projectiles[slot] = { tower: shot.tower, from, to: { ...shot.to }, height: arcHeight(shot.tower, dist), bornMs: this.gameMs, travelMs: travel };
      this.due.push({ at: arrive, kind: 'impact', shot });
    }
  }

  /** A tower fired: aim at its target from now on, kick back, and the muzzle flash and smoke. */
  private fire(shot: Shot): void {
    const pose = this.pose(shot.cell, shot.tower);
    const c = cellCenter(shot.cell);
    pose.targetId = shot.targetId;
    pose.targetAngle = Math.atan2(shot.to.y - c.y, shot.to.x - c.x);
    pose.firedMs = this.gameMs;
    sound.play(`shot.${shot.tower}`);
    const m = muzzlePoint(shot);
    if (shot.tower === 'musketeer' || shot.tower === 'cannon' || shot.tower === 'mortar') {
      this.addImpact('muzzle', m.x, m.y, shot.tower === 'musketeer' ? 8 : 12, pose.targetAngle, COLORS.muzzleFlash);
      this.burst(this.smoke, shot.tower === 'musketeer' ? 2 : 4, m);
    }
  }

  /** Route a batch of simulation events (after a tick or an action). */
  onEvents(events: readonly GameEvent[], state: GameState): void {
    this.moments.onEvents(events, this.realMs, true, state);
    this.tickHits.clear();
    // Milestone 33: an early call sounds Call next instead of the wave horn; the end jingles replace the clear chime.
    const early = events.some((e) => e.kind === 'earlyCall');
    const ended = events.some((e) => e.kind === 'won' || e.kind === 'lost');
    // Damage reports are per attacker. Offer one sound per tick to the shared mixer.
    if (events.some((e) => e.kind === 'blockerHit' && e.guardId === undefined)) sound.play('blockerHit');
    if (events.some((e) => e.kind === 'guardStrike')) sound.play('guardStrike');
    if (events.some((e) => e.kind === 'guardDown')) sound.play('guardDown');
    for (const e of events) {
      switch (e.kind) {
        case 'hit': {
          const s = this.tickShots.get(cellKey(e.cell));
          if (s === undefined) {
            this.sprites.hit(e.enemyId, cellCenter(e.cell));
            this.showpiece?.onHit(e.enemyId, this.sprites.spot(e.enemyId));
            if (this.hitNumber) {
              const spot = this.sprites.spot(e.enemyId);
              if (spot) this.hitNumber(spot, e.damage);
            }
            sound.play('hit');
            break;
          }
          // Splash knocks away from the blast, a direct hit away from the tower.
          const from = s.shot.splashRadius ? s.shot.to : s.shot.from;
          this.due.push({ at: s.arrive, kind: 'hit', id: e.enemyId, from, damage: e.damage });
          this.tickHits.set(e.enemyId, Math.max(this.tickHits.get(e.enemyId) ?? 0, s.arrive));
          break;
        }
        case 'kill': {
          const at = this.tickHits.get(e.enemyId);
          if (at === undefined) {
            this.killNow(e.enemyId, e.bounty, e.enemyType);
          } else {
            this.sprites.doom(e.enemyId);
            this.due.push({ at, kind: 'kill', id: e.enemyId, bounty: e.bounty, type: e.enemyType });
          }
          break;
        }
        case 'exit':
          this.sprites.remove(e.enemyId);
          this.exitAt = this.realMs;
          this.counts.exitFlashes += 1;
          sound.play('exit');
          break;
        case 'bossSpawn':
          this.bossEntrance(e.enemyType === 'grumblemaw');
          break;
        case 'bossDown':
          if (e.cause === 'exit') break;
          {
            const at = this.tickHits.get(e.enemyId);
            if (at === undefined) this.bossDeath(e.enemyId, e.enemyType === 'grumblemaw');
            else this.due.push({ at, kind: 'bossDown', id: e.enemyId, large: e.enemyType === 'grumblemaw' });
          }
          break;
        case 'waveStart':
          if (e.wave !== ACT_ONE_LAST_WAVE + 1) sound.play(early ? 'callNext' : 'waveStart');
          break;
        case 'waveClear':
          if (!ended && !events.some((event) => event.kind === 'boonOffered')) sound.play('waveClear');
          break;
        case 'won':
          sound.play('win');
          break;
        case 'lost':
          sound.play('lose');
          break;
        case 'blockerBreak':
          sound.play('blockerBreak');
          break;
        case 'squadGone':
          if (e.reason !== 'destroyed') sound.play('guardLeave');
          break;
        case 'special':
          sound.play(`special.${e.type}`);
          break;
        case 'cheat':
          sound.play('coin');
          break;
        case 'build':
          this.pop(e.cell, e.tower, 'build');
          sound.play('build');
          break;
        case 'upgrade':
          sound.play(e.level === 3 ? 'upgradePath' : 'upgrade');
          this.pop(e.cell, e.tower, 'upgrade');
          {
            this.burst(this.sparks, 14, cellCenter(e.cell));
          }
          break;
        case 'sell': {
          const old = this.poses.get(cellKey(e.cell));
          this.sells.push({ cell: e.cell, type: e.tower, upgraded: old?.upgraded ?? false, path: old?.path, angle: old?.angle ?? 0, atMs: this.realMs });
          this.poses.delete(cellKey(e.cell));
          this.burst(this.dust, 8, cellCenter(e.cell), 0, 8);
          sound.play('sell');
          break;
        }
        case 'move': {
          const old = this.poses.get(cellKey(e.from));
          this.poses.delete(cellKey(e.from));
          if (old) this.poses.set(cellKey(e.to), old);
          break;
        }
        default:
          break;
      }
    }
  }

  private pop(cell: Cell, type: TowerType, kind: PopKind): void {
    const pose = this.pose(cell, type);
    pose.type = type;
    pose.popKind = kind;
    pose.popMs = this.realMs;
    this.burst(this.dust, kind === 'build' ? 8 : 4, cellCenter(cell), 0, 10);
  }

  private pose(cell: Cell, type: TowerType): Pose {
    const key = cellKey(cell);
    let p = this.poses.get(key);
    if (!p) {
      const a = this.startAim.angle(cell);
      p = { angle: a, targetAngle: a, targetId: -1, firedMs: -Infinity, type, upgraded: false, popKind: null, popMs: 0 };
      this.poses.set(key, p);
    }
    return p;
  }

  private killNow(id: number, bounty: number, type: EnemyType): void {
    // Milestone 33: a pop pitched by size; the boss's fall has its own sound (bossDeath).
    if (type !== 'boss' && type !== 'grumblemaw') sound.play(deathSound(type));
    const spot = this.sprites.spot(id);
    if (spot) this.showpiece?.onKill(id, spot);
    this.sprites.kill(id);
    if (spot && bounty > 0) this.addGold(spot.x, spot.y - 10, bounty, spot.type === 'boss' || spot.type === 'grumblemaw');
  }

  /** A gold label; the boss's (`big`) is large and stands alone. */
  private addGold(x: number, y: number, amount: number, big = false): void {
    const { slot, merged } = this.gold.add(x, y, amount, this.realMs, big);
    const label = this.gold.labels[slot]!;
    const t = this.goldTexts[slot];
    if (!t) return;
    if (!merged) t.setFontSize(big ? 34 : this.layout.kind === 'portrait' ? 20 : 17).setStroke(TEXT.fxStroke, big ? 6 : 4);
    t.setText(goldGainText(label.amount)).setVisible(true);
  }

  private bossEntrance(large: boolean): void {
    this.counts.bossEntrances += 1;
    sound.play(large ? 'grumblemawArrive' : 'bossArrive');
    if (this.reducedMotion) return;
    this.darkenAt = this.realMs;
    this.counts.darkenings += 1;
    this.shake(SHAKE.bossEntrance, large ? 1.3 : 1);
  }

  private bossDeath(id: number, large: boolean): void {
    this.counts.bossDeaths += 1;
    sound.play(large ? 'grumblemawFall' : 'bossFall');
    const spot = this.sprites.spot(id);
    // `spot` is on the screen (milestone 32b); the rings are world-space, so their centre goes back through the layout.
    const m = this.layout.map;
    const p = spot ?? { x: m.x + m.width / 2, y: m.y + m.height / 2 };
    const ring = this.layout.toWorld({ x: p.x, y: p.y - 20 });
    // The biggest effect in the game: three rings one after another, a
    // large spark, dust and smoke burst, held about a second.
    this.sparks.explode(large ? CAPS.particles : 110, p.x, p.y - 20);
    this.dust.explode(large ? 55 : 40, p.x, p.y - 10);
    this.smoke.explode(large ? 32 : 24, p.x, p.y - 20);
    BOSS_RING_DELAYS.forEach((delay, i) => this.addImpact('bossRing', ring.x, ring.y, BOSS_RING_RADII[i] * (large ? 1.4 : 1), 0, COLORS.bossBurstRing, delay));
    if (this.reducedMotion) return;
    this.flashAt = this.realMs;
    this.counts.screenFlashes += 1;
    this.shake(SHAKE.bossDeath, large ? 1.3 : 1);
  }

  /** The Powder Keg's shake (GameScene, milestone 30), through the same map-only shake. */
  shakeKeg(): void {
    this.shake(SHAKE.keg);
  }

  /**
   * Shake the map, not the HUD: while it runs the main camera shows only
   * the map rows (its background is grass, so an edge it uncovers shows
   * grass, never the black canvas) and a second, still camera draws the
   * HUD rows. The offset never scrolls down (shakeOffset), so the map
   * camera never shows the HUD.
   */
  private shake(s: { ms: number; px: number }, strength = 1): void {
    if (this.reducedMotion || this.settledCamera) return;
    this.counts.shakes += 1;
    this.shakeAt = this.realMs;
    this.shakeMs = s.ms;
    this.shakePx = s.px * strength;
    if (this.hudCams.length > 0) return;
    const cam = this.scene.cameras.main;
    this.savedBg = cam.backgroundColor.rgba;
    // Milestone 32b: the map's box shakes; each HUD band beside it (below in
    // landscape, above and below in portrait) gets its own still camera.
    const m = this.layout.map;
    const W = this.layout.width;
    const H = this.layout.height;
    cam.setViewport(m.x, m.y, m.width, m.height).setScroll(m.x, m.y).setBackgroundColor(this.mapBackground);
    this.mapScroll = { x: m.x, y: m.y };
    for (const band of [
      { y: 0, h: m.y },
      { y: m.y + m.height, h: H - m.y - m.height },
    ]) {
      if (band.h > 0) this.hudCams.push(this.scene.cameras.add(0, band.y, W, band.h).setScroll(0, band.y));
    }
  }

  private applyShake(): void {
    if (this.hudCams.length === 0) return;
    const ms = this.realMs - this.shakeAt;
    const cam = this.scene.cameras.main;
    if (ms >= this.shakeMs) {
      for (const c of this.hudCams) this.scene.cameras.remove(c);
      this.hudCams = [];
      this.mapScroll = { x: 0, y: 0 };
      cam.setViewport(0, 0, this.scene.scale.gameSize.width, this.scene.scale.gameSize.height).setScroll(0, 0).setBackgroundColor(this.savedBg);
      return;
    }
    // The reward rail is also still. It can appear or change size mid-shake
    // if a reward is claimed or the browser's usable width changes.
    const right = this.layout.width;
    const railWidth = this.scene.scale.width - right;
    if (railWidth > 0) {
      const existing = this.hudCams.find((c) => c.x === right);
      if (!existing) this.hudCams.push(this.scene.cameras.add(right, 0, railWidth, this.layout.height).setScroll(right, 0));
      else if (existing.width !== railWidth) existing.setSize(railWidth, this.layout.height);
    }
    const o = shakeOffset(ms, this.shakeMs, this.shakePx);
    // Portrait (32b follow-up): the strip is above the map and the controls below, so the
    // map shakes sideways only; grass shows at the uncovered side, as above the map in landscape.
    cam.setScroll(this.mapScroll.x + o.x, this.mapScroll.y + (this.layout.turned ? 0 : o.y));
  }

  /** An impact; `delayMs` (game ms) holds it back, as the boss's later rings. */
  private addImpact(kind: ImpactKind, x: number, y: number, radius: number, angle: number, color: number, delayMs = 0): void {
    const { slot } = this.impactPool.acquire();
    this.impacts[slot] = { kind, x, y, radius, angle, color, bornMs: this.gameMs + delayMs };
  }

  /** A projectile arrived: its impact. */
  private land(shot: Shot): void {
    this.showpiece?.onImpact(shot);
    const { x, y } = shot.to;
    sound.play(`impact.${shot.tower}`);
    switch (shot.tower) {
      case 'cannon':
        this.addImpact('splash', x, y, shot.splashRadius ?? 0, 0, COLORS.cannonSplash);
        this.burst(this.dust, 10, shot.to);
        this.burst(this.sparks, 6, shot.to);
        break;
      case 'mortar':
        this.addImpact('splash', x, y, shot.splashRadius ?? 0, 0, COLORS.mortarSplash);
        this.burst(this.dust, 16, shot.to);
        this.burst(this.sparks, 8, shot.to);
        this.burst(this.smoke, 3, shot.to);
        break;
      case 'tarpit':
        this.addImpact('tar', x, y, 9, 0, COLORS.tarSplat);
        break;
      case 'firepot':
        this.addImpact('fire', x, y, 13, 0, COLORS.fireBurst);
        break;
      default:
        this.burst(this.dust, 4, shot.to);
        break;
    }
  }

  /** Every frame in play: land what has arrived, turn barrels, age labels and banners. */
  update(state: GameState): void {
    const now = this.gameMs;
    if (this.due.length > 0) {
      let keep = 0;
      for (const d of this.due) {
        if (d.at > now) {
          this.due[keep++] = d;
          continue;
        }
        if (d.kind === 'impact') this.land(d.shot);
        else if (d.kind === 'hit') {
          this.sprites.hit(d.id, d.from);
          this.showpiece?.onHit(d.id, this.sprites.spot(d.id));
          if (this.hitNumber) {
            const spot = this.sprites.spot(d.id);
            if (spot) this.hitNumber(spot, d.damage);
          }
          sound.play('hit');
        } else if (d.kind === 'kill') this.killNow(d.id, d.bounty, d.type);
        else this.bossDeath(d.id, d.large);
      }
      this.due.length = keep;
    }
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (p && now - p.bornMs >= p.travelMs) {
        this.projectiles[i] = null;
        this.projectilePool.release(i);
      }
    }
    for (let i = 0; i < this.impacts.length; i++) {
      const f = this.impacts[i];
      if (f && now - f.bornMs >= IMPACT_MS[f.kind]) {
        this.impacts[i] = null;
        this.impactPool.release(i);
      }
    }
    // Barrels turn toward their targets' current positions at TURN_RATE.
    const byId = new Map<number, Enemy>();
    for (const e of state.enemies) byId.set(e.id, e);
    const step = this.lastTurnMs === null ? 0 : ((now - this.lastTurnMs) / 1000) * TURN_RATE;
    this.lastTurnMs = now;
    const live = new Set<number>();
    for (const t of state.towers) {
      const pose = this.pose(t.cell, t.type);
      live.add(cellKey(t.cell));
      pose.upgraded = t.upgraded;
      pose.path = t.path;
      pose.type = t.type;
      const target = byId.get(pose.targetId);
      if (target) {
        const c = cellCenter(t.cell);
        const q = enemyPosition(target, this.map);
        pose.targetAngle = Math.atan2(q.y - c.y, q.x - c.x);
      }
      pose.angle = turnStep(pose.angle, pose.targetAngle, step);
    }
    for (const key of this.poses.keys()) if (!live.has(key)) this.poses.delete(key);
    this.sells = this.sells.filter((s) => this.realMs - s.atMs < POP_MS.sell);
    // Gold labels.
    for (const slot of this.gold.expire(this.realMs)) this.goldTexts[slot]?.setVisible(false);
    const goldBySize: Phaser.GameObjects.Text[][] | undefined = this.clean ? [[], []] : undefined;
    for (let i = 0; i < this.gold.labels.length; i++) {
      const l = this.gold.labels[i];
      const t = this.goldTexts[i];
      if (!l || !t) continue;
      const look = goldLabelLook(this.realMs - l.bornMs, l.lastMs - l.bornMs);
      const text = goldGainText(l.amount);
      if (t.text !== text) t.setText(text);
      t.setPosition(l.x, l.y - look.rise).setAlpha(look.alpha);
      goldBySize?.[Number(l.big)].push(t);
    }
    if (goldBySize) {
      const map = this.layout.map;
      for (const [i, labels] of goldBySize.entries()) {
        const fits = this.goldFit[i].fit(i === 1 ? 34 : this.layout.turned ? 20 : 17, labels.map(label => {
          const pad = 2 * textInset(label);
          return { label, width: map.width - pad, height: map.height - pad };
        }));
        for (const label of labels) {
          label.setVisible(fits);
          if (fits) placeFloatingText(label, map, label.x, label.y);
        }
      }
    }
    this.applyShake();
    this.drawOverlays();
  }

  /** The pose drawTowers uses for the tower on `cell`. */
  towerPose(cell: Cell, type: TowerType): TowerPose {
    const p = this.pose(cell, type);
    const recoil = recoilOffset(this.gameMs - p.firedMs, RECOIL_PX[type]);
    let scale = 1;
    if (p.popKind !== null) {
      const ms = this.realMs - p.popMs;
      if (ms >= POP_MS[p.popKind]) p.popKind = null;
      else scale = popScale(p.popKind, ms);
    }
    return { angle: p.angle, recoil, scale };
  }

  /** Test hook: the barrel angle of the tower on (col, row), or null. */
  towerAngle(cell: Cell): number | null {
    return this.poses.get(cellKey(cell))?.angle ?? null;
  }

  /** Projectiles, impacts, sold towers shrinking and the cottage glow, on the shot layer. */
  draw(g: Phaser.GameObjects.Graphics, painted?: PaintedSkin): void {
    const now = this.gameMs;
    for (const s of this.sells) {
      const p = cellCenter(s.cell);
      const pose = { angle: s.angle, recoil: 0, scale: Math.max(0.01, popScale('sell', this.realMs - s.atMs)) };
      if (painted) painted.sold(s.type, p, pose);
      drawTowerScaled(g, painted ? null : s.type, p, pose, s.upgraded, 1, this.layout, s.path);
    }
    for (const f of this.impacts) if (f && now >= f.bornMs) drawImpact(g, f, (now - f.bornMs) / IMPACT_MS[f.kind]);
    for (const p of this.projectiles) if (p) drawProjectile(g, p, (now - p.bornMs) / p.travelMs, this.layout, painted);
    const exit = flashFade(this.realMs - this.exitAt, EXIT_FLASH_MS);
    if (exit > 0) {
      g.fillStyle(COLORS.exitGlow, 0.5 * exit);
      g.fillCircle(this.cottage.x, this.cottage.y, 30);
      g.lineStyle(4, COLORS.exitGlow, exit);
      g.strokeCircle(this.cottage.x, this.cottage.y, 30 + 10 * (1 - exit));
    }
  }

  /** The veil (boss darkening, boss flash), the banner and the Lives flash. */
  private drawOverlays(): void {
    const v = this.veil;
    v.clear();
    const dark = darkenAlpha(this.realMs - this.darkenAt);
    const m = this.layout.map;
    if (dark > 0) v.fillStyle(COLORS.darken, dark).fillRect(m.x, m.y, m.width, m.height);
    const flash = flashFade(this.realMs - this.flashAt, BOSS_FLASH_MS);
    if (flash > 0) v.fillStyle(0xffffff, 0.5 * flash).fillRect(m.x, m.y, m.width, m.height);

    const since = this.realMs - this.exitAt;
    const lf = flashFade(since, EXIT_FLASH_MS);
    const dx = this.reducedMotion ? 0 : livesShake(since);
    const livesKey = `${lf > 0}|${dx}`;
    if (livesKey !== this.lastLivesKey) {
      this.lastLivesKey = livesKey;
      this.livesFx(lf, dx);
    }
  }

  /** Test hook (window.__tarpit.fx()). */
  snapshot(): FxState {
    const labels: string[] = [];
    for (const l of this.gold.labels) if (l) labels.push(goldGainText(l.amount));
    return {
      projectiles: this.projectilePool.count,
      impacts: this.impactPool.count,
      goldLabels: labels,
      banner: this.moments?.text ?? null,
      bannerPending: this.moments?.pending ?? 0,
      reducedMotion: this.reducedMotion,
      shakes: this.counts.shakes,
      darkenings: this.counts.darkenings,
      darken: darkenAlpha(this.realMs - this.darkenAt),
      screenFlashes: this.counts.screenFlashes,
      bossEntrances: this.counts.bossEntrances,
      bossDeaths: this.counts.bossDeaths,
      exitFlashes: this.counts.exitFlashes,
      livesFlashing: flashFade(this.realMs - this.exitAt, EXIT_FLASH_MS) > 0,
      pendingKills: this.due.filter((d) => d.kind === 'kill').length,
      gameMs: this.gameMs,
      camera: { x: this.scene.cameras.main.scrollX - this.mapScroll.x, y: this.scene.cameras.main.scrollY - this.mapScroll.y, split: this.hudCams.length > 0 },
    };
  }
}

/** Where a shot leaves its tower: the barrel tip (as the old tracers), aimed at the target. */
function muzzlePoint(shot: Shot): Point {
  const { from, to } = shot;
  const d = MUZZLE[shot.tower];
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len <= d) return { ...from };
  const k = d / len;
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}

function drawProjectile(g: Phaser.GameObjects.Graphics, p: Projectile, t: number, layout: Layout, painted?: PaintedSkin): void {
  // World-space drawing (milestone 32b): arcs rise up the screen, and shadows sit below them, flat on the screen.
  const up = layout.up;
  const a = arcPosition(p.from, p.to, t, p.height, up);
  if (painted) {
    painted.projectile(p.tower, a, a.angle);
    return;
  }
  const shadow = (w: number, h: number, alpha: number) => {
    const at = layout.offset({ x: a.groundX, y: a.groundY }, 0, 3);
    const size = layout.ellipse(w, h);
    g.fillStyle(COLORS.shellShadow, alpha).fillEllipse(at.x, at.y, size.w, size.h);
  };
  const dx = Math.cos(a.angle);
  const dy = Math.sin(a.angle);
  // A short bright trail behind fast shots: from where it was a little earlier.
  const trail = (len: number, width: number, color: number, alpha: number) => {
    const b = arcPosition(p.from, p.to, Math.max(0, t - len), p.height, up);
    g.lineStyle(width, color, alpha).lineBetween(b.x, b.y, a.x, a.y);
  };
  switch (p.tower) {
    case 'musketeer':
      trail(0.45, 5, COLORS.muzzleFlash, 0.35);
      trail(0.3, 2.5, COLORS.muzzleFlash, 0.9);
      g.fillStyle(COLORS.muzzleFlash, 1).fillCircle(a.x, a.y, 5.5);
      g.fillStyle(COLORS.musketBall, 1).fillCircle(a.x, a.y, 4);
      break;
    case 'longbow':
      trail(0.35, 2, COLORS.arrowHead, 0.55);
      g.lineStyle(4, COLORS.musketBall, 0.6).lineBetween(a.x - dx * 16, a.y - dy * 16, a.x, a.y);
      g.lineStyle(3, COLORS.arrowShaft, 1).lineBetween(a.x - dx * 16, a.y - dy * 16, a.x, a.y);
      g.lineStyle(2, COLORS.arrowHead, 1);
      g.lineBetween(a.x - dx * 16 - dy * 5, a.y - dy * 16 + dx * 5, a.x - dx * 11, a.y - dy * 11);
      g.lineBetween(a.x - dx * 16 + dy * 5, a.y - dy * 16 - dx * 5, a.x - dx * 11, a.y - dy * 11);
      g.fillStyle(COLORS.arrowHead, 1).fillTriangle(a.x + dx * 6, a.y + dy * 6, a.x - dy * 4, a.y + dx * 4, a.x + dy * 4, a.y - dx * 4);
      break;
    case 'cannon':
      shadow(16, 7, 0.35);
      trail(0.25, 6, COLORS.smoke, 0.4);
      g.fillStyle(COLORS.arrowHead, 0.9).fillCircle(a.x, a.y, 9);
      g.fillStyle(COLORS.cannonBall, 1).fillCircle(a.x, a.y, 8);
      g.fillStyle(COLORS.arrowHead, 0.7).fillCircle(a.x - 3, a.y - 3, 2.5);
      break;
    case 'mortar': {
      const lift = Math.hypot(a.x - a.groundX, a.y - a.groundY);
      const high = p.height > 0 ? lift / p.height : 0;
      // A clear shadow on the ground, smaller and fainter the higher the shell.
      shadow(22 - 8 * high, 10 - 3 * high, 0.5 - 0.15 * high);
      trail(0.15, 7, COLORS.smoke, 0.45);
      const r = 10 + 2 * high;
      g.fillStyle(COLORS.arrowHead, 0.9).fillCircle(a.x, a.y, r + 1.5);
      g.fillStyle(COLORS.mortarShell, 1).fillCircle(a.x, a.y, r);
      g.fillStyle(COLORS.arrowHead, 0.6).fillCircle(a.x - r * 0.35, a.y - r * 0.35, r * 0.3);
      g.fillStyle(COLORS.fireBurstCore, 1).fillCircle(a.x - dx * (r + 2), a.y - dy * (r + 2), 3);
      break;
    }
    case 'tarpit':
      shadow(12, 5, 0.3);
      g.fillStyle(COLORS.tarSplat, 0.7).fillCircle(a.x - dx * 9, a.y - dy * 9, 4);
      g.fillStyle(COLORS.tarpitHighlight, 0.9).fillCircle(a.x, a.y, 9);
      g.fillStyle(COLORS.tarSplat, 1).fillCircle(a.x, a.y, 8);
      g.fillStyle(COLORS.tarpitHighlight, 0.9).fillCircle(a.x - 2.5, a.y - 2.5, 2.5);
      break;
    case 'firepot': {
      // A gout: blobs from the pot to the head, growing toward the head.
      for (let i = 5; i >= 0; i--) {
        const u = Math.max(0, t - i * 0.1);
        const b = arcPosition(p.from, p.to, u, 0, up);
        const r = 10 - i * 1.3;
        g.fillStyle(i % 2 === 0 ? COLORS.fireBurst : COLORS.fireBurstCore, 0.95 - i * 0.1).fillCircle(b.x, b.y, r);
      }
      g.fillStyle(COLORS.muzzleFlash, 1).fillCircle(a.x, a.y, 4);
      break;
    }
  }
}

function drawImpact(g: Phaser.GameObjects.Graphics, f: Impact, u: number): void {
  const a = Math.max(0, 1 - u);
  switch (f.kind) {
    case 'splash': {
      // A bright flash at the centre first, then a bold ring out to the splash radius.
      const r = f.radius * (0.35 + 0.65 * Math.min(1, u * 1.8));
      if (u < 0.3) {
        const k = 1 - u / 0.3;
        g.fillStyle(COLORS.fireBurstCore, 0.9 * k).fillCircle(f.x, f.y, f.radius * 0.55);
        g.fillStyle(COLORS.muzzleFlash, k).fillCircle(f.x, f.y, f.radius * 0.3);
      }
      g.fillStyle(f.color, 0.45 * a).fillCircle(f.x, f.y, r);
      g.lineStyle(6, COLORS.fxDark, 0.5 * a).strokeCircle(f.x, f.y, r);
      g.lineStyle(4, f.color, a).strokeCircle(f.x, f.y, r);
      break;
    }
    case 'tar':
      g.fillStyle(f.color, 0.9 * a);
      g.fillCircle(f.x, f.y, f.radius);
      g.fillCircle(f.x - 8, f.y + 5, 5);
      g.fillCircle(f.x + 8, f.y - 4, 4);
      g.fillCircle(f.x + 4, f.y + 8, 4);
      g.fillCircle(f.x - 5, f.y - 7, 3);
      break;
    case 'fire':
      g.fillStyle(COLORS.fireBurst, 0.9 * a).fillCircle(f.x, f.y, f.radius * (0.7 + 0.6 * u));
      g.fillStyle(COLORS.fireBurstCore, a).fillCircle(f.x, f.y, f.radius * 0.5);
      g.fillStyle(COLORS.muzzleFlash, a).fillCircle(f.x, f.y, f.radius * 0.25);
      break;
    case 'muzzle': {
      const dx = Math.cos(f.angle);
      const dy = Math.sin(f.angle);
      const r = f.radius;
      g.fillStyle(COLORS.fireBurst, 0.9 * a);
      g.fillTriangle(f.x - dy * r * 0.8, f.y + dx * r * 0.8, f.x + dy * r * 0.8, f.y - dx * r * 0.8, f.x + dx * r * 2.2, f.y + dy * r * 2.2);
      g.fillStyle(f.color, a);
      g.fillTriangle(f.x - dy * r * 0.5, f.y + dx * r * 0.5, f.x + dy * r * 0.5, f.y - dx * r * 0.5, f.x + dx * r * 1.6, f.y + dy * r * 1.6);
      g.fillCircle(f.x, f.y, r * 0.7);
      g.fillStyle(0xffffff, a).fillCircle(f.x, f.y, r * 0.35);
      break;
    }
    case 'bossRing': {
      const r = f.radius * Math.min(1, 0.15 + u * 1.3);
      g.fillStyle(COLORS.bossBurst, 0.35 * a).fillCircle(f.x, f.y, r * 0.8);
      g.lineStyle(10, COLORS.fxDark, 0.35 * a).strokeCircle(f.x, f.y, r);
      g.lineStyle(7, f.color, a).strokeCircle(f.x, f.y, r);
      g.lineStyle(3, COLORS.bossBurst, a).strokeCircle(f.x, f.y, r - 5);
      break;
    }
  }
}
