import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { MAP_IDS } from '../src/sim/map';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { cellPage, fingerFor, liftPage, rectPage, startGame, state, tap, touchDrag, ui, worldPage, type Point } from './phone';
import { snapCases } from './snapCases';
import { waitForTitle } from './title';

// Milestone 35, phone project (390 x 844 touch, portrait): the page lock and
// its self-recovery, snap to the nearest valid cell, the drag magnifier and
// nearest-tower selection. Every map point goes through the cellToPage()
// and worldToPage() hooks (phone.ts).

const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));

/** The game scene's camera and display-list counts (no camera or object may outlive the magnifier). */
const sceneCounts = (page: Page) =>
  page.evaluate(() => {
    const s = (window.__tarpit as TarpitTestApi).game.scene.getScene('game');
    return { cameras: s.cameras.cameras.length, children: s.children.length };
  });

async function touchStart(client: CDPSession, p: Point): Promise<void> {
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
}
async function touchMoveTo(client: CDPSession, from: Point, to: Point, steps = 8): Promise<void> {
  for (let i = 1; i <= steps; i++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }] });
  }
}
const touchEnd = (client: CDPSession) => client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

/** The canvas's centre against the centre of its #game box (CSS px). */
const centring = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('#game canvas')!.getBoundingClientRect();
    const g = document.getElementById('game')!.getBoundingClientRect();
    return { dx: c.left + c.width / 2 - (g.left + g.width / 2), dy: c.top + c.height / 2 - (g.top + g.height / 2), fits: c.width <= g.width + 1 && c.height <= g.height + 1 };
  });

const scrolls = (page: Page) =>
  page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
    top: document.scrollingElement?.scrollTop ?? 0,
    vvLeft: window.visualViewport?.offsetLeft ?? 0,
    vvTop: window.visualViewport?.offsetTop ?? 0,
    scale: window.visualViewport?.scale ?? 1,
  }));

