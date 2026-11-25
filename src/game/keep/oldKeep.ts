// All scenery and its texture URLs belong to the hidden visit.
import Phaser from 'phaser';
import type { MapDef } from '../../sim';
import type { Layout } from '../layout';
import type { GameScene } from '../GameScene';
import type { GameClock } from '../loop';
import { SHOWPIECE_DETAIL } from '../names';
import type { DetailGovernor, Detail } from '../showpiece/governor';

export { createKeep } from '../../sim/oldKeep';

const plates = ['sky','drift','portrait','landscape','far','crown','gate','lightning','mist','glow','plinth','gallery'] as const;
type Plate = typeof plates[number];
type Image = Phaser.GameObjects.Image;
const textureKey = (name: Plate) => 'keep:' + name;

export async function loadKeep(scene: Phaser.Scene): Promise<boolean> {
  try {
    await Promise.all(plates.map(async name => {
      const key = textureKey(name);
      if (scene.textures.exists(key)) return;
      const image = new window.Image();
      image.src = import.meta.env.BASE_URL + 'assets/keep/' + name + '.webp';
      await image.decode();
      if (!scene.textures.exists(key)) scene.textures.addImage(key,image);
    }));
    return true;
  } catch {
    return false;
  }
}

function lightningAt(ms: number): number {
  const t = (ms + 7300) % 15700;
  const pulse = (peak: number, rise: number, decay: number) =>
    t < peak ? Math.max(0, 1 - (peak - t) / rise) : Math.exp(-(t - peak) / decay);
  return Math.min(1, pulse(12000,45,94) * .63 + pulse(12215,33,210));
}

/** One world-painted plate per orientation and three registered miniature exposures. */
export class KeepView {
  readonly layer: Phaser.GameObjects.Container;
  private readonly scenery: Phaser.GameObjects.Container;
  private readonly castle: Image[];
  private readonly clouds: Image[];
  private readonly fog: Image[];
  private readonly lights: Image[];
  private readonly banners: Phaser.GameObjects.Graphics;
  private readonly rain: Phaser.GameObjects.Graphics;
  private readonly skyFlash: Phaser.GameObjects.Rectangle;
  private readonly gate: { x: number; y: number };
  private readonly castleW: number;
  private readonly castleH: number;
  private readonly quality: DetailGovernor;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly stillLightning: boolean;
  private readonly buildings = [[566,780],[714,780],[608,429],[431,548],[864,546],[664,570]];
  private readonly pins = [542,738];
  private previous = -Infinity;
  private lastFrame = -1;
  private lastCalm?: boolean;
  private finishedOpening = false;
  private opening = 0;
  private lightning = 0;
  private label?: HTMLOutputElement;
  private labelTier = -1;

  constructor(private readonly scene: GameScene, private readonly layout: Layout, map: MapDef,
      private readonly clock: GameClock, private readonly frozen: boolean, Governor: typeof DetailGovernor) {
    const query = new URLSearchParams(location.search);
    const perf = query.get('perf') === '1';
    const pin = perf ? query.get('keepTier') : null;
    this.quality = new Governor(pin !== null && /^[012]$/.test(pin) ? Number(pin) as Detail : undefined);
    this.stillLightning = frozen && query.get('keepLightning') === '1';
    const { x, y, width, height } = layout.map;
    const gate = layout.toScreen(map.path[map.path.length-1]);
    this.gate = {x:gate.x-x,y:gate.y-y};
    this.castleW = layout.turned ? 495 : 430;
    this.castleH = layout.turned ? 372 : 243;

    this.layer = scene.add.container(x,y);
    this.scenery = scene.add.container(0,0);
    this.layer.add(this.scenery);
    const add = (name: Plate): Image => {
      const im = scene.add.image(0,0,textureKey(name)).setOrigin(0);
      this.scenery.add(im);
      return im;
    };
    const skyline = layout.turned ? 390 : 250;
    add('sky').setDisplaySize(width,skyline);
    this.clouds = Array.from({length:2},() => add('drift').setOrigin(.5));
    this.skyFlash = scene.add.rectangle(0,0,width,skyline,0xd2ddff).setOrigin(0);
    this.scenery.add(this.skyFlash);
    add(layout.turned ? 'portrait' : 'landscape').setDisplaySize(width,height);
    this.castle = (['far','crown','gate','lightning'] as const).map(name => add(name)
      .setDisplaySize(this.castleW,this.castleH).setOrigin(.5,934/960).setPosition(this.gate.x,this.gate.y));
    this.lights = this.buildings.map(([u,v],i) => {
      const pos = this.native(u,v);
      return add('glow').setOrigin(.5).setPosition(pos.x,pos.y)
        .setDisplaySize(i<2 ? 32 : 17,i<2 ? 36 : 21);
    });
    this.banners = scene.add.graphics();
    this.scenery.add(this.banners);
    this.fog = Array.from({length:3},() => add('mist').setOrigin(.5));
    for (const cell of map.buildSites ?? []) {
      const c = layout.cellCenter(cell);
      const lift = this.gate.y-(c.y-y);
      if (lift >= 24) {
        // A high gable gallery projects further than the pair on the curtain walk.
        const height = lift > 50 ? 51 : 21;
        add('gallery').setOrigin(.5,0).setDisplaySize(38,height).setPosition(c.x-x,c.y-y+1);
      }
      add('plinth').setPosition(c.x-x,c.y-y).setOrigin(.5).setDisplaySize(32,25);
    }
    this.rain = scene.add.graphics();
    this.scenery.add(this.rain);
    if (perf) {
      this.label = document.createElement('output');
      this.label.style.cssText = 'position:fixed;right:2px;top:2px;color:white;background:#19211ee6;font:11px monospace;padding:2px 4px;pointer-events:none';
      document.body.append(this.label);
    }
    this.frame();
  }

