// Milestone 43 verifier: Painted on Switchback and Riverbend, checked from the
// delivered game rather than from the art files alone. Chromium project only.
import { expect, test } from '@playwright/test';
import { MAP_IDS } from '../src/sim/map';
import { api } from './phone';
import { waitForGame, click, painted, paintedAsset, settle } from './painted';
import { waitForFirstScreen, waitForTitle } from './title';

for (const map of MAP_IDS) {
  test(`${map}: what looks buildable in Painted is buildable, and water and trail are not`, async ({ page }) => {
    await page.goto('/?test=1&look=painted');
    await waitForTitle(page);
    await page.evaluate((m) => window.__tarpit!.startGame!('normal', m), map);
    await expect.poll(() => painted(page)).toMatchObject({ active: true, density: 1 });
    const cells = await page.evaluate(() => {
      const a = window.__tarpit!;
      a.state!().gold = 1e6;
      const texture = a.game.textures.get(a.painted!().sprites[0].key).getSourceImage() as HTMLImageElement;
      const canvas = document.createElement('canvas');
      canvas.width = texture.width;
      canvas.height = texture.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(texture, 0, 0);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const s = canvas.width / 960;
      const out: { col: number; row: number; reason: string | null; water: number; trail: number }[] = [];
      for (let row = 0; row < 15; row++) for (let col = 0; col < 30; col++) {
        let water = 0, trail = 0, n = 0;
        for (let y = row * 32 * s; y < (row + 1) * 32 * s; y++) for (let x = col * 32 * s; x < (col + 1) * 32 * s; x++) {
          const k = 4 * (y * canvas.width + x);
          n++;
          if (px[k + 2] > px[k] + 40 && px[k + 2] > px[k + 1] - 20) water++;
          else if (px[k] > px[k + 1] + 12 && px[k] > 150) trail++;
        }
        const built = a.buildAt!(col, row, 'musketeer');
        if (built.ok) a.sellAt!(col, row);
        out.push({ col, row, reason: built.ok ? null : built.reason, water: water / n, trail: trail / n });
      }
      return out;
    });
    expect(cells).toHaveLength(450);
    const buildable = cells.filter((c) => c.reason === null);
    expect(buildable.length).toBeGreaterThan(250);
    // No buildable cell is painted as water or trail.
    expect(buildable.filter((c) => c.water > 0.08 || c.trail > 0.08).map((c) => `${c.col},${c.row}`)).toEqual([]);
    // Every water cell is mostly water (reeds and bank take the rest).
    const water = cells.filter((c) => c.reason === 'water');
    expect(water.length).toBe(map === 'riverbend' ? 40 : 0);
    expect(water.filter((c) => c.water < 0.35).map((c) => `${c.col},${c.row}`)).toEqual([]);
  });
}

for (const [level, map] of [[3, 'switchback'], [5, 'riverbend']] as const) {
  test(`campaign level ${level} on ${map} is played to a win in Painted`, async ({ page }) => {
    await page.goto('/?test=1&look=painted');
    await waitForFirstScreen(page);
    await api(page, (a) => a.setCampaignProgress({ 1: 3, 2: 3, 3: 3, 4: 3 }));
    await click(page, 'title:campaign');
    await page.waitForFunction((id) => !!window.__tarpit?.uiRects()[`title:stop:${id}`], level);
    await click(page, `title:stop:${level}`);
    await page.waitForFunction(() => !!window.__tarpit?.uiRects()['title:play']);
    await click(page, 'title:play');
    await waitForGame(page);
    expect(await painted(page)).toMatchObject({ active: true });
    const result = await page.evaluate(() => {
      const a = window.__tarpit!;
      return { map: a.state!().map.id, phase: a.runBot!('botGood'), stars: a.levelStars!(), painted: a.painted!().active };
    });
    expect(result).toMatchObject({ map, phase: 'won', painted: true });
    expect(result.stars).toBeGreaterThan(0);
  });
}