test.describe('page lock', () => {
  test('touch-action none and no selection on html, body and #game; the document cannot scroll', async ({ page }) => {
    await startGame(page);
    const css = await page.evaluate(() =>
      ['html', 'body', '#game', '#game canvas'].map((sel) => {
        const s = getComputedStyle(document.querySelector(sel)!);
        return { sel, touch: s.touchAction, select: s.userSelect || s.webkitUserSelect, overflow: s.overflow, overscroll: s.overscrollBehavior };
      }),
    );
    for (const c of css) {
      expect(c.touch, c.sel).toBe('none');
      expect(c.select, c.sel).toBe('none');
    }
    expect(css[0]).toMatchObject({ overflow: 'hidden', overscroll: 'none' });
    expect(css[1]).toMatchObject({ overflow: 'hidden', overscroll: 'none' });
    const fixed = await page.evaluate(() => [getComputedStyle(document.documentElement).position, getComputedStyle(document.body).position]);
    expect(fixed).toEqual(['fixed', 'fixed']);
    // Focusing and scrolling by script leave the page at the origin.
    await page.evaluate(() => {
      document.querySelector('canvas')!.focus();
      window.scrollTo(50, 200);
      document.documentElement.scrollTop = 120;
    });
    await page.waitForTimeout(250);
    expect(await scrolls(page)).toMatchObject({ x: 0, y: 0, top: 0 });
  });

  test('gesture events, two-finger moves, side-bar moves and dblclick are prevented; one-finger canvas moves are not', async ({ page }) => {
    await startGame(page);
    const r = await page.evaluate(() => {
      const fire = (target: EventTarget, e: Event) => {
        target.dispatchEvent(e);
        return e.defaultPrevented;
      };
      const canvas = document.querySelector('canvas')!;
      const touch = (id: number, target: Element, x: number) => new Touch({ identifier: id, target, clientX: x, clientY: 300 });
      const two = (target: Element) => new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch(1, target, 100), touch(2, target, 200)] });
      const one = (target: Element) => new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch(1, target, 100)] });
      return {
        gesturestart: fire(document.body, new Event('gesturestart', { bubbles: true, cancelable: true })),
        gesturechange: fire(canvas, new Event('gesturechange', { bubbles: true, cancelable: true })),
        gestureend: fire(document, new Event('gestureend', { bubbles: true, cancelable: true })),
        twoOnBody: fire(document.body, two(document.body)),
        twoOnCanvas: fire(canvas, two(canvas)),
        oneOnBody: fire(document.body, one(document.body)),
        dblclickBody: fire(document.body, new MouseEvent('dblclick', { bubbles: true, cancelable: true })),
        dblclickCanvas: fire(canvas, new MouseEvent('dblclick', { bubbles: true, cancelable: true })),
      };
    });
    expect(r).toEqual({ gesturestart: true, gesturechange: true, gestureend: true, twoOnBody: true, twoOnCanvas: true, oneOnBody: true, dblclickBody: true, dblclickCanvas: true });
  });

  test('single taps, a drag and the five-tap gold cheat still work', async ({ page }) => {
    await startGame(page);
    // Five quick taps on the Gold readout (a double tap among them) grant the cheat.
    const gold0 = (await state(page)).gold;
    for (let i = 0; i < 5; i++) await tap(page, 'gold');
    const s = await state(page);
    expect(s.cheated).toBe(true);
    expect(s.gold).toBeGreaterThan(gold0);
    // A drag from the bar builds.
    const client = await page.context().newCDPSession(page);
    await touchDrag(page, client, await rectPage(page, 'bar:musketeer'), await fingerFor(page, { col: 7, row: 5 }));
    expect((await state(page)).towers.map((t) => t.cell)).toEqual([{ col: 7, row: 5 }]);
    // A single tap selects it.
    const p = await cellPage(page, { col: 7, row: 5 });
    await page.touchscreen.tap(p.x, p.y);
    expect(await ui(page)).toMatchObject({ panelOpen: true, selectedCell: { col: 7, row: 5 } });
  });

  test('drags starting on the side bars, the canvas edge and the corners leave the page at the origin', async ({ page }) => {
    await startGame(page);
    const client = await page.context().newCDPSession(page);
    const box = await page.evaluate(() => {
      const r = document.querySelector('canvas')!.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: window.innerWidth, h: window.innerHeight };
    });
    expect(box.left).toBeGreaterThan(10); // portrait letterbox: side bars exist
    const starts: Point[] = [
      { x: 5, y: box.h / 2 },
      { x: box.w - 5, y: box.h / 2 },
      { x: box.left + 1, y: box.h / 2 },
      { x: box.right - 1, y: box.h / 3 },
      { x: 2, y: 2 },
      { x: box.w - 2, y: 2 },
      { x: 2, y: box.h - 2 },
      { x: box.w - 2, y: box.h - 2 },
    ];
    for (const s of starts) {
      await touchDrag(page, client, s, { x: box.w / 2, y: s.y > box.h / 2 ? s.y - 300 : s.y + 300 });
      // Two fingers, one on a side bar and one on the canvas, pinching.
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: s.x, y: s.y, id: 1 }, { x: box.w / 2, y: box.h / 2, id: 2 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: s.x + 40, y: s.y + 40, id: 1 }, { x: box.w / 2 - 40, y: box.h / 2 - 40, id: 2 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      expect(await scrolls(page)).toEqual({ x: 0, y: 0, top: 0, vvLeft: 0, vvTop: 0, scale: 1 });
    }
    // The game still takes a tap afterwards.
    await tap(page, 'bar:musketeer');
    expect((await ui(page)).pick).toBe('musketeer');
  });

  test('a zoomed or offset visual viewport is put back once and the canvas re-centred', async ({ page }) => {
    await startGame(page);
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => (window.__tarpit as TarpitTestApi).pageLock());
    const r = await page.evaluate(async () => {
      const real = window.visualViewport!;
      const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!;
      const content0 = meta.content;
      const fake = { scale: 1.8, offsetLeft: 40, offsetTop: 120, width: real.width / 1.8, height: real.height / 1.8 };
      Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => ({ ...fake }) });
      // A burst of events, as a pinch sends: the debounce turns it into one recovery.
      for (let i = 0; i < 6; i++) {
        real.dispatchEvent(new Event(i % 2 ? 'scroll' : 'resize'));
        window.dispatchEvent(new Event('scroll'));
      }
      await new Promise((res) => setTimeout(res, 400));
      const changed = meta.content !== content0;
      // The browser obeyed: back at scale 1 with no offset; later events recover nothing.
      Object.assign(fake, { scale: 1, offsetLeft: 0, offsetTop: 0, width: real.width, height: real.height });
      real.dispatchEvent(new Event('resize'));
      await new Promise((res) => setTimeout(res, 400));
      delete (window as { visualViewport?: unknown }).visualViewport;
      return { changed, scrollX: window.scrollX, scrollY: window.scrollY };
    });
    const after = await page.evaluate(() => (window.__tarpit as TarpitTestApi).pageLock());
    expect(after.recoveries - before.recoveries).toBe(1);
    expect(after.rescales - before.rescales).toBe(1);
    expect(after.checks - before.checks).toBe(2);
    expect(r).toEqual({ changed: true, scrollX: 0, scrollY: 0 });
    const c = await centring(page);
    expect(Math.abs(c.dx)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.dy)).toBeLessThanOrEqual(1);
    expect((await ui(page)).layout).toBe('portrait');
  });

  // Follow-up: the browser may keep the zoom (the meta rewrite is only a first attempt). The game then
  // fits the visible rectangle, centred, and taps still land on the right cells.
  for (const z of [
    { scale: 1.4, offsetLeft: 30, offsetTop: 60 },
    { scale: 0.8, offsetLeft: -48, offsetTop: -105 },
  ]) {
    test(`a viewport stuck at scale ${z.scale} with offsets: the game fits the visible rectangle and taps hit the right cells`, async ({ page }) => {
      await startGame(page);
      await page.evaluate(() => {
        const t = window.__tarpit as TarpitTestApi;
        t.state().gold = 1000;
        t.buildAt(7, 5, 'musketeer');
      });
      const before = await page.evaluate(() => (window.__tarpit as TarpitTestApi).pageLock());
      const vis = await page.evaluate((v) => {
        const real = window.visualViewport!;
        const fake = { ...v, width: window.innerWidth / v.scale, height: window.innerHeight / v.scale };
        (window as unknown as { __fakeVv: typeof fake; __realVv: VisualViewport }).__fakeVv = fake;
        (window as unknown as { __realVv: VisualViewport }).__realVv = real;
        Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => ({ ...(window as unknown as { __fakeVv: typeof fake }).__fakeVv }) });
        real.dispatchEvent(new Event('resize'));
        return fake;
      }, z);
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => (window.__tarpit as TarpitTestApi).pageLock());
      expect(after.rescales - before.rescales).toBe(1);
      const r = await page.evaluate(() => {
        const c = document.querySelector('#game canvas')!.getBoundingClientRect();
        return { left: c.left, top: c.top, right: c.right, bottom: c.bottom };
      });
      expect(r.left).toBeGreaterThanOrEqual(vis.offsetLeft - 1);
      expect(r.top).toBeGreaterThanOrEqual(vis.offsetTop - 1);
      expect(r.right).toBeLessThanOrEqual(vis.offsetLeft + vis.width + 1);
      expect(r.bottom).toBeLessThanOrEqual(vis.offsetTop + vis.height + 1);
      // Centred in the visible rectangle, filling one side of it.
      expect(Math.abs((r.left + r.right) / 2 - (vis.offsetLeft + vis.width / 2))).toBeLessThanOrEqual(1);
      expect(Math.abs((r.top + r.bottom) / 2 - (vis.offsetTop + vis.height / 2))).toBeLessThanOrEqual(1);
      expect(Math.min(Math.abs(r.right - r.left - vis.width), Math.abs(r.bottom - r.top - vis.height))).toBeLessThanOrEqual(1);
      expect((await ui(page)).layout).toBe('portrait');
      // Taps through cellToPage land on the right cells: the tower selects; with a pick, a free cell arms.
      const tower = await cellPage(page, { col: 7, row: 5 });
      await page.touchscreen.tap(tower.x, tower.y);
      expect(await ui(page)).toMatchObject({ panelOpen: true, selectedCell: { col: 7, row: 5 } });
      await tap(page, 'bar:cannon');
      const free = await cellPage(page, { col: 2, row: 5 });
      await page.touchscreen.tap(free.x, free.y);
      expect((await ui(page)).armedCell).toEqual({ col: 2, row: 5 });
      await page.touchscreen.tap(free.x, free.y);
      expect((await state(page)).towers.map((t) => t.cell)).toContainEqual({ col: 2, row: 5 });
      // The browser comes back to scale 1: the normal CSS returns and the canvas is centred in the window.
      await page.evaluate(() => {
        Object.assign((window as unknown as { __fakeVv: object }).__fakeVv, { scale: 1, offsetLeft: 0, offsetTop: 0, width: window.innerWidth, height: window.innerHeight });
        (window as unknown as { __realVv: VisualViewport }).__realVv.dispatchEvent(new Event('resize'));
      });
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => document.getElementById('game')!.style.cssText)).toBe('');
      const c = await centring(page);
      expect(Math.abs(c.dx)).toBeLessThanOrEqual(1);
      expect(Math.abs(c.dy)).toBeLessThanOrEqual(1);
      expect((await state(page)).towers).toHaveLength(2);
    });
  }

  test('the canvas is centred after ten rotations and resizes, and the game survives', async ({ page }) => {
    await startGame(page);
    await page.evaluate(() => (window.__tarpit as TarpitTestApi).buildAt(7, 5, 'musketeer'));
    const sizes = [
      [844, 390],
      [390, 844],
      [390, 664],
      [664, 390],
      [430, 932],
      [932, 430],
      [390, 763],
      [844, 360],
      [375, 667],
      [390, 844],
    ];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction((kind) => window.__tarpit!.layout() === kind, height > width ? 'portrait' : 'landscape');
      await page.waitForTimeout(250);
      await settle(page);
      const c = await centring(page);
      expect(Math.abs(c.dx), `${width}x${height}`).toBeLessThanOrEqual(1);
      expect(Math.abs(c.dy), `${width}x${height}`).toBeLessThanOrEqual(1);
      expect(c.fits).toBe(true);
      expect(await scrolls(page)).toMatchObject({ x: 0, y: 0, top: 0 });
    }
    expect((await state(page)).towers.map((t) => t.cell)).toEqual([{ col: 7, row: 5 }]);
  });
});

