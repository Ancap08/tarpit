// One Phaser Sprite per live enemy (milestone 16), driven by the simulation
// state on every redraw and by its events after every tick (effects.ts).
//
// Texture by type (sheets.ts), scale 2 (Goblin, Wolf, Harpy, Shieldbearer)
// or 3 (Troll), facing from the last tick's movement (facing.ts), walk
// animation at 10 fps in play and frozen on the cycle's first frame in test
// mode. Walkers live in one Layer above the path and towers and below the
// shot effects, hp bars, labels and HUD; inside it they sort by y, so lower
// enemies draw in front.
//
// Milestone 22: flyers (Harpy) live in a second, air Layer that GameScene
// adds after the tower labels (setAirLayer), so they draw above every walker
// and every label. A flyer is drawn `lift` px above its path position with a
// gentle bob in play (frozen in test mode); its ground shadow is drawn with
// the status rings (draw/enemies.ts). Flyers never take a tar or burn tint,
// only the hit flash. A Shieldbearer carries a small grey shield mark on its
// left, drawn just in front of its sprite; a halved shot shows only the
// usual hit flash.
//
// Milestone 23: the boss (Grumblefoot) has a third Layer between the
// walkers and the shot effects, so he draws above every walker and below
// shots, hp bars, labels and Harpies. He is drawn `lift` px up so his feet
// stand on the path, walks at 8 fps in play (frozen in test mode), and his
// hit flash is a frame of his own Hit sheet shown over him (a second
// sprite) instead of the white tint fill, so it shows in Canvas too. His
// ground shadow and rings are drawn in draw/enemies.ts; his hp is the HUD
// boss bar (ui/bossBar.ts), not a small bar.
//
// Milestone 31 (effects, play only): GameScene's Effects calls hit(), kill()
// and remove() itself when a projectile lands, not when the tick fires. An
// enemy killed by a shot still in flight is `doomed`: its sprite stays where
// it died (sync does not drop it) until the shot arrives; meanwhile it
// keeps its walk cycle and walks on along the trail at its last speed
// (drawing only), so a slow shell does not freeze it. A hit with a `from`
// point knocks the sprite a pixel or two away from it; the death puff is
// sized to the enemy (fx/fxMath.ts deathPuff). Test mode never gets here
// through Effects: onEvents() acts at once, as before.

import Phaser from 'phaser';
import type { BlockedPosition, BlockedPositions } from '../draw/barricade';
import { effectiveSlow, ENEMY_STATS, enemyPosition, isBoss, isTarred, positionAlongPath, type Enemy, type EnemyType, type GameEvent, type GameState, type MapDef } from '../../sim';
import { bobOffset, DEATH_MS, burnPulse, FLAME_EVERY, HIT_FLASH_MS, Particles, statusTint, TINT } from './effects';
import { awayFrom, deathPuff, KNOCK_MS, knockPx, knockShare } from '../fx/fxMath';
import { enemyArt, walkFrame } from '../skin/frames';
import type { PaintedSkin } from '../skin/painted';
import { drawPlumage } from '../draw/feathers';
import { facingAt } from './facing';
import type { Layout } from '../layout';
import { COLORS } from '../palette';
import type { GameClock } from '../loop';
import { FACINGS, SHEETS, walkAnimKey, WALK_FPS, type Facing } from './sheets';

/**
 * Shield mark (Shieldbearer): a 6 x 6 rounded rect, radius 2, with a 1 px
 * dark edge, centred SHIELD_DX px left of and SHIELD_DY px below the sprite
 * centre, over the edge of the body.
 */
export const SHIELD_SIZE = 6;
export const SHIELD_DX = -11;
export const SHIELD_DY = 3;


/** What the test hook animState(enemyId) reports. */
export interface AnimState {
  /** Actual sprite centre in canvas pixels. */
  x: number;
  y: number;
  texture: EnemyType;
  /** The walk animation key for the current facing (frozen in test mode). */
  anim: string;
  /** Position in the walk cycle, from 0; always 0 in test mode. */
  frame: number;
  facing: Facing;
  flipX: boolean;
  scale: number;
  blockerLunge: number;
  flags: { hit: boolean; burning: boolean; slowed: boolean; dying: boolean };
}

