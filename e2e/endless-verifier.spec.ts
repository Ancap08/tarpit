import { expect, test, type Page } from '@playwright/test';
import { END_TEXT, bestScoreText } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { TitleUiState } from '../src/game/TitleScene';
import { resultPaper } from './resultPaper';
import { waitForTitle } from './title';

// Milestone 26 verifier probes (independent of endless.spec.ts): storage
// that throws, when the score is saved, the win screen's three buttons
// under double clicks and keys, the endless HUD at three digits, both lose
// screens, and the title line at its widest. Time is frozen (?test=1).

type Rect = { x: number; y: number; width: number; height: number };

async function open(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await waitForTitle(page);
}
const startGame = (page: Page, d: 'easy' | 'normal' | 'hard' = 'normal') => page.evaluate((x) => (window.__tarpit as TarpitTestApi).startGame(x), d);
const api = <T>(page: Page, f: (t: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const titleUi = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).ui<TitleUiState>());
const toTitle = (page: Page) => waitForTitle(page);

async function click(page: Page, name: string): Promise<void> {
  const r = await page.evaluate((n) => (window.__tarpit as TarpitTestApi).uiRects()[n], name);
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Visible texts of the game scene with their boxes (canvas px). */
const texts = (page: Page) =>
  page.evaluate(() => {
    const scene = (window.__tarpit as TarpitTestApi).game.scene.getScene('game');
    type T = { type: string; visible: boolean; text: string; getBounds(): { x: number; y: number; width: number; height: number } };
    return (scene.children.list as unknown as T[])
      .filter((o) => o.type === 'Text' && o.visible && o.text !== '')
      .map((o) => {
        const b = o.getBounds();
        return { text: o.text, x: b.x, y: b.y, width: b.width, height: b.height };
      });
  });

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Clear `n` waves with no towers: lives are raised so every leak is survived (test setup). */
async function clearWaves(page: Page, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await api(page, (t) => {
      t.state().lives = 1e6;
      t.startWave();
      for (let k = 0; k < 400 && t.state().phase === 'wave'; k++) t.step(60);
    });
  }
  expect(await api(page, (t) => t.state().phase)).toBe('setup');
}

/** Lose the running game at once: one life, no towers. */
async function lose(page: Page): Promise<void> {
  await api(page, (t) => {
    t.state().lives = 1;
    t.startWave();
    for (let k = 0; k < 400 && t.state().phase === 'wave'; k++) t.step(60);
  });
  expect(await api(page, (t) => t.endScreen())).toBe('lost');
}

for (const [name, init] of [
  [
    'getItem throws',
    () => {
      Storage.prototype.getItem = () => {
        throw new DOMException('denied', 'SecurityError');
      };
    },
  ],
  [
    'setItem throws',
    () => {
      Storage.prototype.setItem = () => {
        throw new DOMException('full', 'QuotaExceededError');
      };
    },
  ],
  [
    'window.localStorage itself throws',
    () => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('denied', 'SecurityError');
        },
      });
    },
  ],
] as const) {
  test(`storage broken (${name}): no console error, the game plays, the title shows the session best`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(init);
    await open(page);
    expect((await titleUi(page)).bestLine).toBeNull();
    await startGame(page, 'hard');
    await clearWaves(page, 1);
    expect(await api(page, (t) => t.bestScore('hard'))).toBe(1);
    await lose(page);
    await click(page, 'menu');
    await toTitle(page);
    await page.keyboard.press('ArrowRight');
    expect(await titleUi(page)).toMatchObject({ difficulty: 'hard', bestLine: { text: 'Best on Meadow, Hard: 1 wave' } });
    expect(errors).toEqual([]);
  });
}

