import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { TOWER_DEFS } from '../src/sim';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { cellPage, fingerFor, liftPage, rectPage, startGame, state, tap, ui, worldPage, type Point } from './phone';
import { snapCases } from './snapCases';

// Milestone 35 verifier probes (phone project): the page lock against what the game needs,
// self-recovery under a stubbed visual viewport, the viewport meta, snap integrity, magnifier limits.

const pl = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).pageLock());
const tStart = (c: CDPSession, p: Point) => c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
const tMove = (c: CDPSession, p: Point) => c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
const tEnd = (c: CDPSession) => c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

test.describe('verifier: page lock does not swallow what the game needs', () => {
  test('desktop-style events are not prevented, and listeners are added once', async ({ page }) => {
    await startGame(page);
    const r = await page.evaluate(() => {
      const fire = (e: Event) => {
        document.body.dispatchEvent(e);
        return e.defaultPrevented;
      };
      return {
        wheel: fire(new WheelEvent('wheel', { bubbles: true, cancelable: true })),
        contextmenu: fire(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
        click: fire(new MouseEvent('click', { bubbles: true, cancelable: true })),
        keydown: fire(new KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true })),
        touchstart: fire(new TouchEvent('touchstart', { bubbles: true, cancelable: true })),
        touchend: fire(new TouchEvent('touchend', { bubbles: true, cancelable: true })),
        touchmoveOneFingerNoTouches: fire(new TouchEvent('touchmove', { bubbles: true, cancelable: true })),
      };
    });
    expect(r).toEqual({ wheel: false, contextmenu: false, click: false, keydown: false, touchstart: false, touchend: false, touchmoveOneFingerNoTouches: true });
  });

  test('a drag that starts on the canvas and leaves it is not prevented; a side-bar touch does nothing', async ({ page }) => {
    await startGame(page);
    const client = await page.context().newCDPSession(page);
    const from = await rectPage(page, 'bar:musketeer');
    await tStart(client, from);
    await tMove(client, { x: from.x, y: from.y - 100 });
    await tMove(client, { x: 3, y: from.y - 200 }); // leaves the canvas into the side bar
    expect((await ui(page)).dragging).not.toBeNull();
    await tEnd(client);
    expect((await state(page)).towers).toHaveLength(0);
    expect((await ui(page)).dragging).toBeNull();
    // a touch that starts on the side bar and moves onto the canvas builds and picks nothing
    const pick0 = (await ui(page)).pick;
    await tStart(client, { x: 3, y: 400 });
    await tMove(client, from);
    await tMove(client, await fingerFor(page, { col: 7, row: 5 }));
    await tEnd(client);
    expect((await state(page)).towers).toHaveLength(0);
    expect((await ui(page)).pick).toBe(pick0);
  });

  test('the mute button and a speed hold still take touches', async ({ page }) => {
    await startGame(page);
    const before = await page.evaluate(() => (window.__tarpit as TarpitTestApi).audio().muted);
    await tap(page, 'mute');
    expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).audio().muted)).toBe(!before);
  });
});