for (const map of ['switchback', 'riverbend'] as const) {
  test(`${map}: switching layout mid-wave keeps one game scene and the painted ground`, async ({ page }) => {
    await page.goto('/?test=1&look=painted');
    await waitForTitle(page);
    await page.evaluate((m) => window.__tarpit!.startGame!('normal', m), map);
    await expect.poll(() => painted(page)).toMatchObject({ active: true });
    await api(page, (a) => { a.state().gold = 1000; a.buildAt(7, 5, 'musketeer'); a.startWave(); a.step(600); });
    const read = () => page.evaluate(() => {
      const a = window.__tarpit!;
      const p = a.painted!();
      return {
        layout: a.layout(), active: a.game.scene.getScenes(true).map((s) => s.scene.key), density: p.density,
        ground: p.sprites[0].key, enemies: a.state!().enemies.length, towers: a.state!().towers.length,
      };
    });
    const before = await read();
    expect(before.layout).toBe('landscape');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await read()).layout).toBe('portrait');
    await settle(page);
    const portrait = await read();
    await page.setViewportSize({ width: 960, height: 580 });
    await expect.poll(async () => (await read()).layout).toBe('landscape');
    const after = await read();
    for (const r of [before, portrait, after]) {
      expect(r.active).toEqual(['game']);
      expect(r.ground).toBe(`painted:${map}:1x`);
      expect(r.towers).toBe(1);
      expect(r.enemies).toBe(before.enemies);
    }
  });
}

test('test mode stays frozen and silent under Painted on a new map', async ({ page }) => {
  await page.goto('/?test=1&look=painted');
  await waitForTitle(page);
  await page.evaluate(() => window.__tarpit!.startGame!('normal', 'riverbend'));
  await expect.poll(() => painted(page)).toMatchObject({ active: true });
  const snap = () => page.evaluate(() => {
    const a = window.__tarpit!;
    const au = a.audio();
    return { tick: a.state!().tick, fx: a.fx(), audio: [au.enabled, au.context, au.voices, JSON.stringify(au.played)], smoke: a.decor()?.t };
  });
  const a = await snap();
  await page.waitForTimeout(700);
  expect(await snap()).toEqual(a);
  expect(a.fx).toBeNull();
  expect(a.audio.slice(0, 3)).toEqual([false, 'none', 0]);
});

test('a fresh test-mode visit is Classic, and a Painted visit makes 3 art requests (4 with the speed probe) at each density', async ({ browser }) => {
  for (const map of MAP_IDS) {
    for (const [dpr, hints, expected] of [[1, 'fast', 3], [2, 'fast', 3], [2, 'none', 4]] as const) {
      const context = await browser.newContext({ viewport: { width: 960, height: 580 }, deviceScaleFactor: dpr });
      await context.addInitScript((h) => Object.defineProperty(navigator, 'connection',
        { value: h === 'fast' ? { effectiveType: '4g', downlink: 10 } : undefined }), hints);
      const page = await context.newPage();
      const urls: string[] = [];
      await page.route(paintedAsset, (route) => { urls.push(new URL(route.request().url()).pathname); return route.continue(); });
      await page.goto('/?test=1');
      await waitForTitle(page);
      await page.evaluate((m) => window.__tarpit!.startGame!('normal', m), map);
      await waitForGame(page);
      expect(await painted(page), `${map} default look`).toMatchObject({ active: false });
      expect(urls, 'Classic default makes no painted requests').toEqual([]);
      await page.goto(`/?test=1&look=painted`);
      await waitForTitle(page);
      await page.evaluate((m) => window.__tarpit!.startGame!('normal', m), map);
      await expect.poll(() => painted(page)).toMatchObject({ active: true });
      expect(urls, `${map} ${dpr}x ${hints}`).toHaveLength(expected);
      await context.close();
    }
  }
});
