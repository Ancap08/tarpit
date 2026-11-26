import { expect, test } from '@playwright/test';
import { press } from './campaign';
import { onScreen } from './campaignScreens';
import { waitForFirstScreen } from './title';

// Milestone 55c verifier: leaving a level for the title and entering again must
// not leave the previous scene's device-resolution overlay canvas alive.
test.use({ launchOptions: { args: ['--js-flags=--expose-gc'] } });

async function visit(page: import('@playwright/test').Page, ui: boolean) {
  await page.addInitScript(() => {
    (window as unknown as { __canvases: WeakRef<HTMLCanvasElement>[] }).__canvases = [];
    const create = document.createElement.bind(document);
    document.createElement = ((tag: string, options?: ElementCreationOptions) => {
      const element = create(tag, options);
      if (tag.toLowerCase() === 'canvas') (window as unknown as { __canvases: WeakRef<HTMLCanvasElement>[] }).__canvases.push(new WeakRef(element as HTMLCanvasElement));
      return element;
    }) as typeof document.createElement;
  });
  await page.goto('/?test=1&look=classic' + (ui ? '&ui=new' : ''));
  await waitForFirstScreen(page);
  const detachedMegabytes = () => page.evaluate(async () => {
    const gc = (window as unknown as { gc: () => void }).gc;
    for (let i = 0; i < 4; i++) { gc(); await new Promise(resolve => setTimeout(resolve, 250)); }
    const alive = (window as unknown as { __canvases: WeakRef<HTMLCanvasElement>[] }).__canvases.map(ref => ref.deref()).filter((c): c is HTMLCanvasElement => !!c);
    const detached = alive.filter(canvas => !canvas.isConnected);
    return { mb: detached.reduce((sum, canvas) => sum + canvas.width * canvas.height * 4, 0) / 1e6,
      ink: detached.filter(canvas => canvas.dataset.interfaceInk !== undefined).length };
  });
  const samples = [];
  for (let i = 0; i < 4; i++) {
    await press(page, 'title:campaign', true);
    await onScreen(page, 'levelMap');
    await press(page, 'title:stop:1', true);
    await onScreen(page, 'levelCard');
    await press(page, 'title:play', true);
    await onScreen(page, 'game');
    await page.keyboard.press('p');
    await press(page, 'pause:menu', true);
    await onScreen(page, 'levelMap');
    await press(page, 'title:back', true);
    await onScreen(page, 'first');
    samples.push(await detachedMegabytes());
  }
  return samples;
}

test('returning from a level to the title releases each overlay canvas (switch on)', async ({ page }) => {
  const samples = await visit(page, true);
  expect(samples.map(sample => sample.ink), JSON.stringify(samples)).toEqual([0, 0, 0, 0]);
  expect(samples.at(-1)!.mb - samples[0].mb, JSON.stringify(samples)).toBeLessThan(2);
});

test('with the switch off the same round trips keep detached canvas memory flat', async ({ page }) => {
  const samples = await visit(page, false);
  expect(samples.at(-1)!.mb - samples[0].mb, JSON.stringify(samples)).toBeLessThan(2);
});
