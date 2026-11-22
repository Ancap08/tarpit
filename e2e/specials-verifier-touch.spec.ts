import { expect, test, type CDPSession, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { GameEvent } from '../src/sim';

// Verifier probes for milestone 25b (Claude Fable 5.2), tablet project (the
// file name ends in touch.spec.ts). Real touches through CDP
// Input.dispatchTouchEvent; canvas points are mapped with canvasToPage().
// The spec's numbers are written out: lift 48 canvas px, second-tap slop
// 24 px, map 960x480.

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
const LIFT = 48;

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const specials = async (page: Page) => (await api(page, (a) => a.events())).filter((e: GameEvent) => e.kind === 'special');
const toPage = (page: Page, p: Point) => page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [p.x, p.y]);
const mid = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const near = (a: Point, b: Point) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;

async function inWave(page: Page, wave = 1): Promise<CDPSession> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(async (w) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.state().wave = w - 1;
    t.state().gold = 1000;
    t.startWave();
    t.step(120);
  }, wave);
  return page.context().newCDPSession(page);
}

async function tap(page: Page, p: Point): Promise<void> {
  const q = await toPage(page, p);
  await page.touchscreen.tap(q.x, q.y);
}

/** Several fingers at once: the touch list is sent whole on every event. */
class Fingers {
  private points: (Point | null)[] = [];
  constructor(
    private readonly page: Page,
    private readonly client: CDPSession,
  ) {}
  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd'): Promise<void> {
    const touchPoints = [];
    for (let id = 0; id < this.points.length; id++) {
      const p = this.points[id];
      if (p !== null) touchPoints.push({ ...(await toPage(this.page, p)), id });
    }
    await this.client.send('Input.dispatchTouchEvent', { type, touchPoints });
  }
  async down(id: number, p: Point): Promise<void> {
    this.points[id] = p;
    await this.send('touchStart');
  }
  async move(id: number, to: Point, steps = 8): Promise<void> {
    const from = this.points[id]!;
    for (let i = 1; i <= steps; i++) {
      this.points[id] = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
      await this.send('touchMove');
    }
  }
  /** CDP releases the points listed in a touchEnd (an empty list releases all). */
  async up(id: number): Promise<void> {
    const p = this.points[id]!;
    this.points[id] = null;
    const last = this.points.every((q) => q === null);
    await this.client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: last ? [] : [{ ...(await toPage(this.page, p)), id }] });
  }
}

test('(h) two-tap: a second tap 20 px away fires at the FIRST tap point; one 40 px away re-aims instead', async ({ page }) => {
  await inWave(page);
  await tap(page, mid((await rects(page)).special));
  expect((await ui(page)).special).toMatchObject({ aiming: 'keg', aimPoint: null });
  const first = { x: 500, y: 300 };
  await tap(page, first);
  expect(near((await ui(page)).special.aimPoint!, first)).toBe(true);
  // 40 px away (outside the 24 px slop): the circle moves there, nothing fires.
  const second = { x: 540, y: 300 };
  await tap(page, second);
  let u = await ui(page);
  expect(u.special.aiming).toBe('keg');
  expect(near(u.special.aimPoint!, second)).toBe(true);
  expect(await specials(page)).toEqual([]);
  expect((await state(page)).specialCharges).toBe(1);
  // 20 px from the placed circle (12 across, 16 down): fires at the circle, not at the finger.
  const placed = u.special.aimPoint!;
  await tap(page, { x: 552, y: 316 });
  const ev = await specials(page);
  expect(ev).toHaveLength(1);
  expect(ev[0]).toMatchObject({ type: 'keg', x: placed.x, y: placed.y, radius: 70 });
  u = await ui(page);
  expect(u.special).toMatchObject({ charges: 0, aiming: null, aimPoint: null });
  // No tower pick, armed cell or panel came out of those taps.
  expect(u).toMatchObject({ pick: null, armedCell: null, panelOpen: false });
});

test('(h) a tap 26 px from the placed circle re-aims (just outside the slop)', async ({ page }) => {
  await inWave(page);
  await tap(page, mid((await rects(page)).special));
  await tap(page, { x: 300, y: 300 });
  await tap(page, { x: 300, y: 326.5 });
  const u = await ui(page);
  expect(u.special.aiming).toBe('keg');
  expect(Math.abs(u.special.aimPoint!.y - 326.5)).toBeLessThanOrEqual(1);
  expect(await specials(page)).toEqual([]);
});

test('(h) drag: fires on release at the point 48 px above the finger, once', async ({ page }) => {
  const client = await inWave(page);
  const f = new Fingers(page, client);
  await tap(page, mid((await rects(page)).special));
  await f.down(0, { x: 200, y: 200 });
  await f.move(0, { x: 640, y: 348 });
  const u = await ui(page);
  expect(near(u.special.aimPoint!, { x: 640, y: 348 - LIFT })).toBe(true);
  expect(await specials(page)).toEqual([]);
  await f.up(0);
  const ev = await specials(page);
  expect(ev).toHaveLength(1);
  expect(near(ev[0] as unknown as Point, { x: 640, y: 300 })).toBe(true);
  expect((await ui(page)).special).toMatchObject({ charges: 0, aiming: null });
});

test('(h) released with the finger on the speed button: fires on the map 48 px above, the speed stays 1x', async ({ page }) => {
  const client = await inWave(page);
  const f = new Fingers(page, client);
  const r = await rects(page);
  await tap(page, mid(r.special));
  const finger = mid(r.speed);
  await f.down(0, { x: 700, y: 300 });
  await f.move(0, finger);
  await f.up(0);
  const ev = await specials(page);
  expect(ev).toHaveLength(1);
  expect(near(ev[0] as unknown as Point, { x: finger.x, y: finger.y - LIFT })).toBe(true);
  expect((ev[0] as unknown as Point).y).toBeLessThan(480);
  expect(await api(page, (a) => a.speed())).toBe(1);
});

