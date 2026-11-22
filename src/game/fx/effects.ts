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

import type Phaser from 'phaser';
import {
  cellCenter,
  cellKey,
  cottageFor,
  enemyPosition,
  pathLength,
  positionAlongPath,
  type Cell,
  type Enemy,
  type GameEvent,
  type GameState,
  type MapDef,
  type Point,
  type Shot,
  type TowerType,
} from '../../sim';
import type { EnemySprites } from '../anim/enemySprites';
import { STEP_MS } from '../loop';
import { BOSS_BANNER_SUB, BOSS_NAME, bonusGoldText, goldGainText, waveClearBanner, waveStartBanner } from '../names';
import { COLORS, FONT, TEXT } from '../palette';
import { Aim, drawTowerScaled, MUZZLE, type TowerPose } from '../draw/towers';
import {
  arcHeight,
  arcPosition,
  BannerQueue,
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
  SlotPool,
  TRAVEL_MS,
  TURN_RATE,
  turnStep,
  type PopKind,
} from './fxMath';

/** Impact lengths (game ms). */
const IMPACT_MS: Readonly<Record<ImpactKind, number>> = {
  splash: 300,
  tar: 400,
  fire: 260,
  muzzle: 70,
  bossRing: 700,
};
/** The boss's death flash over the whole map (real ms; off under reduced motion). */
const BOSS_FLASH_MS = 160;
/** Map area (the HUD starts at y 480). */
const MAP_W = 960;
const MAP_H = 480;

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
  | { at: number; kind: 'hit'; id: number; from: Point }
  | { at: number; kind: 'kill'; id: number; bounty: number }
  | { at: number; kind: 'bossDown'; id: number }
  | { at: number; kind: 'impact'; shot: Shot };

interface Pose {
  angle: number;
  targetAngle: number;
  targetId: number;
  firedMs: number;
  type: TowerType;
  upgraded: boolean;
  popKind: PopKind | null;
  popMs: number;
}

interface SellGhost {
  cell: Cell;
  type: TowerType;
  upgraded: boolean;
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
}

const SMOKE_KEY = 'fx-smoke';
const SPARK_KEY = 'fx-spark';

/** The Lives readout: GameScene passes Hud.livesFx. */
export type LivesFx = (flash: number, dx: number) => void;

