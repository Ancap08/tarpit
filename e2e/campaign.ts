import { expect, type Page } from '@playwright/test';
import { BOON_NAMES, boonDescription, GRUMBLEMAW_NAME, rewardTitle } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { lastSpawnTick, type BoonId } from '../src/sim';
import { waitForTitle } from './title';

export const OFFERS = {
  5: ['longBarrels', 'keenArrows', 'warChest'],
  10: ['stickyTar', 'hotCoals', 'quickHands'],
  15: ['stoneWalls', 'veteranCrews', 'biggerBlasts'],
} as const satisfies Record<number, readonly BoonId[]>;

export const api = <T>(page: Page, fn: (t: TarpitTestApi) => T) =>
  page.evaluate(`(${fn.toString()})(window.__tarpit)`) as Promise<T>;

export async function openCampaign(page: Page, touch = false, live = false): Promise<void> {
  await page.goto(live ? '/' : '/?test=1');
  await waitForTitle(page);
  await press(page, 'title:play', touch);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
}

export async function buttonCentre(page: Page, key: string): Promise<{ x: number; y: number }> {
  const point = await page.evaluate((key) => {
    const t = window.__tarpit!;
    const rect = t.uiRects()[key];
    return rect ? t.canvasToPage(rect.x + rect.width / 2, rect.y + rect.height / 2) : null;
  }, key);
  expect(point, key).not.toBeNull();
  return point!;
}

