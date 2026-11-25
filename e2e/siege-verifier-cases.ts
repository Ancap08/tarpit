// Verifier (Claude Sonnet) for milestone 52b: the real Act Three levels
// (?keep=21 to ?keep=25) at the sizes of each project. Plain controls only:
// judge that they can be seen, hit and understood, not that they are pretty.
import { expect, test, type Page } from '@playwright/test';
import { KEEP_LEVELS } from '../src/sim/keepLevels';
import { useTallFontMetrics, useWideFontMetrics } from './campaignFont';
import { waitForGame } from './painted';
import { cellPage, rects, rectPage, rectPageSize, toPage } from './phone';

const captureDir = process.env.PW_SIEGE_VERIFIER_DIR;
async function capture(page: Page, name: string) {
  if (captureDir) {
    const { width, height } = page.viewportSize()!;
    await page.screenshot({ path: `${captureDir}/${width}x${height}-${name}.png`, scale: 'css' });
  }
}
const modes = ['normal', 'wide', 'fixed fallback'] as const;

async function open(page: Page, id: number, mode: (typeof modes)[number]) {
  if (mode === 'wide') await useWideFontMetrics(page, process.platform === 'darwin' ? 1.09 : 1.06);
  if (mode === 'fixed fallback') await useTallFontMetrics(page, true);
  await page.goto(`/?test=1&keep=${id}`);
  await waitForGame(page);
  await page.waitForFunction(() => window.__tarpit!.state?.()?.level !== undefined);
}