test('the score is saved at each wave clear: clear 3, reload mid-run, the title shows 3; lower later scores and other levels do not touch it', async ({ page }) => {
  await open(page);
  await startGame(page);
  await clearWaves(page, 2);
  expect(await page.evaluate(() => localStorage.getItem('tarpit.best'))).toBe('{"v":1,"best":{"meadow":{"normal":2}}}');
  await clearWaves(page, 1);
  // Mid-wave 4 when the page goes away: nothing more is needed to keep the 3.
  await api(page, (t) => {
    t.startWave();
    t.step(120);
  });
  await page.reload();
  await toTitle(page);
  expect((await titleUi(page)).bestLine?.text).toBe(bestScoreText('meadow', 'normal', 3));

  // A second, shorter run on Normal: 1 clear, then lost. The best stays 3.
  await startGame(page);
  await clearWaves(page, 1);
  await lose(page);
  expect(await api(page, (t) => t.bestScore('normal'))).toBe(3);
  // Play again (same level): a fresh count; the best moves only when it is beaten.
  await click(page, 'playAgain');
  await page.waitForFunction(() => (window.__tarpit as TarpitTestApi).endScreen() === null && (window.__tarpit as TarpitTestApi).state().wave === 0);
  await clearWaves(page, 3);
  expect(await api(page, (t) => t.bestScore('normal'))).toBe(3);
  await clearWaves(page, 1);
  expect(await api(page, (t) => t.bestScore('normal'))).toBe(4);
  await lose(page);
  await click(page, 'menu');
  await toTitle(page);

  // Easy is its own score.
  await startGame(page, 'easy');
  await clearWaves(page, 1);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('tarpit.best')))!)).toEqual({ v: 1, best: { meadow: { normal: 4, easy: 1 } } });
  expect(await api(page, (t) => t.bestScore('hard'))).toBeNull();
});

test('an early call is saved at once', async ({ page }) => {
  await open(page);
  await startGame(page);
  const r = await api(page, (t) => {
    t.state().lives = 1e6;
    t.startWave();
    // Wave 1's last Goblin spawns at 19 x 2.5 = 47.5 s (tick 2850; milestone 28).
    t.step(2900);
    const call = t.callNextWave();
    return { call, wave: t.state().wave, phase: t.state().phase, best: t.bestScore('normal') };
  });
  expect(r).toMatchObject({ call: { ok: true }, wave: 2, phase: 'wave', best: 1 });
});

test('a tower type picked on the bar when the game is won is no longer picked on the win screen or after Keep going', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await open(page);
  await startGame(page);
  // A tower type is picked on the bar when the game is won: the pick must not survive into endless.
  await api(page, (t) => {
    const s = t.state();
    s.wave = 19;
    s.gold = 1000;
    t.buildAt(7, 5, 'musketeer');
    t.startWave();
  });
  await click(page, 'bar:longbow');
  expect(await api(page, (t) => t.ui().pick)).toBe('longbow');
  await api(page, (t) => {
    // Fixture: step the final tick after all wave-20 groups have spawned.
    const s = t.state();
    s.spawnedPerGroup.fill(9999);
    t.step(1);
  });
  expect(await api(page, (t) => t.endScreen())).toBe('won');
  expect(await api(page, (t) => t.ui().pick)).toBeNull();
  const towers = await api(page, (t) => t.state().towers.length);
  await click(page, 'keepGoing');
  expect(await api(page, (t) => t.ui().pick)).toBeNull();
  expect(await api(page, (t) => t.state().towers.length)).toBe(towers);
  expect(errors).toEqual([]);
});

