import type Phaser from 'phaser';
import { positionAlongPath, roadPath, type GameState, type Point } from '../../sim';
import type { Rect } from '../input';
import type { Layout } from '../layout';
import { GameClock } from '../loop';
import { SIEGE_TEXT } from '../names';

const ATLAS = 'siege:actors';
const FRAMES: Record<string, [number, number, number, number]> = {
  lit: [0, 0, 192, 168], tip: [192, 0, 192, 168], shake: [384, 0, 192, 168],
  spent: [576, 0, 192, 168], emptyLeft: [768, 0, 192, 168], emptyRight: [0, 168, 192, 168],
  glow: [192, 168, 176, 160], camp: [368, 168, 244, 152], survey: [612, 168, 200, 128],
  packed: [812, 168, 132, 152], walking: [768, 336, 132, 152], dawn: [0, 336, 768, 184],
  coach: [0, 520, 462, 152], wheel: [464, 520, 68, 68], feather: [534, 520, 48, 48],
  tar: [584, 520, 32, 44],
};

export function loadSiegeActors(scene: Phaser.Scene, needed: boolean): void {
  const loaded = scene.textures.exists(ATLAS);
  if (!needed && loaded) scene.textures.remove(ATLAS);
  if (needed && !loaded) {
    scene.load.image(ATLAS, import.meta.env.BASE_URL + 'assets/act3/siege-actors.webp');
  }
}

function atlasReady(scene: Phaser.Scene): boolean {
  if (!scene.textures.exists(ATLAS)) return false;
  const atlas = scene.textures.get(ATLAS);
  if (!atlas.has('lit')) {
    for (const [key, [x, y, width, height]] of Object.entries(FRAMES)) {
      atlas.add(key, 0, x, y, width, height);
    }
  }
  return true;
}

type Sprite = Phaser.GameObjects.Image;
type Projection = (point: Point) => Point;
const identity: Projection = point => point;

function prop(scene: Phaser.Scene, frame: string) {
  return scene.add.image(0, 0, ATLAS, frame).setScale(.5);
}

interface Particle {
  image: Sprite;
  roadPoint: Point;
  starts: number;
  duration: number;
  wide: number;
  isTar: boolean;
}

interface Bedroom {
  glow: Sprite;
  frame: Sprite;
  badge: Sprite;
  particles: Particle[];
  anchor: Point;
  used: boolean;
  usedAt: number;
  emptyAt: number;
}

const TIP_MS = 370;
const SHUT_MS = 1250;
const SHAKE_HEAD_MS = 540;
const PACK_MS = 340;
const LEAVE_MS = 1500;

export class SiegeActors {
  private readonly rooms: Bedroom[] = [];
  private readonly surveys: { stakes: Sprite; board: Phaser.GameObjects.Text; anchor: Point }[] = [];
  private readonly quarter?: { camp: Sprite; soldier: Sprite; anchor: Point };
  private departAt = -Infinity;
  private billeted: boolean;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(scene: Phaser.Scene, private readonly layout: Layout, state: GameState, private readonly frozen: boolean) {
    const tax = state.wallSiteTax;
    this.billeted = tax?.kind === 'quartering';
    if (!atlasReady(scene)) return;
    for (const window of state.windows ?? []) {
      const road = roadPath(state.map, window.road);
      const particles = Array.from({ length: 18 }, (_, i): Particle => {
        const isTar = i < 6;
        const u = (i * 11 % 19) / 18;
        const roadPoint = layout.toScreen(positionAlongPath(road, window.from + (window.to - window.from) * u));
        return {
          image: prop(scene, isTar ? 'tar' : 'feather').setVisible(false),
          roadPoint, isTar,
          starts: isTar ? 170 + i * 18 : TIP_MS + (i - 6) * 33,
          duration: isTar ? 445 + (i % 3) * 55 : 650 + (i % 4) * 65,
          wide: (i % 7 - 3) * 3.8,
        };
      });
      this.rooms.push({
        glow: prop(scene, 'glow'),
        frame: prop(scene, window.used ? 'spent' : 'lit'),
        badge: prop(scene, 'feather'),
        particles, anchor: layout.toScreen(window.position), used: window.used, usedAt: -Infinity, emptyAt: -Infinity,
      });
    }
    if (tax?.kind === 'royalSurvey') {
      for (const site of tax.sites) {
        const stakes = prop(scene, 'survey').setScale(.54, .5);
        const board = scene.add.text(0, 0, SIEGE_TEXT.condemned, {
          fontFamily: 'monospace', fontSize: '17px', fontStyle: 'bold', color: '#281c20',
          metrics: { ascent: 15, descent: 3, fontSize: 18 },
        }).setOrigin(.5);
        this.surveys.push({ stakes, board, anchor: layout.cellCenter(site) });
      }
    }
    if (tax?.kind === 'quartering') {
      this.quarter = {
        camp: prop(scene, 'camp').setOrigin(.5, .86),
        soldier: prop(scene, 'packed').setOrigin(.5, .90).setVisible(false),
        anchor: layout.cellCenter(tax.site),
      };
    }
  }

