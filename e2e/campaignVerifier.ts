// Verifier (milestone 41b): behaviour of the campaign screens in a real browser, shared by the three projects.
import { expect, test, type Page } from '@playwright/test';
import type { TitleUiState } from '../src/game/TitleScene';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { api, press } from './campaign';
import { useTallFontMetrics } from './campaignFont';
import { waitForFirstScreen } from './title';

type Screen = ReturnType<TarpitTestApi['screen']>;

async function onScreen(page: Page, screen: Screen) {
  await page.waitForFunction((screen) => {
    const t = window.__tarpit as TarpitTestApi | undefined;
    return t?.screen() === screen && (t.scene() !== 'title' || t.titleReady());
  }, screen);
}

async function rotate(page: Page, screen: Screen) {
  const { width, height } = page.viewportSize()!;
  await page.setViewportSize({ width: height, height: width });
  await page.waitForFunction((layout) => window.__tarpit?.layout() === layout, height > width ? 'landscape' : 'portrait');
  await onScreen(page, screen);
  // Let a queued restart finish: the title keeps its screen, and one scene runs.
  await page.waitForFunction(() => { const t = window.__tarpit as TarpitTestApi; return t.scene() !== 'title' || t.titleReady(); });
  expect(await api(page, (t) => t.game.scene.getScenes(true).map((s) => s.scene.key))).toHaveLength(1);
}

/** Win or lose the running level by the simulation's own end rule, with chosen lives. */
const end = (page: Page, win: boolean, lives = win ? 12 : 0) => page.evaluate(({ win, lives }) => {
  const t = window.__tarpit as TarpitTestApi;
  const state = t.state();
  state.wave = win ? state.level!.waves.length : 1;
  state.lives = lives;
  state.phase = win ? 'won' : 'lost';
  t.step(0);
}, { win, lives });

/** Every control on the current campaign screen, in page pixels. */
const targets = (page: Page) => page.evaluate(() => {
  const t = window.__tarpit as TarpitTestApi;
  const keep = t.screen() === 'result' ? ['playAgain', 'menu', 'nextLevel'] : null;
  return Object.entries(t.uiRects())
    .filter(([key]) => keep ? keep.includes(key) : key.startsWith('title:'))
    .map(([key, r]) => {
      const a = t.canvasToPage(r.x, r.y);
      const b = t.canvasToPage(r.x + r.width, r.y + r.height);
      return { key, width: b.x - a.x, height: b.y - a.y, left: a.x, top: a.y, right: b.x, bottom: b.y };
    });
});

/** Visible texts of the active scene: inside the canvas, and no two overlapping. */
const textProblems = (page: Page) => page.evaluate(() => {
  const t = window.__tarpit as TarpitTestApi;
  const scene = t.game.scene.getScene(t.scene());
  const texts = t.campaignLabels();
  const problems: string[] = [];
  const W = scene.scale.width;
  const H = scene.scale.height;
  const boxes = texts.map(({ text, x, y, width, height }) => ({
    text: text.replace(/\n/g, ' / '), b: { left: x, top: y, right: x + width, bottom: y + height },
  }));
  for (const { text, b } of boxes) {
    if (b.left < 0 || b.top < 0 || b.right > W || b.bottom > H) problems.push(`outside canvas: ${text}`);
  }
  for (const [i, a] of boxes.entries()) for (const c of boxes.slice(i + 1)) {
    if (a.b.left < c.b.right && c.b.left < a.b.right && a.b.top < c.b.bottom && c.b.top < a.b.bottom) {
      problems.push(`overlap: "${a.text}" with "${c.text}"`);
    }
  }
  return problems;
});

