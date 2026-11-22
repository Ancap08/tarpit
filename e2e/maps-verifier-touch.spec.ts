import { expect, test, type CDPSession, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import { DRAG_LIFT } from '../src/game/input';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { TitleUiState } from '../src/game/TitleScene';
import { buildableCells } from '../src/sim/grid';
import { MAPS, type MapId } from '../src/sim/map';
import type { TowerType } from '../src/sim/types';
import { waitForTitle } from './title';

// Milestone 27, independent verifier (Claude Fable), tablet project (1024 x
// 768, touch): touch drags onto cells at every edge of the new maps (the
// 48 px lift at the top row, the bottom row with the finger over the HUD),
// tap-tap placement beside the river, the panel for a bottom-row tower,
// special aim by touch over the water and the bottom row, and the title's
// thumbnails at tablet size. With VERIFIER_SHOTS set to a folder, frames
// are written there for a person to look at.

type Cell = { col: number; row: number };
type Point = { x: number; y: number };
const NEW_MAPS = ['switchback', 'riverbend'] as const;
const shots = process.env.VERIFIER_SHOTS;

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const toPage = (page: Page, p: Point) => page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [p.x, p.y]);
const centre = (c: Cell): Point => ({ x: c.col * 32 + 16, y: c.row * 32 + 16 });

function watchErrors(page: Page): string[] {
  const seen: string[] = [];
  page.on('pageerror', (e) => seen.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') seen.push(`console: ${m.text()}`);
  });
  return seen;
}

async function start(page: Page, map: MapId, gold = 100): Promise<void> {
  await page.goto('/?test=1');
  await waitForTitle(page);
  await page.evaluate(
    async ({ m, g }) => {
      const t = window.__tarpit as TarpitTestApi;
      await t.startGame('normal', m);
      t.state().gold = g;
      t.step(1);
    },
    { m: map, g: gold },
  );
}

async function rectCentre(page: Page, name: string): Promise<Point> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

async function tapAt(page: Page, p: Point): Promise<void> {
  const q = await toPage(page, p);
  await page.touchscreen.tap(q.x, q.y);
}

async function tap(page: Page, name: string): Promise<void> {
  await tapAt(page, await rectCentre(page, name));
}

/** A real touch drag between canvas points; `during` runs with the finger still down at `to`. */
async function touchDrag(page: Page, client: CDPSession, from: Point, to: Point, during?: () => Promise<void>, steps = 8): Promise<void> {
  const a = await toPage(page, from);
  const b = await toPage(page, to);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= steps; i++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }] });
  }
  if (during) await during();
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** The four corners and the middle buildable cell of each side, without repeats. */
function edgeCells(map: MapId): Cell[] {
  const mask = buildableCells(MAPS[map]);
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  const line = (cells: Cell[]) => {
    const good = cells.filter((c) => mask[c.row * 30 + c.col]);
    return [good[0], good[Math.floor(good.length / 2)], good[good.length - 1]];
  };
  const all = [
    ...line(range(30).map((col) => ({ col, row: 0 }))),
    ...line(range(30).map((col) => ({ col, row: 14 }))),
    ...line(range(15).map((row) => ({ col: 0, row }))),
    ...line(range(15).map((row) => ({ col: 29, row }))),
  ];
  return all.filter((c, i) => all.findIndex((o) => o.col === c.col && o.row === c.row) === i);
}

/** Cells right beside the path or the river on each new map (checked buildable below). */
const BESIDE: Record<(typeof NEW_MAPS)[number], Cell[]> = {
  switchback: [{ col: 13, row: 4 }, { col: 14, row: 7 }, { col: 8, row: 7 }, { col: 19, row: 10 }, { col: 27, row: 10 }, { col: 5, row: 1 }],
  riverbend: [{ col: 12, row: 5 }, { col: 17, row: 13 }, { col: 14, row: 4 }, { col: 12, row: 14 }, { col: 27, row: 10 }, { col: 7, row: 10 }, { col: 11, row: 4 }],
};

