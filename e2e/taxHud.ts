import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import type { TitleScene } from '../src/game/TitleScene';
import { TAX_NAMES } from '../src/game/names';
import { buildableCells, cellFromKey, resolveMap, LEVELS, type LevelDef, type LevelTaxes } from '../src/sim';
import { api, mapPress, press, visibleTexts } from './campaign';
import { useTallFontMetrics } from './campaignFont';
import { checkLabel } from './hudButtonLabels';
import { waitForFirstScreen } from './title';

// Short, repeatable campaign waves let the screen show the exact transaction
// before and after each tax, independently of future changes to bot tuning.
async function fixture(page: Page, taxes: LevelTaxes) {
  const wave = { groups: [{ type: 'goblin', count: 1, interval: 1, delay: 0 }] } as const;
  const level = { ...LEVELS[9], map: 'meadow', startGold: 300, hpScale: 1, hpGrowthStart: null,
    taxes, waves: [wave, wave, wave], rewardWaves: [] } as const;
  await openPaintedLevel(page, level);
}

export async function openPaintedLevel(page: Page, level: LevelDef) {
  await page.goto('/?test=1&look=painted');
  await waitForFirstScreen(page);
  await page.evaluate(level => {
    const t = window.__tarpit!;
    const game = t.game.scene.getScene('game');
    return new Promise<void>(resolve => {
      game.events.once('create', resolve);
      const title = t.game.scene.getScene('title') as TitleScene;
      title['startGame']({ level, map: level.map === 'keep' ? undefined : level.map, difficulty: 'normal' });
    });
  }, level);
  expect(await api(page, t => t.painted().active)).toBe(true);
}

// Read visible Phaser labels and their real bounds, including font fallbacks.
export async function checkTaxLine(page: Page, expected: string, count = false) {
  const line = await page.evaluate(count => {
    const t = window.__tarpit!;
    const scene = t.game.scene.getScene('game') as GameScene;
    const label = scene.children.getByName(count ? 'build-bar-count' : 'active-taxes') as Phaser.GameObjects.Text;
    if (!label.visible) return null;
    const b = label.getBounds();
    const portrait = t.layout() === 'portrait';
    const labels = scene.children.list.filter(node => node.type === 'Text' && node !== label) as Phaser.GameObjects.Text[];
    const overlaps = labels.filter(other => {
      if (!other.visible || !other.text || other.alpha <= 0) return false;
      const box = other.getBounds();
      return box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top;
    });
    const scale = (t.canvasToPage(100, 0).x - t.canvasToPage(0, 0).x) / 100;
    const cssPixels = parseFloat(String(label.style.fontSize)) * Math.min(label.scaleX, label.scaleY) * scale;
    const first = t.uiRects()['bar:musketeer'];
    const second = t.uiRects()['bar:cannon'];
    const region = count ? { left: first.x, right: second.x + second.width, top: first.y, bottom: first.y + first.height }
      : { left: 0, right: portrait ? 480 : 960, top: portrait ? 0 : 480, bottom: portrait ? scene['layout'].map.y : 533 };
    return { text: label.text, readable: cssPixels >= 12, fits: b.left >= region.left && b.right <= region.right
      && b.top >= region.top && b.bottom <= region.bottom, overlaps: overlaps.map(other => other.text) };
  }, count);
  if (!expected) expect(line).toBeNull();
  else expect(line).toEqual({ text: expected, fits: true, overlaps: [], readable: true });
}

