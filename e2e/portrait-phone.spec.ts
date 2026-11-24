import { expect, test, type Page } from '@playwright/test';
import { bestScoreText } from '../src/game/names';
import { stripAimText } from '../src/game/ui/geometry';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { TitleUiState } from '../src/game/TitleScene';
import { GRID_COLS, GRID_ROWS, isBuildableTerrain } from '../src/sim/grid';
import { MAPS } from '../src/sim/map';
import type { TowerType } from '../src/sim/types';
import {
  api,
  cellPage,
  fingerFor,
  liftPage,
  openTitle,
  rectPage,
  rectPageSize,
  rects,
  startGame,
  state,
  tap,
  tapCell,
  touchDrag,
  touchHold,
  ui,
  worldPage,
  type Cell,
} from './phone';
import { waitForTitle } from './title';

// Milestone 32b, phone project (390 x 844 touch, portrait): the portrait
// layout end to end. Positions come from cellToPage(), worldToPage() and
// uiRects(); nothing is hard-coded.

const MAP = { x: 0, y: 76, width: 480, height: 960 }; // the portrait map's box on the canvas (layout.ts)
const insideMap = (r: { x: number; y: number; width: number; height: number }) =>
  r.x >= MAP.x && r.y >= MAP.y && r.x + r.width <= MAP.x + MAP.width && r.y + r.height <= MAP.y + MAP.height;

/** Meadow's buildable cells, and those beside the trail (a 4-neighbour is not buildable terrain). */
const meadow = MAPS.meadow;
const buildable = (c: Cell) => c.col >= 0 && c.row >= 0 && c.col < GRID_COLS && c.row < GRID_ROWS && isBuildableTerrain(c, meadow);
const besideTrail: Cell[] = [];
for (let col = 1; col < GRID_COLS - 1; col++) {
  for (let row = 1; row < GRID_ROWS - 1; row++) {
    const c = { col, row };
    if (buildable(c) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => !buildable({ col: col + dc, row: row + dr }))) besideTrail.push(c);
  }
}
const CORNERS: Cell[] = [
  { col: 0, row: 0 },
  { col: GRID_COLS - 1, row: 0 },
  { col: 0, row: GRID_ROWS - 1 },
  { col: GRID_COLS - 1, row: GRID_ROWS - 1 },
];

const richAndSafe = (page: Page) =>
  page.evaluate(() => {
    const s = (window.__tarpit as TarpitTestApi).state();
    s.gold = 5000;
    s.lives = 999;
  });

test('the title in portrait: pick a level and a map by tap, then Play', async ({ page }) => {
  await openTitle(page);
  expect(await page.evaluate(() => window.__tarpit!.layout())).toBe('portrait');
  expect(await page.evaluate(() => [window.__tarpit!.game.scale.gameSize.width, window.__tarpit!.game.scale.gameSize.height])).toEqual([480, 1194]);
  const names = Object.keys(await rects(page));
  expect(names.sort()).toEqual(['title:back', 'title:easy', 'title:hard', 'title:look:classic', 'title:look:painted', 'title:map:meadow', 'title:map:riverbend', 'title:map:switchback', 'title:mute', 'title:normal', 'title:play']);
  for (const n of names) {
    const r = (await rects(page))[n];
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(480);
    const size = await rectPageSize(page, n);
    expect(size.width, n).toBeGreaterThanOrEqual(44);
    expect(size.height, n).toBeGreaterThanOrEqual(44);
  }
  await tap(page, 'title:hard');
  await tap(page, 'title:map:riverbend');
  expect(await api(page, (a) => a.ui() as unknown as TitleUiState)).toMatchObject({ difficulty: 'hard', map: 'riverbend' });
  await tap(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'game');
  expect(await state(page)).toMatchObject({ difficulty: 'hard', gold: 80, lives: 15 });
  expect(await ui(page)).toMatchObject({ layout: 'portrait', map: 'riverbend' });
});

