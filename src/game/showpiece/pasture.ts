import Phaser from 'phaser';
import rects from '../../../assets/art-showpiece/showpiece-pasture.json';
import lowAtlas from '../../../assets/art-showpiece/showpiece-pasture-1x.webp?url&no-inline';
import highAtlas from '../../../assets/art-showpiece/showpiece-pasture-2x.webp?url&no-inline';
import { CELL, lastWave, type GameState, type Point } from '../../sim';
import type { Layout } from '../layout';

type Frame = keyof typeof rects;
type Density = 1 | 2;
type Tier = 0 | 1 | 2;
type Image = Phaser.GameObjects.Image;
type Pin = {
  x: number; y: number; sprite: Image; blocked: boolean;
  alpha: number; from: number; target: number; fadeAt: number;
};
const fadeMs = 300;
const ghostAlpha = .12;

// A fractional tier fades only the details gained or lost at that boundary.
const detailAlpha = (detail: number, minimumTier: Tier) => Phaser.Math.Clamp(detail - minimumTier + 1, 0, 1);
const atlasKey = (density: Density) => `showpiece:pasture:${density}x`;

/** Register only after the entire image decodes, so a failed load leaves Painted intact. */
export async function loadPasture(textures: Phaser.Textures.TextureManager, density: Density,
  cancellation: AbortSignal): Promise<boolean> {
  if (cancellation.aborted) return false;
  const key = atlasKey(density);
  if (textures.exists(key)) return true;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 8000);
  cancellation.addEventListener('abort', abort, { once: true });
  let url: string | undefined;
  let image: HTMLImageElement | undefined;
  const stopDecode = () => image?.removeAttribute('src');
  try {
    const response = await fetch(density === 1 ? lowAtlas : highAtlas, { signal: controller.signal });
    if (!response.ok) return false;
    url = URL.createObjectURL(await response.blob());
    image = new window.Image();
    controller.signal.throwIfAborted();
    controller.signal.addEventListener('abort', stopDecode, { once: true });
    image.src = url;
    await image.decode();
    controller.signal.throwIfAborted();
    if (image.naturalWidth !== 256 * density ||
        Object.values(rects).some(([, y,, h]) => (y + h) * density > image!.naturalHeight)) return false;
    if (textures.exists(key)) return true;
    const texture = textures.addImage(key, image);
    if (!texture) return false;
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    for (const [name, [x, y, w, h]] of Object.entries(rects))
      texture.add(name, 0, x * density, y * density, w * density, h * density);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    cancellation.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', stopDecode);
    if (url) URL.revokeObjectURL(url);
  }
}

const millFoot = { x: 788, y: 108 };
const houseFoot = { x: 243, y: 392 };
const apiaryFoot = { x: 843, y: 359 };
const twigFoot = { x: 121, y: 373 };

function setFrame(image: Image, frame: Frame): void {
  const [, , w, h, ax, ay] = rects[frame];
  if (image.frame.name !== frame) image.setFrame(frame);
  if (image.originX !== ax/w || image.originY !== ay/h) image.setOrigin(ax/w,ay/h);
}

function ellipseTrail(i: number, t: number): Point {
  return { x: Math.cos(t * .23 + i * 3.4) * 4.7, y: Math.sin(t * .33 + i) * 1.6 };
}

