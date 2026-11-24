// Pure UI geometry (milestone 32b): button stacks, the tower panel's box and
// the portrait controls, with no Phaser, so layout.test.ts can check them.

import type { Rect } from '../../sim';
import { KILLS_LINE_H } from '../input';
import { PORTRAIT_BUTTON_H, PORTRAIT_MIN_FONT, PORTRAIT_ROW1_Y, PORTRAIT_ROW2_Y, PORTRAIT_WIDTH, type Layout } from '../layout';

export const STACK_GAP = 4;
export const STACK_PAD = 6;

/** A stack's button sizes. */
export interface StackSize {
  buttonW: number;
  buttonH: number;
  close: number;
}

/** The landscape stack: 156 x 42 buttons and a 42 px close button. */
export const STACK_SIZE: StackSize = { buttonW: 156, buttonH: 42, close: 42 };
/** Portrait popups and panels: 220 x 70 buttons and a 70 px close button, 18 px text. */
export const PORTRAIT_STACK: StackSize = { buttonW: 220, buttonH: PORTRAIT_BUTTON_H, close: PORTRAIT_BUTTON_H };

/** A stack's backing box: `n` buttons under a `header` px line, with a close button to their right or not. */
export function stackBox(size: StackSize, n: number, header: number, withClose: boolean): { width: number; height: number } {
  return {
    width: size.buttonW + 2 * STACK_PAD + (withClose ? STACK_GAP + size.close : 0),
    height: 2 * STACK_PAD + header + n * size.buttonH + (n - 1) * STACK_GAP,
  };
}

/** The tower panel's kills line in portrait (18 px text). */
export const PORTRAIT_KILLS_LINE_H = 26;

/** The tower panel in `layout`: its stack size, kills line height and box (three buttons and a close button). */
export function panelGeometry(layout: Layout): { size: StackSize; header: number; box: { width: number; height: number } } {
  const portrait = layout.kind === 'portrait';
  const size = portrait ? PORTRAIT_STACK : STACK_SIZE;
  const header = portrait ? PORTRAIT_KILLS_LINE_H : KILLS_LINE_H;
  return { size, header, box: stackBox(size, 3, header, true) };
}

/**
 * Portrait build bar: six 75 x 70 buttons in one row, 4 px apart, centred
 * in the 480 px canvas. A tower name at the 18 px portrait text size does
 * not fit 75 px ("Musketeer" is 97 px, even "Longbow" 76 px), so a portrait
 * button shows the tower's own map shape over its cost.
 */
export const PORTRAIT_BAR_W = 75;
export const PORTRAIT_BAR_GAP = 4;
const BAR_COUNT = 6;
const PORTRAIT_BAR_LEFT = (PORTRAIT_WIDTH - BAR_COUNT * PORTRAIT_BAR_W - (BAR_COUNT - 1) * PORTRAIT_BAR_GAP) / 2;

/** The portrait bar's six button rectangles, left to right. */
export function portraitBarRects(): Rect[] {
  return Array.from({ length: BAR_COUNT }, (_, i) => ({
    x: PORTRAIT_BAR_LEFT + i * (PORTRAIT_BAR_W + PORTRAIT_BAR_GAP),
    y: PORTRAIT_ROW1_Y,
    width: PORTRAIT_BAR_W,
    height: PORTRAIT_BUTTON_H,
  }));
}

/** Both rows share the same inset and gap. Only the wave plaque takes the spare width. */
export function portraitRow2(cssScale = 1) {
  const height = PORTRAIT_BUTTON_H;
  // The space between the tower row and canvas bottom can fit an 80 px square.
  const icon = Math.min(80, Math.max(height, Math.ceil(44 / cssScale)));
  const innerWidth = PORTRAIT_WIDTH - 2 * PORTRAIT_BAR_LEFT;
  const specialWidth = 90;
  const speedWidth = height;
  const startWidth = innerWidth - 4 * PORTRAIT_BAR_GAP - specialWidth - speedWidth - 2 * icon;
  let x = PORTRAIT_BAR_LEFT;
  const plaque = (width: number, h = height): Rect => {
    const r = { x, y: PORTRAIT_ROW2_Y + (height - h) / 2, width, height: h };
    x += width + PORTRAIT_BAR_GAP;
    return r;
  };
  return {
    special: plaque(specialWidth), start: plaque(startWidth), speed: plaque(speedWidth),
    mute: plaque(icon, icon), pause: plaque(icon, icon),
  };
}

/** The title menu's parts (milestone 32b: TitleScene keeps the landscape values; this is portrait). */
export interface TitleGeometry {
  titleY: number;
  subtitleY: number;
  levelCaptionY: number;
  levelY: number;
  levelW: number;
  levelH: number;
  gap: number;
  mapCaptionY: number;
  mapY: number;
  mapH: number;
  thumbW: number;
  thumbH: number;
  thumbTop: number;
  thumbNameY: number;
  mapNameSize: string;
  levelFont: string;
  bestY: number;
  playW: number;
  playH: number;
  playY: number;
  playFont: string;
  promptY: number;
  /** Wrap width for the prompt, or 0 for one line. */
  promptWrap: number;
}

export const PORTRAIT_TITLE: TitleGeometry = {
  titleY: 200,
  subtitleY: 270,
  levelCaptionY: 390,
  levelY: 410,
  levelW: 144,
  levelH: 70,
  gap: 12,
  mapCaptionY: 530,
  mapY: 550,
  mapH: 116,
  thumbW: 120,
  thumbH: 60,
  thumbTop: 8,
  thumbNameY: 92,
  mapNameSize: '20px',
  levelFont: '22px',
  bestY: 720,
  playW: 260,
  playH: 80,
  playY: 770,
  playFont: '26px',
  promptY: 930,
  promptWrap: 330,
};

/** The title's buttons for a geometry, centred on x `cx`: three level buttons, three map buttons and Play. */
export function titleRects(geo: TitleGeometry, cx: number): { levels: Rect[]; maps: Rect[]; play: Rect } {
  const row = 3 * geo.levelW + 2 * geo.gap;
  const at = (i: number) => cx - row / 2 + i * (geo.levelW + geo.gap);
  return {
    levels: [0, 1, 2].map((i) => ({ x: at(i), y: geo.levelY, width: geo.levelW, height: geo.levelH })),
    maps: [0, 1, 2].map((i) => ({ x: at(i), y: geo.mapY, width: geo.levelW, height: geo.mapH })),
    play: { x: cx - geo.playW / 2, y: geo.playY, width: geo.playW, height: geo.playH },
  };
}

/** Characters on one portrait strip line: 468 px of 18 px Courier New (0.6 em a character). */
export const STRIP_LINE_CHARS = Math.floor((PORTRAIT_WIDTH - 12) / (0.6 * PORTRAIT_MIN_FONT));

/**
 * The aim instruction in the portrait strip (32b follow-up), in place of the
 * preview's two lines: the banner's main line, then as many whole sentences
 * of its hint as fit one line. The touch hint ("Or hold to aim and lift to
 * let go. Special again cancels.", 56 characters) loses its second
 * sentence; the Special button shows picked while aiming.
 */
export function stripAimText(banner: { main: string; hint: string }): string {
  const sentences = banner.hint.match(/[^.]+\.?/g)?.map((t) => t.trim()) ?? [];
  let hint = '';
  for (const t of sentences) {
    const next = hint === '' ? t : `${hint} ${t}`;
    if (next.length > STRIP_LINE_CHARS) break;
    hint = next;
  }
  return hint === '' ? banner.main : `${banner.main}\n${hint}`;
}