export async function press(page: Page, key: string, touch = false): Promise<void> {
  const point = await buttonCentre(page, key);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

export async function mapPress(page: Page, col: number, row: number, touch = false): Promise<void> {
  const point = await page.evaluate(([col, row]) => window.__tarpit!.cellToPage(col, row), [col, row]);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

export const clearToOffer = (page: Page, wave: keyof typeof OFFERS): Promise<void> => page.evaluate((wave) => {
  const t = window.__tarpit as TarpitTestApi;
  // Use the actual wave, but skip earlier waves and survive its leaks.
  t.state().wave = wave - 1;
  t.state().lives = 1000;
  if (!t.startWave().ok) throw new Error(`Could not start wave ${wave}`);
  for (let chunk = 0; chunk < 120 && t.state().phase === 'wave'; chunk++) t.step(120);
}, wave);

export const visibleTexts = (page: Page) => page.evaluate(() => {
  const children = window.__tarpit!.game.scene.getScene('game').children.list;
  const labels = (objects: Phaser.GameObjects.GameObject[]): string[] => objects.flatMap((child) => {
    const view = child as Phaser.GameObjects.Text | Phaser.GameObjects.Container;
    if (!view.visible || view.alpha <= 0) return [];
    if (view.type === 'Container') return labels((view as Phaser.GameObjects.Container).list);
    return view.type === 'Text' ? [(view as Phaser.GameObjects.Text).text] : [];
  });
  return labels(children);
});

export async function expectOffer(page: Page, wave: keyof typeof OFFERS): Promise<void> {
  const options = OFFERS[wave];
  expect(await api(page, (t) => t.pendingBoon())).toEqual({ wave, options });
  const labels = await visibleTexts(page);
  const rects = await api(page, (t) => t.uiRects());
  expect(Object.keys(rects).filter((key) => key.startsWith('reward:'))).toEqual(options.map((id) => `reward:${id}`));
  expect(labels).toContain(rewardTitle(wave));
  expect(labels.filter((label) => Object.values(BOON_NAMES).some((name) => name === label))).toEqual(options.map((id) => BOON_NAMES[id]));
  for (const id of options) {
    expect(labels).toContain(BOON_NAMES[id]);
    expect(labels).toContain(boonDescription(id));
  }
  const cards = await page.evaluate((options) => {
    const t = window.__tarpit!;
    const scene = t.game.scene.getScene('game');
    const gold = t.hudText!().gold;
    const body = scene.children.list.find((o) =>
      o.type === 'Text' && (o as Phaser.GameObjects.Text).text === gold) as Phaser.GameObjects.Text;
    const labels = scene.children.list.filter((o) => o.type === 'Container' && (o as Phaser.GameObjects.Container).visible)
      .flatMap((o) => (o as Phaser.GameObjects.Container).list)
      .filter((o) => o.type === 'Text') as Phaser.GameObjects.Text[];
    return options.map(({ id, name, effect }) => {
      const r = t.uiRects()[`reward:${id}`];
      const title = labels.find((label) => label.text === name)!;
      const description = labels.find((label) => label.text === effect)!;
      const box = description.getBounds();
      return {
        top: t.canvasToPage(r.x, r.y), bottom: t.canvasToPage(r.x + r.width, r.y + r.height),
        effectFits: box.left >= r.x && box.right <= r.x + r.width &&
          box.top >= title.getBounds().bottom && box.bottom <= r.y + r.height,
        effectFont: parseFloat(String(description.style.fontSize)), hudFont: parseFloat(String(body.style.fontSize)),
      };
    });
  }, options.map((id) => ({ id, name: BOON_NAMES[id], effect: boonDescription(id) })));
  const viewport = page.viewportSize()!;
  for (const [i, card] of cards.entries()) {
    expect(card.effectFits, options[i]).toBe(true);
    expect(card.effectFont, options[i]).toBeGreaterThanOrEqual(card.hudFont);
    expect(card.top.x).toBeGreaterThanOrEqual(0);
    expect(card.top.y).toBeGreaterThanOrEqual(0);
    expect(card.bottom.x).toBeLessThanOrEqual(viewport.width);
    expect(card.bottom.y).toBeLessThanOrEqual(viewport.height);
    expect(card.bottom.x - card.top.x).toBeGreaterThanOrEqual(44);
    expect(card.bottom.y - card.top.y).toBeGreaterThanOrEqual(44);
    for (const other of cards.slice(i + 1)) {
      const overlaps = card.top.x < other.bottom.x && card.bottom.x > other.top.x &&
        card.top.y < other.bottom.y && card.bottom.y > other.top.y;
      expect(overlaps).toBe(false);
    }
  }
}

/** Smoke every input position in one run, one from each of the three offers. */
export async function pickEachPosition(page: Page, input: 'mouse' | 'key' | 'touch'): Promise<void> {
  await openCampaign(page, input === 'touch');
  const held: BoonId[] = [];
  for (const [wave, position] of [[5, 0], [10, 1], [15, 2]] as const) {
    await clearToOffer(page, wave);
    await expectOffer(page, wave);
    const id = OFFERS[wave][position];
    if (input === 'key') await page.keyboard.press(String(position + 1));
    else await press(page, `reward:${id}`, input === 'touch');
    held.push(id);
    expect(await api(page, (t) => t.heldBoons())).toEqual(held);
    expect(await api(page, (t) => t.pendingBoon())).toBeNull();
  }
}

export async function expectActTwoPreviewsFit(page: Page): Promise<void> {
  for (let wave = 11; wave <= 20; wave++) {
    const result = await page.evaluate((wave) => {
      const t = window.__tarpit as TarpitTestApi;
      t.state().wave = wave - 1;
      t.state().boons = ['longBarrels', 'stickyTar', 'stoneWalls'].slice(0, wave > 15 ? 3 : 2) as BoonId[];
      t.step(0);
      const scene = t.game.scene.getScene('game');
      const previewText = t.hudText().next;
      const label = scene.children.list.find((child) => child.type === 'Text' &&
        (child as Phaser.GameObjects.Text).visible && (child as Phaser.GameObjects.Text).text === previewText) as Phaser.GameObjects.Text | undefined;
      const box = label?.getBounds();
      if (!label || !box) return null;
      const top = t.canvasToPage(box.x, box.y);
      const bottom = t.canvasToPage(box.right, box.bottom);
      const controls = Object.entries(t.uiRects()).filter(([key]) =>
        key === 'special' || key === 'startWave' || key === 'speed' || key.startsWith('boon:'));
      const intrusions = controls.filter(([, r]) =>
        box.x < r.x + r.width && box.right > r.x && box.y < r.y + r.height && box.bottom > r.y).map(([key]) => key);
      const hudEdges = t.layout() === 'portrait' ? { top: 0, bottom: 76 } : { top: 480, bottom: 580 };
      return { text: label.text, lines: label.getWrappedText().length, top, bottom, intrusions,
        hudFit: box.y >= hudEdges.top && box.bottom <= hudEdges.bottom };
    }, wave);
    expect(result, `wave ${wave} preview`).not.toBeNull();
    expect(result!.text).toMatch(/^Next: \d+/);
    if (wave === 20) expect(result!.text).toContain(GRUMBLEMAW_NAME);
    expect(result!.lines).toBeLessThanOrEqual(2);
    expect(result!.top.x).toBeGreaterThanOrEqual(0);
    expect(result!.top.y).toBeGreaterThanOrEqual(0);
    expect(result!.bottom.x).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(result!.bottom.y).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(result!.intrusions).toEqual([]);
    expect(result!.hudFit).toBe(true);
  }
}

/** Put a real wave just past its last spawn without playing its preceding waves. */
export const postSpawn = (page: Page, wave: number) => page.evaluate(({ wave, steps }) => {
  const t = window.__tarpit as TarpitTestApi;
  const s = t.state();
  s.phase = 'setup';
  s.wave = wave - 1;
  s.lives = 1000;
  s.enemies = [];
  t.startWave();
  t.step(steps);
}, { wave, steps: lastSpawnTick(wave) + 1 });

export async function expectStartLabelFits(page: Page, text: string): Promise<void> {
  expect(await api(page, (t) => t.hudText().startWave)).toBe(text);
  const result = await page.evaluate((text) => {
    const t = window.__tarpit!;
    const scene = t.game.scene.getScene('game');
    const label = scene.children.list.find((child) => child.type === 'Text' &&
      (child as Phaser.GameObjects.Text).visible && (child as Phaser.GameObjects.Text).text === text) as Phaser.GameObjects.Text | undefined;
    const box = label?.getBounds();
    if (!box) return null;
    const button = t.uiRects().startWave;
    return {
      left: box.left - button.x,
      right: button.x + button.width - box.right,
      top: box.top - button.y,
      bottom: button.y + button.height - box.bottom,
    };
  }, text);
  expect(result, text).not.toBeNull();
  for (const [edge, margin] of Object.entries(result!)) {
    expect(margin, `${text.replace('\n', ' / ')}: ${edge} padding`).toBeGreaterThanOrEqual(0);
  }
}
