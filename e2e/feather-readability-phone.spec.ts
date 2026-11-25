import { expect, test } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { GameScene } from '../src/game/GameScene';
import { startPlay } from './sound';
import { waitForTitle } from './title';

type DrawnEnemy = {
  sprite: Phaser.GameObjects.Sprite;
  trail?: { pieces: { image: Phaser.GameObjects.Image }[] };
  plumage?: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
};
type FeatherScene = Phaser.Scene & {
  dynamic: Phaser.GameObjects.Graphics;
  enemySprites: { views: Map<number, DrawnEnemy> };
};

test('a tarred runner in a crowd shows at least 45 square CSS pixels of bright plumage over the ring', async ({ page }) => {
  await page.goto('/?test=1&look=painted');
  await waitForTitle(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
  const marks = await page.evaluate(async () => {
    const api = window.__tarpit as TarpitTestApi;
    const scene = api.game.scene.getScene('game') as FeatherScene;
    api.spawnHorde(2);
    const [runner, neighbour] = api.state().enemies;
    runner.distance = 364;
    runner.feathered = true;
    runner.runTicksLeft = 60;
    runner.slowTicksLeft = 120;
    neighbour.distance = runner.distance + 8;
    api.step(0);

    const view = scene.enemySprites.views.get(runner.id)!;
    const plumage = view.plumage!;
    const canvas = api.game.canvas;
    const context = canvas.getContext('2d')!;
    const frame = () => new Promise<void>(resolve => api.game.events.once('postrender', resolve));
    const pixels = () => context.getImageData(Math.floor(view.sprite.x) - 64, Math.floor(view.sprite.y) - 64, 128, 128).data;
    await frame();
    const visible = pixels();
    const drawn = scene.cameras.main.renderList;
    const quills = drawn.indexOf(plumage);
    const ring = drawn.indexOf(scene.dynamic);
    const otherBody = drawn.indexOf(scene.enemySprites.views.get(neighbour.id)!.sprite);
    // Remove just the permanent marks. Ring, neighbouring sprite and its shadow stay in place.
    plumage.setVisible(false);
    await frame();
    const hidden = pixels();

    let bright = 0;
    let minX = 128, minY = 128, maxX = -1, maxY = -1;
    for (let i = 0; i < visible.length; i += 4) {
      if (visible[i] < 225 || visible[i + 1] < 215 || visible[i + 2] < 165) continue;
      const change = Math.max(Math.abs(visible[i] - hidden[i]), Math.abs(visible[i + 1] - hidden[i + 1]),
        Math.abs(visible[i + 2] - hidden[i + 2]));
      if (change < 24) continue;
      const x = (i / 4) % 128, y = Math.floor(i / 4 / 128);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      bright++;
    }
    const bounds = canvas.getBoundingClientRect();
    const sx = bounds.width / canvas.width, sy = bounds.height / canvas.height;
    return {
      area: bright * sx * sy, width: Math.max(0, maxX - minX + 1) * sx, height: Math.max(0, maxY - minY + 1) * sy,
      ring, otherBody, quills,
    };
  });
  console.log('Painted runner, 390x844:', marks);
  expect(marks.area, 'visible bright feather fill, in square CSS pixels').toBeGreaterThanOrEqual(45);
  expect(marks.ring).toBeGreaterThanOrEqual(0);
  expect(marks.otherBody).toBeGreaterThanOrEqual(0);
  expect(marks.quills).toBeGreaterThan(Math.max(marks.ring, marks.otherBody));
});

test('loose feathers drift during the run, hold their pose on pause and clear at the end', async ({ page }) => {
  await startPlay(page, '/?renderer=canvas&perf=1&look=painted');
  const result = await page.evaluate(async () => {
    const api = window.__tarpit!;
    const scene = api.game.scene.getScene('game') as GameScene;
    scene.spawnHorde(1);
    scene.state.spawnedPerGroup.fill(999);
    const runner = scene.state.enemies[0];
    runner.distance = 600;
    runner.feathered = true;
    runner.runTicksLeft = 180;
    const view = (scene as unknown as FeatherScene).enemySprites.views.get(runner.id)!;
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(400);
    api.pause();
    const paused = api.paused();
    const images = view.trail!.pieces.map(piece => piece.image);
    const poses = () => images.filter(image => image.visible).map(({ x, y, rotation, alpha }) => ({ x, y, rotation, alpha }));
    const initial = poses();
    await delay(250);
    scene.redraw();
    const held = poses();
    api.resume();
    await delay(100);
    const moving = poses();
    runner.runTicksLeft = 0;
    scene.redraw();
    return { paused, initial, held, moving, remaining: poses(), attached: view.plumage?.visible };
  });
  expect(result.paused).toBe(true);
  expect(result.initial.length).toBeGreaterThan(0);
  expect(result.initial.length).toBeLessThanOrEqual(3);
  expect(result.held).toEqual(result.initial);
  expect(result.moving.length).toBeGreaterThan(0);
  expect(result.moving).not.toEqual(result.held);
  expect(result.remaining).toEqual([]);
  expect(result.attached).toBe(true);
});