for (const map of NEW_MAPS) {
  test(`${map} by touch: a drag lifts the ghost 48 px and places on every edge and beside the path${map === 'riverbend' ? ' and the river' : ''}`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, map, 100000);
    const client = await page.context().newCDPSession(page);
    const bar = await rectCentre(page, 'bar:longbow');
    const cells = [...edgeCells(map), ...BESIDE[map]];
    expect(edgeCells(map)).toHaveLength(8);
    for (const c of BESIDE[map]) expect(buildableCells(MAPS[map])[c.row * 30 + c.col], JSON.stringify(c)).toBe(true);
    let n = 0;
    for (const cell of cells) {
      const finger = { x: centre(cell).x, y: centre(cell).y + DRAG_LIFT };
      // A bottom-row cell puts the finger at y 512, over the HUD's top row; the top row puts it at y 64.
      if (cell.row === 14) expect(finger.y).toBeGreaterThan(480);
      await touchDrag(page, client, bar, finger, async () => {
        const u = await ui(page);
        expect(u.isTouch).toBe(true);
        expect(u.dragging, JSON.stringify(cell)).toEqual({ kind: 'place', tower: 'longbow', cell });
      });
      n += 1;
      const towers = (await state(page)).towers.map((t) => t.cell);
      expect(towers, `placed ${JSON.stringify(cell)}`).toContainEqual(cell);
      expect(towers).toHaveLength(n);
    }
    const s = await state(page);
    expect(s.gold).toBe(100000 - 40 * n);
    expect(s.phase).toBe('setup'); // a finger over the HUD pressed no button (Start Wave, speed, Special)
    expect(await api(page, (a) => a.speed())).toBe(1);
    expect(errors).toEqual([]);
  });

  test(`${map} by touch: a drag released with the aim on the path, the cave or the cottage places nothing`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, map, 1000);
    const client = await page.context().newCDPSession(page);
    const bar = await rectCentre(page, 'bar:musketeer');
    const m = MAPS[map];
    const cottage = m.landmarks![0];
    const aims: Point[] = [
      { x: m.path[0].x + 12, y: m.path[0].y },
      { x: cottage.x + cottage.width / 2, y: cottage.y + cottage.height / 2 },
      ...m.path.slice(1).map((p, i) => ({ x: (p.x + m.path[i].x) / 2, y: (p.y + m.path[i].y) / 2 })),
      ...(map === 'riverbend' ? [{ x: 480, y: 320 }, { x: 480, y: 470 }, { x: 420, y: 164 }] : []),
    ];
    for (const aim of aims) {
      await touchDrag(page, client, bar, { x: aim.x, y: aim.y + DRAG_LIFT });
      expect((await state(page)).towers, JSON.stringify(aim)).toEqual([]);
    }
    expect((await state(page)).gold).toBe(1000);
    expect(errors).toEqual([]);
  });

  test(`${map} by touch: a bottom-row tower is tapped open, its panel is inside the map, and its Sell button works`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, map, 100000);
    const mask = buildableCells(MAPS[map]);
    const bottom = Array.from({ length: 30 }, (_, col) => ({ col, row: 14 })).filter((c) => mask[c.row * 30 + c.col]);
    const cells = [bottom[0], bottom[Math.floor(bottom.length / 2)], bottom[bottom.length - 1], { col: 29, row: 0 }, { col: 0, row: 0 }, { col: 27, row: 10 }];
    for (const cell of cells) {
      // Tap-tap placement: pick on the bar, tap the cell (arms it), tap again (builds).
      await tap(page, 'bar:mortar');
      await tapAt(page, centre(cell));
      expect((await ui(page)).armedCell, JSON.stringify(cell)).toEqual(cell);
      await tapAt(page, centre(cell));
      expect((await state(page)).towers.map((t) => t.cell)).toEqual([cell]);
      if ((await ui(page)).pick !== null) await tap(page, 'bar:mortar');
      await tapAt(page, centre(cell));
      const u = await ui(page);
      expect(u.panelOpen, JSON.stringify(cell)).toBe(true);
      expect(u.selectedCell).toEqual(cell);
      const all = await rects(page);
      const names = Object.keys(all).filter((n) => n.startsWith('panel:'));
      expect(names.length).toBeGreaterThanOrEqual(3);
      for (const n of names) {
        const r = all[n];
        expect(r.x >= 0 && r.y >= 0 && r.x + r.width <= 960 && r.y + r.height <= 480, `${n} for ${JSON.stringify(cell)}: ${JSON.stringify(r)}`).toBe(true);
        expect(r.height * (1024 / 960), `${n} is a touch target`).toBeGreaterThanOrEqual(40);
      }
      if (shots && cell === cells[0]) await page.screenshot({ path: `${shots}/tablet-${map}-bottom-row-panel.png` });
      await tap(page, 'panel:sell');
      expect((await state(page)).towers, `sell ${JSON.stringify(cell)}`).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}

