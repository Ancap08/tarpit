import type { Gate, MapDef, Point } from '../../sim';
import type { Layout } from '../layout';
import type { Plate } from './plates';
import type { KeepSky } from '../../sim/levelTypes';
import keepSite from '../../sim/keepSite.json';

type Context = CanvasRenderingContext2D;
type ImageSource = (name: Plate) => HTMLImageElement;

export const RENT_GATE = { width: 176, height: 180, sill: 138 };
export const RENT_GATE_TEXTURE = 'keep:rent-gate';
export const RENT_ROAD_WIDTH = 54;

const colour = {
  dusk: { air: '#777d83', clouds: '#646b76', far: '#6d797d', near: '#65716e' },
  'night storm': { air: '#5e7287', clouds: '#495c73', far: '#607584', near: '#5b6e70' },
  dawn: { air: '#a3a5a0', clouds: '#8d979c', far: '#879793', near: '#73847a' },
};

const ridge = [
  [-.4, -.13], [-.23, -.05], [-.1, .08], [.03, .12], [.16, .03], [.24, -.12],
  [.31, -.15], [.39, -.25], [.46, -.19], [.56, -.24], [.66, -.09], [.76, -.04],
  [.85, -.12], [.96, -.22], [1.06, -.13], [1.23, -.21], [1.4, -.31],
] as const;

function polygon(ctx: Context, fill: string, points: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  for (const [x, y] of points) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function trace(ctx: Context, points: readonly Point[]): void {
  ctx.beginPath();
  for (const { x, y } of points) ctx.lineTo(x, y);
}

export function rentHorizon(portrait: boolean) {
  return portrait ? 400 : 111;
}

export function paintRentSky(ctx: Context, image: ImageSource, portrait: boolean, inset: number, weather: KeepSky): void {
  const width = portrait ? 480 : 960;
  const horizon = rentHorizon(portrait);
  const palette = colour[weather];
  ctx.fillStyle = palette.air;
  ctx.fillRect(-inset, -124, width + 2 * inset, horizon + 162);
  ctx.globalAlpha = .47;
  ctx.drawImage(image(weather === 'dawn' ? 'sky-dawn' : weather === 'night storm' ? 'sky-night' : 'sky'),
    -inset, -122, width + 2 * inset, horizon + 141);
  ctx.globalAlpha = 1;
  const haze = ctx.createLinearGradient(0, horizon - (portrait ? 206 : 103), 0, horizon);
  haze.addColorStop(0, palette.clouds + '20');
  haze.addColorStop(1, palette.air);
  ctx.fillStyle = haze;
  ctx.fillRect(-inset, -124, width + 2 * inset, horizon + 162);
  const depth = portrait ? 118 : 76;
  polygon(ctx, palette.far, [...ridge.map(([x, y]) => [x * width, horizon - depth * (.42 - y)] as const),
    [width * 1.4, horizon + 33], [-width * .4, horizon + 33]]);
}

export function rentCastleBox(portrait: boolean) {
  return portrait ? { x: 128, y: 235, width: 393, height: 183 }
    : { x: 355, y: -3, width: 385, height: 117 };
}

export function paintRentCastle(ctx: Context, image: ImageSource, portrait: boolean, weather: KeepSky, flash: boolean): void {
  const { x, y, width, height } = rentCastleBox(portrait);
  const names: Plate[] = flash ? [portrait ? 'strike' : 'strike-wide']
    : portrait ? ['far', 'crown', 'gate'] : ['far-wide', 'crown-wide', 'gate-wide'];
  for (const name of names) ctx.drawImage(image(name), x, y, width, height);
  ctx.globalCompositeOperation = 'source-atop';
  const air = colour[weather].air;
  const haze = ctx.createLinearGradient(0, y, 0, y + height);
  haze.addColorStop(0, air + (flash ? '76' : '8a'));
  haze.addColorStop(.58, air + (flash ? '91' : 'a6'));
  haze.addColorStop(1, air + 'ec');
  ctx.fillStyle = haze;
  ctx.fillRect(x, y, width, height);
  ctx.globalCompositeOperation = 'destination-in';
  const veil = ctx.createLinearGradient(x, 0, x + width, 0);
  veil.addColorStop(0, '#0000');
  veil.addColorStop(.11, '#000');
  veil.addColorStop(.89, '#000');
  veil.addColorStop(1, '#0000');
  ctx.fillStyle = veil;
  ctx.fillRect(x, y, width, height);
  ctx.globalCompositeOperation = 'source-over';
}

export function rentLocal(layout: Layout, point: Point): Point {
  const p = layout.toScreen(point);
  return { x: p.x - layout.map.x, y: p.y - layout.map.y };
}

function soilDetail(ctx: Context, left: number, top: number, width: number, height: number): void {
  // Repeatable brush marks at several scales. Low contrast away from the road
  // leaves the strong silhouettes for units, sockets and the gate.
  let seed = 405;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = 0; i < 155; i++) {
    const x = left + next() * width, y = top + next() * height;
    const w = 5 + next() * 25, h = 1 + next() * 4;
    ctx.fillStyle = i % 3 ? '#b6b48b26' : '#3c563733';
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, .12, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 130; i++) {
    const x = left + next() * width, y = top + next() * height;
    if (i % 3) {
      ctx.strokeStyle = '#405d3b82';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 3);
      ctx.lineTo(x, y);
      ctx.lineTo(x - 1, y - 6);
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x + 6, y - 4);
      ctx.stroke();
    } else {
      const stone = 1 + next() * .7;
      polygon(ctx, '#526248', [[x - 7 * stone, y], [x - 2, y - 4 * stone], [x + 6 * stone, y - 3],
        [x + 9 * stone, y + 1], [x + 2, y + 3 * stone]]);
      polygon(ctx, '#a2a38a', [[x - 7 * stone, y], [x - 2, y - 4 * stone], [x + 6 * stone, y - 3], [x + 1, y]]);
    }
  }
}