async function checkUntaxedHud(page: Page) {
  await checkTaxLine(page, '');
  await checkTaxLine(page, '', true);
  // Use the actual transition after the first wave, where a tax would start its timer.
  const { price, button, phase } = await api(page, t => {
    const s = t.state();
    const startGold = s.gold;
    let built = false;
    for (let row = 0; row < 15 && !built; row++)
      for (let col = 0; col < 30 && !built; col++) built = t.buildAt(col, row, 'musketeer').ok;
    if (!built || !t.startWave().ok) throw new Error('Could not start the control wave');
    const price = startGold - s.gold;
    s.spawnedPerGroup.fill(99_999);
    s.enemies = [];
    t.step(1);
    return { price, button: t.hudText().startWave, phase: t.state().phase };
  });
  expect({ price, button, phase }).toEqual({ price: 50, button: 'Start Wave', phase: 'setup' });
  await checkLabel(page, 'bar:musketeer', '50');
}
export function taxHudSuite(touch: boolean) {
  test('tax names follow the level and clear in Free play and the first act', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/?test=1');
    await waitForFirstScreen(page);
    await api(page, t => t.startGame());
    await checkUntaxedHud(page);
    for (const level of LEVELS) {
      await page.evaluate(id => window.__tarpit!.startLevel!(id), level.id);
      if (!level.taxes) await checkUntaxedHud(page);
      else {
        const names = Object.entries(TAX_NAMES).filter(([key]) => key in level.taxes!);
        const line = (await visibleTexts(page)).find(s => names.every(([, name]) => s.includes(name)));
        expect(line, 'level ' + level.id).toBeTruthy();
        await checkTaxLine(page, line!);
      }
    }
  });

  test('Window Tax charges the price on the plaque and Rationing explains a full bar', async ({ page }) => {
    await useTallFontMetrics(page, true);
    await fixture(page, { windowTax: 0.1, rationing: 2 });
    await checkTaxLine(page, 'Window Tax · Rationing');
    await checkLabel(page, 'bar:musketeer', '50');
    await checkTaxLine(page, '0/2 towers', true);
    expect(await api(page, t => t.buildAt(7, 5, 'musketeer'))).toMatchObject({ ok: true, gold: 250 });
    await checkLabel(page, 'bar:musketeer', '55');
    expect(await api(page, t => t.buildAt(8, 5, 'musketeer'))).toMatchObject({ ok: true, gold: 195 });
    await checkLabel(page, 'bar:musketeer', '60');
    await checkTaxLine(page, 'Window Tax · Rationing (full)');
    await checkTaxLine(page, '2/2 towers', true);
    await press(page, 'bar:musketeer', touch);
    expect(await api(page, t => t.ui().pick)).toBeNull();
    expect(await api(page, t => t.upgradeAt(7, 5))).toMatchObject({ ok: true, gold: 160 });
    expect(await api(page, t => t.sellAt(8, 5))).toMatchObject({ ok: true, gold: 215 });
    await checkTaxLine(page, '1/2 towers', true);
    await checkTaxLine(page, 'Window Tax · Rationing');
    await press(page, 'bar:musketeer', touch);
    expect(await api(page, t => t.ui().pick)).toBe('musketeer');
  });

  test('Curfew shortens the placement and selected rings, including the upgraded tower', async ({ page }) => {
    await fixture(page, { curfew: 0.2, forcedMarch: 0.25 });
    await checkTaxLine(page, 'Forced March · Curfew');
    await press(page, 'bar:musketeer', touch);
    if (touch) await mapPress(page, 7, 5, true);
    else {
      const p = await api(page, t => t.cellToPage(7, 5));
      await page.mouse.move(p.x, p.y);
    }
    expect(await api(page, t => t.ui().rangeRadius)).toBe(88);
    await mapPress(page, 7, 5, touch);
    await mapPress(page, 7, 5, touch);
    expect(await api(page, t => t.ui())).toMatchObject({ selectedCell: { col: 7, row: 5 }, rangeRadius: 88 });
    await press(page, 'panel:upgrade', touch);
    expect(await api(page, t => t.ui().rangeRadius)).toBe(100);
    await api(page, t => { t.startWave(); t.step(2); });
    expect(await api(page, t => t.state().enemies[0].distance)).toBe(1.25);
  });

  test('Frozen Purse shows zero kill gold then the wave payment, and No Loitering counts down', async ({ page }) => {
    await useTallFontMetrics(page, false);
    await fixture(page, { frozenPurse: 40, noLoitering: 8 });
    await checkTaxLine(page, 'Frozen Purse · No Loitering');
    await api(page, t => { t.startWave(); t.step(1); });
    const hit = await api(page, t => {
      const entry = t.state().map.path[0];
      return t.useSpecialAt('keg', entry.x, entry.y);
    });
    expect(hit).toMatchObject({ ok: true, kills: 1 });
    expect(await visibleTexts(page)).toContain('Gold 300');
    await api(page, t => t.step(1));
    expect(await visibleTexts(page)).toContain('Gold 340');
    await checkLabel(page, 'startWave', 'Start in 8s');
    await api(page, t => t.step(60));
    await checkLabel(page, 'startWave', 'Start in 7s');
    await api(page, t => t.step(420));
    expect(await api(page, t => t.state().wave)).toBe(2);
    await api(page, t => t.step(1));
    await press(page, 'startWave', touch);
    expect(await api(page, t => t.state().wave)).toBe(3);
    expect(await visibleTexts(page)).toContain('Gold 400');
  });
}


export function shortPhoneTaxHudSuite() {
  for (const fallback of [false, true]) {
    test(`390×664 keeps the tax line and tower tally readable in fixed ${fallback ? 'fallback' : 'Caslon'}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 664 });
      await useTallFontMetrics(page, fallback);
      const level = LEVELS.find(level => level.taxes?.forcedMarch && level.taxes.rationing)!;
      await openPaintedLevel(page, level);
      expect(await page.evaluate(() => [...document.fonts].some(face => face.status === 'loaded'))).toBe(!fallback);
      const cap = level.taxes!.rationing!;
      await checkTaxLine(page, 'Forced March · Rationing');
      await checkTaxLine(page, `0/${cap} towers`, true);
      const cells = buildableCells(resolveMap(level.map)).flatMap((open, i) => open ? [cellFromKey(i)] : []).slice(0, cap);
      for (const cell of cells)
        expect(await page.evaluate(({ col, row }) => window.__tarpit!.buildAt!(col, row, 'longbow').ok, cell)).toBe(true);
      await checkTaxLine(page, 'Forced March · Rationing (full)');
      await checkTaxLine(page, `${cap}/${cap} towers`, true);
    });
  }
}
