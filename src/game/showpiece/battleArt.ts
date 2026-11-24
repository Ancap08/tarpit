// All dimensions are field pixels. Bake the little figures and their gestures
// once; each one thereafter costs a single textured quad in either renderer.
import type Phaser from 'phaser';

type Ink = CanvasRenderingContext2D;
type Pair = readonly [number, number];
export const INK_KEY = 'showpiece-battle-miniatures';
export const TILE = 48;
const RES = 2;
const COLUMNS = 8;
const poses = ['musket', 'gunner', 'archer'] as const;
const objects = ['hat', 'coin', 'page', 'crater', 'ash', 'arrow', 'wear', 'skid', 'glow', 'bubble', 'ripple'] as const;
export type ObjectInk = typeof objects[number];

function shape(c: Ink, fill: string, points: Pair[], edge?: string) {
  c.beginPath();
  for (const [i, [x, y]] of points.entries()) {
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (edge) {
    c.strokeStyle = edge;
    c.lineWidth = 0.75;
    c.stroke();
  }
}
function line(c: Ink, colour: string, width: number, ...points: Pair[]) {
  c.beginPath();
  c.lineWidth = width;
  c.strokeStyle = colour;
  c.moveTo(...points[0]);
  for (let i = 1; i < points.length; ++i) c.lineTo(...points[i]);
  c.stroke();
}
function oval(c: Ink, x: number, y: number, w: number, h: number, fill: string, angle = 0) {
  c.fillStyle = fill;
  c.beginPath();
  c.ellipse(x, y, w, h, angle, 0, Math.PI * 2);
  c.fill();
}
function tricorn(c: Ink) {
  oval(c, 0, 1, 7.5, 2.1, '#252431');
  shape(c, '#362d36', [[-8, -2], [-1, -1], [3, -6], [7, -4], [5, 1], [-1, 3], [-6, 1]], '#24202a');
  line(c, '#bc9663', 1.25, [-7, -1.8], [-0.6, -0.2], [3.4, -4.8]);
  oval(c, 4.8, -2.7, 1.4, 1.6, '#9f4242');
}
function figure(c: Ink, role: typeof poses[number], pose: number) {
  const bend = [0, 1, 2.5, 1, 0, 0.65][pose];
  const blue = role === 'archer' ? '#456e63' : '#305369';
  const dark = '#282e33';
  oval(c, 0.8, 8.4, 6, 1.65, 'rgba(32,36,29,.28)');
  line(c, dark, 2.6, [-2, 2], [-2.8, 7.8], [-4.1, 7.8]);
  line(c, '#554934', 2.6, [1.7, 2], [3.4, 7.2], [4.7, 7.6]);
  c.translate(bend / 2, bend);
  shape(c, blue, [[-3.8, -5], [-0.7, -6], [2, -4.6], [3.1, 0], [3.7, 3], [-3.9, 3.6], [-3, 0.3]], dark);
  line(c, '#d6c9a1', 1.7, [-2.7, -4.8], [2.4, 0.7]);
  line(c, '#57412c', 1.4, [-3.2, 0.5], [2.9, 0.6]);
  oval(c, 2.4, 1.7, 1.45, 1.8, '#ad7850');
  oval(c, 0.4, -7.7, 2.8, 3, '#b48366');
  oval(c, 1.2, -8.5, 2.2, 2.2, '#edc19a');
  shape(c, '#efd0a0', [[2.6, -9], [4.3, -7.5], [2.5, -7.2]]);
  if (role === 'archer') {
    shape(c, '#2d5051', [[-3.7, -10], [-1, -13.1], [1, -11.5], [3.6, -10.5], [1.9, -9.4], [-2.6, -8.8]], dark);
    line(c, '#6d5039', 2.5, [-5.3, -6.7], [-3.1, 1]);
    line(c, '#dbcda8', 0.85, [-6.2, -10.7], [-4.6, -4], [-6.9, -9]);
  } else {
    shape(c, '#2d3842', [[-4.7, -10.5], [-2.6, -10.9], [-2.4, -12.7], [0.8, -13.1], [2.2, -11], [4.1, -11.2], [3, -9.8], [-2.8, -9.1]], dark);
    line(c, '#aa9574', 0.8, [-4, -10.4], [-0.2, -10.1], [3.1, -10.8]);
  }
  // Six readable silhouettes: ready, take charge, load, ram, aim, shift weight.
  const hand = ([[3, -3], [3.2, -6.8], [6, -2.2], [8, -4.5], [5, -5], [2, -2.8]] as const)[pose];
  line(c, blue, 2.8, [-1, -4.4], [0.8, -2.2], hand);
  oval(c, hand[0], hand[1], 1.3, 1.2, '#edc39d');
  if (role === 'gunner') {
    if (pose === 2) {
      oval(c, 6.5, -2.6, 3.1, 3.1, '#292f35');
      oval(c, 5.7, -3.6, 1.2, 0.8, '#89918b');
    } else {
      const y = pose === 3 ? -6.7 : -13;
      line(c, '#483b2d', 1.5, [hand[0] - 3, hand[1] + 3], [hand[0] + 7, y]);
      oval(c, hand[0] + 7, y, 2.2, 1.65, '#d2c1a1');
    }
  } else if (role === 'musket') {
    const muzzle: Pair = pose === 4 ? [14, -6] : [6, -14.5];
    line(c, '#583c28', 2, [-1, 0], [4, -4], muzzle);
    line(c, '#a1b0aa', 1, [4, -4.8], muzzle);
    if (pose === 1) line(c, '#f0ddab', 1.7, [2.8, -7], [5.1, -7.9]);
    if (pose === 3) line(c, '#d8c7a4', 1.05, [7, -17], [6, -8]);
  } else {
    c.beginPath();
    c.moveTo(6, -13);
    c.quadraticCurveTo(13, -7, 7, 0);
    c.strokeStyle = '#a67b46';
    c.lineWidth = 1.7;
    c.stroke();
    line(c, '#dfd7be', 0.7, [6, -13], [pose === 4 ? -1.5 : 4, -6.8], [7, 0]);
    if (pose === 2 || pose === 4) line(c, '#d7ba86', 1, [-3, -6.3], [12, -6.8]);
  }
}
function paintObject(c: Ink, kind: ObjectInk) {
  switch (kind) {
    case 'hat': tricorn(c); break;
    case 'coin':
      oval(c, 0, 0, 2.9, 2.5, '#74502d');
      oval(c, -0.3, -0.5, 2.5, 2.1, '#d4a341');
      line(c, '#ffdfa0', 1, [0, -1.8], [-1.2, -0.6], [-0.6, 0.5]);
      break;
    case 'page':
      shape(c, '#d6c196', [[-4, -3.6], [3.3, -4.2], [4.6, 2.3], [-2.9, 4.1]], '#92744d');
      line(c, '#8e7052', 0.7, [-2, -1.6], [1.6, -2.1]);
      line(c, '#8e7052', 0.7, [-1.5, 0], [2.4, -0.7]);
      oval(c, 1.4, 1.7, 0.95, 0.85, '#a64c3d');
      break;
    case 'crater':
    case 'ash':
      for (let i = 0; i < 13; i++) {
        const a = i * 2.4, r = i % 5 * 2;
        oval(c, Math.cos(a) * r, Math.sin(a) * r * 0.47, 5.2 - i % 3, 2.5, 'rgba(71,51,37,.21)', Math.sin(a) * 0.5);
      }
      if (kind === 'crater') {
        oval(c, 0, 0, 6.5, 2.8, 'rgba(64,46,36,.65)');
        line(c, '#b49b65', 0.9, [-5, 1.5], [-1.5, 2.7], [2.4, 2.2], [4.4, 1.7]);
      }
      break;
    case 'arrow':
      oval(c, 0.8, 2.4, 4.6, 1, 'rgba(61,48,36,.26)');
      line(c, '#735338', 1.3, [0, 2.6], [-2.8, -6.4]);
      shape(c, '#bda585', [[-3.6, -7.9], [-1.6, -7.2], [-1.3, -4.5], [-3.6, -5.6]]);
      break;
    case 'wear': case 'skid': {
      const skid = kind === 'skid';
      for (let i = 0; i < (skid ? 2 : 12); i++) {
        const x = skid ? -3 : (i * 7 % 23) - 11, y = skid ? i * 2.4 : (i * 11 % 9) - 4;
        oval(c, x, y, skid ? 5.6 : 1.65, skid ? 0.75 : 0.9, skid ? '#59503b' : '#776348', (i % 3 - 1) * .2);
        if (!skid) line(c, '#a19559', 0.8, [x, y + 1], [x + 2.7, y + 0.5]);
      }
      break;
    }
    case 'glow': {
      const gradient = c.createRadialGradient(0, 0, 0, 0, 0, 20);
      gradient.addColorStop(0, 'rgba(255,243,175,.98)');
      gradient.addColorStop(.21, 'rgba(255,184,76,.74)');
      gradient.addColorStop(.56, 'rgba(249,112,39,.26)');
      gradient.addColorStop(1, 'rgba(253,128,39,0)');
      c.fillStyle = gradient;
      c.fillRect(-20, -20, 40, 40);
      break;
    }
    case 'ripple':
      // Oscillating light/dark edges read as a wisp of hot air on the
      // grass. The transparent middle preserves the ground's detail.
      for (const [offset, colour] of [[0, '#6c6d57'], [1.4, '#fbe7a8']] as const) {
        c.beginPath();
        c.moveTo(-5, 4 + offset);
        c.bezierCurveTo(6, 1 + offset, -5, -1 + offset, 5, -4 + offset);
        c.strokeStyle = colour;
        c.lineWidth = 1.15;
        c.stroke();
      }
      break;
    case 'bubble':
      oval(c, 0, 0, 2.2, 1.7, '#474839');
      line(c, '#b3ab7b', 0.8, [-1.5, 0], [-1, -1.1], [0.2, -1.2]);
      break;
  }
}
export function battleTexture(scene: Phaser.Scene): void {
  const frames = [];
  for (const role of poses) {
    for (let pose = 0; pose < 6; pose++) {
      frames.push({ name: role + pose, paint: (c: Ink) => figure(c, role, pose) });
    }
  }
  for (const kind of objects) {
    frames.push({ name: kind, paint: (c: Ink) => paintObject(c, kind) });
  }
  const tex = scene.textures.createCanvas(INK_KEY, COLUMNS * TILE * RES, Math.ceil(frames.length / COLUMNS) * TILE * RES);
  if (!tex) throw new Error('Showpiece texture already in use');
  const c = tex.getContext();
  for (const [i, frame] of frames.entries()) {
    const x = (i % COLUMNS) * TILE * RES, y = Math.floor(i / COLUMNS) * TILE * RES;
    c.save();
    c.translate(x + TILE * RES / 2, y + TILE * RES / 2);
    c.scale(RES, RES);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    frame.paint(c);
    c.restore();
    tex.add(frame.name, 0, x, y, TILE * RES, TILE * RES);
  }
  tex.refresh();
}
