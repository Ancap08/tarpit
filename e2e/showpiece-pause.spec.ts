import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import type { GameScene } from '../src/game/GameScene';
import { liveMeadow } from './showpiece-live';
import { setPageHidden } from './pause';

function meadowFrame(page: Page) {
  return page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const show = scene.showpieceState()!;
    const children: (Phaser.GameObjects.GameObject | Phaser.GameObjects.Layer)[] = scene.children.list;
    const layers = children.filter((node): node is Phaser.GameObjects.Layer => node.type === 'Layer');
    const town = scene.children.list.find(node => node.type === 'Container' &&
      (node as Phaser.GameObjects.Container).getByName('town:map')) as Phaser.GameObjects.Container;
    const objects = [...layers.flatMap(layer => layer.list), ...town.list];
    const poses = objects.filter(node => node.type === 'Image').map(node => node as Phaser.GameObjects.Image)
      .filter(image => image.texture.key.startsWith('showpiece') || image.name.startsWith('town:'))
      .map(image => [image.frame.name, image.visible, image.x, image.y, image.rotation, image.alpha,
        image.scaleX, image.scaleY]);
    // The salute draws directly into a Graphics layer. Include the strokes as well as the sprite poses.
    const strokes = objects.filter(node => node.type === 'Graphics')
      .map(node => Array.from((node as Phaser.GameObjects.Graphics).commandBuffer));
    return { time: show.timeMs, mapTime: scene.decorState()!.t, zoom: show.zoom, poses, strokes,
      tier: show.tier, tick: scene.state.tick, town: scene.townState() };
  });
}

test('both pauses hold the live Meadow camera, sprites and victory salute on the town clock', async ({ page }) => {
  test.setTimeout(90_000);
  const start = new Date('2030-01-01T12:00:00Z');
  await page.clock.install({ time: start });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await liveMeadow(page, '&showpieceTier=2');
  await page.clock.pauseAt(new Date(start.getTime() + 60_000));
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    scene.build({ col: 2, row: 5 }, 'musketeer');
    scene.startWave();
  });
  await page.clock.runFor(640);
  for (const phase of ['wave', 'won']) {
    if (phase === 'won') {
      await page.evaluate(() => {
        const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
        scene.state.phase = 'won';
        scene.redraw();
      });
      await page.clock.runFor(420);
    }
    const before = await meadowFrame(page);
    expect(before.time).toBe(before.mapTime);
    expect(before.poses.length).toBeGreaterThan(50);
    if (phase === 'wave') {
      expect(before.zoom).toBeGreaterThan(1);
      await page.keyboard.press('p');
    } else {
      expect(before.town.outcome).toBe('won');
      await setPageHidden(page, true);
    }
    expect(await page.evaluate(() => window.__tarpit!.paused())).toBe(true);
    await page.clock.runFor(6400); // Longer than the entire victory salute.
    if (phase === 'won') await setPageHidden(page, false);
    expect(await meadowFrame(page)).toEqual(before);
    await page.keyboard.press('p');
    expect(await page.evaluate(() => window.__tarpit!.paused())).toBe(false);
    expect(await meadowFrame(page)).toEqual(before);
    await page.clock.runFor(160);
    const continued = await meadowFrame(page);
    expect(continued.time).toBe(continued.mapTime);
    expect(continued.time - before.time).toBeGreaterThan(0);
    expect(continued.time - before.time).toBeLessThanOrEqual(176);
    expect(continued.poses).not.toEqual(before.poses);
    if (phase === 'won') expect(continued.strokes).not.toEqual(before.strokes);
  }
});