  emptyWindow(index: number, nowMs: number): void {
    const room = this.rooms[index];
    if (room) room.emptyAt = nowMs;
  }

  update(state: GameState, nowMs: number, project: Projection = identity, shown = true): void {
    const animate = !this.frozen && !this.reduced.matches;
    for (const [index, room] of this.rooms.entries()) {
      if (state.windows?.[index]?.used && !room.used) {
        room.used = true;
        room.usedAt = nowMs;
      }
      const age = nowMs - room.usedAt;
      const shake = room.used && animate && age < SHUT_MS;
      const spent = room.used && !shake;
      const empty = ageOfEmpty(room, nowMs, animate);
      const frame = spent ? 'spent' : shake ? age < TIP_MS ? 'tip' : 'shake' : empty;
      const { x, y } = project(room.anchor);
      const pulse = animate ? .5 + .5 * Math.sin(nowMs / 340 + index * 1.5) : .5;
      const wag = shake && age >= TIP_MS ? Math.sin(age / 36) * 1.4 : 0;
      room.glow.setVisible(shown && !spent).setPosition(x, y - 2).setScale(.68 + pulse * .09)
        .setAlpha(.8 + pulse * .2);
      if (room.frame.frame.name !== frame) room.frame.setFrame(frame);
      room.frame.setVisible(shown).setPosition(x + wag, y);
      room.badge.setVisible(shown && !room.used).setPosition(x + 32, y + 18 - pulse * 2)
        .setScale(.50 + pulse * .05);
      for (const p of room.particles) {
        const t = shown && animate ? (age - p.starts) / p.duration : Infinity;
        p.image.setVisible(t >= 0 && t < 1);
        if (!p.image.visible) continue;
        const end = project(p.roadPoint);
        const sway = p.isTar ? Math.sin(t * Math.PI) * 11 : Math.sin(t * 8 + p.wide) * 13;
        const rise = Math.sin(t * Math.PI) * (p.isTar ? 34 : 59);
        p.image.setPosition(x + 21 + (end.x - x - 21) * t + sway + p.wide * t,
          y + 21 + (end.y - y - 21) * t - rise)
          .setScale((p.isTar ? .40 : .58) + .16 * Math.sin(t * Math.PI))
          .setRotation(p.isTar ? p.wide * .05 : p.wide + t * 2.5)
          .setAlpha(Math.min(1, (1 - t) * 5));
      }
    }
    for (const { stakes, board, anchor } of this.surveys) {
      const { x, y } = project(anchor);
      const center = Math.max(53, Math.min(stakes.scene.scale.width - 53, x));
      // Keep the upper board below the Gate plaque in the settled portrait view.
      const sign = this.layout.turned ? Math.max(240, y) : y;
      stakes.setVisible(shown).setPosition(center, sign - 4);
      board.setVisible(shown).setPosition(center, sign - 16);
    }
    if (this.quarter) {
      if (!state.wallSiteTax && this.billeted) {
        this.billeted = false;
        this.departAt = nowMs;
      }
      const age = nowMs - this.departAt;
      const { x, y } = project(this.quarter.anchor);
      const { camp, soldier } = this.quarter;
      camp.setVisible(shown && (this.billeted || animate && age < PACK_MS))
        .setPosition(x, y).setAlpha(this.billeted ? 1 : Math.max(0, 1 - age / PACK_MS));
      const walking = shown && animate && age < LEAVE_MS;
      soldier.setVisible(walking);
      if (walking) {
        const progress = Math.max(0, (age - PACK_MS) / (LEAVE_MS - PACK_MS));
        const stride = Math.floor(age / 118) % 2;
        const frame = stride ? 'walking' : 'packed';
        if (soldier.frame.name !== frame) soldier.setFrame(frame);
        soldier.setPosition(x + progress * 101, y + progress * 24 - stride * 2)
          .setScale(.5 - progress * .10).setAlpha(Math.min(1, (1 - progress) * 4));
      }
    }
  }
}