async function press(page: Page, key: string, touch: boolean) {
  const { x, y } = await rectPage(page, key);
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Every game-scene Text the player can see, as page-space boxes with their strings. */
async function visibleTexts(page: Page) {
  return page.evaluate(() => {
    const api = window.__tarpit!;
    const scene = api.game.scene.getScene('game');
    const scale = api.game.canvas.getBoundingClientRect().width / api.game.scale.width;
    return scene.children.list.flatMap(child => {
      const text = child as Phaser.GameObjects.Text;
      if (child.type !== 'Text' || !text.visible || !text.text.trim()) return [];
      const b = text.getBounds();
      return [{ text: text.text, left: b.left, right: b.right, top: b.top, bottom: b.bottom, size: parseFloat(String(text.style.fontSize)) * scale * Math.min(text.scaleX, text.scaleY) }];
    });
  });
}

export function siegeVerifierCases(touch: boolean, heights: readonly (number | undefined)[]) {
  for (const height of heights) for (const mode of modes) for (const level of KEEP_LEVELS) {
    test(`level ${level.id}: siege controls are seen, hit and understood at ${height ?? 'project size'} (${mode})`, async ({ page }) => {
      test.setTimeout(150_000);
      if (height) await page.setViewportSize({ width: 390, height });
      await open(page, level.id, mode);
      const all = await rects(page);
      const canvas = await page.evaluate(() => ({ width: window.__tarpit!.game.scale.width, height: window.__tarpit!.game.scale.height }));
      const siege = Object.entries(all).filter(([key]) => key.startsWith('window:') || key.startsWith('wallSite'));
      expect(siege.map(([key]) => key).sort(), 'one control per window and per tax site').toEqual([
        ...(level.windows ?? []).map((_, i) => `window:${i}`),
        ...(level.wallSiteTax ? (level.wallSiteTax.kind === 'royalSurvey' ? level.wallSiteTax.sites : [0]).map((_, i) => i ? `wallSite:${i}` : 'wallSite') : []),
      ].sort());
      // Containment, size and overlap with every other control.
      for (const [key, r] of siege) {
        expect(r.x, key).toBeGreaterThanOrEqual(0);
        expect(r.y, key).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width, key).toBeLessThanOrEqual(canvas.width);
        expect(r.y + r.height, key).toBeLessThanOrEqual(canvas.height);
        const size = await rectPageSize(page, key);
        if (touch) expect(Math.min(size.width, size.height), `${key} touch size`).toBeGreaterThanOrEqual(44);
        for (const [other, o] of Object.entries(all)) {
          if (other === key) continue;
          expect(r.x < o.x + o.width && r.x + r.width > o.x && r.y < o.y + o.height && r.y + r.height > o.y, `${key} overlaps ${other}`).toBe(false);
        }
      }
      // A marker must not sit on top of a tower site the player may still use.
      const freeSites = await page.evaluate(() => {
        const s = window.__tarpit!.state!();
        return (s.map.buildSites ?? []).filter(c => !s.wallSiteTax || (s.wallSiteTax.kind === 'quartering'
          ? !(s.wallSiteTax.site.col === c.col && s.wallSiteTax.site.row === c.row)
          : !s.wallSiteTax.sites.some(x => x.col === c.col && x.row === c.row)));
      });
      for (const cell of freeSites) {
        const p = await cellPage(page, cell);
        for (const [key, r] of siege) {
          const a = await toPage(page, { x: r.x, y: r.y });
          const b = await toPage(page, { x: r.x + r.width, y: r.y + r.height });
          expect(p.x >= a.x && p.x <= b.x && p.y >= a.y && p.y <= b.y, `${key} covers open tower site ${cell.col},${cell.row}`).toBe(false);
        }
      }
      // The next-wave line names each road that has a group, in words.
      const next = await page.evaluate(() => window.__tarpit!.hudText!().next);
      const roads = new Set(level.waves[0].groups.map(group => group.road));
      for (const road of roads) expect(next, 'preview names the road').toContain(road === 'east' ? 'East' : 'West');
      if (roads.size === 1) expect(next).not.toContain(roads.has('east') ? 'West' : 'East');
      const texts = await visibleTexts(page);
      for (const t of texts.filter(text => text.size > 0 && !/^Gate \d/.test(text.text))) {
        expect(t.left, t.text).toBeGreaterThanOrEqual(-1);
        expect(t.right, t.text).toBeLessThanOrEqual(canvas.width + 1);
      }
      await capture(page, `level-${level.id}-${mode.replace(' ', '-')}-setup`);
    });
  }

  // Known miss, written to fail until fixed: with the fixed fallback font metrics the five-digit
  // gate label of levels 23 to 25 starts 13 to 14 canvas px left of the canvas (3 px with wide
  // metrics on the 960 px canvas). When the label is fitted this test goes red: delete test.fail.
  for (const level of KEEP_LEVELS.filter(({ gate }) => gate.maxHp >= 10_000)) {
    test(`level ${level.id}: five-digit gate label stays on the canvas (fixed fallback)`, async ({ page }) => {
      test.fail(true, 'Gate NNNNN / NNNNN overflows the canvas edge in fixed fallback metrics');
      test.setTimeout(150_000);
      await open(page, level.id, 'fixed fallback');
      const width = await page.evaluate(() => window.__tarpit!.game.scale.width);
      const gate = (await visibleTexts(page)).find(text => /^Gate \d/.test(text.text));
      expect(gate, 'a gate label is shown').toBeDefined();
      expect(gate!.left).toBeGreaterThanOrEqual(-1);
      expect(gate!.right).toBeLessThanOrEqual(width + 1);
    });
  }

  for (const level of KEEP_LEVELS) {
    test(`level ${level.id}: windows, pay-off, Survey and Repair work by ${touch ? 'touch' : 'mouse'}`, async ({ page }) => {
      test.setTimeout(150_000);
      await open(page, level.id, 'normal');
      // Repair in setup: tap the control and the gate gains exactly one step for the posted price.
      await page.evaluate(() => {
        const state = window.__tarpit!.state!();
        state.gate!.hp = Math.floor(state.gate!.maxHp / 2);
        state.gold = 1000;
      });
      const repairKey = Object.keys(await rects(page)).find(key => /repair/i.test(key));
      expect(repairKey, 'a Repair control exists in setup').toBeDefined();
      const before = await page.evaluate(() => { const s = window.__tarpit!.state!(); return [s.gate!.hp, s.gold]; });
      await press(page, repairKey!, touch);
      const after = await page.evaluate(() => { const s = window.__tarpit!.state!(); return { hp: s.gate!.hp, gold: s.gold, bought: s.boughtRepair ?? false }; });
      expect(after.hp - before[0]).toBe(level.gate.repairHp);
      expect(before[1] - after.gold).toBe(level.gate.repairCost);
      expect(after.bought).toBe(true);

      const tax = level.wallSiteTax;
      if (tax?.kind === 'quartering') {
        const site = tax.site;
        expect(await page.evaluate(({ col, row }) => window.__tarpit!.buildAt!(col, row, 'musketeer').ok, site)).toBe(false);
        await page.evaluate(() => { window.__tarpit!.state!().gold = 500; });
        await press(page, 'wallSite', touch);
        expect(await page.evaluate(() => window.__tarpit!.state!().gold)).toBe(500 - tax.price);
        expect(await page.evaluate(() => window.__tarpit!.uiRects().wallSite)).toBeUndefined();
        expect(await page.evaluate(({ col, row }) => window.__tarpit!.buildAt!(col, row, 'musketeer').ok, site)).toBe(true);
      }
      if (tax?.kind === 'royalSurvey') {
        const gold = await page.evaluate(() => window.__tarpit!.state!().gold);
        for (const [index, site] of tax.sites.entries()) {
          await press(page, index ? `wallSite:${index}` : 'wallSite', touch);
          expect(await page.evaluate(({ col, row }) => [window.__tarpit!.buildAt!(col, row, 'musketeer').ok, window.__tarpit!.state!().gold], site)).toEqual([false, gold]);
        }
      }

      // A window does nothing in setup, then shakes once in a wave and goes dark.
      if (level.windows?.length) {
        await press(page, 'window:0', touch);
        expect(await page.evaluate(() => window.__tarpit!.state!().windows![0].used)).toBe(false);
        const window0 = level.windows[0];
        await page.evaluate(({ road, from }) => {
          const api = window.__tarpit!;
          api.startWave!();
          const state = api.state!();
          state.spawnedPerGroup = state.level!.waves[0].groups.map(group => group.count);
          state.enemies = [0, 1, 2].map(id => ({ id, road, distance: from + 2 + id, hp: 23, type: 'goblin' as const, slow: 0, slowTicksLeft: 0 }));
          state.nextEnemyId = 100;
          api.step!(1);
        }, { road: window0.road ?? 'east', from: window0.from });
        await press(page, 'window:0', touch);
        const used = await page.evaluate(() => {
          const s = window.__tarpit!.state!();
          return [s.windows![0].used, s.enemies.filter(e => e.feathered).length];
        });
        expect(used).toEqual([true, 3]);
        const second = await page.evaluate(() => window.__tarpit!.state!().windows?.[1]?.used);
        if (second !== undefined) expect(second).toBe(false);
        await press(page, 'window:0', touch);
        expect(await page.evaluate(() => window.__tarpit!.state!().enemies.filter(e => e.feathered).length)).toBe(3);
        expect((await visibleTexts(page)).some(t => t.text === 'Spent')).toBe(true);
        await capture(page, `level-${level.id}-window-spent`);
      }
    });
  }

  test('the Act Three switch leaves ordinary play alone', async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => localStorage.setItem('tarpit.campaign', '{"v":2,"stars":{"1":3,"2":2}}'));
    await page.goto('/?test=1&keep=26');
    await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('title') === true);
    expect(await page.evaluate(() => window.__tarpit!.keep?.())).toBeUndefined();
    expect(await page.evaluate(() => localStorage.getItem('tarpit.campaign'))).toBe('{"v":2,"stars":{"1":3,"2":2}}');
  });
}
