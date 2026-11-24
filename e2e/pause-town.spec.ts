import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { smokePuff } from '../src/game/decor/motion';
import { MAPS, pathLength } from '../src/sim/map';
import { press } from './campaign';
import { waitForGame } from './painted';
import { setPageHidden } from './pause';
import { waitForTitle } from './title';

function townFrame(page: Page) {
  return page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const map = scene.decorState()!;
    const town = scene.children.list.find(node => node.type === 'Container' &&
      (node as Phaser.GameObjects.Container).getByName('town:map')) as Phaser.GameObjects.Container;
    const sackPose = town.getAll('name', 'town:sacks').map(node => {
      if (node.type === 'Graphics') return (node as Phaser.GameObjects.Graphics).commandBuffer;
      const image = node as Phaser.GameObjects.Image;
      return [image.x, image.y, image.rotation, image.alpha];
    });
    const smoke = town.getByName('town:smoke') as Phaser.GameObjects.Graphics;
    return { town: scene.townState(), sackPose, smokeAndDust: smoke.commandBuffer,
      smokeAlpha: map.moving.smoke, mapTime: map.t, tick: scene.state.tick };
  });
}

for (const look of ['painted', 'classic', 'showpiece'] as const) {
  test(`${look} town holds the leak tick and the sack in flight through manual and hidden-page pause`, async ({ page }) => {
    const start = new Date('2030-01-01T12:00:00Z');
    await page.clock.install({ time: start });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`/?renderer=canvas&look=${look}`);
    await waitForTitle(page);
    await press(page, 'title:play');
    await waitForGame(page);
    // Drive ordinary live frames at known intervals so both looks freeze at the same point in the flight.
    await page.clock.pauseAt(new Date(start.getTime() + 60_000));
    const activeLook = await page.evaluate(distance => {
      const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
      scene.startWave();
      scene.state.lives = 18;
      scene.state.enemies.push({ type: 'goblin', id: scene.state.nextEnemyId++, distance,
        slow: 0, slowTicksLeft: 0, hp: 100, maxHp: 100 });
      scene.advance(0); // Draw the approaching collector before its exit event.
      scene.advance(1);
      scene.setPaused(true);
      return scene.paintedState().active;
    }, pathLength(MAPS.meadow) - 0.01);
    expect(activeLook).toBe(look !== 'classic');
    if (look === 'showpiece') expect(await page.evaluate(() => window.__tarpit!.showpiece?.())).toBeTruthy();
    expect(await page.evaluate(() => window.__tarpit!.paused())).toBe(true);
    const leak = await townFrame(page);
    expect(leak.town.condition).toBe('scuffed');
    expect(leak.town.sacks).toHaveLength(1);
    await page.clock.runFor(1000);
    expect(await townFrame(page)).toEqual(leak);
    await page.keyboard.press('p');
    expect(await townFrame(page)).toEqual(leak);

    await page.clock.runFor(240);
    const flying = await townFrame(page);
    expect(flying.town.sacks).toHaveLength(1);
    expect(flying.sackPose).not.toEqual(leak.sackPose);
    expect(flying.mapTime).toBeGreaterThan(leak.mapTime);
    expect(flying.smokeAlpha).toEqual([0, 1, 2, 3].map(i => smokePuff(i, flying.mapTime).alpha * 2));
    await setPageHidden(page, true);
    await page.clock.runFor(1000); // Longer than the entire flight.
    await setPageHidden(page, false);
    expect(await page.evaluate(() => window.__tarpit!.paused())).toBe(true);
    expect(await townFrame(page)).toEqual(flying);
    await page.keyboard.press('p');
    expect(await townFrame(page)).toEqual(flying);
    await page.clock.runFor(160);
    const continued = await townFrame(page);
    expect(continued.town.sacks).toHaveLength(1);
    expect(continued.sackPose).not.toEqual(flying.sackPose);
    await page.clock.runFor(480);
    expect((await townFrame(page)).town.sacks).toHaveLength(0);
  });
}
