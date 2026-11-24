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
  await click(page, 'bar:musketeer');
  await page.mouse.click(240, 176); // cell (7,5)
  await click(page, 'startWave');
  await api(page, (a) => a.step(3100));
  // Milestone 28: Goblins every 2.5 s; the Musketeer kills all 20 (the wave clears after 3062 ticks): 50 + 20 x 2 + 25.
  expect(await state(page)).toMatchObject({ phase: 'setup', wave: 1, lives: 20, gold: 115 });
});

test('(b) after Play again no playAgain rect and no end screen', async ({ page }) => {
  await startGame(page);
  await loseGame(page);
  expect((await rects(page)).playAgain).toBeTruthy();
  await playAgain(page);
  expect((await rects(page)).playAgain).toBeUndefined();
  expect(await endScreen(page)).toBeNull();
});

test('(c) lose screen: Start Wave, speed and the bar do nothing; no cell builds or selects, including under the panel', async ({ page }) => {
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
  // Even with gold the bar stays greyed on an end screen.
  await api(page, (a) => (a.state().gold = 500));
  await click(page, 'bar:musketeer');
  expect((await ui(page)).pick).toBeNull();
  const r = await rects(page);
  // Exercise the former legacy cells, skipping any that now host a result action.
  const cells = [[2, 5], [2, 9], [7, 5], [7, 7], [10, 5], [15, 4], [15, 9], [18, 9], [23, 3], [23, 8]];
  const underButton = ([col, row]: number[]) => {
    const cx = col * 32 + 16, cy = row * 32 + 16;
    return [r.playAgain, r.menu].some((b) => cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height);
  };
  const clicked: string[] = [];
  for (const c of cells) {
    if (underButton(c)) continue;
    await page.mouse.click(c[0] * 32 + 16, c[1] * 32 + 16);
    clicked.push(c.join(','));
    expect(await ui(page), `cell ${c}`).toMatchObject({ pick: null, selectedCell: null, panelOpen: false });
  }
  expect(clicked).toContain('10,5'); // within the result paper
  expect(clicked).toContain('2,5'); // on the veiled map
  expect(clicked.length).toBeGreaterThanOrEqual(8);
  expect(await endScreen(page)).toBe('lost');
  expect((await state(page)).phase).toBe('lost');
  expect((await state(page)).towers).toEqual([]);
});

test('(d) win screen HUD text', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => a.runScript('comboBuild'));
  expect(await endScreen(page)).toBe('won');
  const won = await state(page);
  expect(await api(page, (a) => a.hudText())).toMatchObject({
    gold: `Gold ${won.gold}`,
    lives: `Lives ${won.lives}`,
    wave: 'Wave 20/20',
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
  await click(page, 'bar:musketeer');
  await page.mouse.click(240, 176); // cell (7,5): builds
  await page.mouse.click(240, 176); // the tower: selects it, clears the pick
  expect((await ui(page)).panelOpen).toBe(true);
  for (let ticks = 0; ticks < 120_000; ticks += 100) {
    if ((await state(page)).phase === 'lost') break;
    if ((await state(page)).phase === 'setup') await api(page, (a) => a.startWave());
    await api(page, (a) => a.step(100));
  }
  expect((await state(page)).phase).toBe('lost');
  expect(await endScreen(page)).toBe('lost');
  expect((await ui(page)).panelOpen).toBe(false);
  expect((await ui(page)).selectedCell).toBeNull();
});

test('(g) a pick active when the game is lost is cleared', async ({ page }) => {
  await startGame(page);
  await click(page, 'bar:musketeer');
  expect((await ui(page)).pick).toBe('musketeer');
  await loseGame(page);
  expect(await endScreen(page)).toBe('lost');
  expect(await ui(page)).toMatchObject({ pick: null, hoverCell: null });
});