test.describe('snap to the nearest valid cell', () => {
  for (const map of MAP_IDS) {
    for (const c of snapCases(map)) {
      test(`${map}: a bar drag released over a ${c.kind} cell (${c.under.col},${c.under.row}) ${c.expected ? `builds on (${c.expected.col},${c.expected.row})` : 'shows red and cancels'}`, async ({ page }) => {
        await startGame(page, 'normal', map);
        await page.evaluate(
          ([kind, col, row]) => {
            const t = window.__tarpit as TarpitTestApi;
            t.state().gold = 1000;
            if (kind === 'occupied') t.buildAt(col as number, row as number, 'cannon');
          },
          [c.kind, c.under.col, c.under.row] as const,
        );
        const client = await page.context().newCDPSession(page);
        const towers0 = (await state(page)).towers.length;
        const at = await worldPage(page, c.at);
        const finger = { x: at.x, y: at.y + (await liftPage(page)) };
        await touchDrag(page, client, await rectPage(page, 'bar:musketeer'), finger, async () => {
          const u = await ui(page);
          expect(u.dragging?.cell).toEqual(c.expected ?? c.under);
          if (c.expected) expect(u.snap).toMatchObject({ cell: c.expected });
          else expect(u.snap).toBeNull();
        });
        const towers = (await state(page)).towers;
        if (c.expected) {
          expect(towers).toHaveLength(towers0 + 1);
          expect(towers.some((t) => t.type === 'musketeer' && t.cell.col === c.expected!.col && t.cell.row === c.expected!.row)).toBe(true);
        } else {
          expect(towers).toHaveLength(towers0);
        }
      });
    }
  }

  test('moving a tower in setup snaps too, and may go back home', async ({ page }) => {
    await startGame(page);
    const c = snapCases('meadow').find((k) => k.kind === 'path')!;
    await page.evaluate(() => (window.__tarpit as TarpitTestApi).buildAt(7, 5, 'musketeer'));
    const client = await page.context().newCDPSession(page);
    const at = await worldPage(page, c.at);
    await touchDrag(page, client, await cellPage(page, { col: 7, row: 5 }), { x: at.x, y: at.y + (await liftPage(page)) });
    expect((await state(page)).towers.map((t) => t.cell)).toEqual([c.expected]);
  });

  test('a lifted point off the map cancels with no snap', async ({ page }) => {
    await startGame(page);
    const client = await page.context().newCDPSession(page);
    const edge = await cellPage(page, { col: 0, row: 7 }); // the map's top edge on screen
    const finger = { x: edge.x, y: edge.y - 30 + (await liftPage(page)) };
    await touchDrag(page, client, await rectPage(page, 'bar:musketeer'), finger, async () => {
      expect((await ui(page)).dragging?.cell).toBeNull();
      expect((await ui(page)).magnifier).toBeNull();
    });
    expect((await state(page)).towers).toHaveLength(0);
  });

  test('a tap with a pick on the trail margin arms the snapped cell; a second tap builds there', async ({ page }) => {
    await startGame(page);
    const c = snapCases('meadow').find((k) => k.kind === 'path')!;
    await tap(page, 'bar:musketeer');
    const p = await worldPage(page, c.at);
    await page.touchscreen.tap(p.x, p.y);
    expect(await ui(page)).toMatchObject({ armedCell: c.expected, snap: { cell: c.expected } });
    await page.touchscreen.tap(p.x, p.y);
    expect((await state(page)).towers.map((t) => t.cell)).toEqual([c.expected]);
  });
});

