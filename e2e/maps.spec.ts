import { expect, test, type Page } from '@playwright/test';
import { bestScoreText, MAP_NAMES } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { TitleUiState } from '../src/game/TitleScene';
import type { MapId } from '../src/sim/map';
import { waitForTitle } from './title';

// Milestone 27, desktop project (mouse and keyboard): the title's map row,
// a first wave on each map, Riverbend's river refusing a tower, a tower
// between two Switchback lanes, and the map kept across Play again, Menu and
// the best-score line. At the 960x580 viewport canvas space is page space.

type Cell = { col: number; row: number };
type Point = { x: number; y: number };

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const titleUi = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).ui<TitleUiState>());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const centre = (c: Cell): Point => ({ x: c.col * 32 + 16, y: c.row * 32 + 16 });

async function openTitle(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await waitForTitle(page);
}

async function rectCentre(page: Page, name: string): Promise<Point> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

async function click(page: Page, name: string): Promise<void> {
  const p = await rectCentre(page, name);
  await page.mouse.click(p.x, p.y);
}

async function freshGame(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'game' && window.__tarpit.state?.().tick === 0);
}

/** Press at `from`, move in steps to `to`, run `during` while still held, release. */
async function drag(page: Page, from: Point, to: Point, during?: () => Promise<void>): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  if (during) await during();
  await page.mouse.up();
}

/** The RGB of one canvas pixel, read from a 1 x 1 screenshot (no new dependency to decode it). */
async function pixel(page: Page, p: Point): Promise<number[]> {
  const png = await page.screenshot({ clip: { x: p.x, y: p.y, width: 1, height: 1 } });
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(1, 1);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  }, png.toString('base64'));
}

/** Step the wave in chunks until the tower on `cell` has a kill; return its kills. */
async function stepUntilKill(page: Page, cell: Cell): Promise<number> {
  return page.evaluate((c) => {
    const t = window.__tarpit as TarpitTestApi;
    for (let i = 0; i < 60 && t.state().phase === 'wave'; i++) {
      t.step(60);
      const tower = t.state().towers.find((tw) => tw.cell.col === c.col && tw.cell.row === c.row);
      if (tower && tower.kills > 0) return tower.kills;
    }
    return 0;
  }, cell);
}

/** A Longbow cell on each map that reaches the path early (each combo plan's first Longbow). */
const BOW: Record<MapId, Cell> = { meadow: { col: 9, row: 5 }, switchback: { col: 14, row: 7 }, riverbend: { col: 12, row: 5 } };

for (const map of ['meadow', 'switchback', 'riverbend'] as const) {
  test(`${map}: pick it by mouse, Play, drag a Longbow from the bar, start the wave, an enemy dies`, async ({ page }) => {
    await openTitle(page);
    expect((await titleUi(page)).map).toBe('meadow'); // preselected
    await click(page, `title:map:${map}`);
    expect(await api(page, (a) => a.scene())).toBe('title'); // a map click only selects
    expect((await titleUi(page)).map).toBe(map);
    await click(page, 'title:play');
    await freshGame(page);
    const s = await state(page);
    expect(s.map.id).toBe(map);
    expect((await api(page, (a) => a.ui())).map).toBe(map);
    expect(await api(page, (a) => a.hudText())).toMatchObject({ gold: 'Gold 100', lives: 'Lives 20', wave: 'Wave 0/10' });

    await drag(page, await rectCentre(page, 'bar:longbow'), centre(BOW[map]));
    expect((await state(page)).towers).toEqual([expect.objectContaining({ cell: BOW[map], type: 'longbow' })]);
    await click(page, 'startWave');
    expect((await state(page)).phase).toBe('wave');
    expect(await stepUntilKill(page, BOW[map])).toBeGreaterThan(0);
    expect((await api(page, (a) => a.hudText())).wave).toBe('Wave 1/10');
  });
}

test('keyboard: Up and Down change the map, Left and Right the level; Enter plays both', async ({ page }) => {
  await openTitle(page);
  const sel = async () => {
    const u = await titleUi(page);
    return [u.map, u.difficulty];
  };
  expect(await sel()).toEqual(['meadow', 'normal']);
  await page.keyboard.press('ArrowDown');
  expect(await sel()).toEqual(['switchback', 'normal']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); // stops at the end, no wrap
  expect(await sel()).toEqual(['riverbend', 'normal']);
  await page.keyboard.press('ArrowUp');
  expect(await sel()).toEqual(['switchback', 'normal']);
  await page.keyboard.press('ArrowLeft');
  expect(await sel()).toEqual(['switchback', 'easy']);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect(await sel()).toEqual(['meadow', 'easy']);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  expect(await sel()).toEqual(['switchback', 'hard']);
  expect(await api(page, (a) => a.scene())).toBe('title');
  await page.keyboard.press('Enter');
  await freshGame(page);
  const s = await state(page);
  expect([s.map.id, s.difficulty, s.gold, s.lives]).toEqual(['switchback', 'hard', 80, 15]);
});

