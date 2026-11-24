import Phaser from 'phaser';
import type { EnemyType, GameState, Point, Shot } from '../../sim';
import type { Layout } from '../layout';
import { INK_KEY, battleTexture } from './battleArt';
import { GunCrews } from './battleCrew';
import { BattleField } from './battleField';
import { VictorySalute } from './battleVictory';

type Spot = Point & { type: EnemyType };
export interface BattleObserver {
  onImpact(shot: Shot): void;
  onHit(id: number, spot: Spot | null): void;
  onKill(id: number, spot: Spot): void;
}
export class ShowpieceBattle implements BattleObserver {
  blast?: () => void;
  private readonly fieldLayer: Phaser.GameObjects.Layer;
  private readonly crewLayer: Phaser.GameObjects.Layer;
  private readonly victoryLayer: Phaser.GameObjects.Layer;
  private readonly field: BattleField;
  private readonly crew: GunCrews;
  private readonly salute: VictorySalute;
  private readonly profile = new URLSearchParams(location.search).get('perf') === '1';
  private readonly timings = { frames: 0, fieldMs: 0, crewMs: 0, victoryMs: 0, victoryFrames: 0 };
  private calm = true;
  private tier = 2;
  private hitSequence = 0;
  private state?: GameState;
  private victoryKill = false;

  constructor(private readonly scene: Phaser.Scene, private readonly layout: Layout, zones: Phaser.GameObjects.Graphics, private readonly frozen: boolean) {
    battleTexture(scene);
    const belowZones = () => {
      const layer = scene.add.layer();
      Phaser.Utils.Array.MoveTo(scene.children.list, layer, scene.children.getIndex(zones));
      return layer;
    };
    this.fieldLayer = belowZones();
    this.crewLayer = belowZones();
    this.victoryLayer = belowZones();
    this.field = new BattleField(scene, layout, this.fieldLayer);
    this.crew = new GunCrews(scene, layout, this.crewLayer);
    this.salute = new VictorySalute(scene, layout, this.victoryLayer);
  }

  onTick(shots: readonly Shot[]): void {
    for (const shot of shots) {
      this.crew.fire(shot, this.scene.game.loop.now);
      // Test stepping shows the game's instant-hit tracers and still stamps.
      if (this.frozen) this.onImpact(shot);
    }
  }

  onImpact(shot: Shot): void {
    const p = this.layout.toScreen(shot.to);
    const id = shot.targetId;
    switch (shot.tower) {
      case 'cannon':
      case 'mortar':
        this.blast?.();
        this.field.stamp('crater', p, this.calm, id);
        break;
      case 'longbow':
        this.field.stamp('arrow', p, this.calm, id);
        break;
      case 'firepot':
        this.field.stamp('ash', p, this.calm, id);
        break;
      case 'tarpit': {
        const target = this.state?.enemies.find(e => e.id === id);
        if (target?.type === 'wolf' && target.slowTicksLeft > 0) {
          this.field.stamp('skid', p, this.calm, id);
        }
        break;
      }
    }
  }

  onHit(id: number, spot: Spot | null): void {
    // Loose change and torn paperwork only on confirmed impact. Most hits
    // in a large volley keep just their existing Painted hit flash.
    this.hitSequence++;
    if (!spot || this.tier === 0 || this.hitSequence % (this.tier === 1 ? 5 : 3) !== 1) return;
    if (spot.type === 'goblin') this.field.stamp('coin', spot, this.calm, id + this.hitSequence);
    if (spot.type === 'harpy' || spot.type === 'boss') this.field.stamp('page', spot, this.calm, id + this.hitSequence);
  }

  onKill(id: number, spot: Spot): void {
    // A live goblin still wears its painted hat. Remove it only with the
    // exact death puff, at the same rendered spot (including a blocker pile).
    const victory = this.state?.phase === 'won' && !this.victoryKill;
    if (victory) this.victoryKill = true;
    if (spot.type === 'goblin') this.field.stamp('hat', spot, this.calm, id, victory);
    else if (spot.type !== 'wolf' && spot.type !== 'troll') this.field.stamp('page', spot, this.calm, id, victory);
  }

  draw(state: GameState, tier: 0 | 1 | 2, calm: boolean, placing: boolean): void {
    this.state = state;
    this.tier = tier;
    this.calm = calm;
    const now = this.scene.game.loop.now;
    let start = this.profile ? performance.now() : 0;
    this.field.draw(state, tier, calm, placing);
    if (this.profile) {
      const end = performance.now();
      this.timings.fieldMs += end - start;
      start = end;
    }
    this.crew.draw(state, tier, now, calm, placing);
    if (this.profile) {
      const end = performance.now();
      this.timings.crewMs += end - start;
      start = end;
    }
    const won = state.phase === 'won';
    this.salute.draw(won, now, tier, calm);
    if (this.profile) {
      this.timings.frames++;
      if (won) {
        this.timings.victoryMs += performance.now() - start;
        this.timings.victoryFrames++;
      }
    }
  }

  snapshot() {
    return { ...this.field.snapshot(), battleCpu: { ...this.timings } };
  }

  destroy(): void {
    this.fieldLayer.destroy();
    this.crewLayer.destroy();
    this.victoryLayer.destroy();
    this.scene.textures.remove(INK_KEY);
  }
}
