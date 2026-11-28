import type { MapDef, Point, Rect } from '../../sim';
import type { KeepSky } from '../../sim/levelTypes';
import type { Layout } from '../layout';
import { paintGateFooting, type GateFooting } from './footing';
import { paintFork } from './keepMotion';
import type { Plate } from './plates';
import { paintRentCastle, paintRentGround, paintRentSky, rentCastleBox, rentHorizon } from './rentOverdueArt';

const WING = 120;
const CLEAN_WING = 168;
const HEADROOM = 120;
type ImageSource = (plate: Plate) => HTMLImageElement;

/** Crop transparent padding while keeping a pixel for scaled edge sampling. */
function trimAlpha(sheet: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const { width, height } = sheet;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!pixels[(y * width + x) * 4 + 3]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = y;
    }
  }
  if (right < 0) return { sheet, left: 0, top: 0 };
  left = Math.max(0, left - 1);
  top = Math.max(0, top - 1);
  const w = Math.min(width, right + 2) - left;
  const h = Math.min(height, bottom + 2) - top;
  if (w === width && h === height) return { sheet, left: 0, top: 0 };
  const crop = document.createElement('canvas');
  crop.width = w;
  crop.height = h;
  crop.getContext('2d')!.drawImage(sheet, left, top, w, h, 0, 0, w, h);
  sheet.width = sheet.height = 0;
  return { sheet: crop, left, top };
}

/** Static exposures are rasterized once. The compositor moves the finished
 * layers behind the transparent battle canvas, including past its side edges. */
export class KeepSurround {
  private readonly backdrop = document.createElement('div');
  private readonly frame = document.createElement('div');
  private readonly camera = document.createElement('div');
  private readonly observer: ResizeObserver;
  private readonly fit: () => void;
  private readonly sky: HTMLCanvasElement;
  private readonly ground: HTMLCanvasElement;
  private readonly litGround?: HTMLCanvasElement;
  private readonly castle: HTMLCanvasElement[];
  private readonly road?: HTMLCanvasElement;
  private readonly gateBed?: HTMLCanvasElement;
  private readonly storm?: HTMLCanvasElement;
  private readonly bolts: HTMLCanvasElement[];
  private readonly skyFlash: HTMLDivElement;
  private readonly clouds: HTMLCanvasElement[];
  private still?: HTMLCanvasElement;
  private fittings?: HTMLCanvasElement;
  private lastPush = NaN;
  private lastFlash = NaN;
  private lastSide = -1;
  private lastScrollX = 0;
  private lastScrollY = 0;
  private lastScaleY = 1;
  private stillActive = false;
  private readonly inset: number;
  private readonly widerPortrait: boolean;