/** The scenery lives on one noninteractive layer between the painted ground and the first zone. */
export class Pasture {
  private readonly layer: Phaser.GameObjects.Layer;
  private readonly grade: Phaser.GameObjects.Rectangle;
  private readonly vignette: Image;
  private readonly webgl: boolean;
  private readonly mill: Pin;
  private readonly rotor: Image;
  private readonly house: Pin;
  private readonly windowLights: Phaser.GameObjects.Graphics;
  private readonly haze: Image[];
  private readonly sunwash: Image;
  private readonly meter = new URLSearchParams(location.search).get('perf') === '1';
  readonly costs = { updates: 0, weatherMs: 0, animalsMs: 0, dayMs: 0 };
  private readonly shadows: { pin: Pin; image: Image; length: number }[] = [];
  private readonly wheat: Pin[] = [];
  private readonly tree: Pin;
  private readonly linens: Pin;
  private readonly hives: Pin;
  private readonly cart: Pin;
  private readonly flock: Pin[] = [];
  private readonly hens: Pin[] = [];
  private readonly cat: Pin;
  private readonly workers: { pin: Pin; door: Pin }[];
  private readonly birds: Pin[] = [];
  private readonly grass: Pin[] = [];
  private readonly halos: Image[] = [];
  private readonly dust: Image;
  private dustAt = -Infinity;
  private fadingUntil = -Infinity;
  private detail = 2;
  private readonly smoke: Image[] = [];
  private readonly sparks: Image[] = [];
  private readonly fixed: Pin[] = [];
  private allPins: Pin[] = [];
  private occupied: number[] = [];
  private scareAt = -Infinity;
  private lastTime = 0;
  private lastFrame = -Infinity;
  private lastDay = -1;
  private lastTier = -1;
  private lastPlacing = false;
  private lastPhase = '';
  private lastCalm = false;
  private retreat = 0;
  private day = 0;
  private alarmWave = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly layout: Layout, private readonly density: Density,
    zones: Phaser.GameObjects.Graphics) {
    this.webgl = scene.game.renderer.type === Phaser.WEBGL;
    this.layer = scene.add.layer();
    Phaser.Utils.Array.MoveTo(scene.children.list, this.layer, scene.children.getIndex(zones));
    const { x, y, width, height } = layout.map;
    this.grade = scene.add.rectangle(x, y, width, height, 0xffcc85, .12).setOrigin(0).setDepth(-30);
    this.layer.add(this.grade);
    this.vignette = this.image('vignette').setOrigin(.5).setPosition(x+width/2, y+height/2)
      .setDisplaySize(width, height).setDepth(-29);
    this.sunwash = this.image('sunwash').setOrigin(0).setPosition(x,y)
      .setDisplaySize(width*.74,height*.72).setDepth(-28);
    this.haze = [0, 1].map(() => this.image('cloud').setDepth(-25));
    this.mill = this.pin('mill', millFoot);
    this.house = this.pin('cottage', houseFoot);
    this.hives = this.pin('hives', apiaryFoot, 1.2);
    this.cart = this.pin('honeyCart', { x: 879, y: 343 }, 1.12);
    this.tree = this.pin('willow', twigFoot, 1.13);
    this.linens = this.pin('laundry', { x: 293, y: 401 });
    this.fixed.push(this.mill, this.house, this.tree, this.linens, this.hives, this.cart);
    this.rotor = this.image('sails').setDepth(this.mill.y+.5)
      .setPosition(this.mill.x-3, this.mill.y-43);
    for (const [anchor, size] of [[this.mill, 43],[this.house, 33],[this.tree, 25],[this.hives, 12]] as const) {
      this.shadows.push({ pin: anchor, image: this.image('shade').setDepth(-12), length: size });
    }
    for (const [x,y,scale] of [[698,105,1],[728,128,1],[666,87,.85],[757,64,.81]]) {
      const pin = this.pin('wheat', {x,y}, scale);
      this.wheat.push(pin);
      this.fixed.push(pin);
    }
    for (const [x,y] of [[188,418],[153,414],[863,375]]) {
      const fence = this.pin('fence', {x,y});
      this.fixed.push(fence);
    }
    for (const [x,y,s] of [[143,362,1.05],[167,380,.86],[192,362,1],[137,394,.79],[194,388,.78]])
      this.flock.push(this.pin('ewe',{x,y},s));
    for (const [x,y] of [[267,410],[273,405],[284,412]]) this.hens.push(this.pin('hen',{x,y}));
    this.cat = this.pin('cat',{x:228,y:401});
    this.workers = [
      { pin: this.pin('rake',{x: 733,y:103}), door: this.mill },
      { pin: this.pin('rake',{x: 272,y:387}), door: this.house },
    ];
    for (let i=0;i<5;i++) this.birds.push(this.pin('wingUp',{x:704+i*8,y:89+i%2*4},.7));
    // Wide, empty grass on both sides of the trail. Distant blades lean first
    // as the gust travels; their bases stay rooted in the same patch.
    for (const [x,y] of [[108,331],[208,341],[230,424],[126,405],[650,62],[687,147],
      [799,129],[818,72],[827,346],[877,367],[183,311],[664,109],[611,77],[627,119],
      [336,406],[277,353],[781,332],[887,333],[742,305],[530,246],[564,236],[558,269]])
      this.grass.push(this.pin('grass',{x,y}));
    this.windowLights = scene.add.graphics().setDepth(Math.max(this.house.y,this.mill.y)+2);
    this.layer.add(this.windowLights);
    for (let i=0;i<3;i++) {
      const lamp = this.image('lamp').setDepth(this.windowLights.depth+1);
      if (this.webgl) lamp.setBlendMode(Phaser.BlendModes.ADD);
      this.halos.push(lamp);
    }
    for (let i=0;i<4;i++) this.smoke.push(this.image('smoke').setDepth(this.house.y+.4));
    for (let i=0;i<14;i++) {
      const spark = this.image('lamp').setDepth(this.windowLights.depth+.5);
      if (this.webgl) spark.setBlendMode(Phaser.BlendModes.ADD);
      this.sparks.push(spark);
    }
    this.dust = this.image('smoke').setName('build-dust').setTint(0xdbbd90).setDepth(this.windowLights.depth+2).setVisible(false);
    this.allPins = [...this.fixed,...this.flock,...this.hens,this.cat,...this.workers.map(w=>w.pin),...this.birds,...this.grass];
  }

  private image(frame: Frame): Image {
    const image = this.scene.add.image(0,0,atlasKey(this.density),frame).setScale(1/this.density);
    setFrame(image,frame);
    this.layer.add(image);
    return image;
  }

  private pin(frame: Frame, world: Point, scale = 1): Pin {
    const {x,y} = this.layout.toScreen(world);
    const sprite = this.image(frame).setScale(scale/this.density).setPosition(x,y).setDepth(y);
    return { x, y, sprite, blocked: false, alpha: 1, from: 1, target: 1, fadeAt: 0 };
  }

  cannon(): void {
    this.scareAt = this.lastTime;
  }

  /** Recompute obstruction only when a tower changes cell. Use the upright
   * sprite footprint (also in portrait), plus a half cell around that tower. */
  private clearTowerFootprints(state: GameState, timeMs: number, animate: boolean): boolean {
    if (this.occupied.length === state.towers.length &&
        state.towers.every((t,i) => this.occupied[i] === t.cell.row*32+t.cell.col)) return false;
    this.occupied = state.towers.map(t => t.cell.row*32+t.cell.col);
    const centres = state.towers.map(t => this.layout.cellCenter(t.cell));
    for (const pin of this.allPins) {
      const image = pin.sprite;
      const pad = pin === this.mill ? 34 : 0;
      const w = image.displayWidth;
      const h = image.displayHeight;
      const obstruction = centres.find(p => p.x+CELL/2 > pin.x-Math.max(pad,w*image.originX) &&
        p.x-CELL/2 < pin.x+Math.max(pad,w*(1-image.originX)) &&
        p.y+CELL/2 > pin.y-Math.max(pad*2,h*image.originY) && p.y-CELL/2 < pin.y+h*(1-image.originY));
      if (obstruction && !pin.blocked && animate) {
        this.dustAt = timeMs;
        // Let the puff escape past the tower drawn above this layer.
        this.dust.setPosition(obstruction.x + CELL*.45, obstruction.y + CELL*.28);
      }
      pin.blocked = !!obstruction;
    }
    return true;
  }

  draw(state: GameState, timeMs: number, tier: Tier, placing: boolean, calm: boolean): void {
    const phase = state.phase;
    const dayTarget = Math.max(0,Math.min(1,(state.wave-1)/Math.max(1,lastWave(state)-1)));
    const instant = calm || this.lastTier < 0;
    const changed = this.clearTowerFootprints(state, timeMs, !instant) || dayTarget !== this.lastDay || phase !== this.lastPhase ||
      tier !== this.lastTier || placing !== this.lastPlacing || calm !== this.lastCalm ||
      (state.enemies.length > 0 && this.alarmWave !== state.wave);
    const fading = this.lastFrame < this.fadingUntil || this.detail !== tier;
    if (!changed && (calm || timeMs-this.lastFrame < (fading ? 32 : [120,65,32][tier]))) return;
    const dt = Math.min(.3, Math.max(0,timeMs-this.lastTime)/1000);
    this.lastTime = timeMs;
    this.lastFrame = timeMs;
    this.lastTier = tier;
    this.lastPlacing = placing;
    this.lastPhase = phase;
    this.lastDay = dayTarget;
    this.lastCalm = calm;
    const t = calm ? 0 : timeMs/1000;
    this.day = calm ? dayTarget : this.day+(dayTarget-this.day)*Math.min(1,dt*.85);
    if (state.enemies.length > 0) this.alarmWave = state.wave;
    const alarm = phase === 'wave' && this.alarmWave === state.wave;
    this.retreat = calm ? Number(alarm) : Phaser.Math.Clamp(this.retreat + dt*(alarm ? .95 : -.45),0,1);
    this.detail = instant ? tier : this.detail + Phaser.Math.Clamp(tier-this.detail, -dt*1000/fadeMs, dt*1000/fadeMs);
    this.drawClearance(timeMs, placing, instant);
    const dusk = Phaser.Math.SmoothStep(this.day,.48,1);
    const morning = 1-Phaser.Math.SmoothStep(this.day,0,.47);
    this.grade.setFillStyle(dusk > .04 ? 0x393553 : 0xffce84, dusk > .04 ? dusk*.31 : morning*.125);
    const high = detailAlpha(this.detail, 2);
    this.sunwash.visible = this.webgl && high > 0;
    this.sunwash.setAlpha(high*(.09+morning*.57+dusk*.48));
    this.vignette.visible = this.sunwash.visible;
    this.vignette.alpha = high*(.38+dusk*.58);
    const wind = .52*Math.sin(t*.7)+.48*Math.sin(t*.29+1.4);
    this.rotor.setAlpha(this.mill.alpha).setVisible(this.mill.alpha > 0).setRotation(.29+t*.6+.21*Math.sin(t*.64));
    this.tree.sprite.rotation = .027*wind;
    this.linens.sprite.rotation = .023*wind;
    for (const [i,pin] of this.wheat.entries()) pin.sprite.rotation = .035*Math.sin(t*1.3+i*.65);
    const start = this.meter ? performance.now() : 0;
    this.drawWeather(t,wind,calm);
    const afterWeather = this.meter ? performance.now() : 0;
    this.drawFarm(t,calm);
    const afterFarm = this.meter ? performance.now() : 0;
    this.drawShadows(dusk, morning);
    this.drawLights(t,dusk,calm);
    if (this.meter) {
      this.costs.updates++;
      this.costs.weatherMs += afterWeather-start;
      this.costs.animalsMs += afterFarm-afterWeather;
      this.costs.dayMs += performance.now()-afterFarm;
    }
  }

  private drawClearance(timeMs: number, placing: boolean, instant: boolean): void {
    for (const pin of this.allPins) {
      const target = pin.blocked ? 0 : placing ? ghostAlpha : 1;
      if (instant || target !== pin.target) {
        pin.from = instant ? target : pin.alpha;
        pin.target = target;
        pin.fadeAt = timeMs;
        if (!instant) this.fadingUntil = timeMs + fadeMs;
      }
      const blend = instant ? 1 : Math.min(1, (timeMs-pin.fadeAt)/fadeMs);
      pin.alpha = blend === 1 ? target : Phaser.Math.Linear(pin.from, target, blend);
      pin.sprite.setAlpha(pin.alpha).setVisible(pin.alpha > 0);
    }
    if (instant) this.dustAt = -Infinity;
    const dustAge = (timeMs-this.dustAt)/fadeMs;
    this.dust.setVisible(dustAge < 1);
    if (this.dust.visible) this.dust.setDisplaySize(18+32*dustAge, 12+20*dustAge)
      .setOrigin(.5, .8+dustAge*.3).setAlpha(.65*(1-dustAge));
  }

  private drawShadows(dusk: number, morning: number): void {
    const direction = 2*this.day-1;
    for (const {pin,image,length} of this.shadows) {
      const reach = length*(.24+.8*(dusk+morning));
      image.setVisible(pin.alpha > 0).setPosition(pin.x+direction*reach*.43,pin.y+5-length*.05)
        .setDisplaySize(length*.75+reach, length*.46).setRotation(-direction*.28)
        .setAlpha(pin.alpha*(.52+(morning+dusk)*.21));
    }
  }

  private drawWeather(t: number, wind: number, calm: boolean): void {
    const m = this.layout.map;
    for (const [i,cloud] of this.haze.entries()) {
      const alpha = detailAlpha(this.detail, i === 0 ? 1 : 2);
      cloud.visible = alpha > 0;
      if (!cloud.visible) continue;
      cloud.setDisplaySize(210+i*65,94+i*12).setAlpha(alpha*(.07+.022*i))
        .setPosition(m.x+m.width*(.5+.23*Math.sin(t*.057+i*2.9)),m.y+m.height*(.5+.27*Math.cos(t*.041+i*2.2)));
    }
    for (const [i,grass] of this.grass.entries()) {
      const alpha = grass.alpha * detailAlpha(this.detail, i < 4 ? 0 : i < 10 ? 1 : 2);
      grass.sprite.setAlpha(alpha).setVisible(alpha > 0);
      if (grass.sprite.visible) grass.sprite.rotation = wind*.19+.14*Math.sin(t*1.7-i*.5);
    }
    for (const [i,puff] of this.smoke.entries()) {
      const alpha = this.house.alpha * detailAlpha(this.detail, i < 2 ? 0 : i === 2 ? 1 : 2);
      puff.visible = alpha > 0;
      if (!puff.visible) continue;
      const age = (t*.25+i*.25)%1;
      puff.setDisplaySize(3+age*9,2+age*5).setPosition(this.house.x+13+age*age*(11+wind*12),
        this.house.y-43-age*21).setAlpha(alpha*.25*(1-age));
    }
    const flight = calm ? Infinity : (this.lastTime-this.scareAt)/1000;
    for (const [i,bird] of this.birds.entries()) {
      const alpha = bird.alpha * detailAlpha(this.detail, 1);
      bird.sprite.visible = alpha > 0 && (flight < 1.8 || flight > 4.4);
      if (!bird.sprite.visible) continue;
      // Folded at the field edge; a real artillery shot lifts the flock in a
      // short fan over its own plot, then they settle out of sight and return.
      const lift = flight < 1.8 ? Math.min(1,flight/1.8) : 0;
      setFrame(bird.sprite,lift > 0 && Math.sin(t*17+i)>0 ? 'wingDown':'wingUp');
      bird.sprite.setPosition(bird.x+lift*(i-2)*12,bird.y-lift*(19+i*4))
        .setScale((lift > 0 ? .85 : .42)/this.density).setAlpha(alpha*(1-lift*.92));
    }
  }

  private drawFarm(t: number,calm: boolean): void {
    for (const [i,sheep] of this.flock.entries()) {
      const alpha = sheep.alpha * detailAlpha(this.detail, i < 2 ? 0 : i === 2 ? 1 : 2);
      sheep.sprite.setAlpha(alpha).setVisible(alpha > 0);
      if (!sheep.sprite.visible) continue;
      const off = ellipseTrail(i,t);
      const startled = calm ? 2 : (this.lastTime-this.scareAt)/1000-i*.065;
      const hop = startled > 0 && startled < .55 ? Math.sin(startled/.55*Math.PI) : 0;
      setFrame(sheep.sprite,hop === 0 && Math.sin(t*.79+i*2) > .15 ? 'graze':'ewe');
      sheep.sprite.setPosition(sheep.x+off.x+hop*2,sheep.y+off.y-hop*(2+i*.4))
        .setFlipX(Math.sin(t*.23+i*3.4) > .4).setRotation(hop*.09);
    }
    for (const [i,hen] of this.hens.entries()) {
      const alpha = hen.alpha * detailAlpha(this.detail, i === 0 ? 0 : i === 1 ? 1 : 2);
      hen.sprite.setAlpha(alpha).setVisible(alpha > 0);
      if (!hen.sprite.visible) continue;
      const off = ellipseTrail(i+3,t*1.7);
      setFrame(hen.sprite,Math.sin(t*3+i*2) > .35 ? 'peck':'hen');
      hen.sprite.setPosition(hen.x+off.x,hen.y+off.y);
    }
    setFrame(this.cat.sprite, Math.sin(t*2.2)>0 ? 'catTail':'cat');
    for (const [i,{pin,door}] of this.workers.entries()) {
      const alpha = Math.min(pin.alpha, door.alpha);
      pin.sprite.setAlpha(alpha).setVisible(alpha > 0 && this.retreat < .995);
      if (!pin.sprite.visible) continue;
      const h = this.retreat;
      // The hat ducks over the threshold on the last two steps.
      const doorOffset = i === 0 ? -5 : 11;
      const x = Phaser.Math.Linear(pin.x,door.x+doorOffset,h);
      const y = Phaser.Math.Linear(pin.y,door.y-1,h);
      setFrame(pin.sprite,h>.01 ? 'run':'rake');
      pin.sprite.setPosition(x,y-(calm ? 0 : Math.abs(Math.sin(t*(h>.01 ? 17 : 1.6)))*1.1))
        .setRotation(h>.01 ? (door.x>pin.x?.14:-.14) : .09*Math.sin(t*1.3+i)).setDepth(y+.5);
    }
  }

  private drawLights(t: number,dusk: number,calm: boolean): void {
    const lights = this.windowLights;
    lights.clear();
    const lit = dusk > .03;
    if (lit) {
      if (this.house.alpha > 0) {
        lights.fillStyle(0xffc873,dusk*.94*this.house.alpha);
        for (const dx of [-19,-6]) {
          lights.fillRect(this.house.x+dx,this.house.y-14,2,2);
          lights.fillRect(this.house.x+dx+3.3,this.house.y-13.6,1.7,2);
          lights.fillRect(this.house.x+dx,this.house.y-11,2,1.6);
        }
      }
      if (this.mill.alpha > 0) {
        lights.fillStyle(0xffc873,dusk*.94*this.mill.alpha);
        lights.fillRect(this.mill.x-7.7,this.mill.y-29.4,1.9,4);
        lights.fillRect(this.mill.x+7,this.mill.y-32.4,1.9,3.6);
      }
    }
    for (const [i,halo] of this.halos.entries()) {
      const pin = i===2 ? this.mill : this.house;
      const alpha = pin.alpha * detailAlpha(this.detail, 1);
      halo.visible = alpha > 0 && lit && this.webgl;
      if (halo.visible) halo.setPosition(pin.x+(i===0?-16:i===1?-3:-6),pin.y-(i===2?27:12))
        .setDisplaySize(26,21).setAlpha(alpha*dusk*.82);
    }
    for (const [i,spark] of this.sparks.entries()) {
      // Honeybees wheel close to the skeps by day. At dusk the lights
      // spread out into the orchard, slow down, and begin to pulse.
      const pin = !lit || i%2===0 ? this.hives : this.tree;
      const alpha = pin.alpha * detailAlpha(this.detail, i < (lit ? 5 : 2) ? 1 : 2);
      spark.visible = !calm && alpha > 0 && (lit || i < 4);
      if (!spark.visible) continue;
      if (!lit) {
        spark.setPosition(this.hives.x+Math.sin(t*2+i*2.1)*9,
          this.hives.y-9+Math.cos(t*3.2+i)*3).setDisplaySize(3,2).setAlpha(alpha*.78);
        continue;
      }
      spark.setPosition(pin.x+Math.sin(t*.56+i*2.3)*(17+i%4*4),
        pin.y-4-Math.abs(Math.cos(t*.39+i*2.5))*(11+i%7)).setDisplaySize(5,5)
        .setAlpha(alpha*dusk*(.58+.42*Math.sin(t*2.37+i)));
    }
  }

  destroy(): void {
    this.layer.destroy();
  }
}
