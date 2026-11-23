// Milestone 37 verifier: panel placement for towers near every edge, at each
// level, and Menu / Play again leaks after a game with level 3 towers.
import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { api, mapPress, openCampaign, press } from './campaign';
import { waitForTitle } from './title';

type Rect = { x: number; y: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function geometry(page: Page, cell: { col: number; row: number }) {
  return page.evaluate(({ col, row }) => {
    const t = window.__tarpit!;
    const rects = t.uiRects();
    const o = t.canvasToPage(0, 0);
    const scale = (t.canvasToPage(100, 0).x - o.x) / 100;
    const a = t.worldToPage(0, 0), b = t.worldToPage(960, 480);
    const board = { x: (Math.min(a.x, b.x) - o.x) / scale, y: (Math.min(a.y, b.y) - o.y) / scale, width: Math.abs(b.x - a.x) / scale, height: Math.abs(b.y - a.y) / scale };
    const c = t.cellToPage(col, row);
    const c2 = t.cellToPage(col + 1, row + 1);
    const half = Math.abs(c2.x - c.x) / scale / 2 || 16;
    const cx = (c.x - o.x) / scale, cy = (c.y - o.y) / scale;
    const tower = { x: cx - 16, y: cy - 16, width: 32, height: 32 };
    return { rects, board, scale, tower, half };
  }, cell);
}

export function verifierChecks(touch: boolean) {
  test('panel stays on the board, off the controls and off the tower, at levels 1-3, for edge towers', async ({ page }) => {
    await openCampaign(page, touch);
    const anchors = [[0, 0], [29, 0], [0, 14], [29, 14], [15, 0], [15, 14], [0, 7], [29, 7]];
    const cells: { col: number; row: number }[] = [];
    await page.evaluate(() => { (window.__tarpit as TarpitTestApi).state().gold = 100000; });
    for (const [ac, ar] of anchors) {
      const found = await page.evaluate(([ac, ar]) => {
        const t = window.__tarpit as TarpitTestApi;
        const order: [number, number][] = [];
        for (let c = 0; c < 30; c++) for (let r = 0; r < 15; r++) order.push([c, r]);
        order.sort((p, q) => Math.hypot(p[0] - ac, p[1] - ar) - Math.hypot(q[0] - ac, q[1] - ar));
        for (const [c, r] of order) {
          if (t.state().towers.some((x) => x.cell.col === c && x.cell.row === r)) continue;
          if (t.buildAt(c, r, 'mortar').ok) return { col: c, row: r };
        }
        return null;
      }, [ac, ar]);
      if (found) cells.push(found);
    }
    expect(cells.length).toBeGreaterThanOrEqual(6);
    for (const level of [1, 2, 3]) {
      if (level >= 2) await page.evaluate(() => { const t = window.__tarpit as TarpitTestApi; for (const x of t.state().towers) t.upgradeAt(x.cell.col, x.cell.row); });
      if (level === 3) await page.evaluate(() => { const t = window.__tarpit as TarpitTestApi; t.state().towers.forEach((x, i) => t.upgradeAt(x.cell.col, x.cell.row, i % 2 ? 'B' : 'A')); });
      for (const cell of cells) {
        await mapPress(page, cell.col, cell.row, touch);
        await settle(page);
        const { rects, board, tower, scale } = await geometry(page, cell);
        const panel = Object.entries(rects).filter(([k]) => k.startsWith('panel:'));
        const controls = Object.entries(rects).filter(([k]) => !k.startsWith('panel:')).map(([, r]) => r);
        expect(panel.length, `panel open at level ${level} ${JSON.stringify(cell)}`).toBeGreaterThan(0);
        for (const [name, r] of panel) {
          const tag = `L${level} ${JSON.stringify(cell)} ${name}`;
          expect(r.x, tag).toBeGreaterThanOrEqual(board.x - 0.5);
          expect(r.y, tag).toBeGreaterThanOrEqual(board.y - 0.5);
          expect(r.x + r.width, tag).toBeLessThanOrEqual(board.x + board.width + 0.5);
          expect(r.y + r.height, tag).toBeLessThanOrEqual(board.y + board.height + 0.5);
          expect(controls.some((c) => overlaps(c, r)), tag + ' on controls').toBe(false);
          expect(overlaps(tower, r), tag + ' covers the tower').toBe(false);
          if (touch && scale > 0) {
            expect(r.width * scale, tag + ' width css px').toBeGreaterThanOrEqual(44 - 0.5);
            expect(r.height * scale, tag + ' height css px').toBeGreaterThanOrEqual(44 - 0.5);
          }
        }
        await press(page, 'panel:close', touch);
      }
    }
  });

  test('Menu then Play again twice after a level 3 win leaks no scene resources', async ({ page }) => {
    await openCampaign(page, touch);
    const counts = () => api(page, (t) => {
      const scene = t.game.scene.getScene('game');
      const keys = t.game.textures.getTextureKeys().filter((k) => !/^[0-9a-f]{8}-/.test(k)).sort();
      return { objects: scene.children.length, keys, voices: t.audio().voices, down: scene.input.listenerCount('pointerdown'), move: scene.input.listenerCount('pointermove') };
    });
    await expect.poll(() => api(page, (t) => t.audio().voices)).toBe(0);
    const base = await counts();
    for (let i = 0; i < 2; i++) {
      expect(await api(page, (t) => t.runScript('comboBuild'))).toBe('won');
      await press(page, 'menu', touch);
      await waitForTitle(page);
      await press(page, 'title:play', touch);
      await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
      await expect.poll(() => api(page, (t) => t.state().wave)).toBe(0);
      await expect.poll(counts).toEqual(base);
    }
  });
}
