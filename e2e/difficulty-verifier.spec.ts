import { expect, test, type Page } from '@playwright/test';
import { DIFFICULTY_LABELS } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { TitleUiState } from '../src/game/TitleScene';

// Milestone 25 verifier probes: the title menu, the HUD level tag, [Menu]
// and Play again, through real clicks and keys at uiRects() (?test=1).
// The tablet probe (g) is in touch-verifier.spec.ts (tablet project).

type Level = 'easy' | 'normal' | 'hard';
const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const sceneKey = (page: Page) => api(page, (a) => a.scene());
const titleLevel = async (page: Page) => (await page.evaluate(() => (window.__tarpit as TarpitTestApi).ui<TitleUiState>())).difficulty;
const hud = (page: Page) => api(page, (a) => a.hudText());

/** Two animation frames, so anything a click or key would start has started. */
const twoFrames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/**
 * Wait until the title menu takes clicks. Phaser adds new interactive
 * objects to a scene's input list on that scene's next update, so a click
 * in the same frame the title scene starts (seen on a fast reload: about 2
 * in 25) hits nothing. No person clicks that fast; a test can.
 */
async function onTitle(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await twoFrames(page);
}
async function openTitle(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await onTitle(page);
}
async function click(page: Page, name: string): Promise<void> {
  const r = (await api(page, (a) => a.uiRects()))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}
/** GameScene is running a game that has not ticked. */
const freshGame = (page: Page) =>
  page.waitForFunction(() => {
    const a = window.__tarpit as TarpitTestApi | undefined;
    if (a?.scene?.() !== 'game') return false;
    const s = a.state();
    return s.tick === 0 && s.phase === 'setup' && s.wave === 0 && a.endScreen() === null;
  });
/** Bounds of the HUD's Text objects, found by their text in the GameScene's display list. */
function hudBounds(page: Page) {
  return page.evaluate(() => {
    const scene = (window.__tarpit as TarpitTestApi).game.scene.getScene('game');
    const texts = scene.children.list.filter((o) => o.type === 'Text') as Phaser.GameObjects.Text[];
    const box = (t: Phaser.GameObjects.Text | undefined) => {
      if (!t) return null;
      const b = t.getBounds();
      return { text: t.text, x: b.x, y: b.y, right: b.right, bottom: b.bottom, visible: t.visible };
    };
    const hudText = (window.__tarpit as TarpitTestApi).hudText();
    return {
      wave: box(texts.find((t) => t.text === hudText.wave)),
      next: box(texts.find((t) => t.text !== '' && t.text === hudText.next)),
      lives: box(texts.find((t) => t.text === hudText.lives)),
      tag: hudText.difficulty === '' ? null : box(texts.find((t) => t.text === hudText.difficulty)),
      emptyTexts: texts.filter((t) => t.text === '').length,
    };
  });
}
type Box = { x: number; y: number; right: number; bottom: number };
const overlap = (a: Box, b: Box) => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;

test('(a) a level click, an empty click and Left/Right do not start the game; Play, Enter and Space each do', async ({ page }) => {
  for (const start of ['play', 'Enter', 'Space'] as const) {
    await openTitle(page);
    for (const level of ['easy', 'hard', 'normal', 'easy'] as const) {
      await click(page, `title:${level}`);
      await twoFrames(page);
      expect(await sceneKey(page)).toBe('title');
      expect(await titleLevel(page)).toBe(level);
    }
    // Empty title space: the reserved band, the title text, the caption, the prompt, a corner, between two level buttons.
    for (const [x, y] of [[480, 366], [480, 110], [480, 224], [480, 522], [5, 575], [405, 265], [480, 300], [480, 440]]) {
      await page.mouse.click(x, y);
    }
    await page.keyboard.press('ArrowRight');
    await twoFrames(page);
    expect(await sceneKey(page)).toBe('title');
    expect(await titleLevel(page)).toBe('normal'); // Easy + Right
    if (start === 'play') await click(page, 'title:play');
    else await page.keyboard.press(start);
    await freshGame(page);
    expect(await state(page)).toMatchObject({ difficulty: 'normal', gold: 100, lives: 20, towers: [] });
  }
});

