import { expect, type Page } from '@playwright/test';
import type { AudioState } from '../src/game/audio/engine';
import { waitForTitle } from './title';

// Milestone 33 (sound) helpers: real mode (?perf=1 for spawnHorde on the
// live loop, Canvas renderer), the scene reached through window.__tarpit.game.

type Rect = { x: number; y: number; width: number; height: number };

export const audio = (page: Page): Promise<AudioState> => page.evaluate(() => window.__tarpit!.audio());

/** How many times `name` was requested, played or thinned so far. */
export async function count(page: Page, kind: 'requested' | 'played' | 'thinned' | 'capped', name: string): Promise<number> {
  return (await audio(page))[kind][name] ?? 0;
}

/** Count every `new AudioContext()` the page makes (any code, Phaser included). */
export async function countContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { AudioContext: typeof AudioContext; __contexts: number };
    const Orig = w.AudioContext;
    w.__contexts = 0;
    w.AudioContext = class extends Orig {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.__contexts += 1;
      }
    };
  });
}

export const contexts = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __contexts: number }).__contexts);

/** The page centre of a uiRects() button (canvasToPage). */
export async function rectCentre(page: Page, name: string): Promise<{ x: number; y: number }> {
  const r = await page.evaluate((n) => window.__tarpit!.uiRects()[n] as Rect | undefined, name);
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  return page.evaluate(([x, y]) => window.__tarpit!.canvasToPage(x, y), [r!.x + r!.width / 2, r!.y + r!.height / 2]);
}

/** Open the title in real mode, click Play (the first gesture) and give the game plenty of gold and lives. */
export async function startPlay(page: Page, url = '/?renderer=canvas&perf=1'): Promise<void> {
  await page.goto(url);
  await waitForTitle(page);
  const p = await rectCentre(page, 'title:play');
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') && window.__tarpit.fx() !== null);
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as unknown as { state: { gold: number; lives: number } };
    scene.state.gold = 1e5;
    scene.state.lives = 1e5;
  });
  await page.waitForFunction(() => window.__tarpit!.audio().context === 'running');
}

/** Run `f(scene)` in the page; the scene is typed loosely. */
export function onScene<A, R>(page: Page, f: (scene: SceneLike, arg: A) => R, arg: A): Promise<R> {
  return page.evaluate(
    ({ src, arg }) => {
      const scene = window.__tarpit!.game.scene.getScene('game');
      return new Function('scene', 'arg', `return (${src})(scene, arg);`)(scene, arg);
    },
    { src: f.toString(), arg },
  ) as Promise<R>;
}

export interface SceneLike {
  state: {
    gold: number;
    lives: number;
    wave: number;
    phase: string;
    enemies: { id: number; type: string; hp: number; distance: number }[];
    spawnedPerGroup: number[];
    specialCharges: number;
    specialRechargeTicks: number;
  };
  build(c: { col: number; row: number }, t: string): { ok: boolean };
  upgrade(c: { col: number; row: number }, path?: 'A' | 'B'): { ok: boolean };
  sell(c: { col: number; row: number }): { ok: boolean };
  startWave(): { ok: boolean };
  callNextWave(): { ok: boolean };
  spawnHorde(n: number, span?: number): boolean;
  useSpecialAt(type: string, x: number, y: number): { ok: boolean };
  setSpeed(s: number): void;
  cheatGold(): { ok: boolean };
  advance(n: number, redraw?: boolean): void;
}

/** Build `type` on the first free cell near Meadow's spawn; returns the cell. */
export async function buildNearSpawn(page: Page, type: string): Promise<{ col: number; row: number }> {
  const cell = await onScene(
    page,
    (scene, type) => {
      for (const [col, row] of [[2, 5], [1, 5], [3, 5], [2, 9], [1, 9], [3, 9], [4, 5], [4, 9]]) {
        if (scene.build({ col, row }, type).ok) return { col, row };
      }
      return null;
    },
    type,
  );
  expect(cell, `a buildable cell near the spawn for ${type}`).not.toBeNull();
  return cell!;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The mute button (`name`) is inside the canvas, at least `min` canvas px square, and overlaps no other button. */
export async function checkMuteRect(page: Page, name: string, min: number): Promise<Rect> {
  const all = await page.evaluate(() => window.__tarpit!.uiRects() as Record<string, Rect>);
  const size = await page.evaluate(() => ({ w: window.__tarpit!.game.scale.gameSize.width, h: window.__tarpit!.game.scale.gameSize.height }));
  const m = all[name];
  expect(m, name).toBeTruthy();
  expect(m.width).toBeGreaterThanOrEqual(min);
  expect(m.height).toBeGreaterThanOrEqual(min);
  expect(m.x >= 0 && m.y >= 0 && m.x + m.width <= size.w && m.y + m.height <= size.h, `${name} inside the canvas`).toBe(true);
  for (const [other, r] of Object.entries(all)) if (other !== name) expect(overlaps(m, r), `${name} overlaps ${other}`).toBe(false);
  return m;
}

/** Tap (touch) or click (mouse) the centre of a uiRects() button. */
export async function press(page: Page, name: string, touch: boolean): Promise<void> {
  const p = await rectCentre(page, name);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

/** The mute buttons on the title and in the game, by touch or mouse: they mute, show it and are remembered. */
export async function muteRoundTrip(page: Page, touch: boolean, min: number): Promise<void> {
  await page.goto('/?renderer=canvas');
  await waitForTitle(page);
  await checkMuteRect(page, 'title:mute', min);
  expect((await audio(page)).muted).toBe(false);
  await press(page, 'title:mute', touch);
  expect((await audio(page)).muted).toBe(true);
  await press(page, 'title:play', touch);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') && window.__tarpit.uiRects().mute !== undefined);
  await checkMuteRect(page, 'mute', min);
  // Muted carries into the game; the HUD button unmutes and the next sound plays.
  expect((await audio(page)).muted).toBe(true);
  await press(page, 'mute', touch);
  expect((await audio(page)).muted).toBe(false);
  await page.waitForFunction(() => (window.__tarpit!.audio().played.tap ?? 0) > 0);
  await press(page, 'mute', touch);
  expect((await audio(page)).muted).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('tarpit.muted'))).toBe('1');
}
