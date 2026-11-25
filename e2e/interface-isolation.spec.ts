import { expect, test } from '@playwright/test';
import { api, press } from './campaign';
import { onScreen } from './campaignScreens';

import { waitForFirstScreen } from './title';

for (const ui of ['', '&ui=old', '&ui=new']) {
  test(`interface drawing stays behind the explicit switch (${ui || 'absent'})`, async ({ page }) => {
    test.setTimeout(60_000);
    const active = ui === '&ui=new';
    const drawn = () => api(page, t => {
      const scene = t.game.scene.getScene(t.scene());
      return scene.children.list.filter(object => object.name.startsWith('clean-') || object.name === 'hud-level-name')
        .filter(object => (object as Phaser.GameObjects.Graphics).visible).map(object => object.name);
    });
    await page.goto('/?test=1' + ui);
    await waitForFirstScreen(page);
    expect(await drawn()).toEqual([]);
    await expect(page.locator('canvas[data-interface-ink]')).toHaveCount(0);
    await press(page, 'title:campaign');
    await onScreen(page, 'levelMap');
    await press(page, 'title:stop:1');
    await onScreen(page, 'levelCard');
    expect(await drawn()).toEqual(active ? ['clean-printed-card'] : []);
    await expect(page.locator('canvas[data-interface-ink]')).toHaveCount(active ? 1 : 0);
    await press(page, 'title:play');
    await onScreen(page, 'game');
    await expect(page.locator('canvas[data-interface-ink]')).toHaveCount(active ? 1 : 0);
    if (active) expect(await drawn()).toEqual(expect.arrayContaining(['clean-build-icons', 'clean-tower-spots', 'hud-level-name']));
    else expect(await drawn()).toEqual([]);
    await api(page, t => { t.state().phase = 'lost'; t.step(0); });
    await onScreen(page, 'result');
    expect((await drawn()).includes('clean-printed-result')).toBe(active);
  });
}