function ageOfEmpty(room: Bedroom, nowMs: number, animate: boolean): 'lit' | 'emptyLeft' | 'emptyRight' {
  const age = nowMs - room.emptyAt;
  if (!animate || age >= SHAKE_HEAD_MS) return 'lit';
  return Math.floor(age / 90) % 2 === 0 ? 'emptyLeft' : 'emptyRight';
}

const PORTRAIT_ENDING = 'siege:ending-portrait';

export function loadSiegeEnding(scene: Phaser.Scene): void {
  if (!scene.textures.exists(PORTRAIT_ENDING)) {
    scene.load.image(PORTRAIT_ENDING, import.meta.env.BASE_URL + 'assets/act3/siege-ending-portrait.webp');
  }
  scene.events.once('shutdown', () => scene.textures.remove(PORTRAIT_ENDING));
}

/** A moving illustration under the campaign ending copy. */
export function drawSiegeCarriage(scene: Phaser.Scene, frame: Rect, portrait: boolean, frozen: boolean, printed = false): void {
  if (!atlasReady(scene)) return;
  const { width, height } = frame;
  const cx = frame.x + width / 2;
  const y = frame.y + height / 2;
  scene.add.rectangle(cx, y, width + 6, height + 6, 0x664633).setName('siege-carriage-frame').setVisible(!printed);
  const background = portrait && scene.textures.exists(PORTRAIT_ENDING)
    ? scene.add.image(cx, y, PORTRAIT_ENDING) : prop(scene, 'dawn').setPosition(cx, y);
  background.setDisplaySize(width, height);
  const coach = prop(scene, 'coach');
  const wheels = [prop(scene, 'wheel'), prop(scene, 'wheel')];
  const feathers = Array.from({ length: 6 }, () => prop(scene, 'feather'));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clock = new GameClock();
  const draw = () => {
    const animated = !frozen && !reduced.matches;
    const t = animated ? Math.min(1, clock.nowMs / 7200) : .17;
    // Hold the carriage on the far bend after the one visible journey.
    const ease = t * (2 - t);
    const size = Math.min(1.82, width / 382) * (1.34 - ease * .67);
    const x = cx - width * .15 + ease * width * .32;
    const uneven = animated ? Math.sin(ease * 54) * (1 - t) * 1.7 : 0;
    const cy = y + height * (.26 - ease * .11) - size * 21 + uneven;
    coach.setPosition(x, cy).setScale(size / 2).setRotation(-.065);
    wheels[0].setPosition(x - 87 * size, cy + 25 * size).setScale(size / 2)
      .setRotation(ease * 19);
    wheels[1].setPosition(x - 27 * size, cy + 21 * size).setScale(size * .43)
      .setRotation(ease * 22);
    for (const [i, flake] of feathers.entries()) {
      const u = animated ? (clock.nowMs / 1580 + i * .168) % 1 : i / 6;
      const fx = x - (93 + u * 42) * size;
      const edge = Math.max(0, Math.min(1, (fx - cx + width / 2 - 7) / 20));
      flake.setPosition(fx, cy - (14 - u * 40 + i % 3 * 7) * size)
        .setScale(.30 * size).setRotation(i * 1.57 + u * 5).setAlpha((1 - u) * .89 * edge);
      flake.setVisible(t < 1);
    }
  };
  draw();
  if (frozen) return;
  const events = scene.events;
  const update = (_: number, delta: number) => {
    clock.paused = document.hidden || !document.hasFocus();
    clock.frame(delta, 1);
    draw();
  };
  events.on('update', update);
  events.once('shutdown', () => events.off('update', update));
}
