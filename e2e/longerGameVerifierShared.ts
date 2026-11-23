import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { waitForTitle } from './title';
import { api, clearToOffer, expectOffer, OFFERS, openCampaign, press } from './campaign';

// Milestone 36b verifier probes, shared by the desktop, tablet and phone files.

const cellPoint = (page: Page, col: number, row: number) =>
  page.evaluate(([c, r]) => window.__tarpit!.cellToPage(c, r), [col, row]);

/** Fixture: wave `wave` started, then its last tick with nothing left, so the offer opens. */
export const endWaveNow = (page: Page, wave: number) => page.evaluate((wave) => {
  const t = window.__tarpit as TarpitTestApi;
  const s = t.state();
  s.wave = wave - 1;
  s.lives = 1000;
  s.gold = 1000;
  t.startWave();
  t.step(5);
}, wave);
const finish = (page: Page) => page.evaluate(() => {
  const t = window.__tarpit as TarpitTestApi;
  t.state().spawnedPerGroup.fill(9999);
  t.state().enemies = [];
  t.step(1);
});

export function inputChecks(touch: boolean, phone = false): void {
  test('V1 a bar drag that is still held when the offer opens cannot build under the panel', async ({ page }) => {
    await openCampaign(page, touch);
    await endWaveNow(page, 5);
    const bar = await page.evaluate(() => { const t = window.__tarpit!; const r = t.uiRects()['bar:musketeer']; return t.canvasToPage(r.x + r.width / 2, r.y + r.height / 2); });
    const at = await cellPoint(page, 7, 1);
    const before = await api(page, (t) => t.state().towers.length);
    if (touch) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [bar] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: (bar.x + at.x) / 2, y: (bar.y + at.y) / 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at] });
      await finish(page);
      expect(await api(page, (t) => t.pendingBoon())).not.toBeNull();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(bar.x, bar.y);
      await page.mouse.down();
      await page.mouse.move((bar.x + at.x) / 2, (bar.y + at.y) / 2, { steps: 4 });
      await page.mouse.move(at.x, at.y, { steps: 4 });
      await finish(page);
      expect(await api(page, (t) => t.pendingBoon())).not.toBeNull();
      await page.mouse.up();
    }
    await expectOffer(page, 5);
    expect(await api(page, (t) => t.state().towers.length), 'a tower was built while the reward panel was open').toBe(before);
  });

  test('V2 the HUD buttons beside the open panel (special, speed, mute) leave nothing half open', async ({ page }) => {
    await openCampaign(page, touch);
    await endWaveNow(page, 5);
    await finish(page);
    await expectOffer(page, 5);
    const snap = () => api(page, (t) => ({ ui: { aiming: t.ui().special.aiming, menu: t.ui().special.menuOpen, pick: t.ui().pick }, speed: t.speed(), state: t.state().phase }));
    const before = await snap();
    for (const key of ['special', 'speed', 'mute']) {
      await press(page, key, touch);
      const after = await snap();
      expect.soft(after.ui, `${key}: aim/menu/pick state while the panel is open`).toEqual(before.ui);
      test.info().annotations.push({ type: 'info', description: `${key}: speed ${before.speed} -> ${after.speed}` });
    }
    await expectOffer(page, 5);
  });

  // Verifier finding (low): on the phone the second tap of a double tap lands on the map the card
  // just left and selects the tower under it. The pick itself happens once.
  (phone ? test.fixme : test)('V3 a double click or tap on a card picks once and selects nothing under it', async ({ page }) => {
    await openCampaign(page, touch);
    await endWaveNow(page, 5);
    await finish(page);
    await expectOffer(page, 5);
    const c = await page.evaluate(() => { const t = window.__tarpit!; const r = t.uiRects()['reward:longBarrels']; return { x: r.x + r.width / 2, y: r.y + r.height / 2, p: t.canvasToPage(r.x + r.width / 2, r.y + r.height / 2) }; });
    // A tower as near the card centre as a buildable cell allows, so a leaked second click would select it.
    const built = await page.evaluate(({ x, y }) => {
      const t = window.__tarpit as TarpitTestApi;
      t.state().gold = 1000;
      const cells: { col: number; row: number; d: number }[] = [];
      for (let col = 0; col < 24; col++) for (let row = 0; row < 14; row++) {
        const p = t.cellToPage(col, row);
        cells.push({ col, row, d: Math.hypot(p.x - x, p.y - y) });
      }
      cells.sort((m, n) => m.d - n.d);
      for (const c of cells) if (t.buildAt(c.col, c.row, 'musketeer').ok) return { col: c.col, row: c.row, d: Math.round(c.d) };
      return null;
    }, c.p);
    expect(built).not.toBeNull();
    test.info().annotations.push({ type: 'info', description: `tower ${built!.d} page px from the card centre` });
    const towers = await api(page, (t) => t.state().towers.length);
    if (touch) { await page.touchscreen.tap(c.p.x, c.p.y); await page.touchscreen.tap(c.p.x, c.p.y); }
    else await page.mouse.dblclick(c.p.x, c.p.y);
    expect(await api(page, (t) => t.heldBoons())).toEqual(['longBarrels']);
    const ui = await api(page, (t) => t.ui());
    expect.soft(ui.panelOpen, 'the second click opened a tower panel').toBe(false);
    expect.soft(ui.selectedCell).toBeNull();
    expect(await api(page, (t) => t.state().towers.length)).toBe(towers);
  });

  test('V4 gold cheat taps and unrelated keys do nothing while the panel is open', async ({ page }) => {
    await openCampaign(page, touch);
    await endWaveNow(page, 5);
    await finish(page);
    await expectOffer(page, 5);
    const gold = await api(page, (t) => t.state().gold);
    for (let i = 0; i < 6; i++) await press(page, 'gold', touch);
    expect(await api(page, (t) => t.state().gold)).toBe(gold);
    for (const k of ['4', '0', 'Enter', 'Space', 'q', 'F1', 'Escape', 'ArrowRight']) {
      await page.keyboard.press(k);
      expect(await api(page, (t) => t.pendingBoon()), `key ${k} closed the offer`).not.toBeNull();
    }
    await expectOffer(page, 5);
    expect(await api(page, (t) => t.heldBoons())).toEqual([]);
  });

  test('V5 a special in the wave, then the wave ends: the offer opens with no aim or menu left', async ({ page }) => {
    await openCampaign(page, touch);
    await endWaveNow(page, 5);
    await press(page, 'special', touch);
    const mid = await api(page, (t) => ({ a: t.ui().special.aiming, m: t.ui().special.menuOpen }));
    expect(mid.a !== null || mid.m).toBe(true);
    await finish(page);
    await expectOffer(page, 5);
    expect(await api(page, (t) => ({ a: t.ui().special.aiming, m: t.ui().special.menuOpen }))).toEqual({ a: null, m: false });
  });

  test('V6 offers at wave 10 and 15 at 3x speed, with effects still playing', async ({ page }) => {
    await openCampaign(page, touch);
    for (const wave of [5, 10, 15] as const) {
      await api(page, (t) => t.setSpeed(3));
      await clearToOffer(page, wave);
      await expectOffer(page, wave);
      await press(page, `reward:${OFFERS[wave][1]}`, touch);
    }
    expect(await api(page, (t) => t.heldBoons())).toEqual(['keenArrows', 'hotCoals', 'veteranCrews']);
  });
}

