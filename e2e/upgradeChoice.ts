import { expect, test, type Page } from '@playwright/test';
import type { UiState } from '../src/game/GameScene';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { TowerType } from '../src/sim/types';
import { api, mapPress, openCampaign, press } from './campaign';
import { cellPage, fingerFor, touchDrag } from './phone';

export const choices = [
  ['musketeer', 'Sharpshooter', 'Volley'],
  ['cannon', 'Heavy Shot', 'Quick Loader'],
  ['tarpit', 'Deep Tar', 'Wide Tar'],
  ['longbow', 'War Bow', 'Quick Draw'],
  ['mortar', 'Siege Shell', 'Wide Burst'],
  ['firepot', 'Inferno', 'Lasting Flames'],
] as const satisfies readonly [TowerType, string, string][];
const cell = { col: 7, row: 5 };
const destination = { col: 9, row: 5 };
type Rect = { x: number; y: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x &&
  a.y < b.y + b.height && a.y + a.height > b.y;

const settle = (page: Page) => page.evaluate(() =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

async function upgradedTower(page: Page, touch: boolean, type: TowerType = 'musketeer') {
  await openCampaign(page, touch);
  const built = await page.evaluate(({ col, row, type }) => {
    const t = window.__tarpit as TarpitTestApi;
    t.state().gold = 1000;
    return t.buildAt(col, row, type).ok;
  }, { ...cell, type });
  expect(built).toBe(true);
  await mapPress(page, cell.col, cell.row, touch);
  await press(page, 'panel:upgrade', touch);
  expect(await api(page, (t) => t.state().towers[0].level)).toBe(2);
}

async function expectCardLayout(page: Page, choices: UiState['pathChoices']) {
  await settle(page);
  const { controls, board, buttons, panel } = await page.evaluate((choices) => {
    const t = window.__tarpit!;
    const rects = t.uiRects();
    const scale = (t.canvasToPage(100, 0).x - t.canvasToPage(0, 0).x) / 100;
    const origin = t.worldToPage(0, 0);
    const end = t.worldToPage(960, 480);
    const canvas = t.canvasToPage(0, 0);
    const board = { x: (Math.min(origin.x, end.x) - canvas.x) / scale, y: (Math.min(origin.y, end.y) - canvas.y) / scale,
      width: Math.abs(end.x - origin.x) / scale, height: Math.abs(end.y - origin.y) / scale };
    const controls = Object.entries(rects).filter(([key]) => !key.startsWith('panel:')).map(([, rect]) => rect);
    const panel = Object.entries(rects).filter(([key]) => key.startsWith('panel:'));
    const text = (objects: Phaser.GameObjects.GameObject[]): Phaser.GameObjects.Text[] =>
      objects.flatMap((o) => {
        const child = o as Phaser.GameObjects.Text | Phaser.GameObjects.Container;
        if (!child.visible || child.alpha <= 0) return [];
        if (child.type === 'Container') return text((child as Phaser.GameObjects.Container).list);
        return child.type === 'Text' ? [child as Phaser.GameObjects.Text] : [];
      });
    const sceneText = text(t.game.scene.getScene('game').children.list);
    return { board, controls, panel, buttons: ['A', 'B'].map((path, index) => {
      const rect = rects['panel:path:' + path];
      const labels = sceneText.filter((o) => {
        const box = o.getBounds();
        return box.centerX >= rect.x && box.centerX <= rect.x + rect.width &&
          box.centerY >= rect.y && box.centerY <= rect.y + rect.height;
      }).map((o) => {
        const b = o.getBounds();
        return { text: o.text, fits: b.left >= rect.x && b.right <= rect.x + rect.width &&
          b.top >= rect.y && b.bottom <= rect.y + rect.height };
      });
      return { width: rect.width * scale, height: rect.height * scale, labels, choice: choices[index] };
    }) };
  }, choices);
  for (const button of buttons) {
    const { width, height, labels, choice } = button;
    const { name, price, description, disabledReason } = choice;
    expect(width, name).toBeGreaterThanOrEqual(44);
    expect(height, name).toBeGreaterThanOrEqual(44);
    const expected = [name, String(price), description];
    if (disabledReason) expected.push(disabledReason);
    expect(labels.map((label) => label.text)).toEqual(expect.arrayContaining(expected));
    for (const label of labels) expect(label.fits, label.text).toBe(true);
  }
  for (const [index, [name, rect]] of panel.entries()) {
    expect(rect.x, name).toBeGreaterThanOrEqual(board.x - 0.1);
    expect(rect.y, name).toBeGreaterThanOrEqual(board.y - 0.1);
    expect(rect.x + rect.width, name).toBeLessThanOrEqual(board.x + board.width + 0.1);
    expect(rect.y + rect.height, name).toBeLessThanOrEqual(board.y + board.height + 0.1);
    expect(controls.some((control) => overlaps(control, rect)), name).toBe(false);
    for (const [other, second] of panel.slice(index + 1)) {
      expect(overlaps(rect, second), `${name} overlaps ${other}`).toBe(false);
    }
  }
}

const markPixels = (page: Page) => page.evaluate(({ col, row }) => {
  const t = window.__tarpit!;
  const point = t.cellToPage(col, row);
  const origin = t.canvasToPage(0, 0);
  const edge = t.canvasToPage(100, 0);
  const scale = (edge.x - origin.x) / 100;
  const x = Math.round((point.x - origin.x) / scale);
  const y = Math.round((point.y - origin.y) / scale);
  const data = t.game.canvas.getContext('2d')!.getImageData(x + 2, y - 18, 17, 17).data;
  let gold = 0;
  let cyan = 0;
  for (let i = 0; i < data.length; i += 4) {
    const column = (i / 4) % 17;
    const row = Math.floor(i / 4 / 17);
    // Only the diamond's interior, away from the existing level-2 gold ring.
    if (column >= 5 && column <= 10 && row >= 5 && row <= 10 &&
        data[i] === 242 && data[i + 1] === 201 && data[i + 2] === 76) gold++;
    if (data[i] === 118 && data[i + 1] === 230 && data[i + 2] === 232) cyan++;
  }
  return { gold: gold * scale ** 2, cyan: cyan * scale ** 2 };
}, cell);

export function upgradeChoiceChecks(touch: boolean) {
  for (const [type, a, b] of choices) {
    test(`${type}: both paths can be bought once, differ on the board, and undo restores level 2`, async ({ page }) => {
      await upgradedTower(page, touch, type);
      const options = await api(page, (t) => t.ui().pathChoices);
      expect(options.map((c) => c.name)).toEqual([a, b]);
      await expectCardLayout(page, options);
      // Deselect before sampling map pixels so the panel and range circle stay out.
      await press(page, 'panel:close', touch);
      await settle(page);
      expect(await markPixels(page)).toEqual({ gold: 0, cyan: 0 });
      for (const [path, name] of [['A', a], ['B', b]] as const) {
        await mapPress(page, cell.col, cell.row, touch);
        const price = options.find((option) => option.path === path)!.price;
        const gold = await api(page, (t) => t.state().gold);
        await press(page, `panel:path:${path}`, touch);
        expect(await api(page, (t) => t.state().towers[0])).toMatchObject({ level: 3, path });
        expect(await api(page, (t) => t.state().gold)).toBe(gold - price);
        expect(await api(page, (t) => t.ui().towerTitle)).toContain(name);
        expect(Object.keys(await api(page, (t) => t.uiRects())).filter((key) =>
          key === 'panel:upgrade' || key.startsWith('panel:path:'))).toEqual([]);
        await press(page, 'panel:close', touch);
        await settle(page);
        const pixels = await markPixels(page);
        const [mark, other] = path === 'A' ? ['gold', 'cyan'] as const : ['cyan', 'gold'] as const;
        expect(pixels[mark], name).toBeGreaterThanOrEqual(12);
        expect(pixels[other], name).toBe(0);
        await mapPress(page, cell.col, cell.row, touch);
        await press(page, 'panel:undo', touch);
        expect(await api(page, (t) => t.state().towers[0].level)).toBe(2);
        expect(await api(page, (t) => t.state().gold)).toBe(gold);
        await press(page, 'panel:close', touch);
      }
    });
  }

  test('short one gold disables both paths and pressing them keeps the tower and gold', async ({ page }) => {
    await upgradedTower(page, touch);
    const price = await api(page, (t) => t.ui().pathChoices[0].price);
    await page.evaluate((gold) => {
      const t = window.__tarpit as TarpitTestApi;
      t.state().gold = gold;
      t.step(0);
    }, price - 1);
    const before = await api(page, (t) => t.state());
    const options = await api(page, (t) => t.ui().pathChoices);
    await expectCardLayout(page, options);
    for (const path of ['A', 'B'] as const) {
      expect(options.find((choice) => choice.path === path)?.disabledReason).toBeTruthy();
      await press(page, `panel:path:${path}`, touch);
      expect(await api(page, (t) => t.state().gold)).toBe(before.gold);
      expect(await api(page, (t) => t.state().towers)).toEqual(before.towers);
    }
  });

  test('level 3 moves for free in setup and sells for 70% once locked', async ({ page }) => {
    await upgradedTower(page, touch);
    await press(page, 'panel:path:B', touch);
    await press(page, 'panel:close', touch);
    const beforeMove = await api(page, (t) => ({ gold: t.state().gold, spent: t.state().towers[0].spent }));
    const from = await cellPage(page, cell);
    if (touch) await touchDrag(page, await page.context().newCDPSession(page), from, await fingerFor(page, destination));
    else {
      const to = await cellPage(page, destination);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 10 });
      await page.mouse.up();
    }
    const moved = await api(page, (t) => t.state().towers[0]);
    expect(moved).toMatchObject({ cell: destination, level: 3, path: 'B', spent: beforeMove.spent });
    expect(await api(page, (t) => t.state().gold)).toBe(beforeMove.gold);
    await press(page, 'startWave', touch);
    await mapPress(page, destination.col, destination.row, touch);
    expect(await api(page, (t) => t.uiRects()['panel:undo'])).toBeUndefined();
    await press(page, 'panel:sell', touch);
    expect(await api(page, (t) => t.state().towers)).toEqual([]);
    expect(await api(page, (t) => t.state().gold)).toBe(beforeMove.gold + Math.floor(moved.spent * 7 / 10));
  });

  test('a full level 3 campaign wins, and restarting twice restores scene resources', async ({ page }) => {
    await openCampaign(page, touch);
    const counts = () => api(page, (t) => {
      const scene = t.game.scene.getScene('game');
      const textures = t.game.textures.getTextureKeys().sort();
      const stableTextures = textures.filter((key) => !/^[0-9a-f]{8}-/.test(key));
      return {
        objects: scene.children.length,
        voices: t.audio().voices,
        cameras: scene.cameras.cameras.length,
        stableTextures,
        anonymousTextures: textures.length - stableTextures.length,
        pointerdown: scene.input.listenerCount('pointerdown'),
        pointermove: scene.input.listenerCount('pointermove'),
        pointerup: scene.input.listenerCount('pointerup'),
        keyboard: scene.input.keyboard?.listenerCount('keydown-ESC'),
      };
    });
    await expect.poll(() => api(page, (t) => t.audio().voices)).toBe(0);
    const baseline = await counts();
    for (let i = 0; i < 2; i++) {
      const result = await api(page, (t) => {
        const phase = t.runScript('comboBuild');
        const state = t.state();
        return { phase, wave: state.wave, level3: state.towers.filter((tower) => tower.level === 3 && tower.path !== undefined).length };
      });
      expect(result).toMatchObject({ phase: 'won', wave: 20 });
      expect(result.level3).toBeGreaterThan(0);
      await press(page, 'playAgain', touch);
      await expect.poll(() => api(page, (t) => t.state().wave)).toBe(0);
      await expect.poll(counts).toEqual(baseline);
    }
  });
}

export function choiceVisual(touch: boolean, name: string) {
  test(name, async ({ page }) => {
    await upgradedTower(page, touch);
    await page.mouse.move(0, 0);
    await settle(page);
    await expect(page.locator('canvas')).toHaveScreenshot(`${name}.png`);
    if (process.env.M37_FRAMES) {
      const file = touch ? 'm37-upgrade-choice-phone.png' : 'm37-upgrade-choice.png';
      await page.locator('canvas').screenshot({ path: `${process.env.M37_FRAMES}/${file}` });
    }
  });
}
