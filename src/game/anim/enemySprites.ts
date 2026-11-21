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

import Phaser from 'phaser';
import { ENEMY_STATS, enemyPosition, type Enemy, type EnemyType, type GameEvent, type GameState } from '../../sim';
import { bobOffset, DEATH_MS, burnPulse, FLAME_EVERY, HIT_FLASH_MS, Particles, statusTint, TINT } from './effects';
import { facingAt } from './facing';
import { COLORS } from '../palette';
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
  texture: EnemyType;
  /** The walk animation key for the current facing (frozen in test mode). */
  anim: string;
  /** Position in the walk cycle, from 0; always 0 in test mode. */
  frame: number;
  facing: Facing;
  flipX: boolean;
  scale: number;
  flags: { hit: boolean; burning: boolean; slowed: boolean; dying: boolean };
}

interface View {
  sprite: Phaser.GameObjects.Sprite;
  /** The Shieldbearer's shield mark, drawn in front of the sprite; null for other types. */
  shield: Phaser.GameObjects.Graphics | null;
  type: EnemyType;
  flying: boolean;
  facing: Facing;
  /** Play: hit flash ends at this scene time. Test: set by a hit, cleared on the next tick. */
  hitUntil: number;
  hitThisTick: boolean;
  burning: boolean;
  slowed: boolean;
  dying: boolean;
  redraws: number;
}

/** Load every enemy sheet (call from a scene's preload). */
export function loadEnemySheets(scene: Phaser.Scene): void {
  for (const sheet of Object.values(SHEETS)) {
    if (!scene.textures.exists(sheet.key)) {
      scene.load.spritesheet(sheet.key, sheet.url, { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
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
        frameRate: WALK_FPS,
        repeat: -1,
      });
    }
  }
}

