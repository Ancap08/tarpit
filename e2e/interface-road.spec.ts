import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { PATH_WIDTH } from '../src/game/draw/map';
import { MAP_IDS } from '../src/sim';
import { NEW_PHONE_VIEWPORTS } from './newInterface';
import { waitForFirstScreen } from './title';

for (const { width, height } of [...NEW_PHONE_VIEWPORTS, { width: 1024, height: 768 }, { width: 960, height: 580 }]) {
  for (const map of MAP_IDS) {
    test(`Clean battle HUD clears the entire road on ${map} at ${width}×${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/?test=1&ui=new');
      await waitForFirstScreen(page);
      await page.evaluate(map => window.__tarpit!.startGame!('normal', map), map);
      const overlaps = await page.evaluate(pathRadius => {
        const t = window.__tarpit!;
        const state = t.state!();
        state.boons = ['longBarrels', 'stickyTar', 'stoneWalls'];
        state.enemies = [{ id: state.nextEnemyId++, type: 'boss', maxHp: 4000, hp: 2600, distance: 390, slow: 0, slowTicksLeft: 0 }];
        t.step!(0);
        const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
        const layout = scene['layout'];
        const toRect = (a: { x: number; y: number }, b: { x: number; y: number }, margin = 0) => {
          const p = layout.toScreen(a), q = layout.toScreen(b);
          return { x: Math.min(p.x, q.x) - margin, y: Math.min(p.y, q.y) - margin,
            width: Math.abs(p.x - q.x) + 2 * margin, height: Math.abs(p.y - q.y) + 2 * margin };
        };
        const { path, landmarks } = scene.state.map;
        const road = path.slice(1).map((p, i) => toRect(path[i], p, pathRadius));
        // The road's first end includes the cave. The town extends outside the
        // final bend, so also check its footprint from the map definition.
        const entrance = toRect(path[0], path[0], 30);
        const town = (landmarks ?? []).map(b => toRect(b, { x: b.x + b.width, y: b.y + b.height }));
        const m = layout.map;
        const areas = [...road, entrance, ...town].map(r => ({
          x: Math.max(m.x, r.x), y: Math.max(m.y, r.y),
          right: Math.min(m.x + m.width, r.x + r.width), bottom: Math.min(m.y + m.height, r.y + r.height),
        }));
        const { bar, pill } = scene['hud']['bossBar']['geo'];
        const panels = [
          ...scene['hud']['m'].bands,
          { x: bar.x, y: pill.y, width: bar.width, height: bar.y + bar.height - pill.y },
          ...Object.entries(t.uiRects()).filter(([name]) => name.startsWith('boon:')).map(([, rect]) => rect),
        ];
        return panels.flatMap((panel, i) => areas.map((r, j) => ({ r, j }))
          .filter(({ r }) => panel.x < r.right && r.x < panel.x + panel.width && panel.y < r.bottom && r.y < panel.y + panel.height)
          .map(({ j }) => ({ panel: i, roadOrLandmark: j })));
      }, (PATH_WIDTH + 12) / 2);
      expect(overlaps).toEqual([]);
    });
  }
}