  constructor(canvas: HTMLCanvasElement, private layout: Layout,
      image: ImageSource, gate: Point,
      size: {width:number;height:number}, foot: number[], private readonly weather?: KeepSky, footing?: GateFooting,
      private readonly rentMap?: MapDef) {
    const host = canvas.parentElement!;
    this.backdrop.ariaHidden = 'true';
    this.backdrop.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1;background:linear-gradient(#0a1421,#232637 67%,#171a20 87%,#15151a)';
    this.frame.style.cssText = 'position:absolute;transform-origin:0 0';
    this.camera.style.cssText = `transform-origin:${gate.x}px 8px`;
    this.frame.append(this.camera);
    this.backdrop.append(this.frame);
    host.insertBefore(this.backdrop, canvas);
    const { width, height } = layout.map;
    const wing = layout.turned ? WING : 0;
    // The wider Clean canvas needs more scenery at the edges. Preserve
    // the original width of the painted routes and extend the rock beyond them.
    this.widerPortrait = layout.turned && layout.map.x > 0;
    this.inset = this.widerPortrait ? CLEAN_WING : wing;
    const skyline = rentMap ? rentHorizon(layout.turned) + 20 : gate.y + 30;
    const skyInset = weather ? this.inset : 0;
    const skyWidth = width + skyInset * 2;
    const grade = weather === 'night storm' ? 'brightness(.76) contrast(1.08) saturate(1.13)'
      : weather === 'dawn' ? 'brightness(1.12) contrast(1.02) saturate(.88)' : 'none';
    this.sky = this.paint(-skyInset, -HEADROOM, skyWidth, skyline + HEADROOM, ctx => {
      if (rentMap) {
        paintRentSky(ctx, image, layout.turned, skyInset, weather!);
        return;
      }
      const sky = image(weather === 'dawn' ? 'sky-dawn' : weather === 'night storm' ? 'sky-night' : 'sky');
      if (!layout.turned) {
        ctx.save();
        ctx.scale(1, -1);
        ctx.drawImage(sky, -skyInset, 0, skyWidth, skyline);
        ctx.restore();
      }
      ctx.drawImage(sky, -skyInset, 0, skyWidth, skyline);
    }, this.camera, this.widerPortrait);
    const strikes = !weather || weather === 'night storm';

    const cloudMask = document.createElement('div');
    cloudMask.style.cssText = `position:absolute;width:${width}px;height:${skyline}px;overflow:hidden`;
    this.camera.append(cloudMask);
    this.clouds = (rentMap || weather === 'dawn' ? [] : [0, 1]).map(i => {
      const w = Math.round(width * (i ? .64 : .85)), h = i ? 90 : 120;
      const cloud = this.paint(0, 0, w, h, ctx => ctx.drawImage(image('drift'), 0, 0, w, h), cloudMask);
      cloud.style.opacity = i ? '.33' : '.52';
      return cloud;
    });
    this.skyFlash = document.createElement('div');
    this.skyFlash.style.cssText = `position:absolute;top:0;left:${-skyInset}px;width:${skyWidth}px;height:${skyline}px;background:${weather ? 'radial-gradient(ellipse at 24% 10%,#9dbcf9,transparent 76%)' : '#d2ddff'};visibility:hidden`;
    this.camera.append(this.skyFlash);
    this.bolts = (strikes ? [0, 1] : []).map(side =>
      this.paint(0, 0, width, Math.ceil(gate.y / 2), ctx => paintFork(ctx, width, gate.y, side)));
    this.bolts.forEach(bolt => { bolt.hidden = true; });

    const groundTop = rentMap ? rentHorizon(layout.turned) - 55 : 0;
    this.ground = this.paint(-this.inset, groundTop, width + this.inset * 2, height - groundTop, ctx => {
      if (rentMap) {
        paintRentGround(ctx, layout, rentMap, this.inset, weather!);
        return;
      }
      if (weather) {
        ctx.filter = grade;
        ctx.drawImage(image(layout.turned ? 'siege-portrait' : 'siege-wide'), -wing, 0, width + wing * 2, height);
        const extra = this.inset - wing;
        if (extra) {
          ctx.filter = 'none';
          for (const [edge, source] of [[-wing, extra], [width + wing, width + this.inset + wing - extra]]) {
            ctx.save();
            ctx.translate(edge, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(ctx.canvas, source, 0, extra, height, edge < 0 ? 0 : -extra, 0, extra, height);
            ctx.restore();
          }
        }
        return;
      }
      ctx.drawImage(image(layout.turned ? 'portrait' : 'landscape'), 0, 0, width, height);
      if (layout.turned) {
        const wings = image('wings'), half = wings.naturalWidth / 2;
        ctx.drawImage(wings, 0, 0, half, wings.naturalHeight, -WING, 0, WING, height);
        ctx.drawImage(wings, half, 0, half, wings.naturalHeight, width, 0, WING, height);
      }
    }, this.camera, this.widerPortrait);
    if (weather === 'night storm' && !rentMap) {
      const left = -this.inset, span = width + this.inset * 2;
      this.litGround = this.paint(left, 0, span, height, ctx => {
        ctx.drawImage(this.ground, parseFloat(this.ground.style.left), parseFloat(this.ground.style.top));
        ctx.globalCompositeOperation = 'source-atop';
        const falloff = ctx.createLinearGradient(0, gate.y - 36, 38, gate.y + height * .35);
        falloff.addColorStop(0, '#8ab9ff00');
        falloff.addColorStop(.18, '#aacdff70');
        falloff.addColorStop(.55, '#8db5fb35');
        falloff.addColorStop(1, '#8db5fb00');
        ctx.fillStyle = falloff;
        ctx.fillRect(left, 0, span, height);
        const shade = ctx.createLinearGradient(0, gate.y - 9, 46, gate.y + height * .28);
        shade.addColorStop(0, '#080f1de0');
        shade.addColorStop(.65, '#080f1db5');
        shade.addColorStop(1, '#080f1d00');
        ctx.fillStyle = shade;
        // The crown, two main spires and the wall pinnacles reach across the terrace.
        for (const [offset, breadth, length] of [[-.24, 12, 63], [-.154, 20, 112], [-.075, 18, 93],
          [-.011, 23, 142], [.076, 16, 108], [.166, 12, 86], [.223, 10, 69]]) {
          const x = gate.x + offset * size.width, y = gate.y + offset * 62;
          const reach = length * (layout.turned ? 1.24 : .87);
          ctx.beginPath();
          ctx.moveTo(x - breadth / 2, y - 8);
          ctx.lineTo(x + breadth / 2, y - 8);
          ctx.lineTo(x + reach * .68, y + reach * .69);
          ctx.lineTo(x + reach * .89, y + reach);
          ctx.lineTo(x + reach * .57, y + reach * .74);
          ctx.fill();
        }
      }, this.camera, this.widerPortrait);
      this.litGround.hidden = true;
    }
    const x = gate.x - size.width * foot[0] / 1280, y = gate.y - size.height * foot[1] / 960;
    const top = Math.max(-HEADROOM, Math.floor(y));
    const names = layout.turned
      ? ['far', 'crown', 'gate'] as const
      : ['far-wide', 'crown-wide', 'gate-wide'] as const;
    const architecture = (name: Plate, filter: string) => this.paint(-this.inset, top, width + this.inset * 2,
      Math.ceil(y + size.height) - top, ctx => {
        ctx.filter = filter;
        ctx.drawImage(image(name), x, y, size.width, size.height);
      }, this.camera, this.widerPortrait);
    const rentCastle = (flash: boolean) => {
      const { x, y, width, height } = rentCastleBox(layout.turned);
      const layer = this.paint(x, y, width, height,
        ctx => paintRentCastle(ctx, image, layout.turned, weather!, flash), this.camera, true);
      this.camera.insertBefore(layer, this.ground);
      return layer;
    };
    this.castle = rentMap ? [rentCastle(false)] : names.map(name => architecture(name, grade));
    if (strikes) {
      const strike = weather ? 'strike' : 'lightning';
      this.storm = rentMap ? rentCastle(true) : architecture(layout.turned ? strike : `${strike}-wide`, 'none');
      this.storm.hidden = true;
    }
    if (!layout.turned && !rentMap) {
      this.road = weather ? this.paint(832, 96, 128, 224, ctx => {
        ctx.filter = grade;
        ctx.drawImage(image('siege-east-deck'), 832, 96, 128, 224);
      }) : this.paint(512, 0, 448, 480, ctx => ctx.drawImage(image('road-wide'), 512, 0, 448, 480));
    }
    if (weather && footing) {
      // The wide wall and the east deck can overlap the outer gate. Seat
      // its threshold above both, still beneath the Phaser battle actors.
      const { sill, approach } = footing;
      const left = Math.floor(Math.min(sill.x - 139, approach.x - 26));
      const right = Math.ceil(Math.max(sill.x + 139, approach.x + 26));
      const upper = Math.floor(Math.min(sill.y - 23, approach.y - 26));
      const lower = Math.ceil(Math.max(sill.y + 54, approach.y + 26));
      this.gateBed = this.paint(left, upper, right - left, lower - upper,
        ctx => paintGateFooting(ctx, footing, weather), this.camera, true);
      this.gateBed.style.transformOrigin =
        `${gate.x - parseFloat(this.gateBed.style.left)}px ${8 - parseFloat(this.gateBed.style.top)}px`;
    }

    this.fit = () => {
      const r = canvas.getBoundingClientRect(), parent = host.getBoundingClientRect();
      const scaleX = r.width / this.layout.width;
      if (weather && this.layout.turned) {
        // FIT rounds the CSS dimensions independently.
        const scaleY = r.height / this.layout.height;
        const left = r.left - parent.left + this.layout.map.x * scaleX;
        const top = r.top - parent.top + this.layout.map.y * scaleY;
        this.frame.style.transform = `matrix(${scaleX},0,0,${scaleY},${left},${top})`;
      } else {
        this.frame.style.left = (r.left - parent.left + this.layout.map.x * scaleX) + 'px';
        this.frame.style.top = (r.top - parent.top + this.layout.map.y * scaleX) + 'px';
        this.frame.style.scale = String(scaleX);
      }
    };
    this.fit();
    this.observer = new ResizeObserver(this.fit);
    this.observer.observe(canvas);
    this.observer.observe(host);
  }

  refit(layout: Layout): void {
    this.layout = layout;
    this.fit();
  }

  private paint(x: number, y: number, width: number, height: number,
      draw: (ctx: CanvasRenderingContext2D) => void, parent = this.camera, trim = false): HTMLCanvasElement {
    const sheet = document.createElement('canvas');
    sheet.width = width;
    sheet.height = height;
    const ctx = sheet.getContext('2d')!;
    ctx.translate(-x, -y);
    draw(ctx);
    const result = trim ? trimAlpha(sheet, ctx) : { sheet, left: 0, top: 0 };
    result.sheet.style.cssText = `position:absolute;left:${x + result.left}px;top:${y + result.top}px`;
    parent.append(result.sheet);
    return result.sheet;
  }

  stillFittings(draw?: (surface: HTMLCanvasElement) => void): void {
    if (draw && !this.fittings) {
      const { width, height } = this.layout.map;
      this.fittings = this.paint(0, 0, width, height, ctx => draw(ctx.canvas), this.camera, this.widerPortrait);
      this.fittings.style.zIndex = '1';
    }
    if (this.fittings) this.fittings.hidden = !draw;
  }

  stillSurface(lens?: Rect): HTMLCanvasElement {
    const crop = this.widerPortrait || this.rentMap ? lens : undefined;
    const paint = (ctx: CanvasRenderingContext2D) => {
      const layers = this.rentMap ? [this.sky, ...this.castle, this.ground]
        : [this.sky, this.ground, ...this.castle, this.road, this.gateBed];
      for (const layer of layers) {
        if (layer) ctx.drawImage(layer, parseFloat(layer.style.left), parseFloat(layer.style.top));
      }
    };
    if (!this.still) {
      const { width, height } = this.layout.map;
      const bounds = crop ?? { x: -this.inset, y: -HEADROOM, width: width + this.inset * 2, height: height + HEADROOM };
      this.still = this.paint(bounds.x, bounds.y, bounds.width, bounds.height, paint);
      this.still.hidden = !this.stillActive;
    } else if (crop && (parseFloat(this.still.style.left) !== crop.x || parseFloat(this.still.style.top) !== crop.y)) {
      const ctx = this.still.getContext('2d')!;
      ctx.resetTransform();
      ctx.clearRect(0, 0, this.still.width, this.still.height);
      ctx.translate(-crop.x, -crop.y);
      paint(ctx);
      this.still.style.left = crop.x + 'px';
      this.still.style.top = crop.y + 'px';
    }
    return this.still;
  }

  private setStill(still: boolean): void {
    if (this.stillActive === still) return;
    this.stillActive = still;
    if (still) this.stillSurface();
    for (const layer of [this.sky, this.ground, ...this.castle, this.road, this.gateBed]) {
      if (layer) layer.hidden = still;
    }
    if (this.still) this.still.hidden = !still;
  }

  scroll(x: number, y: number, scaleY = 1): void {
    if (x === this.lastScrollX && y === this.lastScrollY && scaleY === this.lastScaleY) return;
    this.lastScrollX = x;
    this.lastScrollY = y;
    if (this.lastScaleY !== scaleY) {
      this.lastScaleY = scaleY;
      this.camera.style.scale = scaleY === 1 ? '' : `1 ${scaleY}`;
    }
    // The existing 8px projection origin is also the CSS scale origin.
    this.camera.style.translate = `${x}px ${y + (scaleY - 1) * 8}px`;
  }

  update(push: number, flash: number, side: number, opening: number, t: number, high: boolean, calm: boolean): void {
    if (!this.rentMap && !this.widerPortrait) this.setStill(!high && !opening && flash === 0);
    if (push !== this.lastPush) {
      this.lastPush = push;
      this.camera.style.transform = push ? `scale(${1 + push})` : '';
      // The sill sprite is fixed during the existing opening push.
      if (this.gateBed) this.gateBed.style.transform = push ? `scale(${1 / (1 + push)})` : '';
    }
    const parallax = high && !calm ? Math.sin(t * .19) : 0;
    if (!this.rentMap && !this.stillActive) this.castle.slice(0, 2).forEach((layer, i) => {
      const depth = 2 - i;
      layer.style.translate = `${depth * (parallax * .7 + opening * 1.2)}px ${depth * opening * 5}px`;
    });
    for (const [i, cloud] of this.clouds.entries()) {
      cloud.hidden = !high;
      if (!cloud.hidden) {
        const width = this.layout.map.width;
        const x = width * (i ? .8 : .18) + Math.sin(t * .088 + i) * width * .18;
        cloud.style.translate = `${x - cloud.width / 2}px ${20 + i * 50 + opening * 8 - cloud.height / 2}px`;
      }
    }
    if (flash !== this.lastFlash || side !== this.lastSide) {
      this.lastFlash = flash;
      this.lastSide = side;
      this.skyFlash.style.visibility = flash > 0 ? '' : 'hidden';
      this.skyFlash.style.opacity = String(flash * (this.weather ? .29 : .55));
      if (this.storm) {
        this.storm.hidden = flash === 0;
        this.storm.style.opacity = String(flash);
      }
      if (this.litGround) {
        this.litGround.hidden = flash === 0;
        this.litGround.style.opacity = String(flash);
      }
      this.bolts.forEach((bolt, i) => {
        bolt.hidden = flash === 0 || i !== side;
        bolt.style.opacity = String(flash);
      });
    }
  }

  destroy(): void {
    this.observer.disconnect();
    this.backdrop.remove();
    for (const sheet of this.backdrop.querySelectorAll('canvas')) sheet.width = sheet.height = 0;
  }
}