/** Smallest font, in CSS px, among visible Text objects. */
export const smallestFonts = (page: Page) => page.evaluate(() => {
  const t = window.__tarpit!;
  const a = t.canvasToPage(0, 0); const b = t.canvasToPage(100, 0);
  const k = (b.x - a.x) / 100;
  const out: { text: string; css: number; px: number }[] = [];
  const walk = (list: Phaser.GameObjects.GameObject[]) => {
    for (const o of list) {
      const v = o as Phaser.GameObjects.Text & Phaser.GameObjects.Container;
      if (!v.visible || v.alpha <= 0) continue;
      if (o.type === 'Container') walk(v.list as Phaser.GameObjects.GameObject[]);
      else if (o.type === 'Text' && v.text.trim()) out.push({ text: v.text.replace(/\n/g, ' / '), px: parseFloat(String(v.style.fontSize)), css: parseFloat(String(v.style.fontSize)) * k * Math.abs(v.scaleX) });
    }
  };
  walk(t.game.scene.getScene('game').children.list);
  return { scale: k, texts: out.sort((x, y) => x.css - y.css) };
});

type R = { x: number; y: number; width: number; height: number };
const hit = (a: R, b: R) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export function layoutChecks(touch: boolean): void {
  test('L1 three boons held, panel open: fonts, card size, overlaps, bar labels', async ({ page }) => {
    await openCampaign(page, touch);
    await api(page, (t) => { const s = t.state(); s.boons = ['longBarrels', 'stickyTar', 'stoneWalls']; s.gold = 1000; });
    await endWaveNow(page, 5);
    await api(page, (t) => { t.state().boons = ['longBarrels', 'stickyTar', 'stoneWalls']; });
    await finish(page);
    // offer wave 5 opens with boons already set by the fixture; the HUD shows three icons.
    const info = await page.evaluate(() => {
      const t = window.__tarpit!;
      const rects = t.uiRects() as Record<string, R>;
      const a = t.canvasToPage(0, 0); const b = t.canvasToPage(100, 0);
      const k = (b.x - a.x) / 100;
      const scene = t.game.scene.getScene('game');
      const canvas = { w: scene.scale.width, h: scene.scale.height };
      return { rects, k, canvas, layout: t.layout(), vp: { w: innerWidth, h: innerHeight } };
    });
    const names = Object.keys(info.rects);
    const cards = names.filter((n) => n.startsWith('reward:'));
    for (const n of cards) {
      const r = info.rects[n];
      expect.soft(r.width * info.k, `${n} width css px`).toBeGreaterThanOrEqual(44);
      expect.soft(r.height * info.k, `${n} height css px`).toBeGreaterThanOrEqual(44);
      expect.soft(r.x >= 0 && r.y >= 0 && r.x + r.width <= info.canvas.w && r.y + r.height <= info.canvas.h, `${n} inside canvas`).toBe(true);
    }
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) expect.soft(hit(info.rects[cards[i]], info.rects[cards[j]]), `${cards[i]} overlaps ${cards[j]}`).toBe(false);
    const hud = names.filter((n) => /^(bar:|boon:|speed|mute|special|startWave|gold)/.test(n));
    for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) {
      if (hit(info.rects[hud[i]], info.rects[hud[j]])) test.info().annotations.push({ type: 'OVERLAP', description: `${hud[i]} x ${hud[j]}` });
      expect.soft(hit(info.rects[hud[i]], info.rects[hud[j]]), `${hud[i]} overlaps ${hud[j]}`).toBe(false);
    }
    for (const n of hud) if (/^boon:/.test(n)) {
      const r = info.rects[n];
      test.info().annotations.push({ type: 'boon-size', description: `${n} ${r.width}x${r.height} canvas = ${(r.width * info.k).toFixed(1)}x${(r.height * info.k).toFixed(1)} css` });
      expect.soft(r.width * info.k, `${n} css width`).toBeGreaterThanOrEqual(24);
    }
    // Button gaps among bar buttons.
    const bars = names.filter((n) => n.startsWith('bar:')).map((n) => info.rects[n]).sort((m, n) => m.x - n.x || m.y - n.y);
    test.info().annotations.push({ type: 'bar', description: JSON.stringify(bars.map((r) => [r.x, r.y, r.width, r.height])) });
    // Bar button label fit.
    const labels = await page.evaluate(() => {
      const t = window.__tarpit!;
      const rects = t.uiRects() as Record<string, R>;
      const out: { text: string; l: number; r: number; btn: string }[] = [];
      const scene = t.game.scene.getScene('game');
      const walk = (list: Phaser.GameObjects.GameObject[]) => {
        for (const o of list) {
          const v = o as Phaser.GameObjects.Text & Phaser.GameObjects.Container;
          if (!v.visible) continue;
          if (o.type === 'Container') { walk(v.list as Phaser.GameObjects.GameObject[]); continue; }
          if (o.type !== 'Text') continue;
          const bb = v.getBounds();
          for (const [n, r] of Object.entries(rects)) if (n.startsWith('bar:') && bb.centerX > r.x && bb.centerX < r.x + r.width && bb.centerY > r.y && bb.centerY < r.y + r.height)
            out.push({ text: v.text, l: bb.left - r.x, r: r.x + r.width - bb.right, btn: n });
        }
      };
      walk(scene.children.list);
      return out;
    });
    for (const l of labels) expect.soft(Math.min(l.l, l.r), `bar label "${l.text}" padding to ${l.btn}`).toBeGreaterThanOrEqual(0);
    test.info().annotations.push({ type: 'barlabels', description: JSON.stringify(labels.map((l) => [l.text, Math.round(l.l), Math.round(l.r)])) });
    const f = await smallestFonts(page);
    test.info().annotations.push({ type: 'fonts', description: `layout ${info.layout} vp ${info.vp.w}x${info.vp.h} scale ${f.scale.toFixed(3)}; smallest: ` + f.texts.slice(0, 8).map((x) => `${x.css.toFixed(1)}css(${x.px}px) "${x.text.slice(0, 30)}"`).join(' | ') });
    for (const x of f.texts) expect.soft(x.css, `font "${x.text.slice(0, 40)}" css px`).toBeGreaterThanOrEqual(11);
  });

  test('L2 a layout switch with the panel open keeps the pick pending and redraws', async ({ page }) => {
    await openCampaign(page, touch);
    await endWaveNow(page, 5);
    await finish(page);
    await expectOffer(page, 5);
    const vp = page.viewportSize()!;
    const other = vp.width > vp.height ? { width: 390, height: 844 } : { width: 960, height: 580 };
    await page.setViewportSize(other);
    await page.waitForFunction(() => window.__tarpit?.layout() !== undefined);
    await page.waitForTimeout(400);
    await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
    await expectOffer(page, 5);
    expect(await api(page, (t) => t.state().phase)).toBe('setup');
    await press(page, 'reward:keenArrows', touch);
    expect(await api(page, (t) => t.heldBoons())).toEqual(['keenArrows']);
    await page.setViewportSize(vp);
    await page.waitForTimeout(400);
    expect(await api(page, (t) => t.heldBoons())).toEqual(['keenArrows']);
    const hudBoon = await api(page, (t) => Object.keys(t.uiRects()).filter((k) => k.startsWith('boon:')));
    expect(hudBoon).toEqual(['boon:keenArrows']);
  });

  test('L3 Play again and Menu with the panel open leave nothing behind', async ({ page }) => {
    await openCampaign(page, touch);
    await endWaveNow(page, 5);
    await finish(page);
    await expectOffer(page, 5);
    // A game cannot end while an offer is open (no end screen, so no Play again or Menu to press); leave through the title.
    // Menu from an open panel is not reachable by UI; leave through the title instead.
    await api(page, (t) => { t.game.scene.getScene('game').scene.start('title'); });
    await waitForTitle(page);
    await press(page, 'title:play', touch);
    await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
    expect(await api(page, (t) => ({ p: t.pendingBoon(), b: t.heldBoons(), w: t.state().wave }))).toEqual({ p: null, b: [], w: 0 });
  });
}

export function iconSizeCheck(touch: boolean): void {
  // Verifier finding (low): the held-boon icons are 40 x 42 canvas px (36 x 42 in portrait), so 25 x 30 CSS px on
  // the phone and 42.7 wide on the tablet. They take taps (tooltip) but are under the 44 px touch size the other buttons meet.
  test.fixme(`L4 held boon icons are at least 44 x 44 CSS px on a touch screen (touch=${touch})`, async ({ page }) => {
    await openCampaign(page, touch);
    await api(page, (t) => { t.state().boons = ['longBarrels', 'stickyTar', 'stoneWalls']; t.step(0); });
    const sizes = await page.evaluate(() => {
      const t = window.__tarpit!;
      const k = (t.canvasToPage(100, 0).x - t.canvasToPage(0, 0).x) / 100;
      return Object.entries(t.uiRects()).filter(([n]) => n.startsWith('boon:')).map(([, r]) => [r.width * k, r.height * k]);
    });
    for (const [w, h] of sizes) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
  });
}