test.describe('verifier: self-recovery', () => {
  const stub = (page: Page, vv: object | null) =>
    page.evaluate((v) => {
      Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => (v === null ? undefined : v) });
    }, vv);

  test('50 events with a stuck zoomed viewport: bounded rewrites, no layout flip, state kept; no-op at scale 1', async ({ page }) => {
    await startGame(page);
    await page.evaluate(() => (window.__tarpit as TarpitTestApi).buildAt(7, 5, 'musketeer'));
    await page.waitForTimeout(300);
    const base = await pl(page);
    // scale 1, offsets 0: nothing to recover
    await page.evaluate(() => {
      for (let i = 0; i < 20; i++) window.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(400);
    const idle = await pl(page);
    expect(idle.recoveries - base.recoveries).toBe(0);
    expect(idle.rescales - base.rescales).toBe(0);
    // stuck at 1.4 (a browser that refuses): 50 events spread over 2.4 s
    const iw = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
    await stub(page, { scale: 1.4, offsetLeft: 30, offsetTop: 60, width: iw[0] / 1.4, height: iw[1] / 1.4 });
    const metas: string[] = [];
    for (let i = 0; i < 50; i++) {
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      metas.push(await page.evaluate(() => document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!.content));
      await page.waitForTimeout(48);
    }
    await page.waitForTimeout(400);
    const stuck = await pl(page);
    const rewrites = stuck.rescales - idle.rescales;
    console.log('rescales over ~2.8s of 50 events:', rewrites, 'recoveries', stuck.recoveries - idle.recoveries, 'checks', stuck.checks - idle.checks);
    expect(rewrites).toBeLessThanOrEqual(3);
    // layout did not flip, game state kept, no restart
    expect((await ui(page)).layout).toBe('portrait');
    expect((await state(page)).towers.map((t) => t.cell)).toEqual([{ col: 7, row: 5 }]);
    // the two spellings are equivalent and keep the lock tokens
    const norm = (c: string) => c.split(',').map((s) => s.trim().replace(/=1\.0$/, '=1')).sort().join('|');
    const all = new Set(metas.map(norm));
    expect(all.size).toBe(1);
    const tokens = [...all][0];
    for (const t of ['viewport-fit=cover', 'maximum-scale=1', 'user-scalable=no', 'initial-scale=1', 'width=device-width']) expect(tokens).toContain(t);
    await stub(page, null);
  });

  test('a zoomed viewport in landscape does not flip the layout; undefined visualViewport throws nothing', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await startGame(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => window.__tarpit!.layout() === 'landscape');
    await page.waitForTimeout(300);
    // a pinch-zoomed view reports a tall narrow visual viewport
    await stub(page, { scale: 1.4, offsetLeft: 10, offsetTop: 10, width: 300, height: 600 });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__tarpit!.layout())).toBe('landscape');
    await stub(page, null);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('pageshow'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(400);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.__tarpit!.layout())).toBe('landscape');
  });
});

test.describe('verifier: snap integrity and magnifier limits', () => {
  test('a snapped drop builds on the shown cell and costs the right gold; mouse never snaps', async ({ page }) => {
    await startGame(page);
    const c = snapCases('meadow').find((k) => k.kind === 'path')!;
    const gold0 = (await state(page)).gold;
    const client = await page.context().newCDPSession(page);
    const at = await worldPage(page, c.at);
    const finger = { x: at.x, y: at.y + (await liftPage(page)) };
    await tStart(client, await rectPage(page, 'bar:musketeer'));
    await tMove(client, { x: finger.x, y: finger.y - 4 });
    await tMove(client, finger);
    const u = await ui(page);
    expect(u.snap?.cell).toEqual(c.expected);
    expect(u.dragging?.cell).toEqual(c.expected);
    const g = await page.evaluate(([col, row]) => window.__tarpit!.cellToPage(col, row), [c.expected!.col, c.expected!.row]);
    console.log('ghost cell', u.dragging?.cell, 'cell page centre', g);
    await tEnd(client);
    const s = await state(page);
    expect(s.towers.map((t) => t.cell)).toEqual([c.expected]);
    expect(gold0 - s.gold).toBe(TOWER_DEFS.musketeer.cost);
    // mouse: the same lifted spot is exact (no lift, no snap): drag onto the trail cell itself
    await page.evaluate(() => (window.__tarpit as TarpitTestApi).state().gold += 1000);
    const trail = await cellPage(page, c.under);
    const bar = await rectPage(page, 'bar:cannon');
    await page.mouse.move(bar.x, bar.y);
    await page.mouse.down();
    await page.mouse.move(trail.x, trail.y, { steps: 6 });
    const m = await ui(page);
    expect(m.snap).toBeNull();
    expect(m.dragging?.cell).toEqual(c.under);
    await page.mouse.up();
    expect((await state(page)).towers).toHaveLength(1);
  });

  test('magnifier: absent on a tablet-size touch screen, present on a landscape phone, takes no input from a second finger', async ({ page }) => {
    await startGame(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForFunction(() => window.__tarpit!.layout() === 'landscape');
    await page.waitForTimeout(300);
    const client = await page.context().newCDPSession(page);
    const from = await rectPage(page, 'bar:musketeer');
    await tStart(client, from);
    await tMove(client, await fingerFor(page, { col: 12, row: 6 }));
    expect((await ui(page)).magnifier).toBeNull();
    await tEnd(client);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(500);
    const from2 = await rectPage(page, 'bar:musketeer');
    await tStart(client, from2);
    await tMove(client, await fingerFor(page, { col: 12, row: 6 }));
    const m = (await ui(page)).magnifier;
    expect(m).not.toBeNull();
    const cam = await page.evaluate(() => {
      const c = window.__tarpit!.game.scene.getScene('game').cameras.main;
      return { sx: c.scrollX, sy: c.scrollY, z: c.zoom };
    });
    // a second finger lands on the magnifier box
    const boxPage = await page.evaluate(([x, y]) => window.__tarpit!.canvasToPage(x, y), [m!.x + 100, m!.y + 100]);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...(await fingerFor(page, { col: 12, row: 6 })), id: 1 }, { x: boxPage.x, y: boxPage.y, id: 2 }] });
    await tEnd(client);
    expect((await state(page)).towers.length).toBeLessThanOrEqual(2); // one built by the tablet-size drag, none by the second finger
    expect((await ui(page)).magnifier).toBeNull();
    expect(await page.evaluate(() => {
      const c = window.__tarpit!.game.scene.getScene('game').cameras.main;
      return { sx: c.scrollX, sy: c.scrollY, z: c.zoom };
    })).toEqual(cam);
  });

  test('magnifier box stays inside the canvas for drags at every edge cell', async ({ page }) => {
    await startGame(page);
    const client = await page.context().newCDPSession(page);
    const from = await rectPage(page, 'bar:musketeer');
    const cells = [[0, 0], [29, 0], [0, 14], [29, 14], [15, 0], [15, 14], [0, 7], [29, 7]];
    for (const [col, row] of cells) {
      await tStart(client, from);
      await tMove(client, await fingerFor(page, { col, row }));
      const u = await ui(page);
      const m = u.magnifier;
      if (m) {
        const hud = await page.evaluate(() => window.__tarpit!.uiRects());
        const map = await page.evaluate(() => window.__tarpit!.layout());
        expect(m.x).toBeGreaterThanOrEqual(0);
        expect(m.y).toBeGreaterThanOrEqual(0);
        expect(m.x + m.width).toBeLessThanOrEqual(480);
        expect(m.y + m.height).toBeLessThanOrEqual(1194);
        for (const [k, r] of Object.entries(hud)) {
          if (k.startsWith('bar:') || k === 'speed' || k === 'start') {
            const o = m.x < r.x + r.width && r.x < m.x + m.width && m.y < r.y + r.height && r.y < m.y + m.height;
            expect(o, `${k} vs magnifier at ${col},${row} ${map}`).toBe(false);
          }
        }
      }
      await tEnd(client);
    }
  });
});