function pave(ctx: Context, points: readonly Point[], width: number, closed: boolean): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  trace(ctx, points.map(({ x, y }) => ({ x: x + 2, y: y + 3 })));
  ctx.strokeStyle = '#40503a';
  ctx.lineWidth = width + 8;
  ctx.stroke();
  trace(ctx, points);
  ctx.strokeStyle = closed ? '#858172' : '#dad2b4';
  ctx.lineWidth = width + 3;
  ctx.stroke();
  ctx.strokeStyle = closed ? '#837e66' : '#bdb08f';
  ctx.lineWidth = width - 4;
  ctx.stroke();
  ctx.lineCap = 'butt';
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = (b.x - a.x) / length, dy = (b.y - a.y) / length;
    for (let along = 9, row = 0; along < length - 8; along += 13, row++) {
      const x = a.x + dx * along, y = a.y + dy * along;
      const cross = width * .37;
      const inset = row % 2 ? 5 : 0;
      ctx.strokeStyle = closed ? '#544e415e' : '#72665061';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - dy * cross, y + dx * cross);
      ctx.lineTo(x + dy * cross, y - dx * cross);
      ctx.moveTo(x + dy * inset, y - dx * inset);
      ctx.lineTo(x + dx * 9 + dy * inset, y + dy * 9 - dx * inset);
      ctx.stroke();
    }
  }
}

function outwork(ctx: Context, { x, y }: Point): void {
  const top = [[x - 28, y - 5], [x - 19, y - 19], [x + 15, y - 20], [x + 29, y - 8],
    [x + 23, y + 11], [x - 21, y + 13]] as const;
  ctx.fillStyle = '#344534a3';
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 12, 34, 15, .05, 0, Math.PI * 2);
  ctx.fill();
  polygon(ctx, '#53594f', [top[0], top[5], top[4], top[3], [x + 25, y + 21], [x - 18, y + 23], [x - 26, y + 12]]);
  polygon(ctx, '#a6a28b', top);
  polygon(ctx, '#b7b09a', [top[0], top[1], top[2], [x + 17, y - 15], [x - 14, y - 13], [x - 22, y - 5]]);
  ctx.strokeStyle = '#858374';
  ctx.lineWidth = 1;
  for (const [dx, dy] of [[-13, 14], [7, 15], [19, 13]]) {
    ctx.beginPath();
    ctx.moveTo(x + dx, y + dy);
    ctx.lineTo(x + dx + 1, y + dy + 6);
    ctx.stroke();
  }
}

