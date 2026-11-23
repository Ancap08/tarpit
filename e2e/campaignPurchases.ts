import { expect, test, type Page } from '@playwright/test';
import { COLORS } from '../src/game/palette';
import { SPECIAL_DEFS, SPECIAL_TYPES, TOWER_DEFS, type TowerType } from '../src/sim';
import { api, mapPress, openCampaign, press } from './campaign';

/** Read the actual slot backgrounds and drawn locks in the game scene. */
async function barAppearance(page: Page) {
  return page.evaluate((types) => {
    const t = window.__tarpit!;
    const scene = t.game.scene.getScene('game');
    return types.map(type => {
      const rect = t.uiRects()[`bar:${type}`];
      const box = scene.children.list.find((child): child is Phaser.GameObjects.Rectangle => {
        if (child.type !== 'Rectangle') return false;
        const box = child as Phaser.GameObjects.Rectangle;
        return box.visible && box.x === rect.x && box.y === rect.y &&
          box.width === rect.width && box.height === rect.height;
      });
      if (!box) throw new Error(`Missing build button for ${type}`);
      const lock = scene.children.getByName(`bar-lock:${type}`) as Phaser.GameObjects.Graphics | null;
      return { type, rect, fill: box.fillColor, locked: !!lock?.visible && lock.alpha > 0 && lock.commandBuffer.length > 0 };
    });
  }, Object.keys(TOWER_DEFS) as TowerType[]);
}

export function campaignPurchaseCase(touch: boolean) {
  test('the gold cheat lifts the level locks on the build bar, upgrades and specials', async ({ page }) => {
    await openCampaign(page, touch);
    await api(page, t => t.startLevel(1));
    const cannon = async () => (await barAppearance(page)).find(slot => slot.type === 'cannon');
    expect(await cannon()).toMatchObject({ locked: true });
    await press(page, 'bar:cannon', touch);
    await mapPress(page, 7, 1, touch);
    expect(await api(page, t => t.ui().pick)).toBeNull();
    expect(await api(page, t => t.state().towers)).toHaveLength(0);
    expect(await api(page, t => t.buildAt(7, 1, 'cannon'))).toMatchObject({ ok: false, reason: 'tower-locked' });

    for (let i = 0; i < 5; i++) await press(page, 'gold', touch);
    expect(await cannon()).toMatchObject({ locked: false });
    await press(page, 'bar:cannon', touch);
    await mapPress(page, 7, 1, touch);
    if (touch) await mapPress(page, 7, 1, true);
    expect(await api(page, t => t.state().towers)).toMatchObject([{ type: 'cannon', cell: { col: 7, row: 1 } }]);
    await mapPress(page, 7, 1, touch);
    await press(page, 'panel:upgrade', touch);
    await press(page, 'panel:path:A', touch);
    expect(await api(page, t => t.state().towers[0])).toMatchObject({ upgraded: true, path: 'A' });
    await press(page, 'panel:close', touch);

    await api(page, t => { t.state().wave = 2; t.startWave(); });
    await press(page, 'special', touch);
    expect(await api(page, t => Object.keys(t.uiRects()).filter(key => key.startsWith('special:'))))
      .toEqual(['special:keg', 'special:barricade']);
  });

  test('purchase controls follow the level loadout in their original slots', async ({ page }) => {
    await openCampaign(page, touch);
    let freeSlots;
    for (const id of [null, 1, 10]) {
      if (id !== null) await page.evaluate(id => window.__tarpit!.startLevel!(id), id);
      expect(await api(page, t => t.state().level?.id ?? null)).toBe(id);
      // Cover every purchase regardless of the run's starting gold.
      await api(page, t => { t.state().gold = 1000; t.step(0); });
      const slots = await barAppearance(page);
      const rects = slots.map(slot => slot.rect);
      if (id === null) freeSlots = rects;
      else expect(rects).toEqual(freeSlots);
      for (const slot of slots) {
        const locked = id === 1 && slot.type !== 'musketeer' && slot.type !== 'longbow';
        expect(slot.locked, `${id}/${slot.type} drawn lock`).toBe(locked);
        expect(slot.fill === COLORS.buttonDisabled, `${id}/${slot.type} dimmed`).toBe(locked);
      }

      await press(page, 'bar:cannon', touch);
      expect(await api(page, t => t.ui().pick)).toBe(id === 1 ? null : 'cannon');
      if (id !== 1) await press(page, 'bar:cannon', touch);
      expect(await api(page, t => t.buildAt(7, 1, 'musketeer'))).toMatchObject({ ok: true });
      await mapPress(page, 7, 1, touch);
      await press(page, 'panel:upgrade', touch);
      expect(await api(page, t => t.state().towers[0].upgraded)).toBe(true);
      const buttons = await api(page, t => Object.keys(t.uiRects()));
      expect(buttons).toContain('panel:close');
      expect(buttons).not.toContain('panel:upgrade');
      expect(buttons.filter(key => key.startsWith('panel:path:'))).toEqual(
        id === 1 ? [] : ['panel:path:A', 'panel:path:B']);
      await press(page, 'panel:close', touch);

      // Free play unlocks specials by wave. Both campaign stops grant their list on wave one.
      if (id === null) await page.evaluate(wave => { window.__tarpit!.state!().wave = wave - 1; },
        Math.max(...Object.values(SPECIAL_DEFS).map(special => special.unlockWave)));
      expect(await api(page, t => t.startWave())).toMatchObject({ ok: true });
      await press(page, 'special', touch);
      if (id === 1) {
        expect(await api(page, t => t.ui().special)).toMatchObject({ aiming: 'keg', menuOpen: false, unlocked: ['keg'] });
      } else {
        expect(await api(page, t => Object.keys(t.uiRects()).filter(key => key.startsWith('special:'))))
          .toEqual(SPECIAL_TYPES.map(type => `special:${type}`));
      }
    }
  });
}
