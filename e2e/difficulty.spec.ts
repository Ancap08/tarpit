import { expect, test, type Page } from '@playwright/test';
import { DIFFICULTY_LABELS } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { TitleUiState } from '../src/game/TitleScene';

// Milestone 25: the title menu's difficulty row and Play button, through
// real clicks and keys (?test=1, time driven by step()). Numbers come from
// docs/SCOPE-v4.md "Difficulty" and the unit tests in
// src/sim/difficulty.test.ts: the first Goblin of wave 1 has 9 hp on Easy,
// 12 on Normal and 13 on Hard (milestone 25c; 23, 30 and 39 before).

const t = (page: Page) => ({
  scene: () => page.evaluate(() => (window.__tarpit as TarpitTestApi).scene()),
  title: () => page.evaluate(() => (window.__tarpit as TarpitTestApi).ui<TitleUiState>()),
  state: () => page.evaluate(() => (window.__tarpit as TarpitTestApi).state()),
  hud: () => page.evaluate(() => (window.__tarpit as TarpitTestApi).hudText()),
  difficulty: () => page.evaluate(() => (window.__tarpit as TarpitTestApi).difficulty()),
  endScreen: () => page.evaluate(() => (window.__tarpit as TarpitTestApi).endScreen()),
  step: (n: number) => page.evaluate((k) => (window.__tarpit as TarpitTestApi).step(k), n),
});