test('Riverbend: a tower dragged onto the river shows the red ghost and places nothing; the cell beside it places', async ({ page }) => {
  await openTitle(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame('normal', 'riverbend'));
  const river: Cell = { col: 13, row: 8 };
  const bank: Cell = { col: 12, row: 8 };
  // The cell's left edge: the 2 px outline, red over the river, green on the bank.
  const edge = (c: Cell): Point => ({ x: c.col * 32 + 1, y: c.row * 32 + 16 });
  const water = await pixel(page, edge(river));
  expect(water[2]).toBeGreaterThan(water[0]); // blue before the drag
  const bar = await rectCentre(page, 'bar:musketeer');
  await drag(page, bar, centre(river), async () => {
    expect((await api(page, (a) => a.ui())).dragging).toEqual({ kind: 'place', tower: 'musketeer', cell: river });
    const [r, g, b] = await pixel(page, edge(river));
    expect(r).toBeGreaterThan(g + 80);
    expect(r).toBeGreaterThan(b + 80);
  });
  let s = await state(page);
  expect(s.towers).toEqual([]);
  expect(s.gold).toBe(100);
  // The sim's own reason for that cell.
  expect(await api(page, (a) => a.buildAt(13, 8, 'musketeer'))).toEqual({ ok: false, reason: 'water' });

  await drag(page, bar, centre(bank), async () => {
    // Green outline (under the translucent range circle): green clearly ahead of red and blue.
    const [r, g, b] = await pixel(page, edge(bank));
    expect(g).toBeGreaterThan(r + 30);
    expect(g).toBeGreaterThan(b + 30);
  });
  s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: bank, type: 'musketeer' })]);
  expect(s.gold).toBe(50);
});

test('Switchback: a Musketeer between two lanes hits enemies on both lanes', async ({ page }) => {
  await openTitle(page);
  const shots = await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame('normal', 'switchback');
    t.buildAt(13, 4, 'musketeer'); // row 4, between the y 96 lane and the y 192 lane
    t.state().lives = 1000;
    t.startWave();
    const ys = new Set<number>();
    for (let i = 0; i < 2400 && t.state().phase === 'wave'; i++) {
      t.step(1);
      for (const shot of t.state().shots) if (shot.cell.col === 13 && shot.cell.row === 4) ys.add(Math.round(shot.to.y));
    }
    return { ys: [...ys].sort((a, b) => a - b), kills: t.state().towers[0].kills };
  });
  // Shots land on the first lane (y 96) and the leftward lane (y 192), and on the turn between them.
  expect(shots.ys).toContain(96);
  expect(shots.ys).toContain(192);
  expect(shots.kills).toBeGreaterThan(0);
});

test('Play again keeps the map; Menu shows it still selected; the best line names the map and only its own score', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tarpit.best', '{"v":1,"best":{"meadow":{"normal":12},"riverbend":{"easy":3}}}'));
  await openTitle(page);
  let u = await titleUi(page);
  expect(u.bestLine?.text).toBe(bestScoreText('meadow', 'normal', 12));
  expect(u.bestLine?.text).toContain(MAP_NAMES.meadow);
  // Riverbend on Normal has no score: no line, and Meadow's 12 is not shown.
  await click(page, 'title:map:riverbend');
  u = await titleUi(page);
  expect(u.bestLine).toBeNull();
  // Riverbend on Easy has 3; the line follows both selections.
  await click(page, 'title:easy');
  expect((await titleUi(page)).bestLine?.text).toBe('Best on Riverbend, Easy: 3 waves');
  await click(page, 'title:normal');
  expect(await api(page, (a) => [a.bestScore('normal'), a.bestScore('normal', 'riverbend'), a.bestScore('easy', 'riverbend'), a.bestScore('normal', 'switchback')])).toEqual([12, null, 3, null]);

  await click(page, 'title:play');
  await freshGame(page);
  expect((await state(page)).map.id).toBe('riverbend');
  // Lose quickly, then Play again: Riverbend again.
  const lose = () =>
    page.evaluate(() => {
      const a = window.__tarpit as TarpitTestApi;
      a.state().lives = 1;
      if (a.state().phase === 'setup') a.startWave();
      a.step(3000);
    });
  await lose();
  expect(await api(page, (a) => a.endScreen())).toBe('lost');
  await click(page, 'playAgain');
  await freshGame(page);
  expect((await state(page)).map.id).toBe('riverbend');
  expect((await api(page, (a) => a.ui())).map).toBe('riverbend');
  // Menu: the title has Riverbend and Normal selected.
  await lose();
  await click(page, 'menu');
  await waitForTitle(page);
  u = await titleUi(page);
  expect([u.map, u.difficulty, u.bestLine]).toEqual(['riverbend', 'normal', null]);
  // And Play starts Riverbend again.
  await click(page, 'title:play');
  await freshGame(page);
  expect((await state(page)).map.id).toBe('riverbend');
});

// Milestone 27 follow-up: a script with a plan for Meadow only refuses another map, loudly, and builds nothing.
test('runScript on Riverbend with a Meadow-only script reports the error and places nothing', async ({ page }) => {
  await openTitle(page);
  const r = await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame('normal', 'riverbend');
    let error = '';
    try {
      t.runScript('soundBuild');
    } catch (e) {
      error = (e as Error).message;
    }
    return { error, towers: t.state().towers.length, gold: t.state().gold, phase: t.state().phase, wave: t.state().wave };
  });
  expect(r).toEqual({ error: 'soundBuild has a script for Meadow only, not for riverbend', towers: 0, gold: 100, phase: 'setup', wave: 0 });
});
