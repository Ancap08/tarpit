import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { GameEvent } from '../src/sim';

// Verifier probes for milestone 25b (Claude Fable 5.2), desktop project,
// real mouse. At the 960x580 viewport canvas space is page space. Time is
// frozen (?test=1). Numbers are the spec's, written out here: map 960x480,
// HUD below y 480, Special button x 630, 100 wide.

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const specials = async (page: Page) => (await api(page, (a) => a.events())).filter((e: GameEvent) => e.kind === 'special');
const mid = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const popupNames = async (page: Page) => Object.keys(await rects(page)).filter((k) => k.startsWith('special:'));

/** A game with wave `wave` running, `ticks` in, 1000 gold. */
async function inWave(page: Page, wave = 1, ticks = 120): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(
    async ([w, n]) => {
      const t = window.__tarpit as TarpitTestApi;
      await t.startGame();
      t.state().wave = w - 1;
      t.state().gold = 1000;
      t.startWave();
      t.step(n);
    },
    [wave, ticks],
  );
}

async function click(page: Page, name: string): Promise<void> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  const p = mid(r);
  await page.mouse.click(p.x, p.y);
}

const shot = async (page: Page, r: Rect) => (await page.screenshot({ clip: r })).toString('base64');

test('(a) aiming and the tower pick or panel exclude each other, both ways', async ({ page }) => {
  await inWave(page);
  await api(page, (a) => a.buildAt(7, 5, 'longbow'));
  // pick -> special
  await click(page, 'bar:cannon');
  expect((await ui(page)).pick).toBe('cannon');
  await click(page, 'special');
  expect(await ui(page)).toMatchObject({ pick: null, special: { aiming: 'keg' } });
  // special -> pick
  await click(page, 'bar:cannon');
  expect(await ui(page)).toMatchObject({ pick: 'cannon', special: { aiming: null, charges: 1 } });
  await page.keyboard.press('Escape');
  // panel -> special
  await page.mouse.click(7 * 32 + 16, 5 * 32 + 16);
  expect((await ui(page)).panelOpen).toBe(true);
  await click(page, 'special');
  expect(await ui(page)).toMatchObject({ panelOpen: false, selectedCell: null, special: { aiming: 'keg' } });
  // special -> a click on the tower fires the keg there; it does not open the panel
  await page.mouse.click(7 * 32 + 16, 5 * 32 + 16);
  expect(await ui(page)).toMatchObject({ panelOpen: false, special: { aiming: null, charges: 0 } });
  expect(await specials(page)).toMatchObject([{ x: 240, y: 176 }]);
});

test('(b) Escape and a second press of Special cancel aiming and the popup; the charge stays', async ({ page }) => {
  await inWave(page, 4);
  await click(page, 'special');
  expect((await ui(page)).special.menuOpen).toBe(true);
  await page.keyboard.press('Escape');
  expect((await ui(page)).special).toMatchObject({ menuOpen: false, aiming: null, charges: 1 });
  await click(page, 'special');
  await click(page, 'special');
  expect((await ui(page)).special).toMatchObject({ menuOpen: false, aiming: null, charges: 1 });
  await click(page, 'special');
  await click(page, 'special:tarBarrel');
  await page.mouse.move(300, 300);
  expect((await ui(page)).special).toMatchObject({ aiming: 'tarBarrel', aimPoint: { x: 300, y: 300 } });
  await page.keyboard.press('Escape');
  expect((await ui(page)).special).toMatchObject({ aiming: null, aimPoint: null, charges: 1 });
  await click(page, 'special');
  await click(page, 'special:keg');
  await click(page, 'special');
  expect((await ui(page)).special).toMatchObject({ aiming: null, menuOpen: false, charges: 1 });
  expect(await specials(page)).toEqual([]);
  expect((await state(page)).specialCharges).toBe(1);
});

test('(c) the special fires once, on the press, at the press point; moving and releasing elsewhere adds nothing', async ({ page }) => {
  await inWave(page);
  await api(page, (a) => a.buildAt(9, 5, 'longbow'));
  await click(page, 'special');
  await page.mouse.move(500, 300);
  await page.mouse.down();
  // Fired already, with the button still down.
  expect(await specials(page)).toMatchObject([{ type: 'keg', x: 500, y: 300, radius: 70 }]);
  expect((await ui(page)).special).toMatchObject({ charges: 0, aiming: null });
  await page.mouse.move(400, 250, { steps: 5 });
  await page.mouse.move(9 * 32 + 16, 5 * 32 + 16, { steps: 5 });
  await page.mouse.up(); // over a tower
  expect(await specials(page)).toHaveLength(1);
  const u = await ui(page);
  expect(u).toMatchObject({ panelOpen: false, dragging: null, pick: null });
  expect((await state(page)).towers).toHaveLength(1);
});

