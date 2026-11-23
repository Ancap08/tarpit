import { campaignHpFactor } from '../src/sim/difficulty';
import { expect, test, type Page } from '@playwright/test';
import { END_TEXT, bestScoreText, heldBoonsText } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { TitleUiState } from '../src/game/TitleScene';
import { waitForTitle } from './title';

// Milestone 26: endless mode and the local high score. Time is frozen
// (?test=1) and driven by the scripts and step(); buttons are pressed with
// real mouse clicks at the rectangles uiRects() reports. The scripted win
// can continue into endless waves while preserving the campaign result.

async function open(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await waitForTitle(page);
}

async function startGame(page: Page, difficulty: 'easy' | 'normal' | 'hard' = 'normal'): Promise<void> {
  await page.evaluate((d) => (window.__tarpit as TarpitTestApi).startGame(d), difficulty);
}

const api = <T>(page: Page, f: (t: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const titleUi = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).ui<TitleUiState>());

async function click(page: Page, name: string): Promise<void> {
  const r = await page.evaluate((n) => (window.__tarpit as TarpitTestApi).uiRects()[n], name);
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

const comboBoons = ['longBarrels', 'stickyTar', 'stoneWalls'] as const;

/** The visible texts of the running game scene (the end screen's lines among them). */
const visibleTexts = (page: Page) =>
  page.evaluate(() => {
    const scene = (window.__tarpit as TarpitTestApi).game.scene.getScene('game');
    return scene.children.list
      .filter((o) => o.type === 'Text' && (o as unknown as { visible: boolean }).visible)
      .map((o) => (o as unknown as { text: string }).text);
  });

test('win, three buttons, Keep going by mouse: wave 21 starts, "Wave 21", no boss bar', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await startGame(page);
  expect(await api(page, (t) => t.runScript('comboBuild'))).toBe('won');
  expect(await api(page, (t) => t.endScreen())).toBe('won');
  const won = await api(page, (t) => t.state());
  expect(await visibleTexts(page)).toContain(heldBoonsText(comboBoons));
  const rects = await api(page, (t) => t.uiRects());
  const row = [rects.keepGoing, rects.playAgain, rects.menu];
  for (const r of row) {
    expect(r).toBeTruthy();
    expect(r.height).toBeGreaterThanOrEqual(42);
    // Inside the 520 px win panel centred on the map (x 220..740, y 125..355).
    expect(r.x).toBeGreaterThanOrEqual(220);
    expect(r.x + r.width).toBeLessThanOrEqual(740);
    expect(r.y).toBeGreaterThanOrEqual(125);
    expect(r.y + r.height).toBeLessThanOrEqual(355);
  }
  // Keep going first (the primary, on the left), then Play again and Menu, 8 px or more apart.
  for (let i = 1; i < row.length; i++) expect(row[i].x - (row[i - 1].x + row[i - 1].width)).toBeGreaterThanOrEqual(8);

  await click(page, 'keepGoing');
  expect(await api(page, (t) => t.endScreen())).toBeNull();
  expect(await api(page, (t) => t.uiRects().keepGoing)).toBeUndefined();
  const s = await api(page, (t) => t.state());
  expect(s).toMatchObject({ phase: 'setup', endless: true, wave: 20, lives: won.lives, gold: won.gold, boons: comboBoons });
  expect(await api(page, (t) => t.hudText().wave)).toBe('Wave 20');

  await click(page, 'startWave');
  expect(await api(page, (t) => t.state().phase)).toBe('wave');
  expect(await api(page, (t) => t.state().wave)).toBe(21);
  await api(page, (t) => t.step(1));
  const hud = await api(page, (t) => t.hudText());
  expect(hud.wave).toBe('Wave 21');
  expect(hud.boss).toBeNull();
  expect(await api(page, (t) => t.events().some((e) => e.kind === 'bossSpawn'))).toBe(false);
  // The first cycle adds 5% to wave 20's unrounded campaign HP.
  const hp = Math.round(23 * campaignHpFactor(20, 'normal') * 1.05);
  expect(await api(page, (t) => t.state().enemies.find((e) => e.type === 'goblin')?.maxHp)).toBe(hp);
});

