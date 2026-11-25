import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { actThreeFit, actThreeFlow } from './actThree';
import { press } from './campaign';
import { onScreen } from './campaignScreens';

actThreeFit([{ width: 960, height: 580 }], false);
actThreeFlow(false);

test('a keg at the farthest drawn foot hits the held crowd and matches the aim preview', async ({ page }) => {
  await page.goto('/?test=1&act3=1&keep=23');
  await onScreen(page, 'game');
  const { point, farthest, positions, replay } = await page.evaluate(() => {
    const api = window.__tarpit!;
    const scene = api.game.scene.getScene('game') as GameScene;
    const state = api.state!();
    api.startWave!();
    state.spawnedPerGroup = state.level!.waves[0].groups.map(group => group.count);
    state.enemies = Array.from({ length: 60 }, (_, id) => ({
      id, type: 'troll', road: 'east', hp: 950, distance: state.gate!.distance, slow: 0, slowTicksLeft: 0,
    }));
    state.enemies.push({ id: 60, type: 'harpy', road: 'east', hp: 36, distance: 0, slow: 0, slowTicksLeft: 0 });
    state.nextEnemyId = 61;
    const drawCrowd = () => {
      api.step!(0);
      return Array.from({ length: 60 }, (_, id) => {
        const { x, y } = api.animState(id)!;
        return { x, y };
      });
    };
    const positions = drawCrowd();
    state.enemies.reverse();
    const replay = drawCrowd();
    const sill = scene.boardLayout.toScreen(state.gate!);
    const distance = (p: { x: number; y: number }) => Math.hypot(p.x - sill.x, p.y - sill.y);
    const edge = positions.reduce((a, b) => distance(b) > distance(a) ? b : a);
    const { x, y } = scene.boardLayout.toWorld(edge);
    const sprites = scene['enemySprites'];
    const draw = sprites.drawSpecialTargets.bind(sprites);
    sprites.drawSpecialTargets = (graphics, enemies, ids) => {
      graphics.setData('landingIds', [...ids]);
      draw(graphics, enemies, ids);
    };
    return { point: api.worldToPage(x, y), farthest: distance(edge), positions, replay };
  });
  expect(farthest).toBeGreaterThan(35);
  expect(farthest).toBeLessThanOrEqual(40);
  expect(replay).toEqual(positions);
  await press(page, 'special');
  await press(page, 'special:keg');
  await page.mouse.move(point.x, point.y);
  const targets = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    return scene['bars'].getData('landingIds');
  });
  expect(targets).toEqual(Array.from({ length: 60 }, (_, i) => 59 - i));
  await page.mouse.click(point.x, point.y);
  const hp = await page.evaluate(() => window.__tarpit!.state!().enemies.map(enemy => [enemy.id, enemy.hp]));
  expect(hp).toEqual([[60, 36], ...Array.from({ length: 60 }, (_, i) => [59 - i, 890])]);
});