test.describe('magnifier', () => {
  test('shows the target cell during a drag, on the side away from the finger, and switches sides', async ({ page }) => {
    await startGame(page);
    const counts0 = await sceneCounts(page);
    const client = await page.context().newCDPSession(page);
    const from = await rectPage(page, 'bar:musketeer');
    // The first frame takes the side away from the finger; it keeps it until the finger comes near.
    const start = await fingerFor(page, { col: 14, row: 7 });
    await touchStart(client, from);
    await touchMoveTo(client, from, start);
    let u = await ui(page);
    const fingerCanvasX = await page.evaluate(([x, y]) => {
      const a = window.__tarpit!.canvasToPage(0, 0);
      const b = window.__tarpit!.canvasToPage(100, 0);
      return ((x - a.x) * 100) / (b.x - a.x) + 0 * y;
    }, [start.x, start.y]);
    expect(u.magnifier).toMatchObject({ side: fingerCanvasX > 240 ? 'left' : 'right', top: true, width: 200, height: 200 });
    const target = await page.evaluate(() => window.__tarpit!.cellToPage(14, 7));
    const centre = await page.evaluate(([x, y]) => window.__tarpit!.canvasToPage(x, y), [u.magnifier!.centre.x, u.magnifier!.centre.y]);
    expect(Math.hypot(centre.x - target.x, centre.y - target.y)).toBeLessThan(1);
    expect((await sceneCounts(page)).cameras).toBe(counts0.cameras + 1);
    // Portrait: low world y is on the right of the screen, high on the left. A finger under the right box moves it left, and back.
    const right = await fingerFor(page, { col: 3, row: 2 });
    const left = await fingerFor(page, { col: 3, row: 12 });
    await touchMoveTo(client, start, right);
    expect((await ui(page)).magnifier?.side).toBe('left');
    await touchMoveTo(client, right, left);
    u = await ui(page);
    expect(u.magnifier?.side).toBe('right');
    await touchMoveTo(client, left, start);
    await touchEnd(client);
    expect((await ui(page)).magnifier).toBeNull();
    expect((await state(page)).towers.map((t) => t.cell)).toEqual([{ col: 14, row: 7 }]);
    // Towers draw into shared graphics (portrait shows no labels), so the counts are back where they started.
    expect(await sceneCounts(page)).toEqual(counts0);
  });

  test('shows during a special aim hold and goes with it', async ({ page }) => {
    await startGame(page);
    await page.evaluate(() => {
      const t = window.__tarpit as TarpitTestApi;
      t.state().wave = 3;
      t.startWave();
      t.step(300);
    });
    await tap(page, 'special');
    if ((await ui(page)).special.menuOpen) await tap(page, 'special:tarBarrel');
    const counts0 = await sceneCounts(page);
    const client = await page.context().newCDPSession(page);
    const target = await worldPage(page, { x: 160, y: 191 });
    const finger = { x: target.x, y: target.y + (await liftPage(page)) };
    await touchStart(client, target);
    await touchMoveTo(client, target, finger, 6);
    const u = await ui(page);
    expect(u.special.holding).toBe(true);
    expect(u.magnifier).not.toBeNull();
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    expect((await ui(page)).magnifier).toBeNull();
    expect(await sceneCounts(page)).toEqual(counts0);
  });

  for (const exit of ['touchcancel', 'layout switch', 'game over'] as const) {
    test(`leaves no camera or object behind after a ${exit} mid-drag`, async ({ page }) => {
      await startGame(page);
      const counts0 = await sceneCounts(page);
      const client = await page.context().newCDPSession(page);
      const from = await rectPage(page, 'bar:musketeer');
      const to = await fingerFor(page, { col: 12, row: 4 });
      await touchStart(client, from);
      await touchMoveTo(client, from, to);
      expect((await ui(page)).magnifier).not.toBeNull();
      if (exit === 'touchcancel') {
        await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        expect(await sceneCounts(page)).toEqual(counts0);
      } else if (exit === 'layout switch') {
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForFunction(() => window.__tarpit!.layout() === 'landscape');
        await page.waitForFunction(() => (window.__tarpit as TarpitTestApi).ui().layout === 'landscape');
        await touchEnd(client);
        const n = await page.evaluate(() => (window.__tarpit as TarpitTestApi).game.scene.getScene('game').cameras.cameras.length);
        expect(n).toBe(counts0.cameras);
        expect((await ui(page)).magnifier).toBeNull();
      } else {
        await page.evaluate(() => {
          const t = window.__tarpit as TarpitTestApi;
          t.state().lives = 1;
          t.startWave();
          for (let i = 0; i < 200 && t.state().phase !== 'lost'; i++) t.step(60);
        });
        expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).endScreen())).toBe('lost');
        expect((await ui(page)).magnifier).toBeNull();
        const cams = await page.evaluate(() => (window.__tarpit as TarpitTestApi).game.scene.getScene('game').cameras.cameras.length);
        expect(cams).toBe(counts0.cameras);
        await touchEnd(client);
      }
    });
  }

  test('survives a shake in play mode and leaves no camera behind', async ({ page }) => {
    await page.goto('/');
    await waitForTitle(page);
    await page.evaluate(() => {
      const g = window.__tarpit!.game;
      (g.scene.getScene('title') as unknown as { play: (d: string, m: string) => void }).play('normal', 'meadow');
    });
    await page.waitForFunction(() => window.__tarpit!.game.scene.isActive('game'));
    await page.waitForTimeout(300);
    const cams = () => page.evaluate(() => window.__tarpit!.game.scene.getScene('game').cameras.cameras.map((c) => c.name));
    const before = await cams();
    const client = await page.context().newCDPSession(page);
    const from = await rectPage(page, 'bar:musketeer');
    // Play mode has no ui() hook: the portrait lift is 48 CSS px.
    const cell = await cellPage(page, { col: 12, row: 4 });
    const to = { x: cell.x, y: cell.y + 48 };
    await touchStart(client, from);
    await touchMoveTo(client, from, to);
    await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { fx: { shakeKeg(): void } }).fx.shakeKeg());
    await page.waitForTimeout(100);
    expect(await cams()).toContain('magnifier');
    await page.waitForTimeout(900);
    expect(await cams()).toContain('magnifier');
    await touchEnd(client);
    await page.waitForTimeout(100);
    expect(await cams()).toEqual(before);
  });
});