test('(h) released with the finger on a build bar button (aim below the map): nothing fires, nothing is picked, still aiming', async ({ page }) => {
  const client = await inWave(page);
  const f = new Fingers(page, client);
  const r = await rects(page);
  await tap(page, mid(r.special));
  const finger = mid(r['bar:longbow']);
  expect(finger.y - LIFT).toBeGreaterThan(480);
  await f.down(0, { x: 300, y: 300 });
  await f.move(0, finger);
  expect((await ui(page)).special.aimPoint).toBeNull();
  await f.up(0);
  expect(await specials(page)).toEqual([]);
  const u = await ui(page);
  expect(u.pick).toBeNull();
  expect(u.special).toMatchObject({ aiming: 'keg', charges: 1, aimPoint: null });
  expect((await state(page)).towers).toEqual([]);
});

test('(i) a bar drag started while aiming cancels the aim and builds; no special fires', async ({ page }) => {
  const client = await inWave(page);
  const f = new Fingers(page, client);
  const r = await rects(page);
  await tap(page, mid(r.special));
  await tap(page, { x: 500, y: 300 });
  expect((await ui(page)).special.aiming).toBe('keg');
  await f.down(0, mid(r['bar:longbow']));
  expect((await ui(page)).special.aiming).toBeNull();
  await f.move(0, { x: 7 * 32 + 16, y: 5 * 32 + 16 + LIFT });
  expect((await ui(page)).dragging).toMatchObject({ kind: 'place', tower: 'longbow', cell: { col: 7, row: 5 } });
  await f.up(0);
  const s = await state(page);
  expect(s.towers.map((t) => [t.type, t.cell.col, t.cell.row])).toEqual([['longbow', 7, 5]]);
  expect(s.specialCharges).toBe(1);
  expect(await specials(page)).toEqual([]);
});

// Two fingers: the scene follows one touch pointer, so a second finger is
// ignored while the first is down.
test('(i) during a tower drag a second finger on the Special button starts no aiming and the drag still builds', async ({ page }) => {
  const client = await inWave(page);
  const f = new Fingers(page, client);
  const r = await rects(page);
  await f.down(0, mid(r['bar:longbow']));
  await f.move(0, { x: 7 * 32 + 16, y: 5 * 32 + 16 + LIFT });
  expect((await ui(page)).dragging).toMatchObject({ kind: 'place', cell: { col: 7, row: 5 } });
  await f.down(1, mid(r.special));
  await f.up(1);
  const u = await ui(page);
  expect(u.special).toMatchObject({ aiming: null, menuOpen: false, charges: 1 });
  expect(u.dragging).toMatchObject({ kind: 'place', cell: { col: 7, row: 5 } });
  await f.up(0);
  const s = await state(page);
  expect(s.towers.map((t) => [t.type, t.cell.col, t.cell.row])).toEqual([['longbow', 7, 5]]);
  expect(s.specialCharges).toBe(1);
  expect(await specials(page)).toEqual([]);
});

test('(i) during an aim drag a second finger on the build bar picks nothing and the release still fires once', async ({ page }) => {
  const client = await inWave(page);
  const f = new Fingers(page, client);
  const r = await rects(page);
  await tap(page, mid(r.special));
  await f.down(0, { x: 300, y: 300 });
  await f.move(0, { x: 500, y: 348 });
  await f.down(1, mid(r['bar:longbow']));
  await f.up(1);
  const u = await ui(page);
  expect(u.pick).toBeNull();
  expect(u.special.aiming).toBe('keg');
  expect(near(u.special.aimPoint!, { x: 500, y: 300 })).toBe(true);
  await f.up(0);
  const ev = await specials(page);
  expect(ev).toHaveLength(1);
  expect(near(ev[0] as unknown as Point, { x: 500, y: 300 })).toBe(true);
  expect((await state(page)).towers).toEqual([]);
});

test('(b, touch) a tap on Special while aiming cancels; a tap on the popup choice aims it; the charge stays', async ({ page }) => {
  await inWave(page, 7);
  const special = mid((await rects(page)).special);
  await tap(page, special);
  expect((await ui(page)).special.menuOpen).toBe(true);
  const r = await rects(page);
  await tap(page, mid(r['special:fireArrows']));
  expect((await ui(page)).special).toMatchObject({ menuOpen: false, aiming: 'fireArrows', aimPoint: null });
  await tap(page, special);
  expect((await ui(page)).special).toMatchObject({ menuOpen: false, aiming: null, charges: 1 });
  expect(await specials(page)).toEqual([]);
});

test('(j) row 1 buttons and the popup buttons are at least 44 CSS px tall on the tablet', async ({ page }) => {
  await inWave(page, 7);
  await tap(page, mid((await rects(page)).special));
  const r = await rects(page);
  const names = ['special', 'startWave', 'speed', 'special:keg', 'special:tarBarrel', 'special:fireArrows'];
  for (const name of names) {
    const b = r[name];
    expect(b, name).toBeTruthy();
    const a = await toPage(page, { x: b.x, y: b.y });
    const c = await toPage(page, { x: b.x + b.width, y: b.y + b.height });
    expect(c.y - a.y, `${name} height in CSS px`).toBeGreaterThanOrEqual(44);
    expect(c.x - a.x, `${name} width in CSS px`).toBeGreaterThanOrEqual(44);
  }
});
