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
    if (cell.col === 22 && cell.row === 7) continue; // The gate paints this roof.
    const p = layout.cellCenter(cell);
    outwork(ctx, { x: p.x - layout.map.x, y: p.y - layout.map.y });
  }
  ctx.restore();
}

/** Each projection has its own near tower and far post. Both meet the
 * same sill and use the original cell centre for the roof socket. */
export function paintRentGate(ctx: Context, layout: Layout, gate: Gate, map: MapDef, damage: number): void {
  const { width, sill } = RENT_GATE;
  const contact = layout.toScreen(gate);
  const high = map.highSites!.find(cell => cell.col === 22 && cell.row === 7)!;
  const roof = layout.cellCenter(high);
  const rx = roof.x - contact.x, ry = roof.y - contact.y;
  const portrait = layout.turned;
  const approach = layout.screenDir(Math.cos(gate.angle), Math.sin(gate.angle));
  const slope = -approach.x * .30 * Math.sign(approach.y);
  const left = portrait ? -25 : 1;
  const right = portrait ? 34 : 62;
  const middle = (left + right) / 2;
  const peak = -89;
  ctx.translate(width / 2, sill);
  ctx.save();
  ctx.transform(1, slope, 0, 1, 0, 0);
  const opening = () => {
    ctx.beginPath();
    ctx.moveTo(left, 2);
    ctx.lineTo(left, -56);
    ctx.bezierCurveTo(left, -76, middle - 11, peak, middle, peak);
    ctx.bezierCurveTo(middle + 13, peak, right, -76, right, -56);
    ctx.lineTo(right, 2);
    ctx.closePath();
  };

  // The arch keeps a clear hole over the existing road when the leaves fall.
  ctx.fillStyle = '#575d50';
  ctx.fillRect(left - 9, peak - 9, right - left + 18, 101);
  polygon(ctx, '#b1b19a', [[left - 9, peak - 9], [right + 9, peak - 9], [right + 5, peak - 16], [left - 13, peak - 16]]);
  opening();
  if (damage === 3) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.save();
  ctx.clip();
  if (damage < 3) {
    ctx.fillStyle = '#604632';
    ctx.fillRect(left, peak, right - left, -peak + 2);
    for (let x = left + 2, i = 0; x < right; x += 8, i++) {
      ctx.fillStyle = i % 2 ? '#8c633f' : '#775538';
      ctx.fillRect(x, peak, 7, -peak + 2);
    }
    ctx.fillStyle = '#393b33';
    ctx.fillRect(left, -54, right - left, 6);
    polygon(ctx, '#373b33', [[left, -29], [right, -29 - 5 * damage], [right, -23 - 5 * damage], [left, -23]]);
    ctx.fillStyle = '#c0a477';
    for (let x = left + 5; x < right; x += 13) ctx.fillRect(x, -52, 2.5, 2.5);
    if (damage >= 1) polygon(ctx, '#292b25', [[middle - 6, -86], [middle - 1, -62], [middle - 8, -48],
      [middle - 2, -27], [middle - 9, -44], [middle - 12, -49], [middle - 5, -63]]);
    if (damage === 2) polygon(ctx, '#31332b', [[middle + 6, 2], [middle + 14, -23], [middle + 21, -12], [right, -33], [right, 2]]);
  } else {
    const shade = ctx.createLinearGradient(0, peak, 0, -53);
    shade.addColorStop(0, '#29302ee0');
    shade.addColorStop(1, '#29302e00');
    ctx.fillStyle = shade;
    ctx.fillRect(left, peak, right - left, -peak);
  }
  ctx.restore();
  ctx.strokeStyle = '#b6af97';
  ctx.lineWidth = 5;
  // Stroke the jambs and curved header, leaving the sill open.
  ctx.beginPath();
  ctx.moveTo(left, -1);
  ctx.lineTo(left, -56);
  ctx.bezierCurveTo(left, -76, middle - 11, peak, middle, peak);
  ctx.bezierCurveTo(middle + 13, peak, right, -76, right, -56);
  ctx.lineTo(right, -1);
  ctx.stroke();

  if (damage === 3) {
    // Broken leaves lie flat by the jambs. The pale middle of the road is exposed.
    polygon(ctx, '#453a2d', [[left - 3, 2], [left + 15, 8], [left + 9, 25], [left - 12, 16]]);
    polygon(ctx, '#8b6744', [[left - 3, 2], [left + 10, 7], [left + 3, 21], [left - 10, 15]]);
    polygon(ctx, '#604732', [[right - 10, 6], [right + 4, -1], [right + 12, 11], [right + 3, 18]]);
    polygon(ctx, '#9d784f', [[right - 7, 5], [right + 4, -1], [right + 10, 7], [right + 2, 12]]);
  }
  ctx.restore();

  // Keep the far pier's foot behind the ground socket in portrait.
  const fx = portrait ? left - 12 : right + 6;
  const foot = portrait ? -37 : -16;
  polygon(ctx, '#565e51', [[fx - 9, -99], [fx + 7, -105], [fx + 12, foot - 7], [fx + 4, foot + 2], [fx - 10, foot - 1]]);
  polygon(ctx, '#838671', [[fx - 10, -97], [fx + 4, -100], [fx + 4, foot + 2], [fx - 10, foot - 1]]);
  polygon(ctx, '#b9b69c', [[fx - 13, -101], [fx + 7, -105], [fx + 11, -99], [fx - 10, -95]]);
  for (let y = -90; y < foot - 5; y += 13) polygon(ctx, '#6a6e5d',
    [[fx - 10, y], [fx + 4, y - 1], [fx + 4, y + 1], [fx - 10, y + 2]]);

  ctx.clearRect(rx - 17, ry - 28, 34, 17);
  if (portrait) {
    const socket = layout.cellCenter({ col: 22, row: 10 });
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.ellipse(socket.x - contact.x, socket.y - contact.y, 18, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // The socket is centred on the cap itself. There is no second plinth on
  // the ground and the wall beside the cap reads as one connected building.
  ctx.fillStyle = '#343c30a0';
  ctx.beginPath();
  ctx.ellipse(rx + 2, ry + 28, 26, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  polygon(ctx, '#616758', [[rx - 21, ry + 2], [rx + 21, ry + 2], [rx + 19, ry + 26], [rx - 18, ry + 29]]);
  polygon(ctx, '#82836e', [[rx - 21, ry + 2], [rx + 9, ry + 6], [rx + 8, ry + 29], [rx - 18, ry + 31]]);
  for (const y of [14, 23]) polygon(ctx, '#555c50',
    [[rx - 19, ry + y], [rx + 8, ry + y + 1], [rx + 20, ry + y - 2],
      [rx + 20, ry + y], [rx + 8, ry + y + 3], [rx - 19, ry + y + 2]]);
  polygon(ctx, '#b6af93', [[rx - 25, ry + 1], [rx - 14, ry - 10], [rx + 15, ry - 10],
    [rx + 24, ry - 1], [rx + 16, ry + 11], [rx - 17, ry + 12]]);
}