function yardArch(ctx: Context, end: Point, approach: Point): void {
  const angle = Math.atan2(end.y - approach.y, end.x - approach.x) + Math.PI / 2;
  ctx.save();
  ctx.translate(end.x, end.y);
  ctx.rotate(angle);
  polygon(ctx, '#827b5f', [[-22, -12], [22, -12], [25, 3], [22, 14], [-22, 14], [-25, 3]]);
  polygon(ctx, '#b3ac8e', [[-23, -10], [22, -10], [24, -3], [-24, -3]]);
  ctx.fillStyle = '#3b3c30';
  ctx.beginPath();
  ctx.moveTo(-15, 10);
  ctx.lineTo(-15, 1);
  ctx.quadraticCurveTo(0, -16, 15, 1);
  ctx.lineTo(15, 10);
  ctx.fill();
  ctx.strokeStyle = '#b0a284';
  ctx.lineWidth = 2;
  for (const y of [8, 12, 16, 20]) {
    ctx.beginPath();
    ctx.moveTo(-15 - y * .23, y);
    ctx.lineTo(15 + y * .23, y);
    ctx.stroke();
  }
  ctx.restore();
}

export function paintRentGround(ctx: Context, layout: Layout, map: MapDef, inset: number, weather: KeepSky): void {
  const { width, height } = layout.map;
  const horizon = rentHorizon(layout.turned);
  const span = width + 2 * inset;
  const edge: readonly (readonly [number, number])[] = ridge.map(([x, y]) =>
    [x * width, horizon + y * (layout.turned ? 62 : 53)]);
  const land = ctx.createLinearGradient(0, horizon - 20, 0, height);
  land.addColorStop(0, colour[weather].near);
  land.addColorStop(.15, '#859267');
  land.addColorStop(.52, '#889568');
  land.addColorStop(1, '#758659');
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-inset, height + 4);
  for (const [x, y] of edge) ctx.lineTo(x, y);
  ctx.lineTo(width + inset, height + 4);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = land;
  ctx.fillRect(-inset, horizon - 55, span, height - horizon + 55);
  for (let i = 1; i < edge.length; i++) {
    const [x, y] = edge[i], [ax, ay] = edge[i - 1];
    polygon(ctx, i % 2 ? '#55665554' : '#54655232',
      [[ax, ay], [x, y], [x + 22, y + 19], [ax + 13, ay + 33]]);
  }
  soilDetail(ctx, -inset, horizon + 14, span, height - horizon);
  const local = (point: Point) => rentLocal(layout, point);
  const branch = keepSite.otherRoads[0];
  pave(ctx, [...branch.approach, keepSite.path[branch.joinIndex]].map(local), 43, true);
  const route = map.path.map(local);
  const mouth = route[0], next = route[1];
  route.unshift({ x: mouth.x + (mouth.x - next.x), y: mouth.y + (mouth.y - next.y) });
  pave(ctx, route, RENT_ROAD_WIDTH, false);
  yardArch(ctx, route.at(-1)!, route.at(-2)!);
  for (const cell of map.highSites ?? []) {
    const p = layout.cellCenter(cell);
    outwork(ctx, { x: p.x - layout.map.x, y: p.y - layout.map.y });
  }
  ctx.restore();
}