test('win screen: three buttons apart and inside the panel, labels inside their buttons; keys do nothing; a double click on Keep going only keeps going', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await open(page);
  await startGame(page);
  expect(await api(page, (t) => t.runScript('comboBuild'))).toBe('won');
  const rects = await api(page, (t) => t.uiRects());
  const row: Rect[] = [rects.keepGoing, rects.playAgain, rects.menu];
  const panel = await resultPaper(page);
  for (const [i, r] of row.entries()) {
    expect(r.height).toBeGreaterThanOrEqual(42);
    expect(r.x).toBeGreaterThanOrEqual(panel.x + 8);
    expect(r.x + r.width).toBeLessThanOrEqual(panel.x + panel.width - 8);
    expect(r.y).toBeGreaterThanOrEqual(panel.y);
    expect(r.y + r.height).toBeLessThanOrEqual(panel.y + panel.height - 8);
    for (const other of row.slice(i + 1)) expect(overlap(r, other)).toBe(false);
    if (i > 0) expect(r.x - (row[i - 1].x + row[i - 1].width)).toBeGreaterThanOrEqual(8);
  }
  // The row is centred on the panel, and each label sits inside its button with room to spare.
  expect(row[0].x - panel.x).toBe(panel.x + panel.width - (row[2].x + row[2].width));
  const all = await texts(page);
  for (const [label, r] of [
    [END_TEXT.keepGoing, row[0]],
    [END_TEXT.playAgain, row[1]],
    [END_TEXT.menu, row[2]],
  ] as const) {
    const t = all.find((x) => x.text === label)!;
    expect(t, label).toBeTruthy();
    expect(t.x).toBeGreaterThanOrEqual(r.x + 4);
    expect(t.x + t.width).toBeLessThanOrEqual(r.x + r.width - 4);
  }
  // The two result lines do not run into the buttons.
  const lives = all.find((x) => x.text.startsWith(END_TEXT.wonLives))!;
  expect(lives.y + lives.height).toBeLessThanOrEqual(row[0].y);

  // Keys: nothing on the win screen answers Enter, Space or Escape.
  const before = await api(page, (t) => JSON.stringify({ s: t.state(), e: t.endScreen() }));
  for (const key of ['Enter', 'Space', 'Escape', 'Tab', 'Enter']) await page.keyboard.press(key);
  expect(await api(page, (t) => JSON.stringify({ s: t.state(), e: t.endScreen() }))).toBe(before);

  // Double click on Keep going: the second click lands on the map where the button was.
  const towers = await api(page, (t) => t.state().towers.length);
  const gold = await api(page, (t) => t.state().gold);
  const k = row[0];
  await page.mouse.dblclick(k.x + k.width / 2, k.y + k.height / 2);
  const s = await api(page, (t) => t.state());
  expect(s).toMatchObject({ phase: 'setup', endless: true, wave: 20, gold });
  expect(s.towers.length).toBe(towers);
  expect(await api(page, (t) => t.endScreen())).toBeNull();
  const ui = await api(page, (t) => t.ui());
  expect(ui.pick).toBeNull();
  expect(ui.dragging).toBeNull();
  // Clicks where Play again and Menu were: plain map clicks now (no restart, no menu).
  for (const r of [row[1], row[2]]) await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  expect(await api(page, (t) => t.scene())).toBe('game');
  expect(await api(page, (t) => t.state())).toMatchObject({ phase: 'setup', endless: true, wave: 20, gold });
  expect((await api(page, (t) => t.state())).towers.length).toBe(towers);
  expect(await api(page, (t) => t.uiRects().keepGoing)).toBeUndefined();
  // The hook refuses a second Keep going.
  expect(await api(page, (t) => t.continueEndless())).toEqual({ ok: false, reason: 'not-won' });
  expect(errors).toEqual([]);
});

test('endless HUD: "Wave 21" and "Wave 123" keep clear of the preview; the widest endless preview fits its room', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  for (const level of ['normal', 'easy'] as const) {
    await startGame(page, level);
    for (const wave of [20, 22, 122, 9998]) {
      // Test setup: jump to an endless setup phase with `wave` cleared.
      await api(page, `(t) => { const s = t.state(); s.endless = true; s.wave = ${wave}; t.step(1); }` as unknown as (t: TarpitTestApi) => void);
      const hud = await api(page, (t) => t.hudText());
      expect(hud.wave).toBe(`Wave ${wave}`);
      const all = await texts(page);
      const waveText = all.find((x) => x.text === hud.wave)!;
      const next = all.find((x) => x.text.startsWith('Next:'))!;
      const livesText = all.find((x) => x.text.startsWith('Lives'))!;
      expect(waveText && next && livesText).toBeTruthy();
      expect(overlap(waveText, next), `${level} wave ${wave}: counter over the preview`).toBe(false);
      expect(next.x - (waveText.x + waveText.width), `${level} wave ${wave}: gap to the preview`).toBeGreaterThanOrEqual(6);
      expect(waveText.x - (livesText.x + livesText.width), `${level} wave ${wave}: gap from Lives`).toBeGreaterThanOrEqual(6);
      // The preview stays in its room: x 356 to 620, above the build bar row, inside the 100 px HUD.
      expect(next.x).toBeGreaterThanOrEqual(355);
      expect(next.x + next.width, `${level} wave ${wave}: "${next.text}"`).toBeLessThanOrEqual(621);
      const rects = await api(page, (t) => t.uiRects());
      expect(overlap(next, rects.special)).toBe(false);
      for (const name of Object.keys(rects).filter((n) => n.startsWith('bar:'))) expect(overlap(next, rects[name]), name).toBe(false);
      const tag = all.find((x) => x.text === hud.difficulty && hud.difficulty !== '');
      if (tag) expect(overlap(tag, next)).toBe(false);
    }
    // Before wave 23 (wave 20 based, with 8 + 10 Harpies and no boss).
    await api(page, (t) => {
      t.state().wave = 22;
      t.step(1);
    });
    expect((await api(page, (t) => t.hudText())).next).toBe('Next: 8 Hound, 5 Redcoat, 18 Harpy, 6 Toll Troll');
    await page.reload();
    await toTitle(page);
  }
});

