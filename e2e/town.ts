import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { buildableCells, GRID_COLS, GRID_ROWS } from '../src/sim/grid';
import { MAP_IDS, MAPS, pathLength, type MapId } from '../src/sim/map';
import { LANDSCAPE, PORTRAIT } from '../src/game/layout';
import { press } from './campaign';
import { useTallFontMetrics } from './campaignFont';
import { settle, waitForGame } from './painted';
import { waitForFirstScreen, waitForTitle } from './title';

const states = [[18, 'untouched'], [17, 'scuffed'], [12, 'scuffed'], [11, 'battered'],
  [1, 'battered'], [0, 'taken']] as const;

async function openMap(page: Page, map: MapId, look: 'painted' | 'classic') {
  await page.goto(`/?test=1&look=${look}`);
  await waitForTitle(page);
  await page.evaluate(map => window.__tarpit!.startGame!('normal', map), map);
  await waitForGame(page);
  expect(await page.evaluate(() => window.__tarpit!.painted!().active)).toBe(look === 'painted');
}

/** Capture the game with and without these actual display objects, through the main
 * camera. Nothing is inferred from the positions the renderer intended to draw. */
async function changedPixels(page: Page, names: string[]) {
  return page.evaluate(async names => {
    const game = window.__tarpit!.game;
    const scene = game.scene.getScene('game');
    const camera = scene.cameras.main;
    const descendants = (list: Phaser.GameObjects.GameObject[]): Phaser.GameObjects.GameObject[] =>
      list.flatMap(node => node.type === 'Container' || node.type === 'Layer'
        ? [node, ...descendants((node as Phaser.GameObjects.Container).list)] : [node]);
    const nodes = descendants(scene.children.list).filter(node => names.includes(node.name));
    if (!nodes.length) throw new Error(`No display objects named ${names.join(', ')}`);
    const ctx = game.canvas.getContext('2d')!;
    const { width, height } = game.canvas;
    const frame = async () => {
      await new Promise<void>(resolve => game.events.once('postrender', resolve));
      const { data } = ctx.getImageData(0, 0, width, height);
      return new Uint32Array(data.buffer);
    };
    const shown = await frame();
    const saved = nodes.map(node => node.cameraFilter);
    camera.ignore(nodes);
    let hidden;
    try { hidden = await frame(); }
    finally { nodes.forEach((node, index) => { node.cameraFilter = saved[index]; }); }
    const portrait = window.__tarpit!.layout() === 'portrait';
    // Both map dimensions are in canvas pixels. Derive the portrait map's top
    // from the same visible square that a player would tap to build in (0,0).
    const origin = window.__tarpit!.worldToPage(0, 480);
    const top = window.__tarpit!.canvasToPage(0, 0).y;
    const scale = window.__tarpit!.canvasToPage(0, 1).y - top;
    const mapY = portrait ? Math.round((origin.y - top) / scale) : 0;
    const counts: number[] = Array(30 * 15).fill(0);
    let count = 0, outside = 0, hash = 2166136261;
    let minX = width, maxX = -1, minY = height, maxY = -1;
    for (let i = 0; i < shown.length; i++) {
      if (shown[i] === hidden[i]) continue;
      const x = i % width, y = Math.floor(i / width);
      minX = Math.min(x, minX); maxX = Math.max(x, maxX);
      minY = Math.min(y, minY); maxY = Math.max(y, maxY);
      const col = Math.floor((portrait ? y - mapY : x) / 32);
      const row = portrait ? 14 - Math.floor(x / 32) : Math.floor(y / 32);
      if (col >= 0 && col < 30 && row >= 0 && row < 15) counts[row * 30 + col]++;
      else outside++;
      count++;
      hash = Math.imul((hash ^ shown[i]) ^ i, 16777619);
    }
    return { counts, count, outside, hash, minX, maxX, minY, maxY };
  }, names);
}

async function review(page: Page, info: TestInfo, name: string, townOnly = false, pictureName?: string) {
  const dir = process.env.M46_REVIEW_DIR;
  if (!dir || info.project.name === 'tablet') return;
  const size = page.viewportSize()!;
  const layout = size.height > size.width ? 'phone' : 'landscape';
  let clip;
  if (townOnly) {
    const centre = await page.evaluate(() => {
      const api = window.__tarpit!;
      const { bounds } = (api.game.scene.getScene('game') as GameScene).townState();
      return api.canvasToPage(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    });
    const width = Math.min(size.width, layout === 'phone' ? 220 : 320), height = layout === 'phone' ? 160 : 190;
    const x = Math.max(0, Math.min(size.width - width, Math.round(centre.x - width / 2)));
    const y = Math.max(0, Math.min(size.height - height, Math.round(centre.y - height / 2)));
    clip = { x, y, width, height };
  }
  if (pictureName) {
    clip = await page.evaluate(pictureName => {
      const api = window.__tarpit!;
      const node = api.game.scene.getScene('game').children.getByName(pictureName) as Phaser.GameObjects.Image;
      const bounds = node.getBounds();
      const start = api.canvasToPage(bounds.left - 4, bounds.top - 4);
      const end = api.canvasToPage(bounds.right + 4, bounds.bottom + 4);
      return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y };
    }, pictureName);
  }
  await settle(page);
  await page.screenshot({ path: `${dir}/${layout}-${name}.jpg`, quality: 83, scale: 'css', clip });
}