test('the best score shows on the portrait title', async ({ page }) => {
  await startGame(page);
  expect(await api(page, (a) => a.runScript('lazyBuild'))).toBe('lost');
  const best = await api(page, (a) => a.bestScore('normal', 'meadow'));
  expect(best).toBeGreaterThan(0);
  await tap(page, 'menu');
  await waitForTitle(page);
  const t = await api(page, (a) => a.ui() as unknown as TitleUiState);
  expect(t.bestLine?.text).toBe(bestScoreText('meadow', 'normal', best!));
  expect(t.bestLine!.rect.x).toBeGreaterThanOrEqual(0);
  expect(t.bestLine!.rect.x + t.bestLine!.rect.width).toBeLessThanOrEqual(480);
});

test('every control is at least 44 CSS px and sits under the map', async ({ page }) => {
  await startGame(page);
  const r = await rects(page);
  for (const n of ['startWave', 'speed', 'special', 'bar:musketeer', 'bar:cannon', 'bar:tarpit', 'bar:longbow', 'bar:mortar', 'bar:firepot']) {
    const size = await rectPageSize(page, n);
    expect(size.width, n).toBeGreaterThanOrEqual(44);
    expect(size.height, n).toBeGreaterThanOrEqual(44);
    expect(r[n].y, n).toBeGreaterThanOrEqual(MAP.y + MAP.height);
  }
});

test('drag each tower type from the bar with the lift: the four corners and cells beside the trail', async ({ page }) => {
  await startGame(page);
  await richAndSafe(page);
  const client = await page.context().newCDPSession(page);
  expect(besideTrail.length).toBeGreaterThan(10);
  const targets: [TowerType, Cell][] = [
    ['musketeer', CORNERS[0]],
    ['cannon', CORNERS[1]],
    ['tarpit', CORNERS[2]],
    ['longbow', CORNERS[3]],
    ['mortar', besideTrail[0]],
    ['firepot', besideTrail[besideTrail.length - 1]],
    ['musketeer', besideTrail[Math.floor(besideTrail.length / 2)]],
  ];
  for (const [type, cell] of targets) {
    expect(buildable(cell), `${cell.col},${cell.row}`).toBe(true);
    const from = await rectPage(page, `bar:${type}`);
    const finger = await fingerFor(page, cell);
    await touchDrag(page, client, from, finger, async () => {
      // The ghost aims DRAG_LIFT above the finger: up the screen, on the cell under it.
      expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: type, cell });
    });
    const s = await state(page);
    expect(s.towers.some((t) => t.cell.col === cell.col && t.cell.row === cell.row && t.type === type), `${type} at ${cell.col},${cell.row}`).toBe(true);
  }
  expect((await state(page)).towers).toHaveLength(targets.length);
});

test('tap-tap placement: the first tap arms the cell, the second builds', async ({ page }) => {
  await startGame(page);
  const cell = besideTrail[3];
  await tap(page, 'bar:cannon');
  expect((await ui(page)).pick).toBe('cannon');
  await tapCell(page, cell);
  expect(await ui(page)).toMatchObject({ armedCell: cell, isTouch: true });
  expect((await state(page)).towers).toHaveLength(0);
  await tapCell(page, cell);
  expect((await state(page)).towers).toEqual([expect.objectContaining({ cell, type: 'cannon' })]);
});

