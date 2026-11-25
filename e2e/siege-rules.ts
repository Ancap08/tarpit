import { expect, test, type Page } from '@playwright/test';
import { useTallFontMetrics, useWideFontMetrics } from './campaignFont';
import { checkLabel } from './hudButtonLabels';
import { rectPage, rectPageSize } from './phone';
import { distanceOnRoad } from '../src/sim/roads';
import { createKeep } from '../src/sim/oldKeep';
import type { Enemy } from '../src/sim/types';

const captureDir = process.env.PW_SIEGE_REVIEW_DIR;
const keep = createKeep();
const gate = keep.gate!;
const westGate = distanceOnRoad(keep.map, 'west', gate)!;
const taxSite = keep.wallSiteTax!.site;

function enemy(id: number, road: string, distance: number, hp = 23): Enemy {
  return { id, road, distance, hp, type: 'goblin', slow: 0, slowTicksLeft: 0 };
}

async function keepBoard(page: Page, survey = false) {
  await page.goto('/?keep=1&test=1' + (survey ? '&survey=1' : ''));
  await page.waitForFunction(() => !!window.__tarpit?.keep?.() && !!window.__tarpit.uiRects()['window:0'], undefined, { timeout: 40_000 });
}

async function click(page: Page, key: string, touch: boolean) {
  const { x, y } = await rectPage(page, key);
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function capture(page: Page, name: string) {
  if (!captureDir) return;
  const { width, height } = page.viewportSize()!;
  if ((width === 390 && height === 844) || (width === 960 && height === 580)) {
    await page.screenshot({ path: `${captureDir}/${width}x${height}-${name}.png`, scale: 'css' });
  }
}

async function seedWave(page: Page, enemies: Enemy[], elapsed = 0) {
  await page.evaluate(({ enemies, elapsed }) => {
    const api = window.__tarpit!;
    const state = api.state!();
    state.phase = 'setup';
    state.wave = 1;
    api.startWave!();
    state.spawnedPerGroup = state.fixedWaves![1].groups.map(group => group.count);
    state.enemies = enemies;
    state.nextEnemyId = 100;
    api.step!(elapsed);
  }, { enemies, elapsed });
}

async function checkField(page: Page, expectedPreview: string) {
  const snapshot = await page.evaluate(() => {
    const api = window.__tarpit!;
    const rects = Object.entries(api.uiRects()).map(([id, r]) =>
      ({ id, left: r.x, right: r.x + r.width, top: r.y, bottom: r.y + r.height }));
    const scene = api.game.scene.getScene('game');
    const preview = scene.children.getByName('wave-preview') as Phaser.GameObjects.Text;
    const b = preview.getBounds();
    const scale = api.game.canvas.getBoundingClientRect().width / api.game.scale.width;
    return {
      rects, width: api.game.scale.width, height: api.game.scale.height,
      preview: { id: 'preview', left: b.left, right: b.right, top: b.top, bottom: b.bottom, text: preview.text,
        font: parseFloat(String(preview.style.fontSize)) * scale * Math.min(preview.scaleX, preview.scaleY) },
    };
  });
  expect(snapshot.preview.text).toBe(expectedPreview);
  // The two-line portrait preview uses the usual compact HUD font.
  expect(snapshot.preview.font).toBeGreaterThanOrEqual(page.viewportSize()!.height === 664 ? 10 : 12);
  const checked = [snapshot.preview, ...snapshot.rects.filter(r => r.id.startsWith('window:') || r.id === 'wallSite')];
  for (const rect of checked) {
    expect(rect.left, rect.id).toBeGreaterThanOrEqual(0);
    expect(rect.top, rect.id).toBeGreaterThanOrEqual(0);
    expect(rect.right, rect.id).toBeLessThanOrEqual(snapshot.width);
    expect(rect.bottom, rect.id).toBeLessThanOrEqual(snapshot.height);
    for (const other of snapshot.rects.filter(r => r.id !== rect.id)) {
      expect(rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top,
        `${rect.id} overlaps ${other.id}`).toBe(false);
    }
  }
}

export function siegeRuleCases(heights: readonly (number | undefined)[], touch: boolean) {
  for (const height of heights) for (const metrics of ['normal', 'wide', 'fixed fallback']) {
    test(`siege controls fit and work at ${height ?? 'project size'} (${metrics})`, async ({ page }) => {
      test.setTimeout(120_000);
      if (height) await page.setViewportSize({ width: 390, height });
      if (metrics === 'wide') await useWideFontMetrics(page, process.platform === 'darwin' ? 1.09 : 1.06);
      if (metrics === 'fixed fallback') await useTallFontMetrics(page, true);
      await keepBoard(page);
      await checkLabel(page, 'window:0', 'Window');
      await checkLabel(page, 'wallSite', 'Quartered\nPay 35');
      await checkField(page, 'Next: East 6 Collector · West 6 Collector');
      for (const key of ['window:0', 'window:1', 'wallSite']) {
        const { width, height } = await rectPageSize(page, key);
        expect(Math.min(width, height), key).toBeGreaterThanOrEqual(44);
      }
      await click(page, 'window:0', touch);
      expect(await page.evaluate(() => window.__tarpit!.state!().windows![0].used)).toBe(false);
      expect(await page.evaluate(({ col, row }) => window.__tarpit!.buildAt!(col, row, 'musketeer').ok, taxSite)).toBe(false);
      if (metrics === 'normal') await capture(page, 'quartering');
      await click(page, 'wallSite', touch);
      expect(await page.evaluate(() => [window.__tarpit!.state!().gold, window.__tarpit!.uiRects().wallSite])).toEqual([205, undefined]);
      expect(await page.evaluate(({ col, row }) => window.__tarpit!.buildAt!(col, row, 'musketeer').ok, taxSite)).toBe(true);

      const west = [230, 248, 266, 284, 302].map((d, id) => ({ ...enemy(id, 'west', d), slow: 0.5, slowTicksLeft: 120 }));
      await seedWave(page, [...west, enemy(5, 'east', 364)]);
      await checkField(page, 'Next: West 16 Collector, 1 Ram · East 4 Toll Troll, 6 Harpy');
      if (metrics === 'normal') await capture(page, 'window-lit');
      await click(page, 'window:0', touch);
      await checkLabel(page, 'window:0', 'Spent');
      await checkLabel(page, 'window:1', 'Window');
      await page.evaluate(() => window.__tarpit!.step!(12));
      expect(await page.evaluate(() => window.__tarpit!.state!().enemies.filter(e => e.runTicksLeft)
        .map(e => [e.id, e.runTicksLeft]))).toEqual(west.map(e => [e.id, 51]));
      if (metrics === 'normal') await capture(page, 'window-spent');

      await keepBoard(page, true);
      await checkLabel(page, 'wallSite', 'Surveyed');
      await checkField(page, 'Next: East 6 Collector · West 6 Collector');
      await click(page, 'wallSite', touch);
      expect(await page.evaluate(({ col, row }) => [
        window.__tarpit!.state!().gold, window.__tarpit!.buildAt!(col, row, 'musketeer').ok,
      ], taxSite)).toEqual([240, false]);
      if (metrics === 'normal') await capture(page, 'royal-survey');
    });
  }

  test('both roads attack the same gate and the Ram has a visible placeholder', async ({ page }) => {
    test.setTimeout(120_000);
    await keepBoard(page);
    const attackers = [enemy(0, 'east', gate.distance), enemy(1, 'west', westGate),
      enemy(2, 'east', gate.distance - 1), enemy(3, 'west', westGate - 1)];
    const approaching = [enemy(4, 'east', 160), enemy(5, 'east', 190), enemy(6, 'west', 200), enemy(7, 'west', 225)];
    await seedWave(page, [...attackers, ...approaching], 8);
    expect(await page.evaluate(() => window.__tarpit!.state!().gate!.hp)).toBeCloseTo(476.8, 8);
    await capture(page, 'two-roads');
    const ram: Enemy = { ...enemy(8, 'west', westGate, 360), type: 'ram' };
    await seedWave(page, [ram], 3);
    expect(await page.evaluate(() => window.__tarpit!.state!().gate!.hp)).toBeCloseTo(467.8, 8);
    expect(await page.evaluate(() => window.__tarpit!.animState!(8)?.texture)).toBe('ram');
    expect(await page.evaluate(() => window.__tarpit!.game.textures.exists('siege-ram'))).toBe(true);
    await capture(page, 'ram-at-gate');
  });
}