test('(b) Left from Easy stays on Easy and Right from Hard stays on Hard (no wrap)', async ({ page }) => {
  await openTitle(page);
  await click(page, 'title:easy');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowLeft');
    expect(await titleLevel(page)).toBe('easy');
  }
  const seen: string[] = [];
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ArrowRight');
    seen.push(await titleLevel(page));
  }
  expect(seen).toEqual(['normal', 'hard', 'hard', 'hard', 'hard']);
  await page.keyboard.press('Enter');
  await freshGame(page);
  expect(await state(page)).toMatchObject({ difficulty: 'hard', gold: 80, lives: 15 });
});

test('(c) Left then Enter back to back, 10 times: the game starts on the level the title showed when Enter landed', async ({ page }) => {
  for (let i = 0; i < 10; i++) {
    await openTitle(page);
    await click(page, 'title:hard');
    expect(await titleLevel(page), `run ${i}: after the click on Hard`).toBe('hard');
    // Record what the menu shows at the moment the Enter keydown reaches the page (capture phase, before Phaser).
    await page.evaluate(() => {
      const w = window as unknown as { __atEnter?: string; __keys: string[] };
      w.__keys = [];
      window.addEventListener(
        'keydown',
        (e) => {
          w.__keys.push(e.key);
          if (e.key === 'Enter') w.__atEnter = (window.__tarpit as TarpitTestApi).ui<TitleUiState>().difficulty;
        },
        true,
      );
    });
    // No await between the two presses: both go down the wire at once.
    await Promise.all([page.keyboard.press('ArrowLeft'), page.keyboard.press('Enter')]);
    await freshGame(page);
    const seen = await page.evaluate(() => {
      const w = window as unknown as { __atEnter?: string; __keys: string[] };
      return { atEnter: w.__atEnter, keys: w.__keys };
    });
    expect(seen.keys, `run ${i}`).toEqual(['ArrowLeft', 'Enter']);
    const started = (await state(page)).difficulty as Level;
    expect(started, `run ${i}: title showed ${seen.atEnter} at Enter`).toBe(seen.atEnter);
    // Hard, one Left: Normal. (The bug the implementer fixed gave Easy: Left ran twice.)
    expect(started, `run ${i}`).toBe('normal');
    expect(await state(page)).toMatchObject({ gold: 100, lives: 20 });
  }
});

test('(c2) the same with a read between the keys, 10 times', async ({ page }) => {
  for (let i = 0; i < 10; i++) {
    await openTitle(page);
    await click(page, 'title:hard');
    expect(await titleLevel(page), `run ${i}: after the click on Hard`).toBe('hard');
    await page.keyboard.press('ArrowLeft');
    const shown = await titleLevel(page);
    await page.keyboard.press('Enter');
    await freshGame(page);
    expect((await state(page)).difficulty, `run ${i}`).toBe(shown);
    expect(shown).toBe('normal');
  }
});

