import Phaser from 'phaser';
import { cellKey, shotCooldown, towerStats, type GameState, type Shot, type Tower, type TowerType } from '../../sim';
import { MUZZLE } from '../draw/towers';
import type { Layout } from '../layout';
import { INK_KEY } from './battleArt';

interface Crew {
  type: TowerType;
  figure: Phaser.GameObjects.Image;
  mate?: Phaser.GameObjects.Image;
  light?: Phaser.GameObjects.Image;
  seen: number;
}
interface Firing {
  at: number;
  angle: number;
  heat: number;
}
const roles = { musketeer: 'musket', cannon: 'gunner', mortar: 'gunner', longbow: 'archer' } as const;
export class GunCrews {
  private readonly crews = new Map<number, Crew>();
  private readonly barrels = new Map<number, Firing>();
  private pass = 0;
  private readonly webgl: boolean;

  constructor(private readonly scene: Phaser.Scene, private readonly layout: Layout, private readonly layer: Phaser.GameObjects.Layer) {
    this.webgl = scene.game.renderer.type === Phaser.WEBGL;
  }

  private sprite(frame: string) {
    const image = this.scene.add.image(0, 0, INK_KEY, frame).setScale(.5);
    this.layer.add(image);
    return image;
  }
  fire(shot: Shot, now: number): void {
    if (shot.tower === 'tarpit' || shot.tower === 'firepot') return;
    const id = cellKey(shot.cell), last = this.barrels.get(id);
    const gap = last ? now - last.at : Infinity;
    const heat = Math.min(1, (last?.heat ?? 0) * Math.exp(-gap / 2100) + .32);
    this.barrels.set(id, { at: now, heat, angle: Math.atan2(shot.to.y - shot.from.y, shot.to.x - shot.from.x) });
  }

  draw(state: GameState, tier: number, now: number, calm: boolean, placing: boolean): void {
    this.pass++;
    this.layer.setAlpha(placing ? .3 : 1);
    for (const tower of state.towers) {
      const id = cellKey(tower.cell), p = this.layout.cellCenter(tower.cell);
      let crew = this.crews.get(id);
      if (crew?.type !== tower.type) {
        if (crew) this.remove(id, crew);
        if (tower.type === 'firepot' && !this.webgl) continue;
        const frame = tower.type === 'firepot' ? 'ripple' : tower.type === 'tarpit' ? 'bubble' : roles[tower.type] + '0';
        crew = { type: tower.type, figure: this.sprite(frame), seen: 0 };
        this.crews.set(id, crew);
      }
      crew.seen = this.pass;
      if (tower.type === 'firepot') {
        // World sprites, zones and the placement rail are above this layer.
        const hot = tier === 2 && !calm && !placing;
        crew.figure.setVisible(hot);
        if (hot) {
          const u = (now / 1240 + id * 0.37) % 1;
          crew.figure.setPosition(p.x + 5 + 2.3 * Math.sin(u * 7), p.y - 33 - 11 * u)
            .setScale(0.32 + 0.26 * u, 0.48).setAlpha(Math.sin(Math.PI * u) * 0.48);
        }
        continue;
      }
      if (tower.type === 'tarpit') {
        const t = calm ? .45 : (now / 980 + id * .47) % 1;
        crew.figure.setPosition(p.x - 5 + t * 3, p.y + 5 - t * 4).setScale(.3 + t * .38).setAlpha(calm ? .6 : Math.sin(Math.PI * t)).setVisible(tier > 0);
        continue;
      }
      const fire = this.barrels.get(id), age = fire ? now - fire.at : Infinity;
      const pose = this.pose(tower, state, calm, now, id);
      const role = roles[tower.type];
      const side = p.x < this.layout.map.x + 22 ? 1 : -1;
      const frame = role + pose;
      if (crew.figure.frame.name !== frame) crew.figure.setFrame(frame);
      crew.figure.setPosition(p.x + side * 13, p.y + 8).setFlipX(side > 0);
      const artillery = tower.type === 'cannon' || tower.type === 'mortar';
      if (artillery && tier > 0) {
        const mate = crew.mate ??= this.sprite('gunner0');
        const mateFrame = 'gunner' + (pose === 2 ? 3 : pose === 3 ? 2 : pose);
        if (mate.frame.name !== mateFrame) mate.setFrame(mateFrame);
        mate.setPosition(p.x - side * 13, p.y + 6).setFlipX(side < 0).setVisible(true);
      } else crew.mate?.setVisible(false);
      const glow = fire && !calm && tier > 0 && (artillery || tower.type === 'musketeer');
      if (!glow || age > 1550) {
        crew.light?.setVisible(false);
        continue;
      }
      const d = this.layout.screenDir(Math.cos(fire.angle), Math.sin(fire.angle));
      if (!crew.light) {
        crew.light = this.sprite('glow');
        if (this.webgl) crew.light.setBlendMode(Phaser.BlendModes.ADD);
      }
      const light = crew.light;
      const warm = artillery ? Math.max(0, fire.heat - .5) * Math.exp(-age / 610) : 0;
      const flash = Math.max(0, 1 - age / 130);
      const scale = .25 + flash * .46;
      light.setPosition(p.x + d.x * MUZZLE[tower.type], p.y + d.y * MUZZLE[tower.type])
        .setScale(scale, scale * .8).setAlpha(Math.min(1, warm + flash * .85)).setVisible(true);
    }
    for (const [id, crew] of this.crews) {
      if (crew.seen !== this.pass) this.remove(id, crew);
    }
  }

  private pose(tower: Tower, state: GameState, calm: boolean, now: number, id: number) {
    if (calm) return 0;
    if (tower.cooldownTicks === 0) return (Math.floor(now / 930) + id) % 5 === 0 ? 5 : 0;
    const u = 1 - tower.cooldownTicks / shotCooldown(towerStats(tower, state.boons));
    if (u < .12) return 4;
    if (u < .36) return 1;
    if (u < .58) return 2;
    if (u < .82) return 3;
    return 4;
  }
  private remove(id: number, crew: Crew) {
    crew.figure.destroy();
    crew.mate?.destroy();
    crew.light?.destroy();
    this.crews.delete(id);
    this.barrels.delete(id);
  }
}