  private native(x: number, y: number) {
    return { x:this.gate.x+(x-640)*this.castleW/1280, y:this.gate.y+(y-934)*this.castleH/960 };
  }

  private hangBanners(t: number): void {
    const g=this.banners.clear();
    this.pins.forEach((pin,i) => {
      const {x,y} = this.native(pin,716);
      const w = this.castleW*.020, h = this.castleH*.075;
      const gust = Math.sin(t*2.1+i)*w*.35+Math.sin(t*4.3)*w*.12;
      const hem = y+h+Math.sin(t*2+i)*.9;
      g.fillStyle(0x203e51).beginPath().moveTo(x-w*.55,y).lineTo(x+w*.55,y)
        .lineTo(x+w*.57+gust,hem-h*.12).lineTo(x+w*.1+gust,hem)
        .lineTo(x-w*.4+gust,hem-h*.11).closePath().fillPath();
      g.lineStyle(1,0x648a9b).beginPath().moveTo(x-w*.4,y)
        .lineTo(x-w*.37+gust*.4,y+h*.49).lineTo(x-w*.27+gust,hem-h*.12).strokePath();
      g.lineStyle(1.4,0xe6bd79).beginPath().moveTo(x-w*.38+gust*.6,y+.65*h)
        .lineTo(x+gust*.72,y+.75*h).lineTo(x+w*.38+gust*.78,y+.64*h).strokePath();
    });
  }

  frame(interacting = false): void {
    if (this.clock.paused && this.previous !== -Infinity) return;
    const ms = this.clock.nowMs;
    if (this.lastFrame !== ms) this.quality.sample(ms);
    this.lastFrame = ms;
    const tier = this.quality.tier;
    const calm = this.frozen || this.reduced.matches;
    if (interacting || this.scene.state.towers.length || this.scene.state.wave > 0) this.finishedOpening = true;
    const opening = calm || this.finishedOpening ? 0 : Math.max(0,1-ms/3600);
    if (calm === this.lastCalm && (calm || (ms-this.previous < [96,32,15][tier] && !(this.opening && !opening)))) return;
    this.lastCalm = calm;
    this.previous = ms;
    const t = calm ? 0 : ms/1000;
    this.opening = opening*opening*(3-2*opening);
    const push = this.opening * .36;
    this.scenery.setScale(1+push).setPosition(-this.gate.x*push,-8*push);
    this.lightning = this.stillLightning ? 1 : calm ? 0 : lightningAt(ms);
    if (this.lightning < .013) this.lightning = 0;
    const parallax = tier > 0 && !calm ? Math.sin(t*.19) : 0;
    this.castle.forEach((im,i) => {
      im.x = this.gate.x + (2-Math.min(i,2)) * (parallax*.7+this.opening*1.2);
      im.y = this.gate.y + (2-Math.min(i,2))*this.opening*5;
    });
    this.castle[3].setVisible(this.lightning>0).setAlpha(this.lightning);
    this.skyFlash.setVisible(this.lightning>0).setAlpha(this.lightning*.55);
    const {width,height} = this.layout.map;
    this.clouds.forEach((im,i) => {
      im.setVisible(tier>=1 && (i===0 || tier===2));
      if (im.visible) im.setPosition(width*(i ? .8 : .18) + Math.sin(t*.088+i)*width*.18,20+i*50+this.opening*8)
        .setDisplaySize(width*(i ? .64 : .85),i ? 90 : 120).setAlpha(i ? .33 : .52);
    });
    this.fog.forEach((im,i) => {
      im.setVisible(i===0 || tier===2 || (tier===1 && i===1));
      if (im.visible) im.setPosition(width*(.14+i*.31) + Math.sin(t*.12+i*2.6)*width*.12,
        this.gate.y+4+i*height*.16+Math.sin(t*.28+i)*2)
        .setDisplaySize(width*(i===0 ? 1.04 : .74),i===0 ? 48 : 28).setAlpha(i===0 ? .47 : .31);
    });
    this.lights.forEach((im,i) => {
      const pulse = .64+Math.sin(t*(i<2 ? 9.4 : 3.4)+i)*.13+Math.sin(t*17.1+i*2.8)*.075;
      im.setVisible(i<2 || tier>0).setAlpha(pulse*(i<2 ? .9 : .56));
    });
    this.hangBanners(t);
    this.rain.clear();
    if (!calm && tier>0) {
      this.rain.lineStyle(.8,0xc7d5e1,.25+this.lightning*.4).beginPath();
      for (let i=0;i<(tier===2 ? 37 : 11);i++) {
        const y=(i*133.7+t*(242+i%4*30))%height;
        const x=((i*79.3-t*(47+i%4*6))%width+width)%width;
        this.rain.moveTo(x,y).lineTo(x-1.9,y+7+i%4);
      }
      this.rain.strokePath();
    }
    if (this.label && this.labelTier !== tier) {
      this.label.textContent = SHOWPIECE_DETAIL[tier];
      this.labelTier = tier;
    }
  }

  snapshot() {
    return { tier:this.quality.tier, timeMs:this.frozen || this.reduced.matches ? 0 : this.clock.nowMs,
      lightning:this.lightning, opening:this.opening };
  }

  resumed(): void { this.quality.resetWindow(2); }

  destroy(): void {
    this.label?.remove();
  }
}
