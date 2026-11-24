import { expect, test } from '@playwright/test';
import type Phaser from 'phaser';
import type { GameScene } from '../src/game/GameScene';
import { tap, tapCell } from './phone';
import { liveMeadow, selectDuringPush } from './showpiece-live';

test('a portrait tap on a moving Meadow tower selects it', async ({ page }) => {
  test.setTimeout(80_000);
  await selectDuringPush(page, true);
});

test('farm buildings ghost during touch placement and the mill fades in a puff when built on', async ({ page }) => {
  await liveMeadow(page, '&showpieceTier=2');
  const millCell = { col: 24, row: 3 };
  const farm = await page.evaluateHandle(cell => {
    const game = window.__tarpit!.game;
    const scene = game.scene.getScene('game') as GameScene;
    const children: (Phaser.GameObjects.GameObject | Phaser.GameObjects.Layer)[] = scene.children.list;
    const layers = children.filter((o): o is Phaser.GameObjects.Layer => o.type === 'Layer');
    const images = [...children, ...layers.flatMap(layer => layer.list)]
      .filter((o): o is Phaser.GameObjects.Image => o.type === 'Image' &&
        (o as Phaser.GameObjects.Image).texture.key.startsWith('showpiece:pasture:'));
    const props = ['mill', 'sails', 'cottage', 'willow', 'hives', 'honeyCart'].map(frame => {
      const image = images.find(o => o.frame.name === frame);
      if (!image) throw new Error('Missing scenery: ' + frame);
      return image;
    });
    const dust = images.find(o => o.name === 'build-dust');
    if (!dust) throw new Error('Missing build dust');
    const alpha = (image: Phaser.GameObjects.Image) => {
      const layer = image.displayList;
      const parent = 'alpha' in layer ? (layer.visible ? layer.alpha : 0) : 1;
      return image.visible ? image.alpha * parent : 0;
    };
    const alphas = () => props.map(alpha);
    let sawFade = false, sawPuff = false;
    let beforeBuild = 1;
    const record = () => {
      const [mill, sails] = alphas();
      if (!scene.state.towers.some(t => t.cell.col === cell.col && t.cell.row === cell.row)) {
        beforeBuild = mill;
        return;
      }
      sawFade ||= mill > 0 && mill < beforeBuild && sails > 0 && sails < beforeBuild;
      sawPuff ||= alpha(dust) > 0;
    };
    game.events.on('postrender', record);
    return { alphas, cleared: () => sawFade && sawPuff && alpha(props[0]) === 0 &&
      alpha(props[1]) === 0 && alpha(dust) === 0 };
  }, millCell);
  await tap(page, 'bar:longbow');
  const ghosts = () => farm.evaluate(f => f.alphas().every(a => a > 0 && a <= .15));
  await expect.poll(ghosts).toBe(true);
  await tap(page, 'bar:longbow');
  await expect.poll(() => farm.evaluate(f => f.alphas())).toEqual([1, 1, 1, 1, 1, 1]);
  await tap(page, 'bar:longbow');
  await tapCell(page, millCell);
  await expect.poll(ghosts).toBe(true);
  await tapCell(page, millCell);
  await expect.poll(() => farm.evaluate(f => f.cleared())).toBe(true);
});

test('reduced motion holds the Meadow clock and camera while the wave plays', async ({ page }) => {
  test.setTimeout(80_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await liveMeadow(page);
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as import('../src/game/GameScene').GameScene;
    scene.startWave();
  });
  await page.waitForFunction(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as import('../src/game/GameScene').GameScene;
    return scene.state.enemies.length > 1;
  });
  expect(await page.evaluate(() => window.__tarpit!.showpiece!())).toMatchObject({ calm: true, timeMs: 0, zoom: 1 });
});