test('(d) [Menu] from the win screen: the title with the played level selected; Play starts a fresh game', async ({ page }) => {
  await openTitle(page);
  await click(page, 'title:easy');
  await click(page, 'title:play');
  await freshGame(page);
  // comboBuild on Easy wins with 30 lives and 412 gold (npm run sim, milestone 25c).
  expect(await api(page, (a) => a.runScript('comboBuild'))).toBe('won');
  expect(await api(page, (a) => a.endScreen())).toBe('won');
  const won = await state(page);
  expect(won).toMatchObject({ difficulty: 'easy', wave: 10, lives: 30, gold: 412 });
  expect(won.towers.length).toBeGreaterThan(0);
  await click(page, 'menu');
  await onTitle(page);
  expect(await titleLevel(page)).toBe('easy');
  expect(Object.keys(await api(page, (a) => a.uiRects())).sort()).toEqual(['title:easy', 'title:hard', 'title:normal', 'title:play']);
  await click(page, 'title:play');
  await freshGame(page);
  expect(await state(page)).toMatchObject({ difficulty: 'easy', tick: 0, wave: 0, gold: 150, lives: 30, towers: [], enemies: [], phase: 'setup' });
  expect(await api(page, (a) => a.speed())).toBe(1);
  // And the menu still switches level after a round trip: Menu is not on screen, so lose and go back.
  await api(page, (a) => {
    a.state().lives = 1;
    a.startWave();
    a.step(3000);
  });
  await click(page, 'menu');
  await onTitle(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await freshGame(page);
  expect(await state(page)).toMatchObject({ difficulty: 'normal', gold: 100, lives: 20, towers: [] });
});

test('(e) Play again on Hard keeps Hard, twice: 80 gold, 15 lives, Goblin 13 hp (milestone 25c)', async ({ page }) => {
  await openTitle(page);
  await click(page, 'title:hard');
  await click(page, 'title:play');
  await freshGame(page);
  for (let round = 0; round < 2; round++) {
    // No towers on Hard: lost on wave 1 (npm run sim, milestone 25c), through the real Start Wave button.
    await click(page, 'startWave');
    await api(page, (a) => a.step(1));
    expect((await state(page)).enemies.map((e) => [e.type, e.hp])).toEqual([['goblin', 13]]);
    for (let i = 0; i < 40 && (await state(page)).phase !== 'lost'; i++) {
      if ((await state(page)).phase === 'setup') await click(page, 'startWave');
      await api(page, (a) => a.step(500));
    }
    expect(await state(page)).toMatchObject({ phase: 'lost', wave: 1, difficulty: 'hard' });
    await click(page, 'playAgain');
    await freshGame(page);
    expect(await state(page)).toMatchObject({ difficulty: 'hard', gold: 80, lives: 15, towers: [], enemies: [] });
    expect((await hud(page)).difficulty).toBe(DIFFICULTY_LABELS.hard);
  }
});

test('(f) HUD tag: none on Normal; the level name on Easy and Hard, clear of the wave counter, lives and preview', async ({ page }) => {
  // Normal: no tag, and the wave counter sits where the lives counter does.
  await openTitle(page);
  await click(page, 'title:play');
  await freshGame(page);
  expect((await hud(page)).difficulty).toBe('');
  const normal = await hudBounds(page);
  expect(normal.tag).toBeNull();
  expect(normal.wave!.y).toBe(normal.lives!.y);

  for (const level of ['easy', 'hard'] as const) {
    await openTitle(page);
    await click(page, `title:${level}`);
    await click(page, 'title:play');
    await freshGame(page);
    // Wave 0/10 (preview of wave 1), then wave 9/10 in setup (the longest
    // preview, with "+ Grumblefoot"), then 10/10.
    for (const wave of [0, 9, 10]) {
      await page.evaluate((w) => {
        const a = window.__tarpit as TarpitTestApi;
        a.state().wave = w;
        a.step(0);
      }, wave);
      const h = await hud(page);
      expect(h.wave).toBe(`Wave ${wave}/10`);
      expect(h.difficulty).toBe(DIFFICULTY_LABELS[level]);
      const b = await hudBounds(page);
      expect(b.tag, `${level} wave ${wave}`).not.toBeNull();
      expect(b.tag!.visible).toBe(true);
      expect(overlap(b.tag!, b.wave!), `tag vs wave ${JSON.stringify(b)}`).toBe(false);
      expect(overlap(b.tag!, b.next!), `tag vs preview ${JSON.stringify(b)}`).toBe(false);
      expect(overlap(b.wave!, b.next!), `wave vs preview ${JSON.stringify(b)}`).toBe(false);
      expect(overlap(b.tag!, b.lives!)).toBe(false);
      // The tag is directly under the counter, left edges aligned, inside the canvas.
      expect(b.tag!.x).toBe(b.wave!.x);
      expect(b.tag!.y).toBeGreaterThanOrEqual(b.wave!.bottom - 4);
      expect(b.tag!.bottom).toBeLessThanOrEqual(580);
      expect(b.wave!.right).toBeLessThan(b.next!.x);
    }
  }
});

// Milestone 25c: the old real case (lazyBuild on Easy losing wave 10 at -1
// lives) is gone, since lazyBuild now wins on Easy (12 lives); the boss exit
// below still proves the display rule.
test('(h) negative lives are shown as 0: a boss exit with 3 lives left', async ({ page }) => {
  // Boss exits with 3 lives left (Normal): the sim says 3 - 5 = -2, the HUD says 0.
  await openTitle(page);
  await click(page, 'title:normal');
  await click(page, 'title:play');
  await freshGame(page);
  await click(page, 'startWave');
  await api(page, (a) => {
    const s = a.state();
    s.lives = 3;
    s.enemies.push({ id: 900, type: 'boss', hp: 4000, distance: 1e9, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 });
    a.step(1);
  });
  expect(await state(page)).toMatchObject({ phase: 'lost', lives: -2 });
  expect((await hud(page)).lives).toBe('Lives 0');
  expect(await api(page, (a) => a.endScreen())).toBe('lost');
});