/** Click the centre of a named rectangle from uiRects(); fails if it is not there. */
async function click(page: Page, name: string): Promise<void> {
  const r = await page.evaluate((n) => (window.__tarpit as TarpitTestApi).uiRects()[n], name);
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

const onScene = (page: Page, key: 'title' | 'game') => page.waitForFunction((k) => window.__tarpit?.scene?.() === k, key);

/** A fresh game (tick 0, setup) is running: after Play or Play again, which restart the scene. */
const freshGame = (page: Page) =>
  page.waitForFunction(() => {
    const a = window.__tarpit as TarpitTestApi | undefined;
    if (a?.scene?.() !== 'game') return false;
    const s = a.state();
    return s.tick === 0 && s.phase === 'setup' && s.wave === 0;
  });

/** Start wave 1 with the real button and run one tick: the first Goblin spawns. */
async function firstGoblinHp(page: Page): Promise<number> {
  await click(page, 'startWave');
  await t(page).step(1);
  const s = await t(page).state();
  expect(s.wave).toBe(1);
  expect(s.enemies.map((e) => e.type)).toEqual(['goblin']);
  return s.enemies[0].hp;
}

/** Lose fast: 1 life left (test setup), wave started if needed, then run until a Goblin exits. */
async function loseQuickly(page: Page): Promise<void> {
  await page.evaluate(() => {
    const a = window.__tarpit as TarpitTestApi;
    a.state().lives = 1;
    if (a.state().phase === 'setup') a.startWave();
    a.step(3000);
  });
  expect(await t(page).endScreen()).toBe('lost');
}

test('the menu starts each level with its gold, lives and Goblin hp; Menu and Play again keep the level', async ({ page }) => {
  await page.goto('/?test=1');
  await onScene(page, 'title');
  expect(await t(page).title()).toEqual({ scene: 'title', difficulty: 'normal' });

  // Easy: selecting does not start the game; Play does.
  await click(page, 'title:easy');
  expect(await t(page).title()).toEqual({ scene: 'title', difficulty: 'easy' });
  expect(await t(page).scene()).toBe('title');
  await click(page, 'title:play');
  await freshGame(page);
  expect(await t(page).difficulty()).toBe('easy');
  expect(await t(page).state()).toMatchObject({ difficulty: 'easy', gold: 150, lives: 30, wave: 0 });
  expect(await firstGoblinHp(page)).toBe(9);
  expect((await t(page).hud()).difficulty).toBe(DIFFICULTY_LABELS.easy);

  // Lose, then [Menu]: the title again with Easy still selected.
  await loseQuickly(page);
  await click(page, 'menu');
  await onScene(page, 'title');
  expect(await t(page).title()).toEqual({ scene: 'title', difficulty: 'easy' });

  // Hard.
  await click(page, 'title:hard');
  await click(page, 'title:play');
  await freshGame(page);
  expect(await t(page).state()).toMatchObject({ difficulty: 'hard', gold: 80, lives: 15 });
  expect(await firstGoblinHp(page)).toBe(13);
  expect((await t(page).hud()).difficulty).toBe(DIFFICULTY_LABELS.hard);

  // Play again after a loss keeps Hard.
  await loseQuickly(page);
  await click(page, 'playAgain');
  await freshGame(page);
  expect(await t(page).state()).toMatchObject({ difficulty: 'hard', gold: 80, lives: 15 });
  expect((await t(page).hud()).difficulty).toBe(DIFFICULTY_LABELS.hard);

  // Normal by keyboard: back to the menu (Hard selected), Left, Enter.
  await loseQuickly(page);
  await click(page, 'menu');
  await onScene(page, 'title');
  expect(await t(page).title()).toEqual({ scene: 'title', difficulty: 'hard' });
  await page.keyboard.press('ArrowLeft');
  expect(await t(page).title()).toEqual({ scene: 'title', difficulty: 'normal' });
  await page.keyboard.press('Enter');
  await freshGame(page);
  expect(await t(page).state()).toMatchObject({ difficulty: 'normal', gold: 100, lives: 20 });
  expect(await firstGoblinHp(page)).toBe(12);
  expect((await t(page).hud()).difficulty).toBe('');
});

test('Left and Right stop at the ends; Space presses Play; a click away from Play does nothing', async ({ page }) => {
  await page.goto('/?test=1');
  await onScene(page, 'title');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect((await t(page).title()).difficulty).toBe('easy');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  expect((await t(page).title()).difficulty).toBe('hard');
  await page.mouse.click(480, 360); // the empty band reserved for the map row
  await page.mouse.click(30, 30);
  expect(await t(page).scene()).toBe('title');
  await page.keyboard.press('Space');
  await freshGame(page);
  expect(await t(page).difficulty()).toBe('hard');
});

test('menu geometry: three level buttons and Play, 42 px tall, at least 120 wide, centred', async ({ page }) => {
  await page.goto('/?test=1');
  await onScene(page, 'title');
  const r = await page.evaluate(() => (window.__tarpit as TarpitTestApi).uiRects());
  expect(Object.keys(r).sort()).toEqual(['title:easy', 'title:hard', 'title:normal', 'title:play']);
  for (const rect of Object.values(r)) {
    expect(rect.height).toBe(42);
    expect(rect.width).toBeGreaterThanOrEqual(120);
  }
  const row = ['title:easy', 'title:normal', 'title:hard'].map((n) => r[n]);
  expect(new Set(row.map((b) => b.y)).size).toBe(1);
  expect(row[0].x + row[0].width).toBeLessThan(row[1].x);
  expect(row[1].x + row[1].width).toBeLessThan(row[2].x);
  expect((row[0].x + row[2].x + row[2].width) / 2).toBe(480);
  expect(r['title:play'].x + r['title:play'].width / 2).toBe(480);
  // Room below the level row for the future map row and high-score line.
  expect(r['title:play'].y - (row[0].y + row[0].height)).toBeGreaterThanOrEqual(120);
});

test('the end screens list Play again and Menu side by side', async ({ page }) => {
  await page.goto('/?test=1');
  await onScene(page, 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  await loseQuickly(page);
  const r = await page.evaluate(() => (window.__tarpit as TarpitTestApi).uiRects());
  expect(r.menu.height).toBe(42);
  expect(r.menu.y).toBe(r.playAgain.y);
  expect(r.menu.x).toBeGreaterThan(r.playAgain.x + r.playAgain.width);
});
