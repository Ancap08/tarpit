import type { Point } from '../../sim';
import type { KeepSky } from '../../sim/levelTypes';

export interface GateFooting {
  sill: Point;
  approach: Point;
  farther: Point;
  expanded: boolean;
}

export interface KeepFooting {
  gate: GateFooting;
  lamps: { point: Point; strength: 'torch' | 'brazier' | 'window' }[];
}

/** An elliptical wash over the ground. Light shows the grain underneath. */
export function groundWash(ctx: CanvasRenderingContext2D, x: number, y: number,
    width: number, height: number, stops: string[]): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(width, height);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  stops.forEach((color, i) => gradient.addColorStop(i / (stops.length - 1), color));
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

function polygon(ctx: CanvasRenderingContext2D, points: Point[], fill: string): void {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const { x, y } of points.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Join the visible front lip to the actual inbound road. The sprite's
 * origin is the simulation sill; its rendered threshold is just below it. */
export function paintGateFooting(ctx: CanvasRenderingContext2D, gate: GateFooting, weather: KeepSky): void {
  const { sill, approach, farther, expanded } = gate;
  const half = expanded ? 112 : 64;
  const face = { x: sill.x - (expanded ? 2 : 7), y: sill.y + 6 };
  const exposure = weather === 'night storm' ? .80 : weather === 'dawn' ? 1.10 : 1;
  const stone = (value: number) => {
    const tone = (v: number) => Math.round((value + v) * exposure);
    return `rgb(${tone(0)},${tone(4)},${tone(13)})`;
  };
  // The wings and the two projecting drums have different contact depths.
  groundWash(ctx, sill.x, face.y + 3, half + 9, 17, ['#0b101ab2', '#10172270', '#10172200']);
  for (const side of [-1, 1]) {
    const shoulder = sill.x + side * half * .67;
    const edge = (u: number, v: number): Point => ({ x: shoulder + u * half * side, y: face.y + v });
    // Rock under the curtain tails gives the towers a bearing even when
    // the registered sill straddles the edge of the ravine.
    polygon(ctx, [edge(-.33, -3), edge(.32, 1), edge(.28, 10), edge(.13, 15),
      edge(-.04, 19), edge(-.24, 14), edge(-.37, 8)], stone(41));
    polygon(ctx, [edge(-.24, 3), edge(-.04, 5), edge(.13, 15), edge(-.04, 19), edge(-.24, 14)], stone(55));
    polygon(ctx, [edge(-.04, 5), edge(.22, 3), edge(.28, 10), edge(.13, 15)], stone(47));
    groundWash(ctx, shoulder, face.y + 5, half * .44, 13, ['#080f1acb', '#11182456', '#11182400']);
  }

  const near = { x: face.x, y: face.y - 9 };
  const front = { x: face.x + (approach.x - face.x) * .36, y: face.y + 19 };
  const inbound = { x: approach.x + .95 * (approach.x - farther.x),
    y: approach.y + .95 * (approach.y - farther.y) };
  function edge(t: number, u: number): Point {
    const a = 1 - t;
    const x = a ** 3 * near.x + 3 * a * a * t * front.x + 3 * a * t * t * inbound.x + t ** 3 * approach.x;
    const y = a ** 3 * near.y + 3 * a * a * t * front.y + 3 * a * t * t * inbound.y + t ** 3 * approach.y;
    const dx = a * a * (front.x - near.x) + 2 * a * t * (inbound.x - front.x) + t * t * (approach.x - inbound.x);
    const dy = a * a * (front.y - near.y) + 2 * a * t * (inbound.y - front.y) + t * t * (approach.y - inbound.y);
    const length = Math.hypot(dx, dy) || 1;
    const offset = u * (expanded ? 21 : 17) + u * t * (expanded ? -2 : 2);
    return { x: x + offset * dy / length, y: y - offset * dx / length };
  }
  const rows = 16;
  for (let row = 0; row < rows; row++) {
    const t = row / rows, end = (row + 1) / rows;
    const opacity = Math.min(1, (1 - t) * 3.2);
    ctx.globalAlpha = opacity;
    polygon(ctx, [edge(t, -1.13), edge(t, 1.13), edge(end, 1.13), edge(end, -1.13)], stone(53));
    for (const side of [-1, 1]) {
      polygon(ctx, [edge(t, .86 * side), edge(t, 1.04 * side),
        edge(end, 1.04 * side), edge(end, .86 * side)], stone(87 + row % 3 * 7));
    }
    const joints = row % 2 ? [-.85, -.57, -.13, .30, .64, .85] : [-.85, -.44, -.05, .43, .85];
    for (let i = 1; i < joints.length; i++) {
      const a = joints[i - 1] + .013, b = joints[i] - .013;
      const shade = 83 + ((row * 17 + i * 11) % 27);
      const leading = t + .006;
      polygon(ctx, [edge(leading, a), edge(leading, b), edge(end - .003, b), edge(end - .003, a)], stone(shade));
      polygon(ctx, [edge(leading, a), edge(leading, b), edge(leading + .006, b), edge(leading + .006, a)],
        stone(shade + 20));
    }
  }
  ctx.globalAlpha = 1;
  groundWash(ctx, face.x, face.y + 1, expanded ? 33 : 25, 11, ['#131621b8', '#14192352', '#14192300']);
}
