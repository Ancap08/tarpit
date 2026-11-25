// All scenery and its texture URLs belong to the hidden visit.
import Phaser from 'phaser';
import type { MapDef, Point } from '../../sim';
import type { Layout } from '../layout';
import { keepPlateSet, type Plate } from './plates';
import type { GameScene } from '../GameScene';
import type { GameClock } from '../loop';
import { SHOWPIECE_DETAIL } from '../names';
import { KeepSurround } from './surround';
import { KeepLight } from './stoneLight';
import { drawFittings, type Landmark } from './keepMotion';
import projection from './projection.json';
import type { DetailGovernor } from '../showpiece/governor';
import type { KeepSky } from '../../sim/levelTypes';

export { createKeep } from '../../sim/oldKeep';

type Image = Phaser.GameObjects.Image;
const textureKey = (name: Plate) => 'keep:' + name;
const MAGNIFIER_KEY = 'keep:magnifier';

export function currentKeepPlateSet(game: Phaser.Game, portrait: boolean) {
  return keepPlateSet(portrait, Math.ceil(game.canvas.getBoundingClientRect().width * devicePixelRatio));
}

export interface KeepAssets {
  id: string;
  panorama(layout: Layout, gate: Point, size: { width: number; height: number }, foot: number[], sky?: KeepSky): KeepSurround;
  release(): void;
}

