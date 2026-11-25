import type Phaser from 'phaser';
import type { Layout } from '../layout';

const WING = 120;
const HEADROOM = 120;

/** Continue the registered scenery past the fitted play canvas. Controls and
 * hit targets retain the game's normal coordinates, including on short phones. */
export class KeepSurround {
  private readonly backdrop = document.createElement('div');
  private readonly frame = document.createElement('div');
  private readonly storm: HTMLCanvasElement;
  private readonly observer: ResizeObserver;
  private lastPush = NaN;
  private lastFlash = NaN;

  constructor(canvas: HTMLCanvasElement, layout: Layout,
      textures: Phaser.Textures.TextureManager, gate: {x:number;y:number},
      size: {width:number;height:number}, foot: number[]) {
    const host = canvas.parentElement!;
    this.backdrop.ariaHidden = 'true';
    this.backdrop.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;background:linear-gradient(#0a1421,#232637 67%,#171a20 87%,#15151a)';
    this.frame.style.cssText = 'position:absolute;transform-origin:0 0;pointer-events:none';
    this.backdrop.append(this.frame);
    host.insertBefore(this.backdrop,canvas);
    // Position the game canvas above its non-interactive continuation.
    this.backdrop.style.zIndex = '-1';
    const {width,height}=layout.map, inset=layout.turned ? WING : 0;
    const draw = (flash:boolean) => {
      const sheet=document.createElement('canvas');
      sheet.width=width+inset*2;
      sheet.height=height+HEADROOM;
      const ctx=sheet.getContext('2d')!;
      ctx.imageSmoothingQuality='high';
      ctx.translate(inset,HEADROOM);
      const image=(name:string) => textures.get('keep:'+name).getSourceImage() as HTMLImageElement;
      const sky=image('sky');
      if (!layout.turned) {
        ctx.save();
        ctx.scale(1,-1);
        ctx.drawImage(sky,0,0,width,gate.y+30);
        ctx.restore();
      }
      ctx.drawImage(sky,0,0,width,gate.y+30);
      ctx.drawImage(image(layout.turned ? 'portrait' : 'landscape'),0,0,width,height);
      if (layout.turned) {
        const wings=image('wings'), half=wings.width/2;
        ctx.drawImage(wings,0,0,half,wings.height,-WING,0,WING,height);
        ctx.drawImage(wings,half,0,half,wings.height,width,0,WING,height);
      }
      if (flash) {
        ctx.fillStyle='rgba(192,212,255,.30)';
        ctx.fillRect(-inset,-HEADROOM,width+2*inset,height+HEADROOM);
      }
      const layers=flash ? ['lightning'] : ['far','crown','gate'];
      for (const layer of layers) {
        ctx.drawImage(image(layer+(layout.turned ? '' : '-wide')),
          gate.x-size.width*foot[0]/1280,gate.y-size.height*foot[1]/960,size.width,size.height);
      }
      sheet.style.cssText='position:absolute;left:0;top:0';
      this.frame.append(sheet);
      return sheet;
    };
    draw(false);
    this.storm=draw(true);
    this.storm.style.opacity='0';
    const fit=() => {
      const r=canvas.getBoundingClientRect(), parent=host.getBoundingClientRect();
      const scale=r.width/layout.width;
      this.frame.style.left=(r.left-parent.left-inset*scale)+'px';
      this.frame.style.top=(r.top-parent.top+(layout.map.y-HEADROOM)*scale)+'px';
      this.frame.style.scale=String(scale);
    };
    fit();
    this.observer=new ResizeObserver(fit);
    this.observer.observe(canvas);
    this.observer.observe(host);
    for (const sheet of this.frame.children) (sheet as HTMLElement).style.transformOrigin=(gate.x+inset)+'px '+(HEADROOM+8)+'px';
  }

  update(push:number, flash:number) {
    // Scale the panorama around the same gate axis as the opening camera.
    if (push !== this.lastPush) {
      this.lastPush = push;
      for (const sheet of this.frame.children) {
        (sheet as HTMLElement).style.transform=push ? 'scale('+(1+push)+')' : '';
      }
    }
    if (flash !== this.lastFlash) {
      this.lastFlash = flash;
      this.storm.style.opacity=String(flash);
    }
  }

  destroy() {
    this.observer.disconnect();
    this.backdrop.remove();
  }
}