test('the tower panel: inside the map, upgrade, target, move by drag in setup, sell', async ({ page }) => {
  await startGame(page);
  await richAndSafe(page);
  const cell = besideTrail[5];
  await api(page, (a) => a.buildAt(0, 0, 'musketeer')); // a second tower, so the panel can cover one
  await page.evaluate(([c, r]) => (window.__tarpit as TarpitTestApi).buildAt(c, r, 'musketeer'), [cell.col, cell.row]);
  await tapCell(page, cell);
  expect(await ui(page)).toMatchObject({ panelOpen: true, selectedCell: cell });
  const r = await rects(page);
  for (const n of ['panel:upgrade', 'panel:sell', 'panel:target', 'panel:close']) {
    expect(insideMap(r[n]), n).toBe(true);
    const size = await rectPageSize(page, n);
    expect(size.height, n).toBeGreaterThanOrEqual(44);
  }
  await tap(page, 'panel:upgrade');
  expect((await state(page)).towers.find((t) => t.cell.col === cell.col && t.cell.row === cell.row)?.upgraded).toBe(true);
  expect((await ui(page)).upgradeLabel).toMatch(/^Undo upgrade/);
  const before = (await ui(page)).selectedTargeting;
  await tap(page, 'panel:target');
  expect((await ui(page)).selectedTargeting).not.toBe(before);
  await tap(page, 'panel:close');
  expect((await ui(page)).panelOpen).toBe(false);

  // Move in the planning phase: drag the tower to another cell beside the trail.
  const to = besideTrail[8];
  const client = await page.context().newCDPSession(page);
  await touchDrag(page, client, await cellPage(page, cell), await fingerFor(page, to), async () => {
    expect((await ui(page)).dragging).toMatchObject({ kind: 'move', from: cell, cell: to });
  });
  const moved = (await state(page)).towers.find((t) => t.cell.col === to.col && t.cell.row === to.row);
  expect(moved).toMatchObject({ type: 'musketeer', upgraded: true });

  await tapCell(page, to);
  expect((await ui(page)).sellLabel).toMatch(/^Remove/);
  await tap(page, 'panel:sell');
  expect((await state(page)).towers).toHaveLength(1);
});

test('Start Wave, a speed tap toggles 2x, a held speed press runs 3x', async ({ page }) => {
  await startGame(page);
  await tap(page, 'startWave');
  expect((await state(page)).phase).toBe('wave');
  await tap(page, 'speed');
  expect(await api(page, (a) => a.speed())).toBe(2);
  await tap(page, 'speed');
  expect(await api(page, (a) => a.speed())).toBe(1);
  const client = await page.context().newCDPSession(page);
  await touchHold(page, client, await rectPage(page, 'speed'), 600, async () => {
    expect(await api(page, (a) => a.speed())).toBe(3);
    expect((await api(page, (a) => a.hudText())).speed).toBe('3x');
  });
  expect(await api(page, (a) => a.speed())).toBe(1);
});

test('a special by tap, then by hold and release near each map edge', async ({ page }) => {
  await startGame(page);
  await richAndSafe(page);
  await tap(page, 'startWave');
  await api(page, (a) => a.step(60));
  const lastSpecial = () =>
    api(page, (a) => {
      const e = a.state().events.filter((x) => x.kind === 'special');
      return e.length ? (e[e.length - 1] as { x: number; y: number }) : null;
    });
  const recharge = () =>
    page.evaluate(() => {
      const t = window.__tarpit as TarpitTestApi;
      t.step(1);
      const s = t.state();
      s.specialCharges = 1;
      s.specialRechargeTicks = 0;
    });

  // A tap on the map fires where it lands.
  await tap(page, 'special');
  expect((await ui(page)).special.aiming).toBe('keg');
  const at = await worldPage(page, { x: 300, y: 200 });
  await page.touchscreen.tap(at.x, at.y);
  const hit = await lastSpecial();
  expect(hit!.x).toBeCloseTo(300, -0.5);
  expect(hit!.y).toBeCloseTo(200, -0.5);
  expect((await ui(page)).special.aiming).toBeNull();

  // A hold fires at the lifted point, DRAG_LIFT up the screen, near each edge
  // of the turned map: the top (world x 10), the bottom (world x 950: the
  // finger ends over the controls), the screen's left (world y 470) and right
  // (world y 10). The top one is held still; the others press on the map and
  // slide down until the lifted circle sits on the target (a press that
  // starts on the controls cancels aiming, as in landscape).
  const client = await page.context().newCDPSession(page);
  const lift = await liftPage(page);
  // 32b follow-up: the lift is 48 CSS px on the page in portrait.
  expect(lift).toBeCloseTo(48, 0);
  for (const [i, target] of [
    { x: 10, y: 240 },
    { x: 950, y: 240 },
    { x: 480, y: 470 },
    { x: 480, y: 10 },
  ].entries()) {
    const label = `${target.x},${target.y}`;
    await recharge();
    await tap(page, 'special');
    expect((await ui(page)).special.aiming, label).toBe('keg');
    const p = await worldPage(page, target);
    const finger = { x: p.x, y: p.y + lift };
    const during = async () => {
      expect((await ui(page)).special.holding, label).toBe(true);
    };
    if (i === 0) await touchHold(page, client, finger, 450, during);
    else await touchDrag(page, client, p, finger, during);
    const e = await lastSpecial();
    expect(Math.abs(e!.x - target.x), `x for ${target.x},${target.y}`).toBeLessThan(1.5);
    expect(Math.abs(e!.y - target.y), `y for ${target.x},${target.y}`).toBeLessThan(1.5);
  }
});

