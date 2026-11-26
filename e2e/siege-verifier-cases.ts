// Verifier (Claude Sonnet) for milestone 52b: the real Act Three levels
// (?keep=21 to ?keep=25) at the sizes of each project. Plain controls only:
// judge that they can be seen, hit and understood, not that they are pretty.
import { expect, test, type Page } from '@playwright/test';
import { KEEP_LEVELS } from '../src/sim/keepLevels';
import { platformWideFactor, useTallFontMetrics, useWideFontMetrics } from './campaignFont';
import { checkLabel } from './hudButtonLabels';
import { waitForGame } from './painted';
import { cellPage, rects, rectPage, rectPageSize, toPage } from './phone';
import { INTER } from '../src/game/palette';
import type { GameScene } from '../src/game/GameScene';
import type { Point, Rect } from '../src/sim';

const captureDir = process.env.PW_SIEGE_VERIFIER_DIR;
async function capture(page: Page, name: string) {
  if (captureDir) {
    const { width, height } = page.viewportSize()!;
    await page.screenshot({ path: `${captureDir}/${width}x${height}-${name}.png`, scale: 'css' });
  }
}
const modes = ['normal', 'wide', 'fixed Caslon', 'fixed fallback'] as const;

async function open(page: Page, id: number, mode: (typeof modes)[number] | 'stretched', clean: boolean) {
  if (mode === 'wide') await useWideFontMetrics(page, platformWideFactor, clean ? INTER : undefined);
  if (mode === 'stretched') await useWideFontMetrics(page, 1.15, INTER);
  if (mode.startsWith('fixed')) await useTallFontMetrics(page, mode === 'fixed fallback');
  await page.goto(`/?test=1&keep=${id}${clean ? '&ui=new' : ''}`);
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

async function checkCleanSetup(page: Page, wave: number, checkCopy: boolean) {
  return page.evaluate(({ wave, checkCopy }) => {
    const api = window.__tarpit!;
    const scene = api.game.scene.getScene('game') as GameScene;
    const state = api.state!();
    state.wave = wave;
    api.step!(0);
    const rects = Object.entries(api.uiRects());
    const layout = scene.boardLayout;
    const problems: string[] = [];
    const contains = ({ x, y }: Point, r: Rect, pad = 0) =>
      x > r.x - pad && x < r.x + r.width + pad && y > r.y - pad && y < r.y + r.height + pad;
    const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    const display = (p: Point) => scene['siegeView']?.displayed(p) ?? p;
    const gate = display(layout.toScreen(state.gate!));
    const polylines = [state.map.path, ...(state.map.otherRoads ?? []).map(road => road.approach)]
      .map(path => path.map(p => display(layout.toScreen(p))));
    for (const [key, rect] of rects) {
      if (key !== 'gate' && key !== 'repair' && !key.startsWith('road:') &&
          !(key === 'wallSite' && state.wallSiteTax?.kind === 'quartering')) continue;
      if (contains(gate, rect, 12)) problems.push(`${key} covers the gate`);
      for (const [other, r] of rects) if (key !== other && overlaps(rect, r)) problems.push(`${key} overlaps ${other}`);
      for (const path of polylines) for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const parts = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6);
        for (let j = 0; j <= parts; j++) {
          const p = { x: a.x + (b.x - a.x) * j / parts, y: a.y + (b.y - a.y) * j / parts };
          if (contains(p, rect, 10)) {
            problems.push(`${key} covers an approach`);
            break;
          }
        }
      }
    }
    const scale = api.game.canvas.getBoundingClientRect().width / layout.width;
    const labels = scene.children.list.filter((o): o is Phaser.GameObjects.Text => o.type === 'Text' &&
      (/^(road:|gate-)/.test(o.name) || ['wave-preview', 'hud-level-name', 'active-taxes', 'siege-feat'].includes(o.name)));
    for (const label of labels) {
      if (!label.text) continue;
      if (checkCopy && !label.visible && label.name !== 'gate-last-stand') problems.push(`${label.name} hides ${label.text}`);
      if (label.visible && parseFloat(String(label.style.fontSize)) * scale < 11.08) problems.push(`${label.name} below 11 CSS px`);
    }
    return problems;
  }, { wave, checkCopy });
}