export class EnemySprites {
  private readonly views = new Map<number, View>();
  private readonly layer: Phaser.GameObjects.Layer;
  /** Flyers' layer, above the labels (setAirLayer); the walkers' layer until set. */
  private airLayer: Phaser.GameObjects.Layer;
  private readonly particles: Particles | null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly frozen: boolean,
  ) {
    ensureAnims(scene);
    this.layer = scene.add.layer();
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

  private hit(id: number): void {
    const v = this.views.get(id);
    if (!v || v.dying) return;
    v.hitThisTick = true;
    v.hitUntil = this.scene.time.now + HIT_FLASH_MS;
  }

  private kill(id: number): void {
    const v = this.views.get(id);
    if (!v || v.dying) return;
    if (this.frozen) {
      this.remove(id);
      return;
    }
    v.dying = true;
    v.sprite.anims.stop();
    const dead = SHEETS[v.type].deadFrame;
    if (dead !== undefined) v.sprite.setFrame(dead);
    v.sprite.clearTint();
    v.shield?.setVisible(false);
    this.particles?.puff(v.sprite.x, v.sprite.y);
    this.scene.tweens.add({
      targets: v.sprite,
      scale: 0,
      alpha: 0,
      duration: DEATH_MS,
      onComplete: () => this.remove(id),
    });
  }

  private remove(id: number): void {
    const v = this.views.get(id);
    if (!v) return;
    this.scene.tweens.killTweensOf(v.sprite);
    v.sprite.destroy();
    v.shield?.destroy();
    this.views.delete(id);
  }

  /** Match the sprites to the live enemies: create, move, face, animate and tint. */
  sync(state: GameState, timeScale: number): void {
    const live = new Set<number>();
    for (const enemy of state.enemies) {
      live.add(enemy.id);
      this.update(this.views.get(enemy.id) ?? this.create(enemy), enemy, timeScale);
    }
    // An enemy gone without a kill or exit event (a test hook, a restart): drop it.
    for (const [id, v] of this.views) if (!live.has(id) && !v.dying) this.remove(id);
  }

  private create(enemy: Enemy): View {
    const sheet = SHEETS[enemy.type];
    const stats = ENEMY_STATS[enemy.type];
    const sprite = this.scene.add.sprite(0, 0, sheet.key, sheet.walk.right.frames[0]).setScale(sheet.scale);
    (stats.flying ? this.airLayer : this.layer).add(sprite);
    let shield: Phaser.GameObjects.Graphics | null = null;
    if (stats.shield) {
      const h = SHIELD_SIZE / 2;
      shield = this.scene.add.graphics();
      shield.fillStyle(COLORS.shieldMarkEdge, 1);
      shield.fillRoundedRect(-h - 1, -h - 1, SHIELD_SIZE + 2, SHIELD_SIZE + 2, 3);
      shield.fillStyle(COLORS.shieldMark, 1);
      shield.fillRoundedRect(-h, -h, SHIELD_SIZE, SHIELD_SIZE, 2);
      this.layer.add(shield);
    }
    const view: View = {
      sprite,
      shield,
      type: enemy.type,
      flying: stats.flying,
      facing: 'right',
      hitUntil: -1,
      hitThisTick: false,
      burning: false,
      slowed: false,
      dying: false,
      redraws: 0,
    };
    this.views.set(enemy.id, view);
    this.setFacing(view, facingAt(enemy.distance, this.step(enemy)), true);
    return view;
  }

  /** Pixels this enemy moved on its last tick. */
  private step(enemy: Enemy): number {
    const slow = enemy.slowTicksLeft > 0 ? enemy.slow : 0;
    return (ENEMY_STATS[enemy.type].speed * (1 - slow)) / 60;
  }

  private setFacing(v: View, facing: Facing, force = false): void {
    if (!force && facing === v.facing) return;
    v.facing = facing;
    const cycle = SHEETS[v.type].walk[facing];
    v.sprite.setFlipX(cycle.flipX);
    if (this.frozen) v.sprite.setFrame(cycle.frames[0]);
    else v.sprite.anims.play(walkAnimKey(v.type, facing), true);
  }

  private update(v: View, enemy: Enemy, timeScale: number): void {
    const { x, y } = enemyPosition(enemy);
    const lift = SHEETS[v.type].lift ?? 0;
    const bob = v.flying && !this.frozen ? bobOffset(this.scene.time.now, enemy.id) : 0;
    v.sprite.setPosition(x, y - lift + bob);
    v.sprite.setDepth(y);
    if (v.shield) {
      v.shield.setPosition(x + SHIELD_DX, y + SHIELD_DY);
      // Just in front of its own sprite, behind any walker lower on screen.
      v.shield.setDepth(y + 0.5);
    }
    this.setFacing(v, facingAt(enemy.distance, this.step(enemy)));
    v.sprite.anims.timeScale = timeScale;
    v.burning = (enemy.burnTicksLeft ?? 0) > 0;
    v.slowed = enemy.slowTicksLeft > 0;
    v.redraws += 1;

    if (this.isHit(v)) {
      v.sprite.setTintFill(TINT.flash);
    } else if (v.flying) {
      v.sprite.clearTint(); // flyers are never tarred or burned
    } else {
      const tint = statusTint(v.burning, v.slowed, this.frozen ? 1 : burnPulse(this.scene.time.now));
      if (tint === null) v.sprite.clearTint();
      else v.sprite.setTint(tint);
    }
    if (v.burning && !v.flying && this.particles && v.redraws % FLAME_EVERY === 0) {
      this.particles.flicker(x + Phaser.Math.Between(-6, 6), y - 6);
    }
  }

  private isHit(v: View): boolean {
    return this.frozen ? v.hitThisTick : this.scene.time.now < v.hitUntil;
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
      texture: v.type,
      anim,
      frame: Math.max(0, frame),
      facing: v.facing,
      flipX: s.flipX,
      scale: SHEETS[v.type].scale,
      flags: { hit: this.isHit(v), burning: v.burning, slowed: v.slowed, dying: v.dying },
    };
  }

  /** Live sprite count, dying ones included (for tests). */
  get count(): number {
    return this.views.size;
  }
}