test('Call next: Start Wave reads "Call next" mid-wave and calls wave 2', async ({ page }) => {
  await startGame(page);
  await richAndSafe(page);
  await tap(page, 'startWave');
  for (let i = 0; i < 60 && !(await ui(page)).callEarly.available; i++) await api(page, (a) => a.step(60));
  expect((await ui(page)).callEarly.available).toBe(true);
  expect((await api(page, (a) => a.hudText())).startWave).toMatch(/^Call next/);
  await tap(page, 'startWave');
  expect((await state(page)).wave).toBe(2);
});

test('a full first wave with kills; enemies face down the screen on Meadow’s first stretch', async ({ page }) => {
  await startGame(page);
  // Towers away from the cave, so the first Goblins live long enough to be seen walking.
  for (const c of besideTrail.filter((b) => b.col >= 12).slice(0, 6)) await page.evaluate(([col, row]) => (window.__tarpit as TarpitTestApi).buildAt(col, row, 'musketeer'), [c.col, c.row]);
  await tap(page, 'startWave');
  await api(page, (a) => a.step(30));
  const first = await api(page, (a) => a.state().enemies[0]?.id ?? -1);
  expect(first).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate((id) => window.__tarpit!.animState(id)?.facing, first)).toBe('down');
  for (let i = 0; i < 200 && (await state(page)).phase === 'wave'; i++) await api(page, (a) => a.step(60));
  const s = await state(page);
  expect(s).toMatchObject({ phase: 'setup', wave: 1 });
  expect(s.towers.reduce((n, t) => n + (t.kills ?? 0), 0)).toBeGreaterThan(0);
});

test('the boss bar shows in portrait', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => a.runScript('comboBuild', 10));
  await api(page, (a) => a.startWave());
  for (let i = 0; i < 100 && (await api(page, (a) => a.hudText())).boss === null; i++) await api(page, (a) => a.step(60));
  expect((await api(page, (a) => a.hudText())).boss).toMatch(/^Assessor Grumblefoot \d+ \/ \d+$/);
});