test('Riverbend by touch: tap-tap on the river arms nothing and builds nothing; the bank cell beside it builds', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page, 'riverbend', 1000);
  await tap(page, 'bar:longbow');
  for (const river of [{ col: 13, row: 8 }, { col: 16, row: 14 }, { col: 13, row: 5 }]) {
    await tapAt(page, centre(river));
    expect((await ui(page)).armedCell, JSON.stringify(river)).toBeNull();
    await tapAt(page, centre(river));
    expect((await state(page)).towers).toEqual([]);
  }
  expect((await ui(page)).pick).toBe('longbow');
  const bank = { col: 12, row: 8 };
  await tapAt(page, centre(bank));
  expect((await ui(page)).armedCell).toEqual(bank);
  await tapAt(page, centre(bank));
  expect((await state(page)).towers.map((t) => t.cell)).toEqual([bank]);
  expect(errors).toEqual([]);
});

// Milestone 30: a tap fires at once (no second tap); the bottom row is reached by a tap.
test('Riverbend by touch: a special tapped over the water and one tapped in the bottom row fire there', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page, 'riverbend');
  await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.state().lives = 1000;
    t.startWave();
    t.step(300);
  });
  const special = () => api(page, (a) => a.events().find((e) => e.kind === 'special'));
  // A tap in the middle of the river fires there.
  await tap(page, 'special');
  expect((await ui(page)).special.aiming).toBe('keg');
  await tapAt(page, { x: 480, y: 320 });
  let ev = await special();
  if (ev?.kind !== 'special') throw new Error('no special event');
  expect(Math.abs(ev.x - 480)).toBeLessThanOrEqual(1);
  expect(Math.abs(ev.y - 320)).toBeLessThanOrEqual(1);
  expect((await ui(page)).special.charges).toBe(0);

  // The bottom row over the river (y 472), after the recharge.
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).step(1200));
  expect((await ui(page)).special.ready).toBe(true);
  await tap(page, 'special');
  await tapAt(page, { x: 500, y: 472 });
  ev = await special();
  if (ev?.kind !== 'special') throw new Error('no special event');
  expect(Math.abs(ev.x - 500)).toBeLessThanOrEqual(1);
  expect(Math.abs(ev.y - 472)).toBeLessThanOrEqual(1);
  const s = await state(page);
  expect(s.phase).toBe('wave');
  expect(s.towers).toEqual([]);
  expect(errors).toEqual([]);
});