export interface PaintedBody {
  x: number; y: number; width: number; height: number; depth: number;
}

// Keep both atlas bearings on the same stride while turning a painted walker.
const TURN_MS = 100;

interface View {
  turn?: { previous: Phaser.GameObjects.Image; facing: Facing; start: number };
  sprite: Phaser.GameObjects.Sprite;
  plumage?: Phaser.GameObjects.Graphics;
  plumageSide?: number;
  shadow?: Phaser.GameObjects.Image;
  crown: Phaser.GameObjects.Graphics | null;
  /** The Shieldbearer's shield mark, drawn in front of the sprite; null for other types. */
  shield: Phaser.GameObjects.Graphics | null;
  /** The boss's hit-flash frame (sheets.ts hitFlash), shown over the sprite while hit; null for other types. */
  flash: Phaser.GameObjects.Sprite | null;
  type: EnemyType;
  flying: boolean;
  facing: Facing;
  /** Play: hit flash ends at this scene time. Test: set by a hit, cleared on the next tick. */
  hitUntil: number;
  hitThisTick: boolean;
  burning: boolean;
  slowed: boolean;
  dying: boolean;
  /** Milestone 31: killed by a shot still in flight; kept in place until it lands. */
  doomed: boolean;
  /** Scene time it was doomed; its last distance and px per tick, for the walk-on. */
  doomedAt: number;
  distance: number;
  stepPx: number;
  /** Milestone 31: the knock direction (unit vector, px per share) and when it started (scene ms). */
  knockX: number;
  knockY: number;
  knockAt: number;
  redraws: number;
  blockerLunge: number;
}

/** Load every enemy sheet (call from a scene's preload). */
export function loadEnemySheets(scene: Phaser.Scene): void {
  for (const sheet of Object.values(SHEETS)) {
    if (!scene.textures.exists(sheet.key)) {
      scene.load.spritesheet(sheet.key, sheet.url, { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
    }
    const hf = sheet.hitFlash;
    if (hf && !scene.textures.exists(hf.key)) {
      scene.load.spritesheet(hf.key, hf.url, { frameWidth: hf.frameWidth, frameHeight: hf.frameHeight });
    }
  }
}

/** Create the walk animations once per game (global animation manager). */
function ensureAnims(scene: Phaser.Scene): void {
  for (const sheet of Object.values(SHEETS)) {
    for (const facing of FACINGS) {
      const key = walkAnimKey(sheet.key, facing);
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(sheet.key, { frames: [...sheet.walk[facing].frames] }),
        frameRate: sheet.fps ?? WALK_FPS,
        repeat: -1,
      });
    }
  }
}

export class EnemySprites {
  private readonly views = new Map<number, View>();
  readonly layer: Phaser.GameObjects.Layer;
  /** The boss's layer: above the walkers, below everything added after this class. */
  private readonly bossLayer: Phaser.GameObjects.Layer;
  /** Flyers' layer, above the labels (setAirLayer); the walkers' layer until set. */
  private airLayer: Phaser.GameObjects.Layer;
  private readonly particles: Particles | null;