test('win screen: Keep going; then Play again; lose screen: Menu', async ({ page }) => {
  await startGame(page);
  expect(await api(page, (a) => a.runScript('comboBuild'))).toBe('won');
  const r = await rects(page);
  for (const n of ['keepGoing', 'playAgain', 'menu']) {
    expect(insideMap(r[n]), n).toBe(true);
    const size = await rectPageSize(page, n);
    expect(size.height, n).toBeGreaterThanOrEqual(44);
  }
  await tap(page, 'keepGoing');
  expect(await api(page, (a) => a.endScreen())).toBeNull();
  expect((await state(page)).endless).toBe(true);

  await startGame(page);
  expect(await api(page, (a) => a.runScript('comboBuild'))).toBe('won');
  await tap(page, 'playAgain');
  await page.waitForFunction(() => (window.__tarpit as TarpitTestApi).state().wave === 0);
  expect(await api(page, (a) => a.endScreen())).toBeNull();

  expect(await api(page, (a) => a.runScript('lazyBuild'))).toBe('lost');
  expect(await api(page, (a) => a.endScreen())).toBe('lost');
  expect(Object.keys(await rects(page))).toEqual(expect.arrayContaining(['playAgain', 'menu']));
  await tap(page, 'playAgain');
  await page.waitForFunction(() => (window.__tarpit as TarpitTestApi).state().wave === 0);
  expect(await api(page, (a) => a.runScript('lazyBuild'))).toBe('lost');
  await tap(page, 'menu');
  await waitForTitle(page);
});

/** What must survive a layout switch. */
const snapshot = (page: Page) =>
  api(page, (a) => {
    const s = a.state();
    return {
      gold: s.gold,
      lives: s.lives,
      wave: s.wave,
      phase: s.phase,
      tick: s.tick,
      towers: s.towers.map((t) => `${t.type}@${t.cell.col},${t.cell.row}`),
      enemies: s.enemies.map((e) => `${e.id}:${e.distance}:${e.hp}`),
    };
  });

test('turning to landscape and back mid-wave keeps the game', async ({ page }) => {
  await startGame(page);
  for (const c of CORNERS.slice(0, 3)) await page.evaluate(([col, row]) => (window.__tarpit as TarpitTestApi).buildAt(col, row, 'cannon'), [c.col, c.row]);
  await tap(page, 'startWave');
  await api(page, (a) => a.step(400));
  const before = await snapshot(page);
  expect(before.enemies.length).toBeGreaterThan(0);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => (window.__tarpit as TarpitTestApi).ui().layout === 'landscape');
  expect(await page.evaluate(() => [window.__tarpit!.game.scale.gameSize.width, window.__tarpit!.game.scale.gameSize.height])).toEqual([960, 580]);
  expect(await snapshot(page)).toEqual(before); // test mode: no tick runs on its own, so the count must not move
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => (window.__tarpit as TarpitTestApi).ui().layout === 'portrait');
  expect(await snapshot(page)).toEqual(before);
  // And it plays on: one step is one tick.
  await api(page, (a) => a.step(1));
  expect((await snapshot(page)).tick).toBe(before.tick + 1);
});

test('a desktop window resized from wide to tall and back keeps the game', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 580 } });
  const page = await ctx.newPage();
  await startGame(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).buildAt(0, 0, 'mortar'));
  await api(page, (a) => a.startWave());
  await api(page, (a) => a.step(500));
  const before = await snapshot(page);
  expect((await ui(page)).layout).toBe('landscape');
  await page.setViewportSize({ width: 600, height: 900 });
  await page.waitForFunction(() => (window.__tarpit as TarpitTestApi).ui().layout === 'portrait');
  expect(await snapshot(page)).toEqual(before);
  await page.setViewportSize({ width: 960, height: 580 });
  await page.waitForFunction(() => (window.__tarpit as TarpitTestApi).ui().layout === 'landscape');
  expect(await snapshot(page)).toEqual(before);
  await ctx.close();
});

test('the live loop keeps ticking across a turn, with no jump in the tick count', async ({ page }) => {
  await page.goto('/?renderer=canvas');
  await waitForTitle(page);
  await tap(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
  await tap(page, 'startWave');
  const tick = () => page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { state: { tick: number } }).state.tick);
  await page.waitForTimeout(500);
  const t0 = await tick();
  const w0 = Date.now();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => window.__tarpit!.layout() === 'landscape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => window.__tarpit!.layout() === 'portrait');
  await page.waitForTimeout(300);
  const t1 = await tick();
  const elapsed = (Date.now() - w0) / 1000;
  expect(t1).toBeGreaterThan(t0);
  // At most what real time allows at 1x (60 a second, plus a frame of slack): nothing ran twice.
  expect(t1 - t0).toBeLessThanOrEqual(Math.ceil(elapsed * 60) + 5);
});

