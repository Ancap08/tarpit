import { expect, test } from '@playwright/test';
import { api, fingerFor, rectPage, state, tap, touchDrag, ui } from './phone';
import { expectMeadowDirections, openPainted, painted, paintedBar, stageMeadowDirections, waitForGame } from './painted';
import { waitForTitle } from './title';
import type { TitleUiState } from '../src/game/TitleScene';

for (const map of ['meadow', 'switchback', 'riverbend'] as const) {
  test(`touch Look enables 2x Painted ${map} and its drag magnifier`, async ({ page }) => {
    await page.goto('/?test=1');
    await waitForTitle(page);
    await tap(page, 'title:look:painted');
    expect(await api(page, (a) => a.ui<TitleUiState>().look)).toBe('painted');
    await tap(page, `title:map:${map}`);
    await tap(page, 'title:play');
    await waitForGame(page);
    await expect.poll(() => painted(page)).toMatchObject({ active: true, density: 2 });
    const bar = await paintedBar(page);
    expect(bar.map(({ icons }) => icons.map(({ key, frame }) => [key, frame]))).toEqual([
      'musketeer', 'cannon', 'tar-pit', 'longbow', 'mortar', 'fire-pot',
    ].map((name) => [[`painted:${name}:2x`, 6]]));
    expect(bar.map(({ labels }) => labels.map(({ text }) => text))).toEqual([['50'], ['80'], ['60'], ['40'], ['110'], ['70']]);

    const cell = { col: 7, row: 5 };
    const client = await page.context().newCDPSession(page);
    await touchDrag(page, client, await rectPage(page, 'bar:musketeer'), await fingerFor(page, cell), async () => {
      const current = await ui(page);
      expect(current.magnifier).not.toBeNull();
      expect(current.dragging?.cell).toEqual(cell);
      expect((await painted(page)).sprites).toContainEqual(expect.objectContaining({
        key: 'painted:musketeer:2x', frame: 6, visible: true, x: 304, y: 316,
      }));
      await expect.poll(() => page.evaluate(() => {
        const scene = window.__tarpit!.game.scene.getScene('game');
        return scene.cameras.getCamera('magnifier')?.renderList.flatMap((child) =>
          'texture' in child ? [(child.texture as { key: string }).key] : []);
      })).toEqual(expect.arrayContaining([`painted:${map}:2x`, 'painted:musketeer:2x']));
    });
    expect((await state(page)).towers).toContainEqual(expect.objectContaining({ cell, type: 'musketeer' }));
    expect((await ui(page)).magnifier).toBeNull();
  });
}

test('painted enemy sheets face each Meadow segment in portrait', async ({ page }) => {
  await openPainted(page);
  await stageMeadowDirections(page);
  await expectMeadowDirections(page, true);
});