test('title at tablet size: the thumbnails are touch targets, apart, inside the screen, and each tap selects its map', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem('tarpit.best', '{"v":1,"best":{"switchback":{"normal":999}}}'));
  await page.goto('/?test=1');
  await waitForTitle(page);
  const r = await rects(page);
  const boxes: { x: number; y: number; right: number; bottom: number }[] = [];
  for (const id of ['meadow', 'switchback', 'riverbend'] as const) {
    const b = r[`title:map:${id}`];
    const a = await toPage(page, { x: b.x, y: b.y });
    const z = await toPage(page, { x: b.x + b.width, y: b.y + b.height });
    boxes.push({ x: a.x, y: a.y, right: z.x, bottom: z.y });
  }
  for (const b of boxes) {
    expect(b.bottom - b.y).toBeGreaterThanOrEqual(42);
    expect(b.right - b.x).toBeGreaterThanOrEqual(42);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(1024);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.bottom).toBeLessThanOrEqual(768);
  }
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].x - boxes[i - 1].right).toBeGreaterThanOrEqual(8);
  const title = () => page.evaluate(() => (window.__tarpit as TarpitTestApi).ui<TitleUiState>());
  for (const id of ['riverbend', 'switchback', 'meadow', 'switchback'] as const) {
    await tap(page, `title:map:${id}`);
    expect((await title()).map).toBe(id);
    expect(await api(page, (a) => a.scene())).toBe('title');
  }
  const u = await title();
  expect(u.bestLine?.text).toBe('Best on Switchback, Normal: 999 waves');
  const play = r['title:play'];
  expect(u.bestLine!.rect.y + u.bestLine!.rect.height).toBeLessThanOrEqual(play.y);
  // Milestone 27 follow-up: the best line clear of the thumbnails too, and the longer prompt inside the screen.
  const rowBottom = r['title:map:meadow'].y + r['title:map:meadow'].height;
  expect(u.bestLine!.rect.y - rowBottom).toBeGreaterThanOrEqual(8);
  const prompt = await page.evaluate(() => {
    const scene = (window.__tarpit as TarpitTestApi).game.scene.getScene('title');
    const t = scene.children.list.find((o) => o.type === 'Text' && (o as Phaser.GameObjects.Text).text.includes('press Play')) as Phaser.GameObjects.Text;
    const b = t.getBounds();
    const a = window.__tarpit!.canvasToPage(b.x, b.y);
    const z = window.__tarpit!.canvasToPage(b.right, b.bottom);
    return { text: t.text, left: a.x, right: z.x, bottom: z.y };
  });
  expect(prompt.text).toBe('Pick a difficulty and a map, then press Play');
  expect(prompt.left).toBeGreaterThanOrEqual(16);
  expect(prompt.right).toBeLessThanOrEqual(1008);
  expect(prompt.bottom).toBeLessThanOrEqual(768);
  if (shots) await page.screenshot({ path: `${shots}/tablet-title.png` });
  expect(errors).toEqual([]);
});

// Frames for a person to look at (not compared with anything).
const FRAMES: Record<(typeof NEW_MAPS)[number], { towers: [TowerType, number, number][]; steps: number }> = {
  switchback: { towers: [['musketeer', 13, 7], ['cannon', 21, 10]], steps: 1230 },
  riverbend: { towers: [['musketeer', 17, 6], ['cannon', 22, 10]], steps: 1440 },
};
for (const map of NEW_MAPS) {
  test(`frames for a person: ${map} at tablet size, wave 0, mid wave 2 and the combo build in wave 7`, async ({ page }) => {
    test.skip(!shots, 'set VERIFIER_SHOTS to a folder to write frames');
    test.setTimeout(60_000);
    await start(page, map);
    await page.screenshot({ path: `${shots}/tablet-${map}-wave0.png` });
    await page.evaluate(
      ({ towers, steps }) => {
        const t = window.__tarpit as TarpitTestApi;
        t.state().gold = 1000;
        for (const [type, col, row] of towers) t.buildAt(col, row, type);
        t.state().wave = 1;
        t.startWave();
        t.step(steps);
      },
      FRAMES[map],
    );
    await page.screenshot({ path: `${shots}/tablet-${map}-midwave.png` });
    await page.goto('/?test=1');
    await waitForTitle(page);
    await page.evaluate(async (m) => {
      const t = window.__tarpit as TarpitTestApi;
      await t.startGame('normal', m);
      t.runScript('comboBuild', 7);
      t.startWave();
      t.step(1500);
    }, map);
    await page.screenshot({ path: `${shots}/tablet-${map}-combo-wave7.png` });
  });
}
