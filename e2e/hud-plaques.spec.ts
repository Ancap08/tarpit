import { expect, test, type Page } from '@playwright/test';
import { COLORS } from '../src/game/palette';
import type { Rect } from '../src/game/input';
import { THEME } from '../src/game/ui/theme';
import { api, mapPress, openCampaign, press } from './campaign';
import { settle } from './painted';

function readRow(page: Page, x: number, y: number, width: number): Promise<number[]> {
  return page.evaluate(([x, y, width]) => {
    const ctx = window.__tarpit!.game.canvas.getContext('2d')!;
    const data = ctx.getImageData(x, y, width, 1).data;
    return Array.from({ length: width }, (_, i) => (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2]);
  }, [x, y, width]);
}

function readEdge(page: Page, r: Rect): Promise<number[]> {
  return readRow(page, r.x, r.y + r.height / 2, 8);
}

test('the landscape coin clears the frame and Gold, including a five-digit balance', async ({ page }) => {
  await openCampaign(page);
  await api(page, t => { t.state().gold = 99999; t.step(0); });
  await settle(page);
  const { gold, lives } = await api(page, t => {
    const labels = t.campaignLabels();
    return { gold: labels.find(l => l.text === t.hudText().gold)!, lives: labels.find(l => l.text === t.hudText().lives)! };
  });
  const pocket = await readRow(page, 3, Math.round(gold.y + gold.height / 2), gold.x - 3);
  expect(pocket).toContain(0xf1c46a);
  expect(pocket.findIndex(pixel => pixel !== THEME.wood)).toBeGreaterThanOrEqual(4);
  expect(pocket.reverse().findIndex(pixel => pixel !== THEME.wood)).toBeGreaterThanOrEqual(4);
  expect(lives.x - gold.x - gold.width).toBeGreaterThanOrEqual(4);
});

test('ready plaques keep their brass and unavailable ones stay flat on reopening', async ({ page }) => {
  await openCampaign(page);
  await settle(page);
  const buttons = await api(page, t => t.uiRects());
  const flat = new Set([COLORS.buttonDisabled]);
  expect(new Set(await readEdge(page, buttons.special))).toEqual(flat);
  const ready = await readEdge(page, buttons.startWave);
  expect(ready).toContain(COLORS.button);
  expect(ready).toContain(COLORS.buttonEdge);

  await api(page, t => { t.buildAt(7, 5, 'musketeer'); });
  await mapPress(page, 7, 5, false);
  await press(page, 'panel:close');
  await api(page, t => { t.state().gold = 0; t.step(0); });
  await mapPress(page, 7, 5, false);
  await settle(page);
  const upgrade = await api(page, t => t.uiRects()['panel:upgrade']);
  expect(new Set(await readEdge(page, upgrade))).toEqual(flat);
});