export class Effects {
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
  private readonly banners = new BannerQueue();
  private bannerText!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private bannerBg!: Phaser.GameObjects.Graphics;
  private bannerKey = '';
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

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sprites: EnemySprites,
    private readonly map: MapDef,
    private readonly livesFx: LivesFx,
  ) {
    this.projectiles = new Array<Projectile | null>(CAPS.projectiles).fill(null);
    this.impacts = new Array<Impact | null>(CAPS.impacts).fill(null);
    this.startAim = new Aim(map);
    const exit = positionAlongPath(map, pathLength(map));
    const box = cottageFor(exit);
    this.cottage = { x: box.x + box.width / 2, y: box.y + box.height - 12 };
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
  createOverlays(): void {
    this.veil = this.scene.add.graphics();
    for (let i = 0; i < CAPS.goldLabels; i++) {
      this.goldTexts.push(
        this.scene.add
          .text(0, 0, '', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: TEXT.goldGain, stroke: TEXT.fxStroke, strokeThickness: 3 })
          .setOrigin(0.5, 1)
          .setVisible(false),
      );
    }
    this.bannerBg = this.scene.add.graphics();
    this.bannerText = this.scene.add
      .text(MAP_W / 2, 0, '', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: TEXT.waveBanner, stroke: TEXT.fxStroke, strokeThickness: 5 })
      .setOrigin(0.5, 0.5)
      .setVisible(false);
    this.bannerSub = this.scene.add
      .text(MAP_W / 2, 0, '', { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: TEXT.waveBannerSub, stroke: TEXT.fxStroke, strokeThickness: 4 })
      .setOrigin(0.5, 0.5)
      .setVisible(false);
  }

  get reducedMotion(): boolean {
    return this.motionQuery?.matches ?? false;
  }

  private get realMs(): number {
    return this.scene.time.now;
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
    const m = muzzlePoint(shot);
    if (shot.tower === 'musketeer' || shot.tower === 'cannon' || shot.tower === 'mortar') {
      this.addImpact('muzzle', m.x, m.y, shot.tower === 'musketeer' ? 5 : 8, pose.targetAngle, COLORS.muzzleFlash);
      this.smoke.explode(shot.tower === 'musketeer' ? 1 : 3, m.x, m.y);
    }
  }

  /** Route a batch of simulation events (after a tick or an action). */
  onEvents(events: readonly GameEvent[], state: GameState): void {
    this.tickHits.clear();
    for (const e of events) {
      switch (e.kind) {
        case 'hit': {
          const s = this.tickShots.get(cellKey(e.cell));
          if (s === undefined) {
            this.sprites.hit(e.enemyId, cellCenter(e.cell));
            break;
          }
          // Splash knocks away from the blast, a direct hit away from the tower.
          const from = s.shot.splashRadius ? s.shot.to : s.shot.from;
          this.due.push({ at: s.arrive, kind: 'hit', id: e.enemyId, from });
          this.tickHits.set(e.enemyId, Math.max(this.tickHits.get(e.enemyId) ?? 0, s.arrive));
          break;
        }
        case 'kill': {
          const at = this.tickHits.get(e.enemyId);
          if (at === undefined) {
            this.killNow(e.enemyId, e.bounty);
          } else {
            this.sprites.doom(e.enemyId);
            this.due.push({ at, kind: 'kill', id: e.enemyId, bounty: e.bounty });
          }
          break;
        }
        case 'exit':
          this.sprites.remove(e.enemyId);
          this.exitAt = this.realMs;
          this.counts.exitFlashes += 1;
          break;
        case 'bossSpawn':
          this.bossEntrance();
          break;
        case 'bossDown':
          if (e.cause === 'exit') break;
          {
            const at = this.tickHits.get(e.enemyId);
            if (at === undefined) this.bossDeath(e.enemyId);
            else this.due.push({ at, kind: 'bossDown', id: e.enemyId });
          }
          break;
        case 'waveStart':
          this.banners.push({ text: waveStartBanner(e.wave), sub: '', big: false }, this.realMs);
          break;
        case 'waveClear':
          this.banners.push({ text: waveClearBanner(e.wave), sub: e.bonus > 0 ? bonusGoldText(e.bonus) : '', big: false }, this.realMs);
          break;
        case 'build':
          this.pop(e.cell, e.tower, 'build');
          break;
        case 'upgrade':
          this.pop(e.cell, e.tower, 'upgrade');
          {
            const c = cellCenter(e.cell);
            this.sparks.explode(14, c.x, c.y);
          }
          break;
        case 'sell': {
          const old = this.poses.get(cellKey(e.cell));
          this.sells.push({ cell: e.cell, type: e.tower, upgraded: old?.upgraded ?? false, angle: old?.angle ?? 0, atMs: this.realMs });
          this.poses.delete(cellKey(e.cell));
          const c = cellCenter(e.cell);
          this.dust.explode(8, c.x, c.y + 8);
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
    // The game ended: no banner over the end screen.
    if (state.phase === 'won' || state.phase === 'lost') this.banners.clear();
  }

  private pop(cell: Cell, type: TowerType, kind: PopKind): void {
    const pose = this.pose(cell, type);
    pose.type = type;
    pose.popKind = kind;
    pose.popMs = this.realMs;
    const c = cellCenter(cell);
    this.dust.explode(kind === 'build' ? 8 : 4, c.x, c.y + 10);
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

  private killNow(id: number, bounty: number): void {
    const spot = this.sprites.spot(id);
    this.sprites.kill(id);
    if (spot && bounty > 0) this.addGold(spot.x, spot.y - 10, bounty);
  }

  private addGold(x: number, y: number, amount: number): void {
    const { slot } = this.gold.add(x, y, amount, this.realMs);
    const label = this.gold.labels[slot]!;
    const t = this.goldTexts[slot];
    if (!t) return;
    t.setText(goldGainText(label.amount)).setVisible(true);
  }

  private bossEntrance(): void {
    this.counts.bossEntrances += 1;
    this.banners.push({ text: BOSS_NAME, sub: BOSS_BANNER_SUB, big: true }, this.realMs);
    if (this.reducedMotion) return;
    this.darkenAt = this.realMs;
    this.counts.darkenings += 1;
    this.shake(SHAKE.bossEntrance);
  }

  private bossDeath(id: number): void {
    this.counts.bossDeaths += 1;
    const spot = this.sprites.spot(id);
    const p = spot ?? { x: MAP_W / 2, y: MAP_H / 2 };
    this.sparks.explode(40, p.x, p.y - 20);
    this.addImpact('bossRing', p.x, p.y - 20, 90, 0, COLORS.bossBurstRing);
    if (this.reducedMotion) return;
    this.flashAt = this.realMs;
    this.counts.screenFlashes += 1;
    this.shake(SHAKE.bossDeath);
  }

  private shake(s: { ms: number; intensity: number }): void {
    if (this.reducedMotion) return;
    this.counts.shakes += 1;
    this.scene.cameras.main.shake(s.ms, s.intensity);
  }

  private addImpact(kind: ImpactKind, x: number, y: number, radius: number, angle: number, color: number): void {
    const { slot } = this.impactPool.acquire();
    this.impacts[slot] = { kind, x, y, radius, angle, color, bornMs: this.gameMs };
  }

  /** A projectile arrived: its impact. */
  private land(shot: Shot): void {
    const { x, y } = shot.to;
    switch (shot.tower) {
      case 'cannon':
        this.addImpact('splash', x, y, shot.splashRadius ?? 0, 0, COLORS.cannonSplash);
        this.dust.explode(6, x, y);
        break;
      case 'mortar':
        this.addImpact('splash', x, y, shot.splashRadius ?? 0, 0, COLORS.mortarSplash);
        this.dust.explode(10, x, y);
        break;
      case 'tarpit':
        this.addImpact('tar', x, y, 7, 0, COLORS.tarSplat);
        break;
      case 'firepot':
        this.addImpact('fire', x, y, 9, 0, COLORS.fireBurst);
        break;
      default:
        this.dust.explode(2, x, y);
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
        else if (d.kind === 'hit') this.sprites.hit(d.id, d.from);
        else if (d.kind === 'kill') this.killNow(d.id, d.bounty);
        else this.bossDeath(d.id);
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
    for (let i = 0; i < this.gold.labels.length; i++) {
      const l = this.gold.labels[i];
      const t = this.goldTexts[i];
      if (!l || !t) continue;
      const look = goldLabelLook(this.realMs - l.bornMs, l.lastMs - l.bornMs);
      const text = goldGainText(l.amount);
      if (t.text !== text) t.setText(text);
      t.setPosition(l.x, l.y - look.rise).setAlpha(look.alpha);
    }
    this.drawOverlays(state);
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
  draw(g: Phaser.GameObjects.Graphics): void {
    const now = this.gameMs;
    for (const s of this.sells) {
      drawTowerScaled(g, s.type, cellCenter(s.cell), { angle: s.angle, recoil: 0, scale: Math.max(0.01, popScale('sell', this.realMs - s.atMs)) }, s.upgraded);
    }
    for (const f of this.impacts) if (f) drawImpact(g, f, (now - f.bornMs) / IMPACT_MS[f.kind]);
    for (const p of this.projectiles) if (p) drawProjectile(g, p, (now - p.bornMs) / p.travelMs);
    const exit = flashFade(this.realMs - this.exitAt, EXIT_FLASH_MS);
    if (exit > 0) {
      g.fillStyle(COLORS.exitGlow, 0.5 * exit);
      g.fillCircle(this.cottage.x, this.cottage.y, 30);
      g.lineStyle(4, COLORS.exitGlow, exit);
      g.strokeCircle(this.cottage.x, this.cottage.y, 30 + 10 * (1 - exit));
    }
  }

  /** The veil (boss darkening, boss flash), the banner and the Lives flash. */
  private drawOverlays(state: GameState): void {
    const v = this.veil;
    v.clear();
    const dark = darkenAlpha(this.realMs - this.darkenAt);
    if (dark > 0) v.fillStyle(COLORS.darken, dark).fillRect(0, 0, MAP_W, MAP_H);
    const flash = flashFade(this.realMs - this.flashAt, BOSS_FLASH_MS);
    if (flash > 0) v.fillStyle(0xffffff, 0.5 * flash).fillRect(0, 0, MAP_W, MAP_H);

    const ended = state.phase === 'won' || state.phase === 'lost';
    if (ended) this.banners.clear();
    const cur = this.banners.current(this.realMs);
    const key = cur === null ? '' : `${cur.banner.text}|${cur.banner.sub}|${cur.banner.big}`;
    if (key !== this.bannerKey) {
      this.bannerKey = key;
      this.bannerBg.clear();
      if (cur === null) {
        this.bannerText.setVisible(false);
        this.bannerSub.setVisible(false);
      } else {
        const b = cur.banner;
        const y = b.big ? 200 : 150;
        this.bannerText
          .setText(b.text)
          .setFontSize(b.big ? 44 : 30)
          .setColor(b.big ? TEXT.bossBanner : TEXT.waveBanner)
          .setY(y)
          .setVisible(true);
        this.bannerSub.setText(b.sub).setY(y + (b.big ? 36 : 28)).setVisible(b.sub !== '');
        const w = Math.max(this.bannerText.width, this.bannerSub.width) + 48;
        const h = b.sub === '' ? 52 : b.big ? 100 : 84;
        this.bannerBg.fillStyle(COLORS.aimBanner, 0.7).fillRoundedRect(MAP_W / 2 - w / 2, y - 30, w, h, 10);
      }
    }
    if (cur !== null) {
      this.bannerText.setAlpha(cur.alpha);
      this.bannerSub.setAlpha(cur.alpha);
      this.bannerBg.setAlpha(cur.alpha);
    }

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
    const cur = this.banners.current(this.realMs);
    return {
      projectiles: this.projectilePool.count,
      impacts: this.impactPool.count,
      goldLabels: labels,
      banner: cur === null ? null : cur.banner.text,
      bannerPending: this.banners.pending,
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
    };
  }

  /** Whether the keg's shake (GameScene) may run. */
  get shakesAllowed(): boolean {
    return !this.reducedMotion;
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

function drawProjectile(g: Phaser.GameObjects.Graphics, p: Projectile, t: number): void {
  const a = arcPosition(p.from, p.to, t, p.height);
  const dx = Math.cos(a.angle);
  const dy = Math.sin(a.angle);
  switch (p.tower) {
    case 'musketeer':
      g.lineStyle(2.5, COLORS.muzzleFlash, 0.75);
      g.lineBetween(a.x - dx * 12, a.y - dy * 12, a.x, a.y);
      g.fillStyle(COLORS.musketBall, 1).fillCircle(a.x, a.y, 3);
      break;
    case 'longbow':
      g.lineStyle(2.5, COLORS.arrowShaft, 1);
      g.lineBetween(a.x - dx * 14, a.y - dy * 14, a.x, a.y);
      g.lineStyle(1.5, COLORS.arrowHead, 1);
      g.lineBetween(a.x - dx * 14 - dy * 3.5, a.y - dy * 14 + dx * 3.5, a.x - dx * 10, a.y - dy * 10);
      g.lineBetween(a.x - dx * 14 + dy * 3.5, a.y - dy * 14 - dx * 3.5, a.x - dx * 10, a.y - dy * 10);
      g.fillStyle(COLORS.arrowHead, 1).fillTriangle(a.x + dx * 4, a.y + dy * 4, a.x - dy * 3, a.y + dx * 3, a.x + dy * 3, a.y - dx * 3);
      break;
    case 'cannon':
      g.fillStyle(COLORS.shellShadow, 0.22).fillEllipse(a.groundX, a.groundY + 2, 8, 4);
      g.fillStyle(COLORS.cannonBall, 1).fillCircle(a.x, a.y, 5.5);
      g.fillStyle(COLORS.arrowHead, 0.6).fillCircle(a.x - 1.5, a.y - 1.5, 1.5);
      break;
    case 'mortar': {
      const lift = a.groundY - a.y;
      const high = p.height > 0 ? lift / p.height : 0;
      g.fillStyle(COLORS.shellShadow, 0.4 - 0.1 * high).fillEllipse(a.groundX, a.groundY + 2, 14 - 5 * high, 7 - 2.5 * high);
      g.fillStyle(COLORS.mortarShell, 1).fillCircle(a.x, a.y, 5 + 2 * high);
      g.fillStyle(COLORS.muzzleFlash, 0.8).fillCircle(a.x - dx * 4, a.y - dy * 4, 1.5);
      break;
    }
    case 'tarpit':
      g.fillStyle(COLORS.tarSplat, 0.6).fillCircle(a.x - dx * 6, a.y - dy * 6, 2.5);
      g.fillStyle(COLORS.tarSplat, 1).fillCircle(a.x, a.y, 6);
      g.fillStyle(COLORS.tarpitHighlight, 0.8).fillCircle(a.x - 1.5, a.y - 1.5, 1.5);
      break;
    case 'firepot': {
      // A gout: blobs from the pot to the head, growing toward the head.
      for (let i = 4; i >= 0; i--) {
        const u = Math.max(0, t - i * 0.12);
        const b = arcPosition(p.from, p.to, u, 0);
        const r = 6 - i;
        g.fillStyle(i % 2 === 0 ? COLORS.fireBurst : COLORS.fireBurstCore, 0.9 - i * 0.12).fillCircle(b.x, b.y, r);
      }
      break;
    }
  }
}

function drawImpact(g: Phaser.GameObjects.Graphics, f: Impact, u: number): void {
  const a = Math.max(0, 1 - u);
  switch (f.kind) {
    case 'splash': {
      const r = f.radius * (0.35 + 0.65 * Math.min(1, u * 1.6));
      g.fillStyle(f.color, 0.35 * a).fillCircle(f.x, f.y, r);
      g.lineStyle(2.5, f.color, 0.95 * a).strokeCircle(f.x, f.y, r);
      break;
    }
    case 'tar':
      g.fillStyle(f.color, 0.85 * a);
      g.fillCircle(f.x, f.y, 7);
      g.fillCircle(f.x - 6, f.y + 4, 4);
      g.fillCircle(f.x + 6, f.y - 3, 3);
      g.fillCircle(f.x + 3, f.y + 6, 3);
      break;
    case 'fire':
      g.fillStyle(COLORS.fireBurst, 0.85 * a).fillCircle(f.x, f.y, f.radius * (0.7 + 0.5 * u));
      g.fillStyle(COLORS.fireBurstCore, a).fillCircle(f.x, f.y, f.radius * 0.45);
      break;
    case 'muzzle': {
      const dx = Math.cos(f.angle);
      const dy = Math.sin(f.angle);
      const r = f.radius;
      g.fillStyle(f.color, a);
      g.fillTriangle(f.x - dy * r * 0.6, f.y + dx * r * 0.6, f.x + dy * r * 0.6, f.y - dx * r * 0.6, f.x + dx * r * 1.8, f.y + dy * r * 1.8);
      g.fillCircle(f.x, f.y, r * 0.6);
      break;
    }
    case 'bossRing': {
      const r = f.radius * Math.min(1, 0.2 + u);
      g.fillStyle(COLORS.bossBurst, 0.4 * a).fillCircle(f.x, f.y, r * 0.7);
      g.lineStyle(5, f.color, a).strokeCircle(f.x, f.y, r);
      break;
    }
  }
}
