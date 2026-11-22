import { expect, test } from '@playwright/test';
import { decorFor } from '../src/game/decor/recipe';
import { MAP_IDS, MAPS } from '../src/sim/map';
import { fingerFor, rectPage, startGame, tap, tapCell, touchDrag } from './phone';

// Milestone 34 verifier, phone project: touch taps and drags over tree, flower and stone cells reach the game; the fade ends when the pick is toggled off.

const frames = (page: import('@playwright/test').Page, n = 3) =>
  page.evaluate((k) => new Promise((r) => { let left = k; const f = () => (--left <= 0 ? r(null) : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

for (const id of MAP_IDS) {
  test(`${id} by touch: tap-tap on tree, bush, flower and stone cells builds; the fade ends when the pick is dropped`, async ({ page }) => {
    await startGame(page, 'normal', id);
    await page.evaluate(() => { window.__tarpit!.state!().gold = 1e6; });
    const dec = decorFor(MAPS[id]);
    const cellOf = (p: { x: number; y: number }) => ({ col: Math.floor(p.x / 32), row: Math.floor(p.y / 32) });
    const taken = new Set(dec.growth.map((g) => `${g.cell.col},${g.cell.row}`));
    const ok = (c: { col: number; row: number }) => page.evaluate(([col, row]) => { const r = window.__tarpit!.buildAt!(col, row, 'musketeer').ok; if (r) window.__tarpit!.sellAt!(col, row); return r; }, [c.col, c.row]);
    const targets = [dec.growth.find((g) => g.kind === 'tree')!.cell, dec.growth.find((g) => g.kind === 'bush')!.cell];
    for (const list of [dec.flowers, dec.stones]) {
      for (const p of list) {
        const c = cellOf(p);
        if (!taken.has(`${c.col},${c.row}`) && !targets.some((t) => t.col === c.col && t.row === c.row) && (await ok(c))) { targets.push(c); break; }
      }
    }
    expect(targets.length).toBe(4);
    for (const c of targets) {
      await tap(page, 'bar:musketeer');
      await tapCell(page, c);
      await frames(page);
      expect((await page.evaluate(() => window.__tarpit!.decor()!)).growthAlpha).toBe(0.3);
      await tapCell(page, c);
      expect(await page.evaluate(([col, row]) => window.__tarpit!.state!().towers.some((t) => t.cell.col === col && t.cell.row === row), [c.col, c.row])).toBe(true);
      await tap(page, 'bar:musketeer'); // toggle the pick off
      await frames(page);
      const u = await page.evaluate(() => window.__tarpit!.ui!());
      expect((await page.evaluate(() => window.__tarpit!.decor()!)).growthAlpha, `pick ${u.pick}`).toBe(u.pick === null ? 1 : 0.3);
      await page.evaluate(([col, row]) => window.__tarpit!.sellAt!(col, row), [c.col, c.row]);
    }
    // A real touch drag from the bar onto the last (stone) cell.
    const cdp = await page.context().newCDPSession(page);
    const last = targets[3];
    const from = await rectPage(page, 'bar:musketeer');
    const to = await fingerFor(page, last);
    await touchDrag(page, cdp, from, to);
    expect(await page.evaluate(([col, row]) => window.__tarpit!.state!().towers.some((t) => t.cell.col === col && t.cell.row === row), [last.col, last.row]), 'touch drag onto a stone cell').toBe(true);
  });
}
