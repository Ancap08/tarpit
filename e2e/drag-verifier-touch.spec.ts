import { expect, test, type CDPSession, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Verifier probes for milestone 25a, tablet project (the file name ends in
// touch.spec.ts, which playwright.config.ts TABLET_SPECS matches). Real
// touch drags through CDP Input.dispatchTouchEvent. The lift is written
// here as the spec's number, 48 canvas px, not imported from the code.

type Cell = { col: number; row: number };
type Point = { x: number; y: number };
const LIFT = 48;
const C75: Cell = { col: 7, row: 5 };
const C95: Cell = { col: 9, row: 5 };

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const toPage = (page: Page, p: Point) => page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [p.x, p.y]);
const centre = (c: Cell): Point => ({ x: c.col * 32 + 16, y: c.row * 32 + 16 });
const under = (p: Point): Cell => ({ col: Math.floor(p.x / 32), row: Math.floor(p.y / 32) });

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

async function barCentre(page: Page, type: string): Promise<Point> {
  const r = (await api(page, (a) => a.uiRects()))[`bar:${type}`];
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

class Finger {
  private at: Point = { x: 0, y: 0 };
  constructor(
    private readonly page: Page,
    private readonly client: CDPSession,
  ) {}
  async down(p: Point): Promise<void> {
    this.at = p;
    const q = await toPage(this.page, p);
    await this.client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: q.x, y: q.y }] });
  }
  /** Slide to canvas point `p` in `steps` moves. */
  async move(p: Point, steps = 8): Promise<void> {
    const a = await toPage(this.page, this.at);
    const b = await toPage(this.page, p);
    for (let i = 1; i <= steps; i++) {
      await this.client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }],
      });
    }
    this.at = p;
  }
  async up(): Promise<void> {
    await this.client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
}

const finger = async (page: Page) => new Finger(page, await page.context().newCDPSession(page));

test('(b) touch drag: the ghost cell is the cell under the point 48 canvas px above the finger', async ({ page }) => {
  await startGame(page);
  const f = await finger(page);
  await f.down(await barCentre(page, 'musketeer'));
  const probes: Point[] = [
    { x: 240, y: 224 }, // finger mid row 7, lifted point mid row 5
    { x: 240, y: 208.5 }, // lifted point just inside the top edge of row 5
    { x: 240, y: 207 }, // one px up: the lifted point crosses into row 4 while the finger is still in row 6
    { x: 255.5, y: 239.5 },
    { x: 256, y: 240 }, // crosses both a column and a row edge
    { x: 240, y: 49 }, // lifted point 1 px inside the top of the map (the page mapping rounds by a fraction of a px)
    { x: 240, y: 479 }, // the finger on the last map row: the drag aims at row 13
  ];
  for (const p of probes) {
    await f.move(p, 4);
    const want = under({ x: p.x, y: p.y - LIFT });
    const u = await ui(page);
    expect(u.dragging, JSON.stringify(p)).toEqual({ kind: 'place', tower: 'musketeer', cell: want });
    expect(u.hoverCell).toEqual(want);
  }
  expect(under({ x: 240, y: 207 - LIFT })).toEqual({ col: 7, row: 4 });
  expect(under({ x: 240, y: 207 })).toEqual({ col: 7, row: 6 });
  // The lifted point above the map: nothing aimed at.
  await f.move({ x: 240, y: 46 }, 4);
  expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'musketeer', cell: null });
  await f.move({ x: 240, y: 224 }, 4);
  await f.up();
  const s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, type: 'musketeer', locked: false })]);
  expect(s.gold).toBe(50);
});

test('(c) finger released over the HUD while the lifted point is over a buildable cell: cancelled', async ({ page }) => {
  await startGame(page);
  const f = await finger(page);
  // Finger at y 490 (the HUD starts at 480); 48 px above is y 442, cell (2,13), buildable grass.
  const hud = { x: 80, y: 490 };
  expect(await api(page, (a) => a.buildAt(2, 13, 'longbow').ok)).toBe(true);
  expect(await api(page, (a) => a.sellAt(2, 13))).toMatchObject({ ok: true, refund: 40 });
  await f.down(await barCentre(page, 'musketeer'));
  await f.move({ x: 80, y: 470 });
  expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'musketeer', cell: { col: 2, row: 13 } });
  await f.move(hud, 4);
  expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'musketeer', cell: null });
  await f.up();
  const s = await state(page);
  expect(s.towers).toEqual([]);
  expect(s.gold).toBe(100);
  expect(await ui(page)).toMatchObject({ dragging: null, pick: 'musketeer' });
});

test('(d) touch: an unlocked tower dragged onto another tower stays; a short slide is a tap that selects it', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => a.buildAt(7, 5, 'musketeer'));
  await api(page, (a) => a.buildAt(9, 5, 'longbow'));
  const before = await state(page);
  const f = await finger(page);
  await f.down(centre(C75));
  await f.move({ x: centre(C95).x, y: centre(C95).y + LIFT });
  expect((await ui(page)).dragging).toEqual({ kind: 'move', tower: 'musketeer', from: C75, cell: C95 });
  await f.up();
  expect((await state(page)).towers).toEqual(before.towers);
  expect((await ui(page)).dragging).toBeNull();

  // 5 canvas px of slide: not a drag; the tap selected the tower.
  await f.down(centre(C75));
  await f.move({ x: centre(C75).x + 5, y: centre(C75).y }, 2);
  expect((await ui(page)).dragging).toBeNull();
  await f.up();
  expect(await ui(page)).toMatchObject({ selectedCell: C75, panelOpen: true });
  expect((await state(page)).towers).toEqual(before.towers);
});

test('(h) two-tap placement still works', async ({ page }) => {
  await startGame(page);
  const tap = async (p: Point) => {
    const q = await toPage(page, p);
    await page.touchscreen.tap(q.x, q.y);
  };
  await tap(await barCentre(page, 'cannon'));
  expect((await ui(page)).pick).toBe('cannon');
  await tap(centre(C75));
  expect(await ui(page)).toMatchObject({ armedCell: C75, dragging: null });
  expect((await state(page)).towers).toEqual([]);
  await tap(centre(C75));
  const s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, type: 'cannon', locked: false, unlockedSpend: 80 })]);
  expect(s.gold).toBe(20);
});

test('(i) touch, during a wave: a bar drag builds a locked tower; a tower does not drag', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => a.startWave());
  const f = await finger(page);
  await f.down(await barCentre(page, 'musketeer'));
  await f.move({ x: centre(C75).x, y: centre(C75).y + LIFT });
  await f.up();
  expect((await state(page)).towers).toEqual([expect.objectContaining({ cell: C75, locked: true, unlockedSpend: 0 })]);
  await f.down(centre(C75));
  await f.move({ x: centre(C95).x, y: centre(C95).y + LIFT });
  expect((await ui(page)).dragging).toBeNull();
  await f.up();
  const s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75 })]);
  expect(s.gold).toBe(50);
});