test('(d) aiming, then a click on the speed button: the speed toggles, aiming ends, nothing fires', async ({ page }) => {
  await inWave(page);
  await click(page, 'special');
  await page.mouse.move(500, 300);
  expect((await ui(page)).special.aiming).toBe('keg');
  await click(page, 'speed');
  expect(await api(page, (a) => a.speed())).toBe(2);
  expect(await specials(page)).toEqual([]);
  expect((await ui(page)).special).toMatchObject({ aiming: null, charges: 1 });
  expect((await state(page)).specialCharges).toBe(1);
  // The disabled Start Wave button and the bare HUD background do the same.
  for (const p of [mid((await rects(page)).startWave), { x: 300, y: 505 }, { x: 500, y: 480 }]) {
    await click(page, 'special');
    await page.mouse.click(p.x, p.y);
    expect((await ui(page)).special).toMatchObject({ aiming: null, charges: 1 });
  }
  expect(await specials(page)).toEqual([]);
  expect((await state(page)).wave).toBe(1);
});

for (const at of [
  { x: 2, y: 2 },
  { x: 500, y: 479 },
  { x: 958, y: 240 },
]) {
  test(`(e) fires with the aim centre at the map edge (${at.x}, ${at.y})`, async ({ page }) => {
    await inWave(page);
    await click(page, 'special');
    await page.mouse.move(at.x, at.y);
    expect((await ui(page)).special.aimPoint).toEqual(at);
    await page.mouse.click(at.x, at.y);
    expect(await specials(page)).toMatchObject([{ type: 'keg', x: at.x, y: at.y }]);
    expect((await state(page)).specialCharges).toBe(0);
  });
}

for (const [wave, listed] of [
  [1, []],
  [3, []],
  [4, ['special:keg', 'special:tarBarrel']],
  [6, ['special:keg', 'special:tarBarrel']],
  [7, ['special:keg', 'special:tarBarrel', 'special:fireArrows']],
  [10, ['special:keg', 'special:tarBarrel', 'special:fireArrows']],
] as const) {
  test(`(f) wave ${wave}: the popup lists ${listed.length ? listed.join(', ') : 'nothing (the keg is selected directly)'}`, async ({ page }) => {
    await inWave(page, wave, 30);
    await click(page, 'special');
    expect(await popupNames(page)).toEqual(listed);
    if (listed.length === 0) {
      expect((await ui(page)).special).toMatchObject({ aiming: 'keg', menuOpen: false });
      return;
    }
    // Every popup button is inside the map and above the HUD, none overlapping another.
    const r = await rects(page);
    const boxes = listed.map((k) => r[k]);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(960);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(480);
      expect(b.height).toBeGreaterThanOrEqual(42);
    }
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height);
    // An outside click on the map closes it, fires nothing and does not start aiming.
    await page.mouse.click(200, 200);
    expect((await ui(page)).special).toMatchObject({ menuOpen: false, aiming: null, charges: 1 });
    expect(await popupNames(page)).toEqual([]);
    // A selection closes it and aims that special.
    await click(page, 'special');
    const last = listed[listed.length - 1];
    await click(page, last);
    expect((await ui(page)).special).toMatchObject({ menuOpen: false, aiming: last.slice('special:'.length) });
    expect(await popupNames(page)).toEqual([]);
    expect(await specials(page)).toEqual([]);
  });
}