test('lose screens: "Reached wave 1 of 20" in a normal game, "Reached wave 21" in an endless one', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await startGame(page);
  await lose(page);
  let lines = (await texts(page)).map((x) => x.text);
  expect(lines).toContain('Reached wave 1 of 20');
  expect(await api(page, (t) => t.uiRects().keepGoing)).toBeUndefined();
  await click(page, 'playAgain');
  await page.waitForFunction(() => (window.__tarpit as TarpitTestApi).endScreen() === null && (window.__tarpit as TarpitTestApi).state().wave === 0);
  expect(await api(page, (t) => t.state().endless)).toBe(false);

  expect(await api(page, (t) => t.runScript('endlessIdle', 21))).toBe('setup');
  // Test setup: take the towers away so wave 21 walks through.
  await api(page, (t) => {
    t.state().towers.splice(0);
  });
  await lose(page);
  lines = (await texts(page)).map((x) => x.text);
  expect(lines).toContain('Reached wave 21');
  expect(lines.some((x) => x.includes(' of '))).toBe(false);
  expect(await api(page, (t) => t.uiRects().keepGoing)).toBeUndefined();
  expect(await api(page, (t) => t.hudText().wave)).toBe('Wave 21');
  // Play again after an endless loss starts a normal game: "Wave 0/20", not endless.
  await click(page, 'playAgain');
  await page.waitForFunction(() => (window.__tarpit as TarpitTestApi).endScreen() === null && (window.__tarpit as TarpitTestApi).state().wave === 0);
  expect(await api(page, (t) => t.state().endless)).toBe(false);
  expect(await api(page, (t) => t.hudText().wave)).toBe('Wave 0/20');
});

test('title line: follows mouse and keyboard selection, absent without a score, fits at 999 waves', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tarpit.best', '{"v":1,"best":{"meadow":{"easy":1,"normal":999}}}'));
  await open(page);
  let ui = await titleUi(page);
  expect(ui).toMatchObject({ difficulty: 'normal', bestLine: { text: 'Best on Meadow, Normal: 999 waves' } });
  const rects = (await page.evaluate(() => (window.__tarpit as TarpitTestApi).uiRects())) as Record<string, Rect>;
  const r = ui.bestLine!.rect;
  expect(r.x).toBeGreaterThanOrEqual(16);
  expect(r.x + r.width).toBeLessThanOrEqual(960 - 16);
  for (const name of Object.keys(rects)) expect(overlap(r, rects[name]), name).toBe(false);
  expect(rects['title:play'].y - (r.y + r.height)).toBeGreaterThanOrEqual(8);
  await page.keyboard.press('ArrowLeft');
  ui = await titleUi(page);
  expect(ui).toMatchObject({ difficulty: 'easy', bestLine: { text: 'Best on Meadow, Easy: 1 wave' } });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await titleUi(page)).toMatchObject({ difficulty: 'hard', bestLine: null });
  await click(page, 'title:normal');
  expect((await titleUi(page)).bestLine?.text).toBe('Best on Meadow, Normal: 999 waves');
  await click(page, 'title:hard');
  expect((await titleUi(page)).bestLine).toBeNull();
});