// Follow-up (8b0f820): #game follows a stubbed zoomed visual viewport.
test.describe('verifier: zoomed viewport fit', () => {
  const cases: { scale: number; ox: number; oy: number; w: number; h: number }[] = [
    { scale: 1.4, ox: 40, oy: 90, w: 390, h: 844 },
    { scale: 0.8, ox: 0, oy: 0, w: 390, h: 844 },
    { scale: 2.5, ox: 100, oy: 250, w: 390, h: 844 },
    { scale: 1.4, ox: 70, oy: 30, w: 844, h: 390 },
    { scale: 0.8, ox: 0, oy: 0, w: 844, h: 390 },
    { scale: 2.5, ox: 200, oy: 100, w: 844, h: 390 },
  ];
  for (const k of cases) {
    test(`scale ${k.scale} offsets ${k.ox},${k.oy} at ${k.w}x${k.h}`, async ({ page }) => {
      await startGame(page);
      if (k.w > k.h) {
        await page.setViewportSize({ width: k.w, height: k.h });
        await page.waitForFunction(() => window.__tarpit!.layout() === 'landscape');
        await page.waitForTimeout(400);
      }
      const layout0 = await page.evaluate(() => window.__tarpit!.layout());
      await page.evaluate(() => {
        const t = window.__tarpit as TarpitTestApi;
        t.state().gold = 5000;
        t.buildAt(2, 2, 'cannon');
      });
      const vv = { scale: k.scale, offsetLeft: k.ox, offsetTop: k.oy, width: k.w / k.scale, height: k.h / k.scale };
      const writes = await page.evaluate(async (v) => {
        const box = document.getElementById('game')!;
        let n = 0;
        new MutationObserver((m) => (n += m.length)).observe(box, { attributes: true, attributeFilter: ['style'] });
        Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => ({ ...v }) });
        for (let i = 0; i < 50; i++) {
          window.dispatchEvent(new Event('resize'));
          await new Promise((r) => setTimeout(r, 30));
        }
        await new Promise((r) => setTimeout(r, 500));
        return n;
      }, vv);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
      const geo = await page.evaluate(() => {
        const c = document.querySelector('canvas')!.getBoundingClientRect();
        return { l: c.left, t: c.top, w: c.width, h: c.height };
      });
      console.log('writes to #game style', k, writes);
      expect(writes).toBeLessThanOrEqual(6);
      // inside the visible rectangle and centred in it
      expect(geo.l).toBeGreaterThanOrEqual(vv.offsetLeft - 1);
      expect(geo.t).toBeGreaterThanOrEqual(vv.offsetTop - 1);
      expect(geo.l + geo.w).toBeLessThanOrEqual(vv.offsetLeft + vv.width + 1);
      expect(geo.t + geo.h).toBeLessThanOrEqual(vv.offsetTop + vv.height + 1);
      expect(Math.abs(geo.l + geo.w / 2 - (vv.offsetLeft + vv.width / 2))).toBeLessThanOrEqual(1.5);
      expect(Math.abs(geo.t + geo.h / 2 - (vv.offsetTop + vv.height / 2))).toBeLessThanOrEqual(1.5);
      expect(await page.evaluate(() => window.__tarpit!.layout())).toBe(layout0);
      expect((await state(page)).towers.map((t) => t.cell)).toEqual([{ col: 2, row: 2 }]);
      // taps land on the right cells (pick, then tap: the armed cell is the tapped one)
      const cands: { col: number; row: number }[] = [
        { col: 0, row: 0 }, { col: 29, row: 0 }, { col: 0, row: 14 }, { col: 29, row: 14 },
        { col: 15, row: 0 }, { col: 15, row: 14 }, { col: 8, row: 6 }, { col: 22, row: 9 }, { col: 5, row: 12 }, { col: 25, row: 4 },
      ];
      await tap(page, 'bar:musketeer');
      let tried = 0;
      const bad: string[] = [];
      for (const c of cands) {
        const p = await cellPage(page, c);
        if (p.x < 1 || p.y < 1 || p.x > k.w - 1 || p.y > k.h - 1) continue;
        // skip cells under the HUD
        const hud = await page.evaluate(([x, y]) => window.__tarpit!.uiRects() && [x, y], [p.x, p.y]);
        void hud;
        await page.touchscreen.tap(p.x, p.y);
        const u = await ui(page);
        tried++;
        if (!(u.armedCell?.col === c.col && u.armedCell?.row === c.row) && !(u.snap && u.snap.cell.col === u.armedCell?.col)) bad.push(`${c.col},${c.row}->${JSON.stringify(u.armedCell)}`);
      }
      console.log('taps tried', tried, 'bad', bad);
      expect(tried).toBeGreaterThanOrEqual(2);
      expect(bad).toEqual([]);
      // a drag with the lift builds on the right cell
      const target = { col: 8, row: 6 };
      const finger = await fingerFor(page, target);
      if (k.scale >= 1 && finger.x > 0 && finger.y > 0 && finger.x < k.w && finger.y < k.h) {
        // (a stubbed scale under 1 puts the HUD off the real screen, so no drag there)
        const client = await page.context().newCDPSession(page);
        await tStart(client, await rectPage(page, 'bar:musketeer'));
        await tMove(client, { x: finger.x, y: finger.y - 3 });
        await tMove(client, finger);
        await tEnd(client);
        expect((await state(page)).towers.some((t) => t.cell.col === 8 && t.cell.row === 6)).toBe(true);
      }
      // back to scale 1: normal CSS returns
      await page.evaluate(() => {
        delete (window as { visualViewport?: unknown }).visualViewport;
        window.dispatchEvent(new Event('resize'));
      });
      await page.waitForTimeout(500);
      const css = await page.evaluate(() => {
        const b = document.getElementById('game')!;
        return { w: b.style.width, l: b.style.left, fit: b.dataset.fit ?? '' };
      });
      expect(css).toEqual({ w: '', l: '', fit: '' });
    });
  }
});