test('(g) the Special button looks greyed in setup, after use and after the game ends; lit only with a usable charge', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  const r = (await rects(page)).special;
  expect(r).toEqual({ x: 630, y: 484, width: 100, height: 42 });
  await page.mouse.move(100, 100);
  const setup = await shot(page, r);
  await click(page, 'special');
  expect((await ui(page)).special).toMatchObject({ aiming: null, menuOpen: false });
  await page.mouse.move(100, 100);

  await api(page, (a) => {
    a.startWave();
    a.step(60);
  });
  const lit = await shot(page, r);
  expect(lit).not.toBe(setup);

  await click(page, 'special');
  await page.mouse.click(100, 100);
  expect((await state(page)).specialCharges).toBe(0);
  expect(await shot(page, r)).toBe(setup);
  await click(page, 'special');
  expect((await ui(page)).special).toMatchObject({ aiming: null, menuOpen: false });

  // Next wave: lit again. Then the game ends mid-wave with the charge unspent.
  await api(page, (a) => {
    a.state().lives = 1000;
    a.step(4500); // milestone 28: wave 1 ends after 4435 ticks
  });
  expect((await state(page)).phase).toBe('setup');
  await page.mouse.move(100, 100);
  expect(await shot(page, r)).toBe(setup);
  await api(page, (a) => {
    a.startWave();
    a.step(60);
  });
  expect(await shot(page, r)).toBe(lit);
  // Aim, then lose: aiming ends with the game.
  await click(page, 'special');
  expect((await ui(page)).special.aiming).toBe('keg');
  await api(page, (a) => {
    a.state().lives = 1;
    a.step(4000);
  });
  expect((await state(page)).phase).toBe('lost');
  expect((await state(page)).specialCharges).toBe(1);
  expect((await ui(page)).special.aiming).toBeNull();
  await page.mouse.move(100, 100);
  expect(await shot(page, r)).not.toBe(lit);
  // Clicks on the button and on the map do nothing now.
  await click(page, 'special');
  expect((await ui(page)).special).toMatchObject({ aiming: null, menuOpen: false });
  expect(await api(page, (a) => a.useSpecialAt('keg', 100, 100))).toEqual({ ok: false, reason: 'game-over' });
});

test('(i) a bar drag begun while aiming ends the aiming (no special fires); nothing can be aimed during the drag', async ({ page }) => {
  await inWave(page);
  await click(page, 'special');
  expect((await ui(page)).special.aiming).toBe('keg');
  const bar = mid((await rects(page))['bar:longbow']);
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  expect((await ui(page)).special.aiming).toBeNull(); // the HUD press cancelled it
  await page.mouse.move(7 * 32 + 16, 5 * 32 + 16, { steps: 8 });
  const u = await ui(page);
  expect(u.dragging).toMatchObject({ kind: 'place', tower: 'longbow', cell: { col: 7, row: 5 } });
  expect(u.special).toMatchObject({ aiming: null, aimPoint: null, menuOpen: false });
  await page.mouse.up();
  const s = await state(page);
  expect(s.towers.map((t) => [t.type, t.cell.col, t.cell.row])).toEqual([['longbow', 7, 5]]);
  expect(s.specialCharges).toBe(1);
  expect(await specials(page)).toEqual([]);
});

test('(j) the wave preview never reaches the Special button, in setup and mid-wave, for every wave', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  const special = (await rects(page)).special;
  const out: string[] = [];
  for (let wave = 1; wave <= 10; wave++) {
    for (const running of [false, true]) {
      const b = await page.evaluate(
        ([w, run]) => {
          const t = window.__tarpit as TarpitTestApi;
          const s = t.state();
          s.wave = (w as number) - 1;
          s.phase = 'setup';
          s.enemies = [];
          s.lives = 1000;
          if (run) t.startWave();
          t.step(1);
          const scene = t.game.scene.getScene('game');
          const texts = scene.children.list.filter(
            (o) => o.type === 'Text' && (o as Phaser.GameObjects.Text).text.startsWith('Next'),
          ) as Phaser.GameObjects.Text[];
          return texts.map((o) => {
            const r = o.getBounds();
            return { text: o.text, visible: o.visible, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          });
        },
        [wave, running] as const,
      );
      for (const t of b) {
        out.push(`wave ${wave}${running ? ' running' : ''}: "${t.text.replace(/\n/g, ' / ')}" x ${t.left.toFixed(0)}..${t.right.toFixed(0)} y ${t.top.toFixed(0)}..${t.bottom.toFixed(0)}`);
        expect(t.right, `wave ${wave} preview right edge`).toBeLessThanOrEqual(special.x - 4);
        expect(t.top, `wave ${wave} preview top`).toBeGreaterThanOrEqual(480);
        expect(t.bottom, `wave ${wave} preview bottom`).toBeLessThanOrEqual(special.y + special.height + 2);
      }
      if (!running && wave >= 2) expect(b.length, `a preview at wave ${wave}`).toBeGreaterThanOrEqual(1);
    }
  }
  expect(out.length).toBeGreaterThanOrEqual(19);
  // Row 1 buttons: 8 px apart, 14 px from the right edge, none overlapping.
  const r = await rects(page);
  expect([r.special, r.startWave, r.speed].map((q) => [q.x, q.width, q.y, q.height])).toEqual([
    [630, 100, 484, 42],
    [738, 130, 484, 42],
    [876, 70, 484, 42],
  ]);
});
