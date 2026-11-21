import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Plays wave 1 through the real Start Wave and speed buttons, with time
// driven by window.__tarpit.step in ?test=1 mode. Numbers come from the
// verified simulation (milestones 1 and 2).

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
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

test('wave 1 with no towers: 8 goblins, 8 leaks, clear bonus paid', async ({ page }) => {
  await startGame(page);
  expect(await hud(page)).toMatchObject({ gold: 'Gold 100', lives: 'Lives 20', wave: 'Wave 0/10', next: 'Next: 8 Goblin' });
  expect(await state(page)).toMatchObject({ gold: 100, lives: 20, wave: 0, phase: 'setup' });

  await clickButton(page, 'startWave');
  expect(await state(page)).toMatchObject({ phase: 'wave', wave: 1 });

  await step(page, 2005);
  expect(await state(page)).toMatchObject({ phase: 'setup', wave: 1, lives: 12, gold: 125, enemies: [] });
  expect(await hud(page)).toMatchObject({ gold: 'Gold 125', lives: 'Lives 12', wave: 'Wave 1/10', next: 'Next: 12 Goblin' });
});

test('one musketeer at cell (7,5) kills 2 goblins in wave 1', async ({ page }) => {
  await startGame(page);
  const built = await page.evaluate(() => (window.__tarpit as TarpitTestApi).buildAt(7, 5, 'musketeer'));
  expect(built.ok).toBe(true);
  await clickButton(page, 'startWave');
  await step(page, 2005);
  expect(await state(page)).toMatchObject({ phase: 'setup', wave: 1, lives: 14, gold: 83 });
  expect(await hud(page)).toMatchObject({ gold: 'Gold 83', lives: 'Lives 14' });
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

test('title screen starts the game on click', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.mouse.click(480, 290);
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'game');
});

test('test mode runs no ticks on its own', async ({ page }) => {
  await startGame(page);
  await page.waitForTimeout(500);
  expect(await state(page)).toMatchObject({ tick: 0, phase: 'setup', wave: 0 });
});

test('Start Wave is clickable again after wave 1 clears and starts wave 2', async ({ page }) => {
  await startGame(page);
  await clickButton(page, 'startWave');
  await step(page, 2005);
  expect(await state(page)).toMatchObject({ phase: 'setup', wave: 1 });
  await clickButton(page, 'startWave');
  expect(await state(page)).toMatchObject({ phase: 'wave', wave: 2 });
});
