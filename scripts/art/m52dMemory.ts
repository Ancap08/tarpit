import { strict as assert } from 'node:assert';
import type { GameScene } from '../../src/game/GameScene.ts';
import type { Page } from '@playwright/test';
import { waitForFirstScreen } from '../../e2e/title.ts';
import { origin, phone, press, run } from './m47Browser.ts';

// RGBA bytes for retained sources, counted once per object. This is not a
// process heap, GPU allocation or transient image-decoder peak.
async function snapshot(page: Page, visit: string) {
  assert.deepEqual(await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]), [390, 844, 3]);
  const groups = await page.evaluate(() => {
    const manager = window.__tarpit!.game.textures;
    const seen = new Set<object>();
    const bytes: Record<string, number> = {};
    function count(group: string, source: HTMLImageElement | HTMLCanvasElement) {
      if (seen.has(source)) return;
      seen.add(source);
      const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
      const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
      bytes[group] = (bytes[group] ?? 0) + width * height * 4;
    }
    for (const [key, texture] of Object.entries(manager.list)) {
      const group = key.startsWith('painted:') ? 'painted'
        : key.startsWith('showpiece:') ? 'showpiece'
        : key.startsWith('keep:') ? 'keepTextures'
        : key.startsWith('siege:') ? 'siege' : 'otherTextures';
      for (const source of texture.source) count(group, source.image as HTMLImageElement | HTMLCanvasElement);
    }
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>('#game [aria-hidden=true] canvas')) count('keepCanvases', canvas);
    return bytes;
  });
  console.log(JSON.stringify({ visit, ...groups, total: Object.values(groups).reduce((a, b) => a + b, 0) }));
}

async function enter(page: Page, level: number) {
  await waitForFirstScreen(page, { showStory: true });
  await press(page, 'title:campaign', true);
  await page.waitForFunction(() => window.__tarpit?.screen?.() === 'levelMap' && window.__tarpit.titleReady());
  if (level === 1 && !await page.evaluate(() => !!window.__tarpit!.uiRects()['title:stop:1'])) {
    await press(page, await page.evaluate(() => window.__tarpit!.uiRects()['title:act:1'] ? 'title:act:1' : 'title:act'), true);
  }
  await press(page, 'title:stop:' + level, true);
  await page.waitForFunction(() => window.__tarpit?.screen?.() === 'levelCard' && window.__tarpit.titleReady());
  await press(page, 'title:play', true);
  await page.waitForFunction(() => window.__tarpit?.screen?.() === 'game' && !!window.__tarpit.uiRects()['startWave']);
}

await run(async browser => {
  for (const level of [1, 21, 23, 25, 0]) {
    const context = await browser.newContext(phone);
    try {
      await context.addInitScript(() => {
        if (localStorage.getItem('tarpit.campaign')) return;
        const wins = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [i + 1, 3]));
        localStorage.setItem('tarpit.campaign', JSON.stringify({ v: 2, stars: wins }));
        localStorage.setItem('tarpit.seenBroadsides', '["opening","secondAct","ending"]');
        localStorage.setItem('tarpit.seenSiegeBroadsides', '["thirdAct","siegeEnding"]');
        localStorage.setItem('tarpit.seenTips', '[1]');
        localStorage.setItem('tarpit.seenSiegeTips', '[21,23,25]');
      });
      const page = await context.newPage();
      await page.goto(origin + '/?test=1' + (level === 1 ? '&look=painted' : '&act3=1&look=showpiece'));
      await enter(page, level || 1);
      if (level) {
        await snapshot(page, `${level} setup`);
        await page.evaluate(() => {
          const api = window.__tarpit!;
          const scene = api.game.scene.getScene('game') as GameScene;
          const { state } = scene;
          state.gold = 100_000;
          const occupied = new Set<string>();
          for (const type of state.level!.allowedTowers) {
            const site = state.map.buildSites?.find(site =>
              !occupied.has(site.col + ':' + site.row) && scene.build(site, type).ok);
            if (site) occupied.add(site.col + ':' + site.row);
          }
          if (state.gate && occupied.size !== state.level!.allowedTowers.length) {
            throw new Error('Could not build the full measurement roster');
          }
          if (!scene.startWave().ok) throw new Error('Could not start the measurement wave');
          const types = new Set(state.level!.waves.flatMap(wave => wave.groups.map(group => group.type)));
          if (state.level!.endingBoss === 'grumblemaw') types.add('wolf');
          for (const [id, type] of [...types].entries()) {
            state.enemies.push({ id, type, hp: 950, slow: 0, slowTicksLeft: 0, distance: 100 + 30 * id });
          }
          state.nextEnemyId = types.size;
          if (state.gate && !scene.useSpecialAt('guards', state.gate.x, state.gate.y).ok) {
            throw new Error('Could not deploy the measurement guards');
          }
          api.step!(0);
        });
        await snapshot(page, `${level} roster`);
      } else {
        await snapshot(page, '1 showpiece');
        await page.evaluate(() => {
          window.__tarpit!.state!().phase = 'lost';
          window.__tarpit!.step!(0);
        });
        await press(page, 'menu', true);
        await page.waitForFunction(() => window.__tarpit?.screen?.() === 'levelMap' && window.__tarpit.titleReady());
        await press(page, 'title:act:3', true);
        await press(page, 'title:stop:23', true);
        await page.waitForFunction(() => window.__tarpit?.screen?.() === 'levelCard' && window.__tarpit.titleReady());
        await press(page, 'title:play', true);
        await page.waitForFunction(() => window.__tarpit?.screen?.() === 'game' && window.__tarpit.state!().level?.id === 23);
        await snapshot(page, '23 after Showpiece');
      }
    } finally { await context.close(); }
  }
});
