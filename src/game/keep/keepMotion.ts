import type Phaser from 'phaser';
import type { Point } from '../../sim';
import projection from './projection.json';

export type Landmark = keyof typeof projection.portrait;
type Locate = (key: Landmark) => Point;
type Graphics = Phaser.GameObjects.Graphics;

/** All movable fittings use the same projected 3D mounting points as the stone. */
export function drawFittings(g: Graphics, at: Locate, t: number, high: boolean) {
  g.clear();
  const clock = at('clock'), radius = at('dialRight').x - clock.x;
  for (const [length, angle, weight] of [[.74,t / 9 + .82,1.1],[.52,t / 108 - 1.95,1.7]]) {
    const x = clock.x + Math.sin(angle) * radius * length;
    const y = clock.y - Math.cos(angle) * radius * length;
    g.lineStyle(weight, 0x302523).lineBetween(clock.x, clock.y, x, y);
  }
  g.fillStyle(0xffda83).fillCircle(clock.x,clock.y,1);
  const bell = at('bell'), bw = at('bellWidth').x - bell.x;
  g.save().translateCanvas(bell.x,bell.y).rotateCanvas(Math.sin(t * 1.45) * .21);
  g.lineStyle(1,0x926a46).lineBetween(0,0,0,bw*.33);
  g.fillStyle(0x765032).fillCircle(0,bw*.35,bw*.28);
  const lip = bw*.92;
  g.fillStyle(0xa88455).beginPath().moveTo(-bw*.25,bw*.34).lineTo(bw*.25,bw*.34)
    .lineTo(bw*.35,bw*.76).lineTo(bw*.52,lip).lineTo(-bw*.52,lip)
    .lineTo(-bw*.35,bw*.76).closePath().fillPath();
  g.lineStyle(1,0xf0c887).lineBetween(-bw*.5,lip,bw*.5,lip);
  g.fillStyle(0x6b4c39).fillCircle(bw*.09,lip+bw*.09,bw*.12).restore();
  const flagL=at('flagL'), flagR=at('flagR');
  const w = (flagR.x - flagL.x) * .13;
  for (const [i,p] of [flagL,flagR].entries()) {
    const h = w * 2.18, gust = Math.sin(t*3+i)*w*.33+Math.sin(t*6.9)*w*.13;
    g.save().translateCanvas(p.x,p.y);
    g.fillStyle(0x184669).beginPath().moveTo(-w*.5,0).lineTo(w*.5,0)
      .lineTo(w*.42+gust,h*.83).lineTo(w*.13+gust,h).lineTo(-w*.44+gust,h*.87).closePath().fillPath();
    g.fillStyle(0x3075a1).beginPath().moveTo(-w*.36,0).lineTo(-w*.13,0)
      .lineTo(-w*.11+gust,h*.9).lineTo(-w*.34+gust,h*.86).closePath().fillPath();
    g.lineStyle(1.2,0xe1be78).beginPath().moveTo(-w*.35+gust*.56,h*.57)
      .lineTo(gust*.65,h*.67).lineTo(w*.37+gust*.72,h*.58).strokePath().restore();
  }
  for (const [upper,lower] of [['chainTopL','chainFootL'],['chainTopR','chainFootR']] as const) {
    const a = at(upper), b = at(lower);
    const count = Math.max(8,Math.round(Math.hypot(a.x-b.x,a.y-b.y)/3));
    for (let i=0; i<count; i++) {
      const k=i/count, bow=Math.sin(k*Math.PI)*(1.9+Math.sin(t*1.8));
      const x=a.x+(b.x-a.x)*k+bow, y=a.y+(b.y-a.y)*k;
      g.lineStyle(1,i%2 ? 0x4d4442 : 0xb09771).strokeEllipse(x,y,i%2 ? 1.4 : 2.7,4);
    }
  }
  const patrol=(side:'walkL'|'walkR',offset:number) => {
    const post=at(side), phase=t*.22+offset, dx=Math.sin(phase)*19;
    const x=post.x+dx, y=post.y, step=Math.sin(t*4.2+offset);
    g.lineStyle(1.1,0x282e37).lineBetween(x-.7,y-2.6,x-1.3-step,y)
      .lineBetween(x+.5,y-2.6,x+1.2+step,y);
    g.fillStyle(0x283a50).fillTriangle(x,y-8,x-2.5,y-2,x+2,y-2);
    g.fillStyle(0xd6b18d).fillCircle(x,y-8.6,1.35);
    g.lineStyle(1,0x90a0ac).lineBetween(x-1.3,y-9.1,x+1.3,y-9.1);
    g.lineStyle(.85,0xc4ad88).lineBetween(x+2.2,y-1,x+3,y-11);
  };
  patrol('walkL',0); patrol('walkR',2.6);
  for (const [i,key] of (['westWindow','eastWindow'] as const).entries()) {
    const p=at(key), phase=(t*.17+i*.41)%1;
    if (phase>.65) continue;
    const x=p.x+(phase/.65-.5)*radius*.88;
    g.fillStyle(0x483a42,.83).fillCircle(x,p.y,1.4).fillEllipse(x,p.y+3.3,3.4,5);
  }
  if (!high) return;
  const roost=at('crownTip');
  for (let i=0;i<7;i++) {
    const phase=t*.36+i*.79, x=roost.x+Math.cos(phase)*(65+i*7);
    const y=Math.max(9,roost.y+33)+Math.sin(phase)*12+i*4;
    const wing=Math.sin(t*5.7+i)*2.1;
    g.lineStyle(1.05,0x151c29,.87).beginPath().moveTo(x-3.1,y+wing).lineTo(x,y+1)
      .lineTo(x+3.7,y+wing-.6).strokePath();
  }
  const chimney=at('chimney');
  for (let i=0;i<9;i++) {
    const q=(t*.23+i/9)%1, x=chimney.x+q*34+q*Math.sin(t*.65+q*9)*6;
    g.fillStyle(0x87909c,(1-q)*.14).fillEllipse(x,chimney.y-q*31,3+q*14,2+q*7);
  }
  for (const key of ['roofL','roofR'] as const) {
    const p=at(key);
    for (let i=0;i<5;i++) {
      const k=(t*1.7+i*.21)%1;
      g.lineStyle(.75,0xc7dded,.41*(1-k)).lineBetween(p.x-k*4,p.y+k*23,p.x-k*4-.5,p.y+k*23+3);
    }
  }
}

/** Branch endpoints stay fixed throughout a discharge. A subsequent storm uses the other bank. */
export function paintFork(ctx: CanvasRenderingContext2D, width: number, height: number, side: number) {
  const draw = (points: number[][], weight: number, color: number, alpha: number) => {
    ctx.lineWidth = weight;
    ctx.strokeStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    points.forEach(([u,v],i) => {
      const x=(side ? 1-u : u)*width, y=v*height;
      if (i===0) ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
    });
    ctx.stroke();
  };
  const spine=[[.76,-.01],[.752,.053],[.774,.093],[.745,.139],[.757,.144],[.711,.208],
    [.721,.21],[.674,.27],[.69,.267],[.642,.355],[.65,.35],[.616,.418]];
  draw(spine,7,0x9cb2ff,.16); draw(spine,2.5,0xcddeff,.86); draw(spine,1,0xffffff,1);
  draw([[.745,.139],[.79,.148],[.8,.177],[.833,.183],[.858,.223]],1.2,0xdde9ff,.8);
  draw([[.711,.208],[.684,.206],[.651,.227],[.643,.226],[.609,.254]],1.3,0xe2e4ff,.85);
  draw([[.79,.148],[.814,.139],[.833,.151]],.8,0xdae5ff,.76);
}
