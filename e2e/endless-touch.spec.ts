import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Milestone 26, tablet project (iPad landscape, see playwright.config.ts):
// win with the combo script, then tap Keep going and Start Wave with real
// taps at the page points canvasToPage() gives.

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const toPage = (page: Page, x: number, y: number) => page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [x, y]);

async function tap(page: Page, name: string): Promise<void> {
  const r = (await api(page, (a) => a.uiRects()))[name];
  expect(r, name).toBeTruthy();
  const p = await toPage(page, r.x + r.width / 2, r.y + r.height / 2);
  await page.touchscreen.tap(p.x, p.y);
}

test('win, tap Keep going: three buttons at least 44 px on screen; wave 11 starts, "Wave 11", no boss bar', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  expect(await api(page, (a) => a.runScript('comboBuild'))).toBe('won');
  const r = await api(page, (a) => a.uiRects());
  for (const name of ['keepGoing', 'playAgain', 'menu']) {
    const top = await toPage(page, r[name].x, r[name].y);
    const bottom = await toPage(page, r[name].x, r[name].y + r[name].height);
    expect(bottom.y - top.y, name).toBeGreaterThanOrEqual(44);
  }
  await tap(page, 'keepGoing');
  expect(await api(page, (a) => a.endScreen())).toBeNull();
  expect(await api(page, (a) => a.state())).toMatchObject({ phase: 'setup', endless: true, wave: 10 });
  await tap(page, 'startWave');
  expect(await api(page, (a) => a.state())).toMatchObject({ phase: 'wave', wave: 11 });
  await api(page, (a) => a.step(300));
  const hud = await api(page, (a) => a.hudText());
  expect(hud.wave).toBe('Wave 11');
  expect(hud.boss).toBeNull();
});