  /** `layout` (milestone 32b) places every sprite on the screen and turns its facing with the map. */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly frozen: boolean,
    private readonly layout: Layout,
    private readonly painted: PaintedSkin | undefined,
    private readonly clock: GameClock,
  ) {
    if (!painted) ensureAnims(scene);
    this.layer = painted?.standing ?? scene.add.layer();
    this.bossLayer = painted?.standing ?? scene.add.layer();
    this.airLayer = this.layer;
    this.particles = frozen ? null : new Particles(scene);
  }

  /**
   * Give flyers their own layer. GameScene calls this right after creating
   * the tower labels, with a layer added then, so flyers draw above every
   * walker and label but below the HUD, panel and end screen.
   */
  setAirLayer(layer: Phaser.GameObjects.Layer): void {
    this.airLayer = layer;
  }

  /** Call when a new tick's events arrive: per-tick test flags reset. */
  newTick(): void {
    for (const v of this.views.values()) v.hitThisTick = false;
  }

  /** React to simulation events (after a tick or an action). */
  onEvents(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.kind === 'hit') this.hit(e.enemyId);
      else if (e.kind === 'kill') this.kill(e.enemyId);
      else if (e.kind === 'exit') this.remove(e.enemyId);
    }
  }

  /** A hit: the flash, and (milestone 31, play) a knock away from `from` when given. */
  hit(id: number, from?: { x: number; y: number }): void {
    const v = this.views.get(id);
    if (!v || v.dying) return;
    v.hitThisTick = true;
    v.hitUntil = this.clock.nowMs + HIT_FLASH_MS;
    if (from && !this.frozen) {
      const d = awayFrom(this.layout.toScreen(from), { x: v.sprite.x, y: v.sprite.y });
      const px = knockPx(v.type);
      v.knockX = d.x * px;
      v.knockY = d.y * px;
      v.knockAt = this.clock.nowMs;
    }
  }

  /** Milestone 31: this enemy died to a shot still in flight; keep its sprite until kill(). */
  doom(id: number): void {
    const v = this.views.get(id);
    if (v && !v.dying && !v.doomed) {
      v.doomed = true;
      v.doomedAt = this.clock.nowMs;
    }
  }

  private lift(type: EnemyType): number {
    if (this.painted) return ENEMY_STATS[type].flying ? 3 : 0;
    return SHEETS[type].lift ?? 0;
  }

  /** Actual upper body edge after bob and knock, in canvas pixels. */
  paintedBar(id: number): PaintedBody | undefined {
    const v = this.views.get(id);
    if (v) return this.paintedBarForView(v);
  }

  private paintedBarForView(v: View): PaintedBody | undefined {
    if (!this.painted) return;
    const { density, sheets } = this.painted.assets;
    const sheet = sheets[enemyArt(v.type)];
    const bounds = sheet.bodyBounds?.[Number(v.sprite.frame.name) % sheet.frames];
    if (bounds) return { x: v.sprite.x + ((bounds[0] + bounds[2]) / 2 - sheet.anchor[0]) / density,
      y: v.sprite.y + (bounds[1] - sheet.anchor[1]) / density,
      width: (bounds[2] - bounds[0]) / density, height: (bounds[3] - bounds[1]) / density,
      depth: v.flying ? Infinity : v.sprite.depth };
  }

  /** Where an enemy's sprite stands and its type, or null (milestone 31: puffs and gold labels). */
  spot(id: number): { x: number; y: number; type: EnemyType } | null {
    const v = this.views.get(id);
    if (!v) return null;
    return { x: v.sprite.x, y: v.sprite.y + this.lift(v.type), type: v.type };
  }

  kill(id: number): void {
    const v = this.views.get(id);
    if (!v || v.dying) return;
    if (this.frozen) {
      this.remove(id);
      return;
    }
    v.turn?.previous.destroy();
    v.turn = undefined;
    v.dying = true;
    v.sprite.setAlpha(1);
    v.sprite.anims.stop();
    const dead = SHEETS[v.type].deadFrame;
    if (this.painted) v.sprite.setFrame(Number(v.sprite.frame.name) % this.painted.assets.sheets[enemyArt(v.type)].frames);
    if (!this.painted && dead !== undefined) v.sprite.setFrame(dead);
    v.sprite.clearTint().setBlendMode(Phaser.BlendModes.NORMAL);
    v.plumage?.setVisible(false);
    v.shadow?.setVisible(false);
    v.crown?.setVisible(false);
    v.shield?.setVisible(false);
    v.flash?.setVisible(false);
    const puff = deathPuff(v.type);
    this.particles?.puff(v.sprite.x, v.sprite.y, puff.count, puff.scale);
    this.scene.tweens.add({
      targets: v.sprite,
      scale: 0,
      alpha: 0,
      duration: DEATH_MS,
      onComplete: () => this.remove(id),
    });
  }

  remove(id: number): void {
    const v = this.views.get(id);
    if (!v) return;
    this.scene.tweens.killTweensOf(v.sprite);
    v.turn?.previous.destroy();
    v.sprite.destroy();
    v.plumage?.destroy();
    v.shadow?.destroy();
    v.crown?.destroy();
    v.shield?.destroy();
    v.flash?.destroy();
    this.views.delete(id);
  }

  /**
   * Milestone 30: create (and place) a sprite for every live enemy that has
   * none yet. GameScene calls this after each tick of a frame, before the
   * tick's events, so a hit or kill on an enemy spawned earlier in the same
   * frame finds its sprite instead of being dropped.
   */
  addNew(state: GameState): void {
    for (const enemy of state.enemies) if (!this.views.has(enemy.id)) this.update(this.create(enemy, state.map), enemy, state.map, 1);
  }

  /** Match the sprites to the live enemies: create, move, face, animate and tint. */
  sync(state: GameState, timeScale: number, stopped?: BlockedPositions): void {
    const live = new Set<number>();
    for (const enemy of state.enemies) {
      live.add(enemy.id);
      const view = this.views.get(enemy.id) ?? this.create(enemy, state.map);
      const position = stopped?.get(enemy.id);
      this.update(view, enemy, state.map, timeScale, position);
    }
    // An enemy gone without a kill or exit event (a test hook, a restart): drop it.
    for (const [id, v] of this.views) {
      if (live.has(id) || v.dying) continue;
      if (v.doomed) this.walkOn(v, state.map, timeScale);
      else this.remove(id);
    }
  }

  /** A doomed sprite walks on along the trail at its last speed until its shot lands (play only). */
  private walkOn(v: View, map: MapDef, timeScale: number): void {
    if (v.stepPx === 0) return; // A walker killed against the wall stays there until the shot lands.
    const ticks = ((this.clock.nowMs - v.doomedAt) / (1000 / 60)) * timeScale;
    const distance = Math.max(0, v.distance + v.stepPx * ticks);
    const { x, y } = this.layout.toScreen(positionAlongPath(map, distance));
    v.shadow?.setPosition(x, y);
    const lift = this.lift(v.type);
    v.sprite.setPosition(x, y - lift).setDepth(y);
    if (this.painted) this.setFacing(v, facingAt(map, distance, v.stepPx, this.layout), false, distance);
    this.placePlumage(v, y);
    v.sprite.anims.timeScale = timeScale;
    v.crown?.setPosition(v.sprite.x, v.sprite.y - 41).setDepth(y + 1);
    v.shield?.setPosition(x + SHIELD_DX, y + SHIELD_DY).setDepth(y + 0.5);
  }

  private create(enemy: Enemy, map: MapDef): View {
    const sheet = SHEETS[enemy.type];
    const stats = ENEMY_STATS[enemy.type];
    const art = enemyArt(enemy.type);
    const sprite = this.painted
      ? this.painted.pose(this.scene.add.sprite(0, 0, this.painted.assets.sheets[art].key, 0), art, 0)
      : this.scene.add.sprite(0, 0, sheet.key, sheet.walk.right.frames[0]).setScale(sheet.scale);
    const shadow = this.painted && stats.flying ? this.painted.image('harpy-shadow') : undefined;
    if (shadow) this.painted!.shadows.add(shadow);
    const layer = stats.flying ? this.airLayer : isBoss(enemy) ? this.bossLayer : this.layer;
    layer.add(sprite);
    let flash: Phaser.GameObjects.Sprite | null = null;
    if (!this.painted && sheet.hitFlash) {
      flash = this.scene.add.sprite(0, 0, sheet.hitFlash.key, sheet.hitFlash.frame).setScale(sheet.scale).setVisible(false);
      layer.add(flash);
    }
    let shield: Phaser.GameObjects.Graphics | null = null;
    if (!this.painted && stats.shield) {
      const h = SHIELD_SIZE / 2;
      shield = this.scene.add.graphics();
      shield.fillStyle(COLORS.shieldMarkEdge, 1);
      shield.fillRoundedRect(-h - 1, -h - 1, SHIELD_SIZE + 2, SHIELD_SIZE + 2, 3);
      shield.fillStyle(COLORS.shieldMark, 1);
      shield.fillRoundedRect(-h, -h, SHIELD_SIZE, SHIELD_SIZE, 2);
      this.layer.add(shield);
    }
    let crown: Phaser.GameObjects.Graphics | null = null;
    if (!this.painted && enemy.type === 'grumblemaw') {
      crown = this.scene.add.graphics();
      const points = [{ x: -18, y: -14 }, { x: -7, y: -6 }, { x: 0, y: -20 }, { x: 7, y: -6 },
        { x: 18, y: -14 }, { x: 14, y: 3 }, { x: -14, y: 3 }];
      crown.fillStyle(COLORS.bossBurst).fillPoints(points, true);
      crown.lineStyle(3, COLORS.fxDark).strokePoints(points, true);
      crown.fillStyle(COLORS.bossBarFill).fillCircle(0, -3, 3);
      layer.add(crown);
    }
    const view: View = {
      shadow, crown,
      sprite,
      shield,
      flash,
      type: enemy.type,
      flying: stats.flying,
      facing: 'right',
      hitUntil: -1,
      hitThisTick: false,
      burning: false,
      slowed: false,
      dying: false,
      doomed: false,
      doomedAt: 0,
      distance: enemy.distance,
      stepPx: 0,
      knockX: 0,
      knockY: 0,
      knockAt: -1,
      redraws: 0,
      blockerLunge: 0,
    };
    this.views.set(enemy.id, view);
    this.setFacing(view, facingAt(map, enemy.distance, this.step(enemy), this.layout), true);
    return view;
  }

  /** Pixels this enemy moved on its last tick. */
  private step(enemy: Enemy): number {
    if (enemy.runTicksLeft) return -ENEMY_STATS[enemy.type].speed / 60;
    const slow = effectiveSlow(enemy);
    return (ENEMY_STATS[enemy.type].speed * (1 - slow)) / 60;
  }

  private setFacing(v: View, facing: Facing, force = false, distance = v.distance): void {
    if (this.painted) {
      const now = this.clock.nowMs;
      const hitOffset = this.isHit(v) ? this.painted.assets.sheets[enemyArt(v.type)].frames : 0;
      if (!force && !this.frozen && !v.flying && facing !== v.facing) {
        const previous = v.turn?.previous ?? this.painted.image(enemyArt(v.type));
        this.layer.add(previous);
        v.turn = { previous, facing: v.facing, start: now };
      }
      if (v.turn) {
        const fade = Math.min(1, (now - v.turn.start) / TURN_MS);
        v.sprite.setAlpha(fade);
        if (fade === 1) {
          v.turn.previous.destroy();
          v.turn = undefined;
        } else {
          v.turn.previous.setPosition(v.sprite.x, v.sprite.y).setDepth(v.sprite.depth)
            .setFrame(hitOffset + walkFrame(v.turn.facing, distance, false)).setAlpha(1 - fade);
        }
      }
      v.facing = facing;
      const index = hitOffset + walkFrame(facing, distance, this.frozen);
      if (Number(v.sprite.frame.name) !== index) v.sprite.setFrame(index);
      return;
    }
    if (!force && facing === v.facing) return;
    v.facing = facing;
    const cycle = SHEETS[v.type].walk[facing];
    v.sprite.setFlipX(cycle.flipX);
    v.flash?.setFlipX(cycle.flipX);
    if (this.frozen) v.sprite.setFrame(cycle.frames[0]);
    else v.sprite.anims.play(walkAnimKey(v.type, facing), true);
  }

  private placePlumage(v: View, depth: number): void {
    if (!v.plumage) return;
    const body = this.paintedBarForView(v);
    const side = v.facing === 'left' ? 1 : -1;
    if (v.plumageSide !== side) {
      drawPlumage(v.plumage.clear(), side, v.type === 'troll' ? 1.2 : 1);
      v.plumageSide = side;
    }
    v.plumage.setPosition(body?.x ?? v.sprite.x, body ? body.y + body.height * 0.48 : v.sprite.y - 2)
      .setAngle(v.sprite.angle).setDepth(depth + 0.25);
  }

  private update(v: View, enemy: Enemy, map: MapDef, timeScale: number, stoppedAt?: BlockedPosition): void {
    const { x, y } = this.layout.toScreen(stoppedAt ?? enemyPosition(enemy, map));
    v.blockerLunge = stoppedAt?.lunge ?? 0;
    const lift = this.lift(v.type);
    const bob = v.flying && !this.frozen ? bobOffset(this.clock.nowMs, enemy.id) : 0;
    if (v.knockAt >= 0 && this.clock.nowMs - v.knockAt >= KNOCK_MS) v.knockAt = -1;
    if (v.knockAt >= 0) {
      const k = knockShare(this.clock.nowMs - v.knockAt);
      v.sprite.setPosition(x + v.knockX * k, y - lift + bob + v.knockY * k);
    } else {
      v.sprite.setPosition(x, y - lift + bob);
    }
    // A Classic boss normally stands above the walkers. At a guard, put all
    // parts of its sprite in the formation so the nearer combatant draws last.
    if (!this.painted && isBoss(enemy)) {
      const layer = enemy.guardContact ? this.layer : this.bossLayer;
      if (v.sprite.displayList !== layer) {
        layer.add(v.sprite);
        if (v.flash) layer.add(v.flash);
        if (v.crown) layer.add(v.crown);
      }
    }
    const depth = stoppedAt?.depth ?? y;
    v.sprite.setDepth(depth);
    v.crown?.setPosition(v.sprite.x, v.sprite.y - 41).setDepth(depth + 1);
    if (v.shield) {
      v.shield.setPosition(x + SHIELD_DX, y + SHIELD_DY);
      // Keep the shield just in front of its owner.
      v.shield.setDepth(depth + 0.5);
    }
    this.setFacing(v, facingAt(map, stoppedAt?.distance ?? enemy.distance, this.step(enemy), this.layout), false, enemy.distance);
    v.shadow?.setPosition(x, y);
    const flinching = !!enemy.flinchTicksLeft;
    v.sprite.anims.timeScale = stoppedAt || flinching ? 0 : timeScale;
    v.sprite.setAngle(flinching ? (v.facing === 'left' ? 15 : -15) : 0);
    if (enemy.feathered && !v.plumage) {
      v.plumage = this.scene.add.graphics();
      (v.flying ? this.airLayer : this.layer).add(v.plumage);
    }
    this.placePlumage(v, depth);
    v.distance = enemy.distance;
    v.stepPx = stoppedAt || flinching ? 0 : this.step(enemy);
    v.burning = (enemy.burnTicksLeft ?? 0) > 0;
    v.slowed = isTarred(enemy);
    v.redraws += 1;

    const hit = this.isHit(v);
    if (v.flash) {
      v.flash.setPosition(x, y - lift).setDepth(depth + 0.1).setVisible(hit);
    }
    if (hit && this.painted) {
      v.sprite.clearTint();
    } else if (hit && !v.flash) {
      v.sprite.setTintFill(TINT.flash);
    } else {
      // Flyers too: a special can tar or burn a Harpy (milestone 25b).
      const tint = statusTint(v.burning, v.slowed, this.frozen ? 1 : burnPulse(this.clock.nowMs));
      if (tint === null) v.sprite.clearTint();
      else v.sprite.setTint(tint);
    }
    if (v.burning && this.particles && v.redraws % FLAME_EVERY === 0) {
      this.particles.flicker(x + Phaser.Math.Between(-6, 6), y - lift - 6);
    }
  }

  private isHit(v: View): boolean {
    return this.frozen ? v.hitThisTick : this.clock.nowMs < v.hitUntil;
  }

  /** Test hook: the sprite state for an enemy id, or null if it has no sprite. */
  animState(id: number): AnimState | null {
    const v = this.views.get(id);
    if (!v) return null;
    const s = v.sprite;
    const anim = walkAnimKey(v.type, v.facing);
    const current = s.anims.currentAnim;
    const frame = this.frozen || !current || !s.anims.currentFrame ? 0 : current.frames.indexOf(s.anims.currentFrame);
    return {
      x: s.x,
      y: s.y,
      texture: SHEETS[v.type].key,
      anim,
      frame: this.painted ? Number(s.frame.name) % 4 : Math.max(0, frame),
      facing: v.facing,
      flipX: s.flipX,
      scale: s.scaleX,
      blockerLunge: v.blockerLunge,
      flags: { hit: this.isHit(v), burning: v.burning, slowed: v.slowed, dying: v.dying },
    };
  }

  /** Live sprite count, dying ones included (for tests). */
  get count(): number {
    return this.views.size;
  }
}
