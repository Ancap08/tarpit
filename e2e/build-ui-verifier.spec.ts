import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Independent verifier probes for milestone 4. Real clicks at uiRects().

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

async function click(page: Page, name: string): Promise<void> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

async function buildAt(page: Page, spot: number, type: 'musketeer' | 'cannon' | 'tarpit'): Promise<void> {
  await click(page, `spot:${spot}`);
  await click(page, `menu:${type}`);
}

test('(a) a greyed Upgrade (already upgraded) changes nothing', async ({ page }) => {
  await startGame(page);
  await buildAt(page, 2, 'musketeer');
  await click(page, 'spot:2');
  await click(page, 'panel:upgrade');
  const before = await state(page);
  expect(before.towers[0].upgraded).toBe(true);
  await api(page, (a) => (a.state().gold = 500));
  await click(page, 'panel:upgrade');
  const after = await state(page);
  expect(after.gold).toBe(500);
  expect(after.towers).toEqual(before.towers);
  expect(await ui(page)).toMatchObject({ panelOpen: true, selectedSpot: 2 });
});

test('(b) selling during an active wave removes the tower and the wave continues', async ({ page }) => {
  await startGame(page);
  await buildAt(page, 2, 'musketeer');
  await click(page, 'startWave');
  await api(page, (a) => a.step(120));
  await click(page, 'spot:2');
  await click(page, 'panel:sell');
  const s = await state(page);
  expect(s.towers).toEqual([]);
  expect(s.phase).toBe('wave');
  const t0 = s.tick;
  await api(page, (a) => a.step(60));
  const s2 = await state(page);
  expect(s2.phase).toBe('wave');
  expect(s2.tick).toBeGreaterThan(t0);
});

test('(c) after selling, clicking the same spot opens the build menu, not the panel', async ({ page }) => {
  await startGame(page);
  await buildAt(page, 5, 'musketeer');
  await click(page, 'spot:5');
  await click(page, 'panel:sell');
  await click(page, 'spot:5');
  expect(await ui(page)).toEqual({ activeSpot: 5, selectedSpot: null, menuOpen: true, panelOpen: false });
});

test('(d) Start Wave still works while a build menu is open, and the menu closes', async ({ page }) => {
  await startGame(page);
  await click(page, 'spot:3');
  expect((await ui(page)).menuOpen).toBe(true);
  await click(page, 'startWave');
  expect((await state(page)).phase).toBe('wave');
  expect((await ui(page)).menuOpen).toBe(false);
});

test('(e) building with exactly the cost in gold succeeds and leaves 0', async ({ page }) => {
  await startGame(page);
  await click(page, 'spot:1');
  await api(page, (a) => (a.state().gold = 50));
  await click(page, 'menu:musketeer');
  const s = await state(page);
  expect(s.towers.map((t) => t.spotId)).toEqual([1]);
  expect(s.gold).toBe(0);
});

test('(f) the menu and panel never overlap the HUD or leave the canvas, for every spot', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => (a.state().gold = 9999));
  for (let id = 0; id < 10; id++) {
    await click(page, `spot:${id}`);
    const r = await rects(page);
    const names = Object.keys(r).filter((n) => n.startsWith('menu:'));
    expect(names.length, `menu at spot ${id}`).toBe(3);
    for (const n of names) {
      expect(r[n].y + r[n].height, `${n} bottom at spot ${id}`).toBeLessThanOrEqual(480);
      expect(r[n].x).toBeGreaterThanOrEqual(0);
      expect(r[n].y).toBeGreaterThanOrEqual(0);
      expect(r[n].x + r[n].width).toBeLessThanOrEqual(960);
    }
    await page.keyboard.press('Escape');
  }
  // Same for the tower panel.
  for (let id = 0; id < 10; id++) {
    await click(page, `spot:${id}`);
    await click(page, 'menu:musketeer');
    await click(page, `spot:${id}`);
    const r = await rects(page);
    for (const n of ['panel:upgrade', 'panel:sell']) {
      expect(r[n], `${n} at spot ${id}`).toBeTruthy();
      expect(r[n].y + r[n].height).toBeLessThanOrEqual(480);
      expect(r[n].x).toBeGreaterThanOrEqual(0);
      expect(r[n].x + r[n].width).toBeLessThanOrEqual(960);
    }
    await page.keyboard.press('Escape');
  }
});