const townState = (page: Page) => page.evaluate(() =>
  (window.__tarpit!.game.scene.getScene('game') as GameScene).townState());

async function stageResult(page: Page, lives: number) {
  await page.evaluate(lives => {
    const api = window.__tarpit as TarpitTestApi;
    const s = api.state();
    s.lives = lives;
    s.wave = s.level?.waves.length ?? 20;
    s.phase = lives ? 'won' : 'lost';
    api.step(0);
  }, lives);
}

async function picture(page: Page, condition: string) {
  const name = `town-picture:${condition}`;
  await page.waitForFunction(name => {
    const node = window.__tarpit!.game.scene.getScene('game').children.getByName(name) as Phaser.GameObjects.Image;
    return node?.visible && node.texture.key === name.replace('town-picture:', 'town-portrait-');
  }, name);
  return page.evaluate(name => {
    const api = window.__tarpit as TarpitTestApi;
    const image = api.game.scene.getScene('game').children.getByName(name) as Phaser.GameObjects.Image;
    const bounds = image.getBounds();
    const result = api.campaignResult();
    const labels = api.campaignLabels().filter(l => result
      ? [result.title, result.slots, result.story, ...result.details, ...result.buttons].includes(l.text)
      : true);
    const obstacles = [...labels, ...Object.entries(api.uiRects()).map(([key, rect]) => ({ ...rect, text: key }))];
    const overlaps = obstacles.filter(b => b.x < bounds.right && b.y < bounds.bottom &&
      b.x + b.width > bounds.x && b.y + b.height > bounds.y).map(b => b.text);
    return { key: `${image.texture.key}/${image.frame.name}`, overlaps, width: bounds.width, height: bounds.height };
  }, name);
}