export async function loadKeep(game: Phaser.Game, portrait: boolean, signal: AbortSignal,
    onProgress: (fraction: number) => void): Promise<KeepAssets> {
  const set = currentKeepPlateSet(game, portrait);
  const images = new Map<Plate, HTMLImageElement>();
  const installed: Plate[] = [];
  let surround: KeepSurround | undefined;
  const release = () => {
    surround?.destroy();
    surround = undefined;
    for (const name of installed.splice(0)) game.textures.remove(textureKey(name));
    for (const image of images.values()) image.removeAttribute('src');
    images.clear();
  };
  try {
    let completed = 0;
    await Promise.all(set.files.map(async ({ name, file }) => {
      const response = await fetch(import.meta.env.BASE_URL + 'assets/keep/' + file, { signal });
      if (!response.ok) throw new Error(`Keep plate returned ${response.status}`);
      const blob = await response.blob();
      signal.throwIfAborted();
      const url = URL.createObjectURL(blob);
      const image = new window.Image();
      images.set(name, image);
      const cancel = () => image.removeAttribute('src');
      signal.addEventListener('abort', cancel, { once: true });
      try {
        image.src = url;
        await image.decode();
        onProgress(++completed / set.files.length);
      } finally {
        signal.removeEventListener('abort', cancel);
        URL.revokeObjectURL(url);
      }
    }));
    signal.throwIfAborted();
    // Only the small effects go into Phaser. The large plates are painted
    // once into the panorama's cropped canvas layers.
    for (const name of ['mist', 'glow', 'plinth'] as const) {
      const image = images.get(name)!;
      const texture = game.textures.addImage(textureKey(name), image);
      if (!texture) throw new Error(`Could not install keep plate ${name}`);
      installed.push(name);
      texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    return {
      id: set.id,
      release,
      panorama(layout, gate, size, foot, sky) {
        if (surround) return surround;
        surround = new KeepSurround(game.canvas, layout, name => images.get(name)!, gate, size, foot, sky);
        // The static canvases now own the pixels. Retain only the Phaser sources
        // which the battle canvas still draws (and can re-upload on context restore).
        for (const [name, image] of images) {
          if (installed.includes(name)) continue;
          image.removeAttribute('src');
          images.delete(name);
        }
        return surround;
      },
    };
  } catch (error) {
    release();
    throw error;
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
  readonly light: KeepLight;
  private readonly surround: KeepSurround;
  private readonly fieldLight: Phaser.GameObjects.Container;
  private readonly reflection: Phaser.GameObjects.Graphics;
  private readonly spill: Image[];
  private readonly scenery: Phaser.GameObjects.Container;
  private readonly fog: Image[];
  private readonly lights: Image[];
  private readonly banners: Phaser.GameObjects.Graphics;
  private readonly rain: Phaser.GameObjects.Graphics;
  private readonly gate: { x: number; y: number };
  private readonly castleW: number;
  private readonly castleH: number;
  private readonly quality: DetailGovernor;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly stillLightning: boolean;
  private readonly anchors: typeof projection.portrait;
  private previous = -Infinity;
  private lastFrame = -1;
  private lastCalm?: boolean;
  private finishedOpening = false;
  private opening = 0;
  private lightning = 0;
  private label?: HTMLOutputElement;
  private magnifier?: Image;
  private labelTier = -1;
  private lastTier = -1;

  constructor(private readonly scene: GameScene, private readonly layout: Layout, map: MapDef,
      private readonly clock: GameClock, private readonly frozen: boolean, Governor: typeof DetailGovernor, assets: KeepAssets, framed = false) {
    this.finishedOpening = framed;
    const query = new URLSearchParams(location.search);
    const perf = query.get('perf') === '1';
    const pin = perf ? query.get('keepTier') : null;
    this.quality = new Governor(pin === '0' ? 0 : pin === '2' ? 2 : undefined, { medium: false });
    this.quality.resetWindow(8);
    this.stillLightning = frozen && query.get('keepLightning') === '1';
    const { x, y } = layout.map;
    const gate = layout.toScreen(map.path[map.path.length-2]);
    this.gate = {x:gate.x-x,y:gate.y-y};
    this.castleW = layout.turned ? framed ? 730 : 820 : 1250;
    this.castleH = layout.turned ? framed ? 475 : 660 : 335;
    this.anchors = layout.turned ? projection.portrait : projection.landscape;
    this.light = new KeepLight(scene.textures);
    this.surround = assets.panorama(layout,this.gate,
      {width:this.castleW,height:this.castleH},this.anchors.foot, scene.state.level?.keepSky);
    this.fieldLight = scene.add.container(x,y);
    this.reflection = scene.add.graphics();
    this.fieldLight.add(this.reflection);

    this.layer = scene.add.container(x,y);
    this.scenery = scene.add.container(0,0);
    this.layer.add(this.scenery);
    const add = (name: Plate): Image => {
      const im = scene.add.image(0,0,textureKey(name)).setOrigin(0);
      this.scenery.add(im);
      return im;
    };
    const lamps = ['torchL','torchR','brazier-1_0','brazier1_0','brazier-1_1','brazier1_1',
      'brazier-1_2','brazier1_2','rose'] as const;
    this.lights = lamps.map((key,i) => {
      const pos = this.at(key);
      return add('glow').setOrigin(.5).setPosition(pos.x,pos.y)
        .setDisplaySize(i<2 ? 41 : 28,i<2 ? 55 : 34);
    });
    const posts = layout.turned ? [[315,936],[155,796],[210,694]] : [[927,173],[855,393],[714,301]];
    this.spill = [...posts, [this.gate.x,this.gate.y-8]].map(([px,py],i) => {
      const im = scene.add.image(px,py-10,textureKey('glow')).setOrigin(.5).setDisplaySize(i===3 ? 93 : 53,39);
      this.fieldLight.add(im);
      return im;
    });
    this.banners = scene.add.graphics();
    this.scenery.add(this.banners);
    this.fog = Array.from({length:3},() => add('mist').setOrigin(.5));
    for (const cell of map.buildSites ?? []) {
      const c = layout.cellCenter(cell);
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

  private readonly at = (key: Landmark) => {
    const [u,v] = this.anchors[key], [fx,fy] = this.anchors.foot;
    return { x:this.gate.x+(u-fx)*this.castleW/1280, y:this.gate.y+(v-fy)*this.castleH/960 };
  };

  frame(interacting = false): void {
    const camera = this.scene.cameras.main;
    const scaleY = camera.zoomY;
    const y = camera.y + (this.layout.map.y - camera.scrollY) * scaleY - this.layout.map.y;
    this.surround.scroll(camera.x - camera.scrollX, y, scaleY);
    if (this.clock.paused && this.previous !== -Infinity) return;
    const ms = this.clock.nowMs;
    if (this.lastFrame !== ms) this.quality.sample(ms);
    this.lastFrame = ms;
    const tier = this.quality.tier;
    const high = tier === 2;
    const calm = this.frozen || this.reduced.matches;
    if (interacting || this.scene.state.towers.length || this.scene.state.wave > 0) this.finishedOpening = true;
    const opening = calm || this.finishedOpening ? 0 : Math.max(0,1-ms/3600);
    if (calm === this.lastCalm && (calm || (ms-this.previous < (high ? 15 : 96) && !(this.opening && !opening)))) return;
    this.lastCalm = calm;
    this.previous = ms;
    const t = calm ? 0 : ms/1000;
    this.opening = opening*opening*(3-2*opening);
    const push = this.opening * .22;
    this.scenery.setScale(1+push).setPosition(-this.gate.x*push,-8*push);
    this.fieldLight.setScale(1+push).setPosition(this.layout.map.x-this.gate.x*push,this.layout.map.y-8*push);
    const sky = this.scene.state.level?.keepSky;
    const storm = sky === undefined || sky === 'night storm';
    this.lightning = this.stillLightning ? 1 : calm || !storm ? 0 : lightningAt(ms);
    if (this.lightning < .013) this.lightning = 0;
    this.surround.update(push, this.lightning, Math.floor((ms+7300)/15700)%2, this.opening, t, high, calm);
    const {width,height} = this.layout.map;
    this.fog.forEach((im,i) => {
      im.setVisible(i===0 || high);
      if (im.visible) im.setPosition(width*(.14+i*.31) + Math.sin(t*.12+i*2.6)*width*.12,
        this.gate.y+4+i*height*.16+Math.sin(t*.28+i)*2)
        .setDisplaySize(width*(i===0 ? 1.04 : .74),i===0 ? 48 : 28).setAlpha(i===0 ? .47 : .31);
    });
    this.lights.forEach((im,i) => {
      const pulse = .64+Math.sin(t*(i<2 ? 9.4 : 3.4)+i)*.13+Math.sin(t*17.1+i*2.8)*.075;
      im.setVisible(i<2 || high).setAlpha(pulse*(i<2 ? .9 : .56));
    });
    if (!high) {
      if (this.lastTier !== tier) {
        this.surround.stillFittings(surface => {
          drawFittings(this.banners, this.at, 0, false);
          this.banners.generateTexture(surface);
          this.banners.clear();
        });
        this.banners.setVisible(false);
      }
    } else {
      if (this.lastTier !== tier) {
        this.surround.stillFittings();
        this.banners.setVisible(true);
      }
      drawFittings(this.banners, this.at, t, true);
    }
    this.lastTier = tier;
    const reflection = this.reflection.clear();
    if (this.lightning > 0) {
      reflection.fillStyle(0xb8d4ff,.22*this.lightning).fillRect(0,0,width,height);
      // The flash comes from the ridge. Pinnacles cast oblique shadows over wet shale.
      for (let i=0;i<7;i++) {
        const px = this.gate.x + (i-3)*this.castleW*.087;
        const py = this.gate.y + Math.cos(i*2.7)*7;
        const reach = (i===3 ? 72 : 27+i%3*11);
        reflection.fillStyle(0x172438,.31*this.lightning).fillTriangle(px-7,py,px+10,py,px-reach,py+reach*.57);
      }
    }
    this.spill.forEach((lamp,i) => lamp.setAlpha(.19+Math.sin(t*5.1+i)*.034));
    this.rain.clear();
    if (!calm && high && storm) {
      this.rain.lineStyle(.8,0xb7c7dd,.30+this.lightning*.4).beginPath();
      for (let i=0;i<76;i++) {
        const y=(i*133.7+t*(242+i%4*30))%height;
        const x=((i*79.3-t*(47+i%4*6))%width+width)%width;
        this.rain.moveTo(x,y).lineTo(x-3.8,y+12+i%7);
      }
      this.rain.strokePath();
    }
    if (this.label && this.labelTier !== tier) {
      this.label.textContent = SHOWPIECE_DETAIL[tier];
      this.labelTier = tier;
    }
  }

  showMagnifiedGround(): void {
    if (!this.magnifier) {
      const still = this.surround.stillSurface();
      const texture = this.scene.textures.addCanvas(MAGNIFIER_KEY, still)!;
      texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      this.magnifier = this.scene.add.image(parseFloat(still.style.left), parseFloat(still.style.top), texture).setOrigin(0);
      this.layer.addAt(this.magnifier, 0);
      this.scene.cameras.main.ignore(this.magnifier);
    }
    this.magnifier.setVisible(true);
  }

  hideMagnifiedGround(): void {
    this.magnifier?.setVisible(false);
  }

  snapshot() {
    return { tier:this.quality.tier, timeMs:this.frozen || this.reduced.matches ? 0 : this.clock.nowMs,
      lightning:this.lightning, opening:this.opening };
  }

  resumed(): void { this.quality.resetWindow(2); }

  destroy(): void {
    this.label?.remove();
    this.light.destroy();
    if (this.magnifier) this.scene.textures.remove(MAGNIFIER_KEY);
  }
}
