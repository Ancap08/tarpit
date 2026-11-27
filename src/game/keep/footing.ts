import type { Point } from '../../sim';
import type { KeepSky } from '../../sim/levelTypes';

export interface GateFooting {
  sill: Point;
  approach: Point;
  farther: Point;
  expanded: boolean;
  portrait: boolean;
  wrapsShoulder: boolean;
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

type Stone = (light: number, rock?: boolean) => string;

/** Join the arch to the road where its paving emerges from behind the gate. */
export function paintGateFooting(ctx: CanvasRenderingContext2D, gate: GateFooting, weather: KeepSky): void {
  const { sill, approach, farther, expanded, portrait, wrapsShoulder } = gate;
  const exposure = weather === 'night storm' ? .80 : weather === 'dawn' ? 1.06 : 1;
  const stone: Stone = (light, rock = false) => {
    const tone = (offset: number) => Math.round((light + offset) * exposure);
    return rock ? `rgb(${tone(0)},${tone(1)},${tone(10)})` : `rgb(${tone(0)},${tone(4)},${tone(15)})`;
  };
  const face = { x: sill.x - (expanded ? 2 : 7), y: sill.y + (expanded ? 5 : 3) };
  const half = expanded ? 112 : 64;
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

  const side = Math.sign(approach.x - sill.x);
  const front = { x: face.x + (portrait ? side * 13 : 2), y: face.y + (portrait ? 33 : 31) };
  const run = Math.hypot(approach.x - farther.x, approach.y - farther.y) || 1;
  const reach = portrait ? 38 : 35;
  const inbound = { x: approach.x + reach * (approach.x - farther.x) / run,
    y: approach.y + reach * (approach.y - farther.y) / run };
  if (wrapsShoulder) {
    // In wide view the west-only gate sits on the return bend. The last
    // visible setts are below its right wing, past the hidden inside turn.
    front.x = face.x + 17;
    front.y = face.y + 24;
  }

  function edge(t: number, u: number): Point {
    const a = 1 - t;
    const x = a ** 3 * face.x + 3 * a * a * t * front.x + 3 * a * t * t * inbound.x + t ** 3 * approach.x;
    const y = a ** 3 * face.y + 3 * a * a * t * front.y + 3 * a * t * t * inbound.y + t ** 3 * approach.y;
    const dx = a * a * (front.x - face.x) + 2 * a * t * (inbound.x - front.x) + t * t * (approach.x - inbound.x);
    const dy = a * a * (front.y - face.y) + 2 * a * t * (inbound.y - front.y) + t * t * (approach.y - inbound.y);
    const length = Math.hypot(dx, dy) || 1;
    const width = 19 + (1 - t) * (expanded ? 1 : -4);
    return { x: x + u * width * dy / length, y: y - u * width * dx / length };
  }
  const rows = Math.ceil(Math.hypot(approach.x - face.x, approach.y - face.y) / 5.5);
  const strip = (t: number, end: number, left: number, right: number, shade: number) => {
    polygon(ctx, [edge(t, left), edge(t, right), edge(end, right), edge(end, left)], stone(shade));
  };
  for (let row = 0; row < rows; row++) {
    const t = row / rows, end = (row + 1) / rows;
    ctx.globalAlpha = Math.min(1, (1 - t) * 5);
    strip(t, end, -1.13, 1.13, 65);
    for (const side of [-1, 1]) {
      const rim = 1.02 + .035 * Math.sin(row * 2.7 + side);
      strip(t, end, .85 * side, rim * side, 94 + row % 4 * 8);
    }
    const joints = row % 2 ? [-.84, -.55, -.13, .26, .59, .84] : [-.84, -.38, -.01, .41, .84];
    for (let i = 1; i < joints.length; i++) {
      const wander = Math.sin(row * 4.7 + i * 2.4) * .04;
      const left = joints[i - 1] + .014 + wander, right = joints[i] - .014 + wander;
      const shade = 83 + (row * 17 + i * 11) % 25;
      const leading = t + .11 / rows;
      strip(leading, end - .06 / rows, left, right, shade);
      strip(leading, leading + .16 / rows, left + .03, right - .07, shade + 12);
    }
  }
  ctx.globalAlpha = 1;
  groundWash(ctx, face.x, face.y + 1, expanded ? 28 : 22, 9, ['#13162192', '#14192329', '#14192300']);
}