export function campaignVerifierSuite(touch: boolean, rotated: boolean) {
  const click = (page: Page, key: string) => press(page, key, touch);
  const open = async (page: Page, query = '/?test=1') => {
    await page.goto(query);
    await waitForFirstScreen(page);
  };

  test('journey: map, shut stop, card, real win, result, next, loss, retry, map', async ({ page }) => {
    await open(page);
    await click(page, 'title:campaign');
    await onScreen(page, 'levelMap');
    // A shut stop cannot start and says why in one line.
    await click(page, 'title:stop:5');
    await expect.poll(() => api(page, (t) => t.ui<TitleUiState>().lockedMessage)).toBe('Win level 1 first');
    expect(await api(page, (t) => t.screen())).toBe('levelMap');
    expect(await api(page, (t) => t.levelStops().filter((s) => s.open).map((s) => s.id))).toEqual([1]);
    await click(page, 'title:stop:1');
    await onScreen(page, 'levelCard');
    expect(await textProblems(page)).toEqual([]);
    await click(page, 'title:play');
    await onScreen(page, 'game');
    expect(await api(page, (t) => t.hudText().difficulty)).toBe('Level 1');
    expect(await api(page, (t) => t.hudText().wave)).toMatch(/0\s*\/\s*6|0 of 6|Wave 0/);
    // A real win by the capable bot through the live scene.
    expect(await api(page, (t) => t.runBot('botGood'))).toBe('won');
    await onScreen(page, 'result');
    expect(await api(page, (t) => t.campaignResult())).toMatchObject({ stars: 3, lives: 20, nextId: 2, hint: '', complete: '' });
    expect(await api(page, (t) => t.progress())).toEqual({ 1: 3 });
    expect(await textProblems(page)).toEqual([]);
    await click(page, 'nextLevel');
    await onScreen(page, 'levelCard');
    expect(await api(page, (t) => t.ui<TitleUiState>().levelId)).toBe(2);
    await click(page, 'title:play');
    await onScreen(page, 'game');
    await end(page, false);
    await onScreen(page, 'result');
    expect(await api(page, (t) => t.campaignResult())).toMatchObject({ kind: 'lost', stars: 0, nextId: null });
    expect(await api(page, (t) => t.progress())).toEqual({ 1: 3 });
    await click(page, 'playAgain'); // Try again
    await onScreen(page, 'game');
    expect(await api(page, (t) => ({ id: t.state().level?.id, wave: t.state().wave, lives: t.state().lives }))).toEqual({ id: 2, wave: 0, lives: 20 });
    await end(page, true, 12);
    await onScreen(page, 'result');
    expect(await api(page, (t) => t.campaignResult())).toMatchObject({ stars: 2, nextId: 3, hint: 'Finish with 18 lives for three stars' });
    await click(page, 'playAgain'); // Play again
    await onScreen(page, 'game');
    expect(await api(page, (t) => t.state().level?.id)).toBe(2);
    await end(page, true, 11);
    await onScreen(page, 'result');
    expect(await api(page, (t) => t.campaignResult())).toMatchObject({ stars: 1, hint: 'Finish with 12 lives for two stars' });
    await click(page, 'menu');
    await onScreen(page, 'levelMap');
    // Best stars never go down: the second run of level 2 was worse than its first.
    expect(await api(page, (t) => t.levelStops().slice(0, 4).map((s) => [s.open, s.stars]))).toEqual([[true, 3], [true, 2], [true, 0], [false, 0]]);
  });

  test('level ten shows the complete line and no Next', async ({ page }) => {
    await open(page);
    await api(page, (t) => t.setCampaignProgress(JSON.parse('{"1":3,"2":3,"3":3,"4":3,"5":3,"6":3,"7":3,"8":3,"9":3}')));
    await click(page, 'title:campaign');
    await onScreen(page, 'levelMap');
    await click(page, 'title:stop:10');
    await onScreen(page, 'levelCard');
    await click(page, 'title:play');
    await onScreen(page, 'game');
    await end(page, true, 16);
    await onScreen(page, 'result');
    const result = await api(page, (t) => t.campaignResult());
    expect(result).toMatchObject({ levelId: 10, nextId: null, complete: 'Campaign complete!' });
    expect(result!.buttons).not.toContain('Next level');
    expect(await textProblems(page)).toEqual([]);
  });

  test('a cheated campaign win saves nothing and offers no Next: what the player sees', async ({ page }, info) => {
    await open(page);
    await click(page, 'title:campaign');
    await onScreen(page, 'levelMap');
    await click(page, 'title:stop:1');
    await onScreen(page, 'levelCard');
    await click(page, 'title:play');
    await onScreen(page, 'game');
    expect(await api(page, (t) => t.cheatGold())).toMatchObject({ ok: true });
    expect(await api(page, (t) => t.runBot('botGood'))).toBe('won');
    await onScreen(page, 'result');
    const seen = await page.evaluate(() => {
      const t = window.__tarpit as TarpitTestApi;
      const texts = t.campaignLabels().map(label => label.text);
      return { texts, result: t.campaignResult(), progress: t.progress(), cheated: t.state().cheated };
    });
    info.annotations.push({ type: 'cheated-win-screen', description: JSON.stringify(seen) });
    expect(seen.cheated).toBe(true);
    expect(seen.progress).toEqual({});
    expect(seen.result).toMatchObject({ stars: 0, slots: '☆☆☆', nextId: null, hint: 'Gold cheat used: stars not saved' });
    expect(seen.texts).toEqual(expect.arrayContaining(['☆☆☆', 'Gold cheat used: stars not saved']));
    if (process.env.VERIFY_SHOT) await page.screenshot({ path: `${process.env.VERIFY_SHOT}-${info.project.name}.png` });
    expect(await textProblems(page)).toEqual([]);
    await rotate(page, 'result');
    expect(await textProblems(page)).toEqual([]);
    if (process.env.VERIFY_SHOT) await page.screenshot({ path: `${process.env.VERIFY_SHOT}-${info.project.name}-turned.png` });
    expect(await api(page, (t) => t.campaignResult())).toMatchObject({ slots: '☆☆☆', nextId: null });
    // An uncheated win is unchanged.
    await click(page, 'menu');
    await onScreen(page, 'levelMap');
    await click(page, 'title:stop:1');
    await onScreen(page, 'levelCard');
    await click(page, 'title:play');
    await onScreen(page, 'game');
    expect(await api(page, (t) => t.runBot('botGood'))).toBe('won');
    await onScreen(page, 'result');
    expect(await api(page, (t) => t.campaignResult())).toMatchObject({ stars: 3, nextId: 2, hint: '' });
    expect(await api(page, (t) => t.progress())).toEqual({ 1: 3 });
  });

  for (const tall of [false, true]) {
    test(`every campaign screen keeps its place across a turn, with one scene running${tall ? ' (tall metrics)' : ''}`, async ({ page }) => {
      if (tall) await useTallFontMetrics(page);
      await open(page);
      await rotate(page, 'first');
      await click(page, 'title:campaign');
      await onScreen(page, 'levelMap');
      await api(page, (t) => t.setCampaignProgress({ 1: 3, 2: 1 }));
      await onScreen(page, 'levelMap');
      await click(page, 'title:stop:5');
      await expect.poll(() => api(page, (t) => t.ui<TitleUiState>().lockedMessage)).toBe('Win level 3 first');
      await rotate(page, 'levelMap');
      expect(await textProblems(page)).toEqual([]);
      expect(await api(page, (t) => t.levelStops().map((s) => [s.open, s.stars]).slice(0, 4))).toEqual([[true, 3], [true, 1], [true, 0], [false, 0]]);
      await click(page, 'title:stop:3');
      await onScreen(page, 'levelCard');
      await rotate(page, 'levelCard');
      expect(await api(page, (t) => t.ui<TitleUiState>().levelId)).toBe(3);
      expect(await textProblems(page)).toEqual([]);
      await click(page, 'title:play');
      await onScreen(page, 'game');
      // Mid-level: build, spend, start the wave, then turn twice.
      await api(page, (t) => { t.buildAt(10, 5, 'musketeer'); t.startWave(); t.step(300); });
      const before = await api(page, (t) => { const s = t.state(); return { gold: s.gold, wave: s.wave, tick: s.tick, towers: s.towers.length, id: s.level?.id }; });
      await rotate(page, 'game');
      await rotate(page, 'game');
      expect(await api(page, (t) => { const s = t.state(); return { gold: s.gold, wave: s.wave, tick: s.tick, towers: s.towers.length, id: s.level?.id }; })).toEqual(before);
      // On the result screen, in both layouts.
      await end(page, true, 14);
      await onScreen(page, 'result');
      await rotate(page, 'result');
      expect(await api(page, (t) => t.campaignResult())).toMatchObject({ levelId: 3, stars: 2, nextId: 4 });
      expect(await textProblems(page)).toEqual([]);
      await rotate(page, 'result');
      expect(await textProblems(page)).toEqual([]);
    });
  }

  for (const tall of [false, true]) {
    test(`every control meets the 44 px target size and every screen has clean text${tall ? ' (tall metrics)' : ''}`, async ({ page }, info) => {
      if (tall) await useTallFontMetrics(page);
      await open(page);
      const small: string[] = [];
      const turned: string[] = [];
      const first = page.viewportSize()!;
      const record = async (label: string) => {
        const here = page.viewportSize()!;
        for (const c of await targets(page)) {
          if (c.width < 44 || c.height < 44) {
            (here.width === first.width ? small : turned).push(`${label} ${c.key} ${c.width.toFixed(0)}x${c.height.toFixed(0)}`);
          }
        }
        const problems = await textProblems(page);
        expect(problems, label).toEqual([]);
      };
      const viewportLabel = () => `${page.viewportSize()!.width}x${page.viewportSize()!.height}`;
      for (const turn of rotated ? [0, 1] : [0]) {
        if (turn) await rotate(page, 'first');
        const v = viewportLabel();
        await record(`${v} first`);
        await click(page, 'title:campaign');
        await onScreen(page, 'levelMap');
        await record(`${v} map`);
        await api(page, (t) => t.setCampaignProgress(JSON.parse('{"1":3,"2":3,"3":3,"4":3,"5":3,"6":3,"7":3,"8":3,"9":3,"10":3}')));
        await onScreen(page, 'levelMap');
        for (let id = 1; id <= 10; id++) {
          await click(page, `title:stop:${id}`);
          await onScreen(page, 'levelCard');
          await record(`${v} card ${id}`);
          await click(page, 'title:back');
          await onScreen(page, 'levelMap');
        }
        await click(page, 'title:stop:10');
        await onScreen(page, 'levelCard');
        await click(page, 'title:play');
        await onScreen(page, 'game');
        for (const [id, win, lives] of [[1, true, 12], [1, true, 20], [1, false, 0], [10, true, 12], [10, true, 20]] as const) {
          await page.evaluate((id) => (window.__tarpit as TarpitTestApi).startLevel(id), id);
          await end(page, win, lives);
          await onScreen(page, 'result');
          await record(`${v} result L${id} ${win ? lives : 'loss'}`);
        }
        await click(page, 'menu');
        await onScreen(page, 'levelMap');
        await click(page, 'title:back');
        await onScreen(page, 'first');
      }
      info.annotations.push({ type: 'small-targets-turned', description: JSON.stringify([...new Set(turned)]) });
      info.annotations.push({ type: 'small-targets', description: JSON.stringify([...new Set(small)]) });
      // A mouse-only layout (desktop) is allowed smaller buttons: its Look and mute were already 42 px on main.
      if (touch) expect([...new Set(small)]).toEqual([]);
    });
  }

  test('Free play still reaches the old picker, a game and its best score; mute and Look work', async ({ page }) => {
    await open(page);
    await api(page, (t) => t.setCampaignProgress({ 1: 2 }));
    // The Look switch and the mute button live on the first screen.
    const lookBefore = await api(page, (t) => t.ui<TitleUiState>().look);
    await click(page, `title:look:${lookBefore === 'classic' ? 'painted' : 'classic'}`);
    await expect.poll(() => api(page, (t) => t.ui<TitleUiState>().look)).not.toBe(lookBefore);
    await click(page, `title:look:${lookBefore}`);
    await expect.poll(() => api(page, (t) => t.ui<TitleUiState>().look)).toBe(lookBefore);
    const muteKey = 'title:mute';
    expect(await api(page, (t) => Object.keys(t.uiRects()))).toContain(muteKey);
    const muted = await api(page, (t) => t.audio().muted);
    await click(page, muteKey!);
    await expect.poll(() => api(page, (t) => t.audio().muted)).toBe(!muted);
    await click(page, muteKey!);
    await expect.poll(() => api(page, (t) => t.audio().muted)).toBe(muted);
    await click(page, 'title:freePlay');
    await onScreen(page, 'freePlay');
    await click(page, 'title:hard');
    await click(page, 'title:map:switchback');
    expect(await api(page, (t) => t.ui<TitleUiState>().difficulty)).toBe('hard');
    await click(page, 'title:play');
    await onScreen(page, 'game');
    expect(await api(page, (t) => t.state())).toMatchObject({ difficulty: 'hard', map: { id: 'switchback' } });
    expect(await api(page, (t) => t.state().level)).toBeUndefined();
    expect(await api(page, (t) => t.hudText().wave)).toMatch(/20/);
  });

  test('Enter opens Campaign and the map highlights the next unwon open level', async ({ page }) => {
    await open(page);
    await api(page, (t) => t.setCampaignProgress({ 1: 3, 2: 2 }));
    await page.keyboard.press('Enter');
    await onScreen(page, 'levelMap');
    // Right at the last open stop cannot select a lock.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await onScreen(page, 'levelCard');
    expect(await api(page, (t) => t.ui<TitleUiState>().levelId)).toBe(3);
    await page.keyboard.press('Escape');
    await onScreen(page, 'levelMap');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await onScreen(page, 'levelCard');
    expect(await api(page, (t) => t.ui<TitleUiState>().levelId)).toBe(2);
  });

  test('keys alone reach a running level one and operate its result', async ({ page }) => {
    await open(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await onScreen(page, 'freePlay');
    await page.keyboard.press('Escape');
    await onScreen(page, 'first');
    await page.keyboard.press('Space');
    await onScreen(page, 'levelMap');
    await page.keyboard.press('Enter');
    await onScreen(page, 'levelCard');
    await page.keyboard.press('Space');
    await onScreen(page, 'game');
    expect(await api(page, (t) => t.state().level?.id)).toBe(1);
    await end(page, true);
    await onScreen(page, 'result');
    await page.keyboard.press('Enter');
    await onScreen(page, 'levelCard');
    expect(await api(page, (t) => t.ui<TitleUiState>().levelId)).toBe(2);
    await page.keyboard.press('Space');
    await onScreen(page, 'game');
    await end(page, true);
    await onScreen(page, 'result');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await onScreen(page, 'game');
    expect(await api(page, (t) => t.state().level?.id)).toBe(2);
    await end(page, false);
    await onScreen(page, 'result');
    await page.keyboard.press('Escape');
    await onScreen(page, 'levelMap');
  });

  /** Total keyboard listeners on the scene that is showing. */
  const listeners = (page: Page) => page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const kb = t.game.scene.getScene(t.scene()).input.keyboard!;
    return kb.eventNames().reduce((n, name) => n + kb.listenerCount(name), 0);
  });

  test('keys: no leaked listeners across screens and turns, nothing odd in a level or Free play', async ({ page }) => {
    await open(page);
    const first = await listeners(page);
    for (let i = 0; i < 3; i++) await rotate(page, 'first');
    expect(await listeners(page)).toBe(first);
    await page.keyboard.press('Enter');
    await onScreen(page, 'levelMap');
    const map = await listeners(page);
    await rotate(page, 'levelMap');
    await rotate(page, 'levelMap');
    expect(await listeners(page)).toBe(map);
    await page.keyboard.press('Escape');
    await onScreen(page, 'first');
    expect(await listeners(page)).toBe(first);
    // Free play's picker: Enter plays once, Escape goes back once.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await onScreen(page, 'freePlay');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await onScreen(page, 'first');
    expect(await api(page, (t) => t.scene())).toBe('title');
    await page.keyboard.press('Enter');
    await onScreen(page, 'levelMap');
    await page.keyboard.press('Enter');
    await onScreen(page, 'levelCard');
    await page.keyboard.press('Enter');
    await onScreen(page, 'game');
    const at = await api(page, (t) => { const s = t.state(); return { tick: s.tick, wave: s.wave, phase: s.phase, gold: s.gold, towers: s.towers.length, scene: t.scene() }; });
    for (const key of ['Escape', 'Enter', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) await page.keyboard.press(key);
    await rotate(page, 'game');
    expect(await api(page, (t) => { const s = t.state(); return { tick: s.tick, wave: s.wave, phase: s.phase, gold: s.gold, towers: s.towers.length, scene: t.scene() }; })).toEqual(at);
    const inGame = await listeners(page);
    // Win, press Space on the result (Next level), come back and win again: the game scene adds no listeners.
    await end(page, true);
    await onScreen(page, 'result');
    await page.keyboard.press('Space');
    await onScreen(page, 'levelCard');
    expect(await api(page, (t) => t.scene())).toBe('title');
    await page.keyboard.press('Enter');
    await onScreen(page, 'game');
    expect(await api(page, (t) => ({ id: t.state().level?.id, wave: t.state().wave, phase: t.state().phase }))).toEqual({ id: 2, wave: 0, phase: 'setup' });
    expect(await listeners(page)).toBe(inGame);
    await end(page, false);
    await onScreen(page, 'result');
    await rotate(page, 'result');
    await page.keyboard.press('Enter'); // Try again, once
    await onScreen(page, 'game');
    expect(await api(page, (t) => ({ id: t.state().level?.id, wave: t.state().wave, lives: t.state().lives }))).toEqual({ id: 2, wave: 0, lives: 20 });
    expect(await listeners(page)).toBe(inGame);
  });
}