export function paintRentGate(ctx: Context, layout: Layout, gate: Gate, map: MapDef, damage: number): void {
  const { width, sill } = RENT_GATE;
  const approach = layout.screenDir(Math.cos(gate.angle), Math.sin(gate.angle));
  const slope = -approach.x * .37 * Math.sign(approach.y);
  ctx.translate(width / 2, sill);
  ctx.save();
  ctx.transform(1, slope, 0, 1, 0, 0);
  ctx.fillStyle = '#333b3690';
  ctx.beginPath();
  ctx.ellipse(3, 3, 72, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // A straight sill across the approach, with visible top and side faces.
  const roof = (left: number, right: number, y: number) => polygon(ctx, '#b8b39b',
    [[left, y], [right, y], [right - 8, y - 10], [left - 8, y - 10]]);
  const pier = (left: number, right: number) => {
    polygon(ctx, '#575c50', [[right, -104], [right + 8, -114], [right + 8, -10], [right, 0]]);
    ctx.fillStyle = '#777968';
    ctx.fillRect(left, -104, right - left, 104);
    ctx.fillStyle = '#9d9d86';
    ctx.fillRect(left, -100, 4, 98);
    ctx.fillStyle = '#a6a48c';
    ctx.fillRect(left - 2, -106, right - left + 4, 10);
    polygon(ctx, '#b8b39b', [[left - 2, -106], [right + 2, -106], [right + 10, -116], [left + 6, -116]]);
    ctx.strokeStyle = '#53594f';
    ctx.lineWidth = 1.5;
    for (let y = -88, row = 0; y < 0; y += 14, row++) {
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.moveTo(left + (row % 2 ? 9 : 16), y);
      ctx.lineTo(left + (row % 2 ? 9 : 16), y + 14);
      ctx.stroke();
    }
    ctx.fillStyle = '#b6ad96';
    ctx.fillRect(left - 2, -8, right - left + 3, 8);
  };

  ctx.fillStyle = '#55594c';
  ctx.fillRect(-51, -98, 102, 96);
  roof(-51, 51, -98);
  ctx.fillStyle = '#272b25';
  ctx.beginPath();
  ctx.moveTo(-33, 0);
  ctx.lineTo(-33, -63);
  ctx.quadraticCurveTo(-33, -91, 0, -94);
  ctx.quadraticCurveTo(33, -91, 33, -63);
  ctx.lineTo(33, 0);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = damage === 3 ? '#9f9477' : '#604632';
  ctx.fillRect(-33, -94, 66, 94);
  if (damage < 3) {
    for (let x = -31, i = 0; x < 33; x += 8, i++) {
      ctx.fillStyle = i % 2 ? '#8c633f' : '#775538';
      ctx.fillRect(x, -94, 7, 92);
    }
    ctx.fillStyle = '#393b33';
    ctx.fillRect(-33, -60, 66, 6);
    polygon(ctx, '#373b33', [[-33, -31], [33, -31 - 5 * damage], [33, -25 - 5 * damage], [-33, -25]]);
    ctx.fillStyle = '#c0a477';
    for (const x of [-28, -15, 0, 15, 28]) ctx.fillRect(x, -58, 2.5, 2.5);
  }
  if (damage >= 1) polygon(ctx, '#292b25', [[-6, -89], [-1, -64], [-8, -50], [-2, -29],
    [-9, -46], [-12, -51], [-5, -65]]);
  if (damage === 2) polygon(ctx, '#31332b', [[6, 0], [14, -23], [21, -12], [32, -33], [33, 0]]);
  ctx.restore();
  ctx.strokeStyle = '#aba58b';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-34, -4);
  ctx.lineTo(-34, -63);
  ctx.quadraticCurveTo(-34, -91, 0, -95);
  ctx.quadraticCurveTo(34, -91, 34, -63);
  ctx.lineTo(34, -4);
  ctx.stroke();
  pier(-62, -37);
  pier(37, 62);
  ctx.fillStyle = '#273d3b';
  ctx.fillRect(-55, -90, 10, 29);
  ctx.fillRect(45, -90, 10, 29);
  ctx.fillStyle = '#9ab7a1';
  ctx.fillRect(-52, -85, 4, 10);
  ctx.fillRect(48, -85, 4, 10);
  ctx.restore();
  // A near wall-walk outwork crosses the face in this projection. Paint
  // only the part interrupted by the gate; the rest is already in the field.
  const contact = layout.toScreen(gate);
  ctx.globalCompositeOperation = 'source-atop';
  for (const cell of map.highSites ?? []) {
    const at = layout.cellCenter(cell);
    const x = at.x - contact.x, y = at.y - contact.y;
    if (Math.abs(x) >= width / 2 || y <= -sill || y >= 30) continue;
    const side = Math.sign(x);
    polygon(ctx, '#646656', [[x + side * 13, y + 4], [x + side * 38, y + 4],
      [x + side * 43, y + 32], [x + side * 32, y + 30]]);
    outwork(ctx, { x, y });
  }
  ctx.globalCompositeOperation = 'source-over';
}
