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

/** An elliptical wash over the ground. Light shows the grain underneath. */
function groundWash(ctx: CanvasRenderingContext2D, x: number, y: number,
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

function paintAbutments(ctx: CanvasRenderingContext2D, gate: GateFooting, stone: Stone): void {
  const { sill, expanded } = gate;
  const scale = expanded ? 1 : .57;
  ctx.save();
  ctx.translate(sill.x, sill.y);
  ctx.scale(scale, scale);
  // Each curtain tail bears on a separate outcrop. Loose shale continues
  // below it, in the same sloping strata as the painted crag.
  groundWash(ctx, -65, 13, 72, 28, ['#11141edb', '#171a255c', '#171a2500']);
  groundWash(ctx, 65, 14, 73, 30, ['#10151fd2', '#171a2557', '#171a2500']);
  const ledges = [
    [-111, 18, 27, 17], [-90, 24, 36, 27], [-67, 28, 34, 27], [-47, 23, 27, 22], [-24, 21, 20, 15],
    [114, 21, 30, 23], [94, 26, 36, 26], [68, 21, 32, 24], [45, 22, 33, 24], [22, 22, 22, 15],
    [-106, 25, 17, 10], [-91, 37, 19, 13], [-71, 40, 22, 12], [-52, 32, 22, 18], [-31, 27, 14, 8],
    [104, 35, 18, 11], [78, 30, 16, 7], [61, 28, 22, 13], [34, 33, 15, 9],
    [-93, 43, 11, 7], [-83, 38, 13, 13], [-72, 39, 15, 12], [-66, 45, 14, 8], [-48, 40, 11, 5],
    [90, 44, 11, 8], [70, 36, 13, 9], [84, 35, 17, 13], [99, 40, 15, 10],
  ];
  if (gate.wrapsShoulder) ledges.push([-78, 33, 19, 13]);
  ledges.forEach(([x, y, w, h], i) => {
    const variance = Math.sin(i * 3.1 + sill.x * .11);
    const shape = (u: number, v: number) => ({ x: x + u * w + variance * 3, y: y + (v - u * .17) * h + variance * 3 });
    const a = shape(-.57, -.14), b = shape(-.38, -.67), c = shape(.14, -.80);
    const d = shape(.45, -.59), e = shape(.54, -.16), f = shape(.33, .05);
    const g = shape(.08, .40), heel = shape(-.37, .25), ridge = shape(.04, -.30);
    const shade = 54 + (i * 17 % 15) + variance * 5;
    polygon(ctx, [a, b, c, d, e, f, g, heel], stone(shade - 13, true));
    polygon(ctx, [a, b, c, d, ridge], stone(shade + 6, true));
    polygon(ctx, [d, e, f, g, ridge], stone(shade - 4, true));
    polygon(ctx, [b, shape(-.14, -.72), c, shape(-.12, -.66)], stone(shade + 17, true));
    polygon(ctx, [shape(-.48, .06), shape(-.10, -.06), shape(.14, -.18), shape(-.07, .02)], stone(shade + 2, true));
    polygon(ctx, [shape(-.15, -.57), shape(-.03, -.47), shape(.18, -.54), shape(.01, -.41)], stone(shade - 3, true));
  });
  groundWash(ctx, -65, 5, 61, 11, ['#101621bb', '#14182348', '#14182300']);
  groundWash(ctx, 64, 7, 64, 11, ['#101621bb', '#14182348', '#14182300']);
  ctx.restore();
}

/** Join the arch to the road where its paving emerges from behind the gate. */
export function paintGateFooting(ctx: CanvasRenderingContext2D, gate: GateFooting, weather: KeepSky): void {
  const { sill, approach, farther, expanded, portrait, wrapsShoulder } = gate;
  const exposure = weather === 'night storm' ? .80 : weather === 'dawn' ? 1.06 : 1;
  const stone: Stone = (light, rock = false) => {
    const tone = (offset: number) => Math.round((light + offset) * exposure);
    return rock ? `rgb(${tone(0)},${tone(1)},${tone(10)})` : `rgb(${tone(0)},${tone(4)},${tone(15)})`;
  };
  const face = { x: sill.x - (expanded ? 2 : 7), y: sill.y + (expanded ? 5 : 3) };
  paintAbutments(ctx, gate, stone);

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
