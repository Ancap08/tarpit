import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Win and lose screens reached through the real simulation, and [Play again]
// through a real click. Time is frozen (?test=1) and driven by step().
// Numbers come from the verified simulation: with no towers the game is lost
// on wave 2 with 0 lives; the sound build wins with 13 lives and 269 gold
// (milestone 8 grid plan; v1 was 11 lives and 253 gold).

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).scene())).toBe('game');
}

const state = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).state());
const ui = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).ui());
const endScreen = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).endScreen());
const speed = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).speed());
const step = (page: Page, n: number) => page.evaluate((k) => (window.__tarpit as TarpitTestApi).step(k), n);

/** Click the centre of a named rectangle from uiRects(); fails if it is not there. */
async function click(page: Page, name: string): Promise<void> {
  const r = await page.evaluate((n) => (window.__tarpit as TarpitTestApi).uiRects()[n], name);
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

/** With no towers: click Start Wave whenever a wave can start, step until lost (cap 60000 ticks). */
async function loseWithNoTowers(page: Page): Promise<void> {
  for (let ticks = 0; ticks < 60_000; ticks += 500) {
    const s = await state(page);
    if (s.phase === 'lost') return;
    if (s.phase === 'setup') await click(page, 'startWave');
    await step(page, 500);
  }
}

/** Counts that would grow if a restart leaked listeners or game objects. */
const leakProbe = (page: Page) =>
  page.evaluate(() => {
    const scene = (window.__tarpit as TarpitTestApi).game.scene.getScene('game');
    return {
      pointerdown: scene.input.listenerCount('pointerdown'),
      pointermove: scene.input.listenerCount('pointermove'),
      escape: scene.input.keyboard?.listenerCount('keydown-ESC') ?? 0,
      objects: scene.children.length,
    };
  });

/** Click [Play again] and wait for the restarted scene (Phaser restarts it on its next step). */
async function playAgain(page: Page): Promise<void> {
  await click(page, 'playAgain');
  await page.waitForFunction(() => {
    const t = window.__tarpit as TarpitTestApi;
    return t.scene() === 'game' && t.endScreen() === null && t.state().phase === 'setup' && t.state().tick === 0;
  });
}

async function expectFreshGame(page: Page): Promise<void> {
  expect(await state(page)).toMatchObject({ gold: 100, lives: 20, wave: 0, phase: 'setup', tick: 0, towers: [], enemies: [] });
  expect(await endScreen(page)).toBeNull();
  expect(await speed(page)).toBe(1);
  expect(await ui(page)).toMatchObject({ pick: null, selectedCell: null, panelOpen: false });
  expect((await page.evaluate(() => (window.__tarpit as TarpitTestApi).uiRects())).playAgain).toBeUndefined();
}

test('lose with no towers, map clicks do nothing, play again starts a clean game', async ({ page }) => {
  await startGame(page);
  const before = await leakProbe(page);
  expect(await endScreen(page)).toBeNull();

  await loseWithNoTowers(page);
  expect(await state(page)).toMatchObject({ phase: 'lost', wave: 2, lives: 0 });
  expect(await endScreen(page)).toBe('lost');
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).hudText())).toMatchObject({
    lives: 'Lives 0',
    wave: 'Wave 2/10',
    next: '', // no next wave after a loss
  });

  // The bar is greyed and a cell under the veil does nothing.
  await click(page, 'bar:musketeer');
  await page.mouse.click(240, 176); // cell (7,5)
  expect(await ui(page)).toMatchObject({ pick: null, hoverCell: null, panelOpen: false });
  expect((await state(page)).towers).toEqual([]);
  // Stepping more changes nothing and the screen stays.
  await step(page, 100);
  expect(await endScreen(page)).toBe('lost');

  await playAgain(page);
  await expectFreshGame(page);
  expect(await leakProbe(page)).toEqual(before);

  // Wave 1 again plays exactly as in a first game.
  await click(page, 'startWave');
  await step(page, 2005);
  expect(await state(page)).toMatchObject({ phase: 'setup', wave: 1, lives: 12, gold: 125 });
  // And the build bar works in the new game.
  await click(page, 'bar:musketeer');
  expect(await ui(page)).toMatchObject({ pick: 'musketeer' });
  await page.mouse.click(240, 176); // cell (7,5)
  expect((await state(page)).towers).toEqual([expect.objectContaining({ cell: { col: 7, row: 5 }, type: 'musketeer' })]);
});

test('win with the sound build through the scene actions, then play again', async ({ page }) => {
  await startGame(page);
  const phase = await page.evaluate(() => (window.__tarpit as TarpitTestApi).runScript('soundBuild'));
  expect(phase).toBe('won');
  expect(await endScreen(page)).toBe('won');
  expect(await state(page)).toMatchObject({ phase: 'won', wave: 10, lives: 13, gold: 269 });
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).hudText())).toMatchObject({
    gold: 'Gold 269',
    lives: 'Lives 13',
    wave: 'Wave 10/10',
  });

  // A tower under the veil does not select, and the bar is greyed even with gold.
  const tower = (await state(page)).towers[0].cell;
  await page.mouse.click(tower.col * 32 + 16, tower.row * 32 + 16);
  await click(page, 'bar:musketeer');
  expect(await ui(page)).toMatchObject({ pick: null, selectedCell: null, panelOpen: false });

  await playAgain(page);
  await expectFreshGame(page);
});

// Milestone 8: the grid lazy build loses on wave 3 (v1 spots: wave 8); the v1
// wave target returns in milestone 12.
test('lazy build loses on wave 3', async ({ page }) => {
  await startGame(page);
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).runScript('lazyBuild'))).toBe('lost');
  expect(await endScreen(page)).toBe('lost');
  expect(await state(page)).toMatchObject({ wave: 3, lives: 0 });
});

test('speed resets to 1x after play again', async ({ page }) => {
  await startGame(page);
  await click(page, 'speed');
  expect(await speed(page)).toBe(2);
  await loseWithNoTowers(page);
  expect(await endScreen(page)).toBe('lost');
  // The speed toggle is inert on the end screen.
  await click(page, 'speed');
  expect(await speed(page)).toBe(2);
  await playAgain(page);
  expect(await speed(page)).toBe(1);
  expect((await page.evaluate(() => (window.__tarpit as TarpitTestApi).hudText())).speed).toBe('1x');
});