test('the gold cheat: five taps on the Gold readout in the strip', async ({ page }) => {
  await startGame(page);
  const gold = (await state(page)).gold;
  for (let i = 0; i < 5; i++) await tap(page, 'gold');
  expect((await state(page)).gold).toBe(gold + 500);
  expect((await api(page, (a) => a.hudText())).cheat).toBe('cheat used');
});

test('the drag ghost sits 48 CSS px above the finger in portrait (32b follow-up)', async ({ page }) => {
  await startGame(page);
  expect(await liftPage(page)).toBeCloseTo(48, 0);
  const client = await page.context().newCDPSession(page);
  const cell = besideTrail[4];
  const finger = await fingerFor(page, cell);
  const centre = await cellPage(page, cell);
  expect(finger.y - centre.y).toBeCloseTo(48, 0);
  await touchDrag(page, client, await rectPage(page, 'bar:musketeer'), finger, async () => {
    expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'musketeer', cell });
  });
  expect((await state(page)).towers).toEqual([expect.objectContaining({ cell, type: 'musketeer' })]);
});

test('aiming in portrait: the instruction replaces the preview in the strip, nothing over the map (32b follow-up)', async ({ page }) => {
  await startGame(page);
  await richAndSafe(page);
  const preview = (await api(page, (a) => a.hudText())).next;
  await tap(page, 'startWave');
  await api(page, (a) => a.step(30));
  await tap(page, 'special');
  const u = await ui(page);
  expect(u.special.aiming).toBe('keg');
  expect((await api(page, (a) => a.hudText())).next).toBe(stripAimText(u.special.banner!));
  const mapBanner = await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { bannerMain: { text: string } }).bannerMain.text);
  expect(mapBanner).toBe('');
  await tap(page, 'special'); // cancels
  expect((await ui(page)).special.aiming).toBeNull();
  expect((await api(page, (a) => a.hudText())).next).not.toBe(stripAimText(u.special.banner!));
  expect(preview).toMatch(/^Next: /);
});

test('a burst of ten alternating resizes ends in the window\'s shape with the game intact (32b follow-up)', async ({ page }) => {
  await startGame(page);
  for (const c of CORNERS.slice(0, 2)) await page.evaluate(([col, row]) => (window.__tarpit as TarpitTestApi).buildAt(col, row, 'cannon'), [c.col, c.row]);
  await tap(page, 'startWave');
  await api(page, (a) => a.step(200));
  const before = await snapshot(page);
  for (const end of ['landscape', 'portrait'] as const) {
    // Ten resizes with no wait between them; the last one is `end`.
    const sizes = Array.from({ length: 10 }, (_, i) => ((i % 2 === 0) === (end === 'portrait') ? [844, 390] : [390, 844]));
    for (const [w, h] of sizes) await page.setViewportSize({ width: w, height: h });
    const want = end === 'portrait' ? [520, 1194] : [960, 580];
    await page.waitForFunction((k) => {
      const t = window.__tarpit as TarpitTestApi;
      return t.scene() === 'game' && t.ui().layout === k;
    }, end);
    await page.waitForTimeout(150);
    expect((await ui(page)).layout).toBe(end);
    expect(await page.evaluate(() => [window.__tarpit!.game.scale.gameSize.width, window.__tarpit!.game.scale.gameSize.height])).toEqual(want);
    expect(await snapshot(page)).toEqual(before);
  }
});