test('lose in endless: the wave label omits "of 20" and Menu shows the best line for Normal only', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  expect(await titleUi(page)).toMatchObject({ difficulty: 'normal', bestLine: null });
  await startGame(page);
  expect(await api(page, (t) => t.runScript('endlessIdle'))).toBe('lost');
  expect(await api(page, (t) => t.endScreen())).toBe('lost');
  const wave = await api(page, (t) => t.state().wave);
  expect(wave).toBeGreaterThan(20);
  expect(await api(page, (t) => t.uiRects().keepGoing)).toBeUndefined();
  const texts = await visibleTexts(page);
  expect(texts).toContain(`${END_TEXT.lostWave} ${wave}`);
  expect(texts).toContain(heldBoonsText(comboBoons));
  expect(texts.some((x) => x.includes(' of '))).toBe(false);
  expect(await api(page, (t) => t.bestScore('normal'))).toBe(wave - 1);

  await click(page, 'menu');
  await waitForTitle(page);
  const ui = await titleUi(page);
  expect(ui.bestLine?.text).toBe(bestScoreText('meadow', 'normal', wave - 1));
  // Centred on y 422, midway between milestone 27's map row (bottom y 398) and Play (top y 446).
  const r = ui.bestLine!.rect;
  expect(Math.abs(r.x + r.width / 2 - 480)).toBeLessThanOrEqual(1);
  expect(Math.abs(r.y + r.height / 2 - 422)).toBeLessThanOrEqual(1);
  expect(r.y).toBeGreaterThan(398);
  expect(r.y + r.height).toBeLessThan(446);
  // A level never played shows no line; the line follows the selection.
  await click(page, 'title:easy');
  expect(await titleUi(page)).toMatchObject({ difficulty: 'easy', bestLine: null });
  await click(page, 'title:normal');
  expect((await titleUi(page)).bestLine?.text).toBe(bestScoreText('meadow', 'normal', wave - 1));
});

test('the score survives a reload; a fresh context shows no line', async ({ page, browser }) => {
  await open(page);
  await startGame(page, 'hard');
  // Hard, no towers but lives raised: wave 1 clears with every Goblin leaking.
  await api(page, (t) => {
    t.state().lives = 1e6; // test setup: survive the leaks
    t.startWave();
    t.step(4500); // milestone 28: wave 1 ends after 4435 ticks
  });
  expect(await api(page, (t) => t.state().phase)).toBe('setup');
  expect(await api(page, (t) => t.bestScore('hard'))).toBe(1);
  await page.reload();
  await waitForTitle(page);
  expect(await api(page, (t) => t.bestScore('hard'))).toBe(1);
  await page.keyboard.press('ArrowRight');
  expect((await titleUi(page)).bestLine?.text).toBe(bestScoreText('meadow', 'hard', 1));
  expect(await page.evaluate(() => localStorage.getItem('tarpit.best'))).toBe('{"v":1,"best":{"meadow":{"hard":1}}}');

  const fresh = await browser.newContext({ viewport: { width: 960, height: 580 } });
  const other = await fresh.newPage();
  await open(other);
  for (const level of ['ArrowLeft', 'ArrowRight', 'ArrowRight'] as const) {
    await other.keyboard.press(level);
    expect((await titleUi(other)).bestLine).toBeNull();
  }
  await fresh.close();
});

test('a malformed stored value shows no line and no console error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('tarpit.best', '{"v":1,"best":{"meadow":{"normal":"lots"'));
  await open(page);
  expect((await titleUi(page)).bestLine).toBeNull();
  expect(await api(page, (t) => t.bestScore('normal'))).toBeNull();
  await page.keyboard.press('ArrowLeft');
  expect((await titleUi(page)).bestLine).toBeNull();
  expect(errors).toEqual([]);
});

test('a win without Keep going stores 20', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await startGame(page);
  expect(await api(page, (t) => t.runScript('comboBuild'))).toBe('won');
  expect(await api(page, (t) => t.bestScore('normal'))).toBe(20);
  expect(await page.evaluate(() => localStorage.getItem('tarpit.best'))).toBe('{"v":1,"best":{"meadow":{"normal":20}}}');
  await click(page, 'menu');
  await waitForTitle(page);
  expect((await titleUi(page)).bestLine?.text).toBe(bestScoreText('meadow', 'normal', 20));
});

test('runScript stops in setup right after Keep going with untilWave 21', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await startGame(page);
  expect(await api(page, (t) => t.runScript('endlessIdle', 21))).toBe('setup');
  expect(await api(page, (t) => t.state())).toMatchObject({ phase: 'setup', wave: 20, endless: true });
  expect(await api(page, (t) => t.endScreen())).toBeNull();
  // The generated wave 21 preview fits its box: at most two lines.
  const fit = await page.evaluate(() => {
    const scene = (window.__tarpit as TarpitTestApi).game.scene.getScene('game');
    const next = scene.children.list.find((o) => o.type === 'Text' && (o as unknown as { text: string }).text.startsWith('Next:')) as unknown as {
      text: string;
      height: number;
      style: { fontSize: string };
      getWrappedText(): string[];
    };
    return { text: next.text, lines: next.getWrappedText().length, size: next.style.fontSize };
  });
  expect(fit.text).toBe('Next: 23 Goblin, 15 Troll, 9 Shieldbearer, 29 Harpy');
  expect(fit.lines).toBeLessThanOrEqual(2);
});