test.describe('nearest tower', () => {
  test('a touch tap near a tower selects it; further away closes the panel', async ({ page }) => {
    await startGame(page);
    await page.evaluate(() => (window.__tarpit as TarpitTestApi).buildAt(7, 5, 'musketeer'));
    const near = await worldPage(page, { x: 7 * 32 + 16 + 22, y: 5 * 32 + 16 });
    await page.touchscreen.tap(near.x, near.y);
    expect(await ui(page)).toMatchObject({ panelOpen: true, selectedCell: { col: 7, row: 5 } });
    const far = await worldPage(page, { x: 7 * 32 + 16, y: 5 * 32 + 16 + 34 });
    await page.touchscreen.tap(far.x, far.y);
    expect((await ui(page)).panelOpen).toBe(false);
  });

  test('not while a pick is active: the tap places instead', async ({ page }) => {
    await startGame(page);
    await page.evaluate(() => {
      const t = window.__tarpit as TarpitTestApi;
      t.state().gold = 1000;
      t.buildAt(7, 5, 'musketeer');
    });
    await tap(page, 'bar:cannon');
    const near = await worldPage(page, { x: 7 * 32 + 16 + 22, y: 5 * 32 + 16 });
    await page.touchscreen.tap(near.x, near.y);
    expect(await ui(page)).toMatchObject({ panelOpen: false, pick: 'cannon', armedCell: { col: 8, row: 5 } });
  });
});