export function siegeVerifierCases(touch: boolean, heights: readonly (number | undefined)[], clean = false) {
  const metrics = clean ? [...modes, 'stretched'] as const : modes;
  for (const height of heights) for (const mode of metrics) for (const level of KEEP_LEVELS) {
    test(`level ${level.id}: siege controls are seen, hit and understood at ${height ?? 'project size'} (${mode})`, async ({ page }) => {
      test.setTimeout(150_000);
      if (height) await page.setViewportSize({ width: 390, height });
      await open(page, level.id, mode, clean);
      const checkCopy = !clean || mode === 'normal' || mode === 'wide';
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
      if (checkCopy) {
        expect(texts.some(t => t.text === 'Gate 100%')).toBe(true);
        await checkLabel(page, 'gate', 'Gate 100%');
      }
      const warning = texts.find(t => t.text === 'Costs the third star');
      if (checkCopy) expect(!!warning).toBe(level.feat.kind === 'noRepairs');
      if (warning) {
        const r = all.repair;
        expect(warning.left).toBeGreaterThanOrEqual(r.x);
        expect(warning.right).toBeLessThanOrEqual(r.x + r.width);
        expect(warning.top).toBeGreaterThanOrEqual(r.y);
        expect(warning.bottom).toBeLessThanOrEqual(r.y + r.height);
      }
      for (const t of texts.filter(text => text.size > 0)) {
        expect(t.left, t.text).toBeGreaterThanOrEqual(-1);
        expect(t.right, t.text).toBeLessThanOrEqual(canvas.width + 1);
      }
      if (clean) {
        const roads = level.keepRoads === 'both' ? ['east', 'west'] : [level.keepRoads];
        expect(Object.keys(all).filter(key => key.startsWith('road:')).sort()).toEqual(roads.map(road => `road:${road}`).sort());
        for (let wave = 0; wave < level.waves.length; wave++) {
          const issues = await checkCleanSetup(page, wave, checkCopy);
          expect(issues, `level ${level.id}, wave ${wave + 1}`).toEqual([]);
        }
      }
      await capture(page, `level-${level.id}-${mode.replace(' ', '-')}-setup`);
    });
  }

  for (const level of KEEP_LEVELS) {
    test(`level ${level.id}: windows, pay-off, Survey and Repair work by ${touch ? 'touch' : 'mouse'}`, async ({ page }) => {
      test.setTimeout(150_000);
      await open(page, level.id, 'normal', clean);
      // Repair in setup: tap the control and the gate gains exactly one step for the posted price.
      await page.evaluate(() => {
        const api = window.__tarpit!;
        const state = api.state!();
        state.gate!.hp = Math.floor(state.gate!.maxHp / 2);
        state.gold = 1000;
        api.step!(0);
      });
      const repairKey = Object.keys(await rects(page)).find(key => /repair/i.test(key));
      expect(repairKey, 'a Repair control exists in setup').toBeDefined();
      const warn = 'Costs the third star';
      expect((await visibleTexts(page)).some(t => t.text === warn)).toBe(level.feat.kind === 'noRepairs');
      const before = await page.evaluate(() => { const s = window.__tarpit!.state!(); return [s.gate!.hp, s.gold]; });
      if (clean) await checkLabel(page, 'repair', `Repair ${level.gate.repairCost}`);
      await press(page, repairKey!, touch);
      const after = await page.evaluate(() => { const s = window.__tarpit!.state!(); return { hp: s.gate!.hp, gold: s.gold, bought: s.boughtRepair ?? false }; });
      expect(after.hp - before[0]).toBe(level.gate.repairHp);
      expect(before[1] - after.gold).toBe(level.gate.repairCost);
      expect(after.bought).toBe(true);
      expect((await visibleTexts(page)).some(t => t.text === warn)).toBe(false);
      expect(await page.locator('.repair-action').textContent()).not.toContain(warn);

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

      // An empty tap stays lit, then the same window shakes once an enemy arrives.
      if (level.windows?.length) {
        await press(page, 'window:0', touch);
        expect(await page.evaluate(() => window.__tarpit!.state!().windows![0].used)).toBe(false);
        await page.evaluate(() => window.__tarpit!.startWave!());
        await press(page, 'window:0', touch);
        expect(await page.evaluate(() => window.__tarpit!.state!().windows![0].used)).toBe(false);
        expect((await visibleTexts(page)).some(t => t.text === 'No targets')).toBe(true);
        const window0 = level.windows[0];
        await page.evaluate(({ road, from }) => {
          const api = window.__tarpit!;
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

  if (clean) {
    test('Repair quotes its price and the breach shows the last stand countdown', async ({ page }) => {
      if (heights[0]) await page.setViewportSize({ width: 390, height: heights[0] });
      await open(page, 25, 'normal', true);
      await page.evaluate(() => {
        const api = window.__tarpit!;
        const state = api.state!();
        state.gate!.hp = Math.floor(state.gate!.maxHp / 2);
        state.gold = state.level!.gate!.repairCost - 1;
        api.step!(0);
      });
      await expect(page.getByRole('button', { name: 'Repair 105', exact: true })).toBeDisabled();
      await checkLabel(page, 'repair', 'Repair 105');
      await page.evaluate(() => {
        const api = window.__tarpit!;
        const state = api.state!();
        state.wave = 5;
        api.startWave!();
        state.gate!.hp = 1;
        state.enemies = [{ id: 900, type: 'grumblemaw', road: 'east', hp: 10000,
          distance: state.gate!.distance, slow: 0, slowTicksLeft: 0 }];
        api.step!(1);
      });
      await checkLabel(page, 'gate', 'Gate fallen');
      await checkLabel(page, 'gate', 'Last stand! 6s');
      await expect(page.getByRole('button', { name: 'Repair 105', exact: true })).toHaveCount(0);
      await page.evaluate(() => window.__tarpit!.step!(360));
      expect((await visibleTexts(page)).some(o => o.text.startsWith('Last stand!'))).toBe(false);
      await checkLabel(page, 'gate', 'Gate fallen');
    });
    return;
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