export function townSuite(touch: boolean) {
  for (const look of ['painted', 'classic'] as const) {
    for (const map of MAP_IDS) {
      test(`${look} ${map}: town boundaries and rendered pixels in every cell`, async ({ page }, info) => {
        test.setTimeout(120_000);
        await openMap(page, map, look);
        const buildable = buildableCells(MAPS[map]);
        expect(buildable.length).toBe(GRID_COLS * GRID_ROWS);
        const layout = await page.evaluate(() => window.__tarpit!.layout()) === 'portrait' ? PORTRAIT : LANDSCAPE;
        const hashes = new Set<number>();
        const checked = new Set<string>();
        for (const [lives, expected] of states) {
          await page.evaluate(lives => {
            const api = window.__tarpit as TarpitTestApi;
            api.state().lives = lives;
            api.step(0);
          }, lives);
          const state = await townState(page);
          expect(state.condition, `${lives} lives`).toBe(expected);
          if (checked.has(expected)) continue;
          checked.add(expected);
          if (expected === 'scuffed') {
            const crossing = await changedPixels(page, ['town:smoke']);
            await page.evaluate(() => window.__tarpit!.step!(30));
            const settled = await changedPixels(page, ['town:smoke']);
            expect(settled.hash, 'crossing a boundary makes a temporary visible puff').not.toBe(crossing.hash);
          } else {
            await page.evaluate(() => window.__tarpit!.step!(30));
          }
          const pixels = await changedPixels(page, ['town:map', 'town:smoke', 'town:cheer']);
          expect(pixels.count, 'visible on the battlefield').toBeGreaterThan(100);
          hashes.add(pixels.hash);
          expect(pixels.counts).toHaveLength(GRID_COLS * GRID_ROWS);
          expect(pixels.outside, 'town paints into the HUD or beyond the map').toBe(0);
          const intrusions = pixels.counts.flatMap((count, i) => count && buildable[i]
            ? [{ col: i % GRID_COLS, row: Math.floor(i / GRID_COLS), pixels: count }] : []);
          expect(intrusions, `town in buildable cells: ${expected}`).toEqual([]);
          const exit = layout.toScreen(MAPS[map].path.at(-1)!);
          const trailClearance = layout.turned ? pixels.minX - exit.x : exit.y - pixels.maxY;
          expect(trailClearance, 'last half-width of the 40 px trail remains clear').toBeGreaterThanOrEqual(20);
          if (look === 'painted') {
            await review(page, info, `${map}-${expected}`, true);
            if (map === 'meadow' && expected === 'untouched') await review(page, info, 'meadow-overview');
          }
        }
        expect(hashes.size, 'four visibly different battlefield states').toBe(4);
      });
    }
  }

  test('three collectors at the exit take sacks sized to the lives lost', async ({ page }, info) => {
    test.setTimeout(120_000);
    await openMap(page, 'meadow', 'painted');
    const result = await page.evaluate(distance => {
      const api = window.__tarpit as TarpitTestApi;
      api.startWave();
      const s = api.state();
      for (const type of ['goblin', 'boss', 'grumblemaw'] as const) {
        s.enemies.push({ type, id: s.nextEnemyId++, distance, slow: 0, slowTicksLeft: 0, hp: 100, maxHp: 100 });
      }
      api.step(0); // Show the three approaching collectors before their departure tick.
      api.step(1);
      const view = (api.game.scene.getScene('game') as GameScene).townState();
      return { lives: s.lives, sacks: view.sacks };
    }, pathLength(MAPS.meadow) - 0.01);
    expect(result.lives).toBe(4);
    const sorted = result.sacks.sort((a, b) => a.cost - b.cost);
    expect(sorted.map(sack => sack.cost)).toEqual([1, 5, 10]);
    expect(sorted[0].size).toBeLessThan(sorted[1].size);
    expect(sorted[1].size).toBeLessThan(sorted[2].size);
    const pixels = await changedPixels(page, ['town:sacks']);
    expect(pixels.count).toBeGreaterThan(10);
    expect(pixels.outside, 'sacks stay clear of all HUD rows').toBe(0);
    await page.evaluate(() => window.__tarpit!.step!(15));
    const flying = await changedPixels(page, ['town:sacks']);
    expect(flying.hash, 'the sacks leave the town').not.toBe(pixels.hash);
    expect(flying.outside).toBe(0);
    await review(page, info, 'leak', true);
    await page.evaluate(() => window.__tarpit!.step!(60));
    expect((await townState(page)).sacks).toHaveLength(0);
  });

  for (const tall of [false, true]) {
    test(`result art matches all four states, clears controls and leaves the outcome visible${tall ? ' (tall metrics)' : ''}`,
      async ({ page }, info) => {
        test.setTimeout(120_000);
        if (tall) await useTallFontMetrics(page);
        const keys = new Set<string>();
        for (const [lives, expected] of [[20, 'untouched'], [16, 'scuffed'], [9, 'battered'], [0, 'taken']] as const) {
          await page.goto('/?test=1&look=painted');
          await waitForFirstScreen(page);
          await press(page, 'title:campaign', touch);
          await page.waitForFunction(() => !!window.__tarpit?.uiRects()['title:stop:1']);
          await press(page, 'title:stop:1', touch);
          await page.waitForFunction(() => !!window.__tarpit?.uiRects()['title:play']);
          await press(page, 'title:play', touch);
          await waitForGame(page);
          await stageResult(page, lives);
          expect(await page.evaluate(() => window.__tarpit!.endScreen!())).toBe(lives ? 'won' : 'lost');
          expect(await townState(page)).toMatchObject({ condition: expected, outcome: lives ? 'won' : 'lost' });
          const art = await picture(page, expected);
          expect(art.overlaps, `${expected} illustration overlaps`).toEqual([]);
          expect(art.width).toBeGreaterThan(50);
          expect(art.height).toBeGreaterThan(35);
          keys.add(art.key);
          const pixels = await changedPixels(page, lives ? ['town:cheer'] : ['town:map', 'town:cheer']);
          expect(pixels.count, 'outcome is visible behind the actual panel').toBeGreaterThan(5);
          const still = await changedPixels(page, lives ? ['town:cheer'] : ['town:map', 'town:cheer']);
          expect(still.hash, 'test mode holds the outcome').toBe(pixels.hash);
          if (!tall) {
            await review(page, info, `picture-${expected}`, false, `town-picture:${expected}`);
            if (expected === 'battered' || expected === 'taken') {
              await review(page, info, lives ? 'win' : 'loss');
            }
          }
        }
        expect(keys.size).toBe(4);
      });
  }

  test('Free play result illustration clears the reward list and its three actions in tall type', async ({ page }) => {
    test.setTimeout(120_000);
    await useTallFontMetrics(page);
    await openMap(page, 'riverbend', 'classic');
    await page.evaluate(() => {
      window.__tarpit!.state!().boons = ['longBarrels', 'quickHands', 'veteranCrews'];
    });
    await stageResult(page, 12);
    const art = await picture(page, 'scuffed');
    expect(art.overlaps).toEqual([]);
    expect(await page.evaluate(() => Object.keys(window.__tarpit!.uiRects()))).toEqual(
      expect.arrayContaining(['playAgain', 'menu', 'keepGoing']));
  });

  test('live hats move and the red banner climbs while the result buttons are available', async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const outcome of ['won', 'lost'] as const) {
      await page.goto('/?look=painted&renderer=canvas');
      await waitForTitle(page);
      await press(page, 'title:play', touch);
      await waitForGame(page);
      const motion = await page.evaluate(async outcome => {
        const api = window.__tarpit!;
        const scene = api.game.scene.getScene('game') as GameScene;
        const town = scene.children.list.find(node => node.type === 'Container' &&
          (node as Phaser.GameObjects.Container).getByName('town:map')) as Phaser.GameObjects.Container;
        scene.state.phase = outcome;
        scene.state.lives = outcome === 'won' ? 13 : 0;
        scene.advance(0);
        const ready = !!api.uiRects().playAgain;
        const frames = new Set<string>();
        function sample() {
          if (outcome === 'won') {
            const hats = town.list.filter(node => node.name === 'town:cheer');
            frames.add(JSON.stringify(hats.map(node => {
              if (node.type === 'Graphics') return (node as Phaser.GameObjects.Graphics).commandBuffer;
              const image = node as Phaser.GameObjects.Image;
              return [image.visible, image.frame.name, image.x, image.y, image.rotation];
            })));
          } else {
            const banner = town.list.find(node => node.type === 'Image' &&
              (node as Phaser.GameObjects.Image).visible &&
              (node as Phaser.GameObjects.Image).texture.key.includes('royal-hoist') &&
              Number((node as Phaser.GameObjects.Image).frame.name) % 2 === 1) as Phaser.GameObjects.Image | undefined;
            if (banner) frames.add(String(banner.y));
          }
        }
        sample();
        scene.events.on('postupdate', sample);
        await new Promise<void>(resolve => scene.time.delayedCall(1000, resolve));
        scene.events.off('postupdate', sample);
        return { ready, samples: [...frames] };
      }, outcome);
      expect(motion.ready, 'the first result frame has clickable actions').toBe(true);
      expect(motion.samples.length, 'several distinct poses').toBeGreaterThan(1);
      if (outcome === 'lost') {
        expect(Number(motion.samples[0]) - Number(motion.samples.at(-1)), 'banner rises').toBeGreaterThan(4);
      }
    }
  });

  test('reduced-motion play holds a visible win and loss on the map', async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const outcome of ['won', 'lost'] as const) {
      await page.goto('/?look=painted&renderer=canvas');
      await waitForTitle(page);
      await press(page, 'title:play', touch);
      await waitForGame(page);
      const status = await page.evaluate(outcome => {
        const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
        scene.state.phase = outcome;
        scene.state.lives = outcome === 'won' ? 13 : 0;
        scene.advance(0);
        return scene.townState();
      }, outcome);
      expect(status.outcome).toBe(outcome);
      await page.waitForFunction(() => !!window.__tarpit?.uiRects().playAgain);
      await page.waitForFunction(key => window.__tarpit!.game.textures.exists(key),
        outcome === 'won' ? 'town-portrait-scuffed' : 'town-portrait-taken');
      const names = outcome === 'won' ? ['town:cheer'] : ['town:map', 'town:cheer'];
      const first = await changedPixels(page, names);
      const next = await changedPixels(page, names);
      expect(first.count).toBeGreaterThan(5);
      expect(next.hash).toBe(first.hash);
    }
  });

  test('the opening notice, a posted level card and the ending appear at their campaign stops', async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.goto('/?test=1&look=painted');
    await waitForFirstScreen(page, { showStory: true });
    await press(page, 'title:campaign', touch);
    await page.waitForFunction(() => window.__tarpit?.screen?.() === 'opening' && !!window.__tarpit.uiRects()['title:continue']);
    await review(page, info, 'opening');
    await press(page, 'title:continue', touch);
    await page.waitForFunction(() => !!window.__tarpit?.uiRects()['title:stop:1']);
    await press(page, 'title:stop:1', touch);
    await page.waitForFunction(() => !!window.__tarpit?.uiRects()['title:play']);
    await review(page, info, 'level-1-notice');
    await page.evaluate(() => window.__tarpit!.startLevel!(10));
    await stageResult(page, 20);
    await press(page, 'menu', touch);
    await page.waitForFunction(() => window.__tarpit?.screen?.() === 'ending' && !!window.__tarpit.uiRects()['title:continue']);
    await review(page, info, 'ending');
    await press(page, 'title:continue', touch);
    await page.waitForFunction(() => !!window.__tarpit?.uiRects()['title:stop:1']);
  });
}
