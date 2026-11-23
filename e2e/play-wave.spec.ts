import { expect, test, type Page } from '@playwright/test';
import { ENEMY_NAMES } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { waitForTitle } from './title';

// Plays wave 1 through the real Start Wave and speed buttons, with time
// driven by window.__tarpit.step in ?test=1 mode. Numbers come from the
// verified simulation (milestones 1 and 2).

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await waitForTitle(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).scene())).toBe('game');
}

const state = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).state());
const hud = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).hudText());
const step = (page: Page, n: number) => page.evaluate((k) => (window.__tarpit as TarpitTestApi).step(k), n);

async function clickButton(page: Page, which: 'startWave' | 'speed'): Promise<void> {
  const r = await page.evaluate((w) => (window.__tarpit as TarpitTestApi).uiRects()[w], which);
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

// Milestone 25c: wave 1 is 20 Goblins; with no towers all 20 exit, which
// would end a 20-life game, so these tests raise the lives to 100 first
// (test setup). Milestone 28: they come 2.5 s apart; the last spawns at
// waveTick 2850 and exits at 2850 + 1584, so the wave ends after 4435 ticks.
const WAVE1_NO_TOWERS_TICKS = 4435;
const lives100 = (page: Page) => page.evaluate(() => void ((window.__tarpit as TarpitTestApi).state().lives = 100));

test('wave 1 with no towers: 20 goblins, 20 leaks, clear bonus paid', async ({ page }) => {
  await startGame(page);
  expect(await hud(page)).toMatchObject({ gold: 'Gold 100', lives: 'Lives 20', wave: 'Wave 0/20', next: `Next: 20 ${ENEMY_NAMES.goblin}` });
  expect(await state(page)).toMatchObject({ gold: 100, lives: 20, wave: 0, phase: 'setup' });
  await lives100(page);

  await clickButton(page, 'startWave');
  expect(await state(page)).toMatchObject({ phase: 'wave', wave: 1 });

  await step(page, WAVE1_NO_TOWERS_TICKS - 1);
  expect(await state(page)).toMatchObject({ phase: 'wave', lives: 81 });
  await step(page, 1);
  expect(await state(page)).toMatchObject({ phase: 'setup', wave: 1, lives: 80, gold: 125, enemies: [] });
  expect(await hud(page)).toMatchObject({ gold: 'Gold 125', lives: 'Lives 80', wave: 'Wave 1/20', next: `Next: 32 ${ENEMY_NAMES.goblin}` });
});

// Milestone 25c: a 12 hp Goblin dies to one Musketeer shot; this one kills
// all 20 (before: 2 of 8). Second pass: 19 hp Goblins take two shots, so it
// killed 8 and 12 leaked. Milestone 28: 23 hp Goblins, still two shots, but
// one every 2.5 s, so it kills all 20 again: 100 - 50 + 20 x 2 + 25 = 115.
test('one musketeer at cell (7,5) kills all 20 goblins in wave 1', async ({ page }) => {
  await startGame(page);
  const built = await page.evaluate(() => (window.__tarpit as TarpitTestApi).buildAt(7, 5, 'musketeer'));
  expect(built.ok).toBe(true);
  await clickButton(page, 'startWave');
  await step(page, 3100);
  expect(await state(page)).toMatchObject({ phase: 'setup', wave: 1, lives: 20, gold: 115 });
  expect(await hud(page)).toMatchObject({ gold: 'Gold 115', lives: 'Lives 20' });
});

test('speed button toggles 1x and 2x', async ({ page }) => {
  await startGame(page);
  const speed = () => page.evaluate(() => (window.__tarpit as TarpitTestApi).speed());
  expect(await speed()).toBe(1);
  expect((await hud(page)).speed).toBe('1x');
  await clickButton(page, 'speed');
  expect(await speed()).toBe(2);
  expect((await hud(page)).speed).toBe('2x');
  await clickButton(page, 'speed');
  expect(await speed()).toBe(1);
  // Test mode never ticks on its own, so speed changes no state here.
  expect((await state(page)).tick).toBe(0);
});

test('Start Wave does nothing while a wave is active', async ({ page }) => {
  await startGame(page);
  await clickButton(page, 'startWave');
  await step(page, 30);
  await clickButton(page, 'startWave');
  expect(await state(page)).toMatchObject({ phase: 'wave', wave: 1, waveTick: 30 });
});

test('the title menu starts the game on a click on Play (milestone 25), not on a click elsewhere', async ({ page }) => {
  await page.goto('/?test=1');
  await waitForTitle(page);
  await page.mouse.click(480, 360); // the empty band under the level buttons
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).scene())).toBe('title');
  const r = await page.evaluate(() => (window.__tarpit as TarpitTestApi).uiRects()['title:play']);
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'game');
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).difficulty())).toBe('normal');
});

test('test mode runs no ticks on its own', async ({ page }) => {
  await startGame(page);
  await page.waitForTimeout(500);
  expect(await state(page)).toMatchObject({ tick: 0, phase: 'setup', wave: 0 });
});

test('Start Wave is clickable again after wave 1 clears and starts wave 2', async ({ page }) => {
  await startGame(page);
  await lives100(page);
  await clickButton(page, 'startWave');
  await step(page, WAVE1_NO_TOWERS_TICKS);
  expect(await state(page)).toMatchObject({ phase: 'setup', wave: 1 });
  await clickButton(page, 'startWave');
  expect(await state(page)).toMatchObject({ phase: 'wave', wave: 2 });
});