// 32b follow-up: a layout switch in the same frame as a scene change. Exactly one scene runs afterwards, in
// the window's layout, with the right game.
const activeScenes = (page: Page) => page.evaluate(() => window.__tarpit!.game.scene.getScenes(true).map((x) => x.scene.key));
type Relayable = { relayout(): void };

test('switch edge: a relayout in the same frame as Play, Play again, Menu, Keep going, a loss and a win', async ({ page }) => {
  await openTitle(page);
  // Play on the title, then a switch: only a fresh game.
  await page.evaluate(() => {
    const t = window.__tarpit!.game.scene.getScene('title') as unknown as Relayable & { play(d: string, m: string): void };
    t.play('normal', 'meadow');
    t.relayout();
  });
  await page.waitForFunction(() => (window.__tarpit as TarpitTestApi).scene() === 'game');
  await page.waitForTimeout(200);
  expect(await activeScenes(page)).toEqual(['game']);
  expect(await ui(page)).toMatchObject({ layout: 'portrait' });
  expect((await state(page)).gold).toBe(100);

  /** The game scene's switch-related methods (test-only access). */
  type Game = Relayable & { playAgain(): void; toMenu(): void; continueEndless(): void };
  // A switch, then Play again; and Play again, then a switch: a fresh game either way.
  for (const relayoutFirst of [true, false]) {
    await page.evaluate((first) => {
      (window.__tarpit as TarpitTestApi).state().gold = 4321;
      const g = window.__tarpit!.game.scene.getScene('game') as unknown as Relayable & { playAgain(): void };
      if (first) g.relayout();
      g.playAgain();
      if (!first) g.relayout();
    }, relayoutFirst);
    await page.waitForTimeout(300);
    const order = relayoutFirst ? 'relayout, Play again' : 'Play again, relayout';
    expect(await activeScenes(page), order).toEqual(['game']);
    expect((await state(page)).gold, order).toBe(100);
    expect((await ui(page)).layout, order).toBe('portrait');
  }

  // Keep going, then a switch: the endless game is kept.
  expect(await api(page, (a) => a.runScript('comboBuild'))).toBe('won');
  const won = await state(page);
  await page.evaluate(() => {
    const g = window.__tarpit!.game.scene.getScene('game') as unknown as Game;
    g.continueEndless();
    g.relayout();
  });
  await page.waitForTimeout(300);
  expect(await activeScenes(page)).toEqual(['game']);
  expect(await state(page)).toMatchObject({ endless: true, wave: won.wave, gold: won.gold, lives: won.lives });
  expect(await api(page, (a) => a.endScreen())).toBeNull();

  // The losing tick, then a switch: the same lost game, its end screen up again.
  await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    if (t.state().phase === 'setup') t.startWave();
    t.state().lives = 0;
    t.step(1);
    (t.game.scene.getScene('game') as unknown as Relayable).relayout();
  });
  await page.waitForTimeout(300);
  expect(await activeScenes(page)).toEqual(['game']);
  expect(await api(page, (a) => a.endScreen())).toBe('lost');
  expect((await state(page)).endless).toBe(true);

  // The winning tick, then a switch: the won game and its end screen.
  await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as Game).playAgain());
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.runScript('comboBuild');
    (t.game.scene.getScene('game') as unknown as Relayable).relayout();
  });
  await page.waitForTimeout(300);
  expect(await activeScenes(page)).toEqual(['game']);
  expect(await api(page, (a) => a.endScreen())).toBe('won');
  expect((await state(page)).phase).toBe('won');

  // A switch, then Menu: only the title, in portrait.
  await page.evaluate(() => {
    const g = window.__tarpit!.game.scene.getScene('game') as unknown as Game;
    g.relayout();
    g.toMenu();
  });
  await waitForTitle(page);
  expect(await activeScenes(page)).toEqual(['title']);
  expect(await page.evaluate(() => window.__tarpit!.game.scale.gameSize.width)).toBe(480);
});
