import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Independent verifier probes for milestone 5. Real clicks at uiRects().

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) =>
  page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const endScreen = (page: Page) => api(page, (a) => a.endScreen());

async function click(page: Page, name: string): Promise<void> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

/** Start waves and step until lost. Optionally stops early if a click is wanted between. */
async function loseGame(page: Page): Promise<void> {
  for (let ticks = 0; ticks < 120_000; ticks += 500) {
    const s = await state(page);
    if (s.phase === 'lost') return;
    if (s.phase === 'setup') await click(page, 'startWave');
    await api(page, (a) => a.step(500));
  }
  throw new Error('never lost');
}

async function playAgain(page: Page): Promise<void> {
  await click(page, 'playAgain');
  await page.waitForFunction(() => {
    const t = window.__tarpit as TarpitTestApi;
    return t.scene() === 'game' && t.endScreen() === null && t.state().phase === 'setup' && t.state().tick === 0;
  });
}

test('(a) third game behaves like the first', async ({ page }) => {
  await startGame(page);
  for (let i = 0; i < 2; i++) {
    await loseGame(page);
    expect(await endScreen(page)).toBe('lost');
    await playAgain(page);
  }
  await click(page, 'spot:2');
  await click(page, 'menu:musketeer');
  await click(page, 'startWave');
  await api(page, (a) => a.step(2005));
  expect(await state(page)).toMatchObject({ phase: 'setup', wave: 1, lives: 14, gold: 83 });
});

test('(b) after Play again no playAgain rect and no end screen', async ({ page }) => {
  await startGame(page);
  await loseGame(page);
  expect((await rects(page)).playAgain).toBeTruthy();
  await playAgain(page);
  expect((await rects(page)).playAgain).toBeUndefined();
  expect(await endScreen(page)).toBeNull();
});

test('(c) lose screen: Start Wave and speed clicks do nothing; no spot opens a menu, including under the panel', async ({ page }) => {
  await startGame(page);
  await loseGame(page);
  const before = await state(page);
  const sp = await api(page, (a) => a.speed());
  await click(page, 'startWave');
  await click(page, 'speed');
  expect(await api(page, (a) => a.speed())).toBe(sp);
  const after = await state(page);
  expect(after.phase).toBe('lost');
  expect(after.wave).toBe(before.wave);
  expect(after.tick).toBe(before.tick);
  const r = await rects(page);
  const pa = r.playAgain;
  // Every spot whose centre is outside the Play again button: nothing opens.
  // (Spot 6 lies under the button; clicking it is a click on Play again.)
  const underButton = (id: number) => {
    const s = r[`spot:${id}`];
    const cx = s.x + s.width / 2, cy = s.y + s.height / 2;
    return cx >= pa.x && cx <= pa.x + pa.width && cy >= pa.y && cy <= pa.y + pa.height;
  };
  const clicked: number[] = [];
  for (let id = 0; id < 10; id++) {
    if (underButton(id)) continue;
    await click(page, `spot:${id}`);
    clicked.push(id);
    expect(await ui(page), `spot ${id}`).toMatchObject({ menuOpen: false, panelOpen: false });
  }
  expect(clicked.length).toBe(9);
  expect(underButton(6)).toBe(true);
  // Spots 4, 5, 7 sit inside the panel box (x 250..710, y 125..355) but outside the button.
  expect(await endScreen(page)).toBe('lost');
  expect((await state(page)).phase).toBe('lost');
});

test('(d) win screen HUD text', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => a.runScript('soundBuild'));
  expect(await endScreen(page)).toBe('won');
  expect(await api(page, (a) => a.hudText())).toMatchObject({
    gold: 'Gold 269',
    lives: 'Lives 13',
    wave: 'Wave 10/10',
    next: 'Next: none',
  });
});

test('(e) Escape on an end screen keeps it', async ({ page }) => {
  await startGame(page);
  await loseGame(page);
  await page.keyboard.press('Escape');
  expect(await endScreen(page)).toBe('lost');
  expect((await state(page)).phase).toBe('lost');
  expect((await rects(page)).playAgain).toBeTruthy();
  await playAgain(page);
});

test('(f) a tower panel open when the game is lost is closed', async ({ page }) => {
  await startGame(page);
  await click(page, 'spot:2');
  await click(page, 'menu:musketeer');
  await click(page, 'spot:2');
  expect((await ui(page)).panelOpen).toBe(true);
  for (let ticks = 0; ticks < 120_000; ticks += 100) {
    if ((await state(page)).phase === 'lost') break;
    if ((await state(page)).phase === 'setup') await api(page, (a) => a.startWave());
    await api(page, (a) => a.step(100));
  }
  expect((await state(page)).phase).toBe('lost');
  expect(await endScreen(page)).toBe('lost');
  expect((await ui(page)).panelOpen).toBe(false);
  expect((await ui(page)).selectedSpot).toBeNull();
});
