import { expect, test, type Page } from '@playwright/test';
import { useTallFontMetrics } from './campaignFont';
import type { GameScene } from '../src/game/GameScene';
import type { TitleScene, TitleUiState } from '../src/game/TitleScene';
import { api, cellPage, state, ui, worldPage } from './phone';
import { click, expectMeadowDirections, openPainted, painted, paintedAsset, paintedBar, settle, stageMeadowDirections, waitForGame } from './painted';
import { waitForFirstScreen, waitForTitle } from './title';

const livePainted = (page: Page) => page.evaluate(() => {
  const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
  return scene.paintedState().active;
});

const titleLook = (page: Page) => api(page, (a) => a.ui<TitleUiState>()).then((title) => title.look);

async function play(page: Page): Promise<void> {
  await click(page, 'title:play');
  await waitForGame(page);
  await settle(page);
}

test('fresh Classic test-mode visit, lazy Painted assets, mouse and keyboard Look, and URL precedence', async ({ page }) => {
  const requests: string[] = [];
  await page.route(paintedAsset, (route) => {
    requests.push(route.request().url());
    return route.continue();
  });
  await page.goto('/?test=1');
  await waitForTitle(page);
  expect(await titleLook(page)).toBe('classic');
  await play(page);
  expect(await painted(page)).toMatchObject({ active: false });
  expect(requests).toEqual([]);

  await page.reload();
  await waitForTitle(page);
  await click(page, 'title:look:painted');
  expect(await titleLook(page)).toBe('painted');
  expect(requests).toEqual([]);
  await page.reload();
  await waitForTitle(page);
  expect(await titleLook(page)).toBe('painted');
  await page.keyboard.press('l');
  expect(await titleLook(page)).toBe('classic');
  await page.keyboard.press('l');
  expect(await titleLook(page)).toBe('painted');
  await play(page);
  expect(await painted(page)).toMatchObject({ active: true, density: 1 });
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => url.includes('-1x-'))).toBe(true);

  await page.goto('/?test=1&look=classic');
  await waitForTitle(page);
  expect(await titleLook(page)).toBe('classic');
  expect(await page.evaluate(() => localStorage.getItem('tarpit.look'))).toBe('painted');
});

for (const map of ['switchback', 'riverbend'] as const) {
  test(`failed ${map} ground falls back to a playable Classic game`, async ({ page }) => {
    const requests: string[] = [];
    await page.route(paintedAsset, (route) => {
      requests.push(route.request().url());
      return route.request().url().includes('/' + map + '-') ? route.abort() : route.continue();
    });
    await page.goto('/?test=1&look=painted');
    await waitForTitle(page);
    await click(page, `title:map:${map}`);
    await play(page);
    expect((await state(page)).map.id).toBe(map);
    expect(await painted(page)).toMatchObject({ active: false });
    expect(requests.some(url => url.includes('/' + map + '-'))).toBe(true);
    await click(page, 'startWave');
    expect((await state(page)).wave).toBe(1);
  });
}

for (const [level, map] of [[3, 'switchback'], [5, 'riverbend']] as const) {
  test(`campaign level ${level} runs in Painted on ${map}`, async ({ page }) => {
    await page.goto('/?test=1&look=painted');
    await waitForFirstScreen(page);
    await api(page, a => a.setCampaignProgress({ 1: 1, 2: 1, 3: 1, 4: 1 }));
    await click(page, 'title:campaign');
    await page.waitForFunction(level => !!window.__tarpit?.uiRects()[`title:stop:${level}`], level);
    await click(page, `title:stop:${level}`);
    await page.waitForFunction(() => !!window.__tarpit?.uiRects()['title:play']);
    await click(page, 'title:play');
    await waitForGame(page);
    expect((await state(page)).level?.id).toBe(level);
    expect((await state(page)).map.id).toBe(map);
    expect(await painted(page)).toMatchObject({ active: true });
    await click(page, 'startWave');
    expect((await state(page)).wave).toBe(1);
  });
}

test('a failed Painted load starts a playable Classic Meadow and can retry on the same visit', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let failed = false;
  await page.route(paintedAsset, (route) => {
    if (failed) return route.continue();
    failed = true;
    return route.abort();
  });
  await page.goto('/?test=1&look=painted');
  await waitForTitle(page);
  await play(page);
  expect(failed).toBe(true);
  expect(await painted(page)).toMatchObject({ active: false });
  expect((await state(page)).map.id).toBe('meadow');
  const registered = await page.evaluate(() => window.__tarpit!.game.textures.getTextureKeys());
  expect(registered.filter((key) => key.startsWith('painted:'))).toEqual([]);
  expect(errors).toEqual([]);
  const gameTexts = () => page.evaluate(() => window.__tarpit!.game.scene.getScene('game').children.list
    .flatMap((child) => 'text' in child ? [child.text] : []));
  const notice = 'Painted art could not load. Playing Classic.';
  expect(await gameTexts()).toContain(notice);
  await click(page, 'startWave');
  expect((await state(page)).wave).toBe(1);
  expect(await gameTexts()).not.toContain(notice);

  await api(page, (a) => a.step(6000));
  expect(await api(page, (a) => a.endScreen())).toBe('lost');
  await click(page, 'menu');
  await waitForTitle(page);
  expect(await titleLook(page)).toBe('painted');
  await play(page);
  expect(await painted(page)).toMatchObject({ active: true });
  expect(await gameTexts()).not.toContain(notice);
});

test('play wave one with painted scenery, upgrading, selling and a Powder Keg kill', async ({ page }) => {
  await openPainted(page);
  const tree = (await painted(page)).sprites.find((s) => s.visible && s.key.includes(':oak:'));
  expect(tree).toBeDefined();
  const cell = { col: Math.floor(tree!.x / 32), row: Math.floor(tree!.y / 32) };
  const at = await cellPage(page, cell);
  const visible = async () => (await painted(page)).sprites.some((s) =>
    s.visible && s.key === tree!.key && s.frame === tree!.frame && s.x === tree!.x && s.y === tree!.y);
  await click(page, 'bar:musketeer');
  await page.mouse.click(at.x, at.y);
  expect((await state(page)).towers).toEqual([expect.objectContaining({ cell, type: 'musketeer' })]);
  expect(await visible()).toBe(false);
  await page.keyboard.press('Escape');
  await page.mouse.click(at.x, at.y);
  await click(page, 'panel:upgrade');
  expect((await state(page)).towers[0]).toMatchObject({ upgraded: true, spent: 85 });
  await click(page, 'startWave');
  await page.mouse.click(at.x, at.y);
  expect((await ui(page)).panelOpen).toBe(true);
  await click(page, 'panel:sell');
  expect((await state(page)).towers).toEqual([]);
  expect((await state(page)).gold).toBe(74);
  expect(await visible()).toBe(true);

  await api(page, (a) => a.step(81));
  const aim = await worldPage(page, { x: 81, y: 240 });
  await click(page, 'special');
  await page.mouse.click(aim.x, aim.y);
  expect(await api(page, (a) => a.events())).toContainEqual(expect.objectContaining({ kind: 'special', type: 'keg', hits: 1 }));
  expect((await state(page)).enemies).toEqual([]);
  expect((await state(page)).gold).toBeGreaterThan(74);

  const replacement = await cellPage(page, { col: 7, row: 5 });
  await click(page, 'bar:musketeer');
  await page.mouse.click(replacement.x, replacement.y);
  await api(page, (a) => a.step(6000));
  expect(await state(page)).toMatchObject({ phase: 'setup', wave: 1, towers: [expect.objectContaining({ locked: true, kills: expect.any(Number) })] });
  expect((await state(page)).towers[0].kills).toBeGreaterThan(0);
  expect(await painted(page)).toMatchObject({ active: true });
});

test('a painted Musketeer turns from the path to the first shot', async ({ page }) => {
  await openPainted(page);
  const musketeer = async () => (await painted(page)).sprites.find((sprite) =>
    sprite.visible && sprite.key.includes(':musketeer:') && sprite.x === 240 && sprite.y === 176);
  expect(await api(page, (a) => a.buildAt(7, 5, 'musketeer'))).toMatchObject({ ok: true });
  const initial = await musketeer();
  expect(initial).toMatchObject({ frame: 12 }); // Faces west toward the nearest stretch of trail.
  await api(page, (a) => {
    a.spawnHorde(1, 300);
    a.step(1);
  });
  expect((await state(page)).shots).toContainEqual(expect.objectContaining({ cell: { col: 7, row: 5 } }));
  expect(await musketeer()).toMatchObject({ frame: 10 }); // Aims southwest at the Goblin.
});

function expectBarLabelGaps(bar: Awaited<ReturnType<typeof paintedBar>>) {
  for (const { name, labels: [nameLabel, priceLabel], rect } of bar) {
    expect(nameLabel.left, name).toBeGreaterThan(rect.x);
    expect(priceLabel.left - nameLabel.right, name).toBeGreaterThanOrEqual(6);
    expect(priceLabel.right, name).toBeLessThan(rect.x + rect.width);
  }
}

test('Classic landscape bar separates names and costs before and after a reward', async ({ page }) => {
  await useTallFontMetrics(page, false);
  await page.goto('/?test=1&look=classic');
  await waitForTitle(page);
  await api(page, a => a.startGame());
  expectBarLabelGaps(await paintedBar(page));
  await api(page, a => {
    a.state().boons = ['longBarrels'];
    a.step(0);
  });
  expectBarLabelGaps(await paintedBar(page));
});

test('painted landscape bar keeps every label in its button and the ghost faces the same way at each cell', async ({ page }) => {
  await useTallFontMetrics(page, false);
  await openPainted(page);
  await api(page, (a) => {
    const state = a.state();
    state.gold = 50;
    state.boons = ['longBarrels'];
    a.step(0);
  });
  const bar = await paintedBar(page);
  expect(bar.map(({ icons }) => icons)).toEqual([
    [{ key: 'painted:musketeer:1x', frame: 6, alpha: 1 }],
    [{ key: 'painted:cannon:1x', frame: 6, alpha: 0.4 }],
    [{ key: 'painted:tar-pit:1x', frame: 6, alpha: 0.4 }],
    [{ key: 'painted:longbow:1x', frame: 6, alpha: 1 }],
    [{ key: 'painted:mortar:1x', frame: 6, alpha: 0.4 }],
    [{ key: 'painted:fire-pot:1x', frame: 6, alpha: 0.4 }],
  ]);
  expect(bar.map(({ labels }) => labels.map(({ text }) => text))).toEqual([
    ['Musketeer', '50'], ['Cannon', '80'], ['Tar Pit', '60'], ['Longbow', '40'], ['Mortar', '110'], ['Fire Pot', '70'],
  ]);
  expectBarLabelGaps(bar);
  await click(page, 'bar:musketeer');
  for (const cell of [{ col: 7, row: 5 }, { col: 3, row: 5 }]) {
    const position = await cellPage(page, cell);
    await page.mouse.move(position.x, position.y);
    expect((await painted(page)).sprites).toContainEqual(expect.objectContaining({
      key: 'painted:musketeer:1x', frame: 6, visible: true, x: cell.col * 32 + 16, y: cell.row * 32 + 16,
    }));
  }
  await page.keyboard.press('Escape');
  expect((await painted(page)).sprites.filter((sprite) => sprite.visible && sprite.key.includes(':musketeer:'))).toEqual([]);
});

test('painted sheets face each Meadow segment through a live layout change', async ({ page }) => {
  await openPainted(page);
  await stageMeadowDirections(page);
  await expectMeadowDirections(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => api(page, (a) => a.layout())).toBe('portrait');
  await expectMeadowDirections(page, true);
});

test('the board, walkers, tower, flyer and HUD draw in screen order', async ({ page }) => {
  await openPainted(page);
  await api(page, (a) => {
    a.buildAt(7, 5, 'musketeer');
    a.spawnHorde(2);
    const state = a.state();
    state.enemies[0].distance = 434; // y = 96, behind the tower
    state.enemies[1].distance = 80; // y = 240, in front of the tower
    state.enemies.push({ ...state.enemies[0], id: state.nextEnemyId++, type: 'harpy' });
    a.step(0);
  });
  await settle(page);
  const order = await page.evaluate(() => window.__tarpit!.game.scene.getScene('game').cameras.main.renderList.flatMap((child) => {
    if ('texture' in child && 'y' in child) {
      const key = (child.texture as { key: string }).key;
      if (key.startsWith('painted:')) return [`${key}:${child.y}`];
    }
    if ('text' in child && child.text === 'Wave 1/20') return ['wave HUD'];
    return [];
  }));
  const names = ['painted:meadow:1x:0', 'painted:goblin:1x:96', 'painted:musketeer:1x:176', 'painted:goblin:1x:240'];
  const flyer = order.find((name) => name.startsWith('painted:harpy:'));
  expect(flyer).toBeDefined();
  const positions = [...names, flyer!, 'wave HUD'].map((name) => order.indexOf(name));
  expect(positions, order.join(', ')).not.toContain(-1);
  expect(positions).toEqual([...positions].sort((left, right) => left - right));
});

test('reuse loaded art after Play again and Menu', async ({ page }) => {
  const requests: string[] = [];
  await page.route(paintedAsset, (route) => {
    requests.push(route.request().url());
    return route.continue();
  });
  await openPainted(page);
  const textures = () => page.evaluate(() => window.__tarpit!.game.textures.getTextureKeys()
    .filter((key) => key.startsWith('painted:')).sort());
  const first = await textures();
  expect(first).toContain('painted:meadow:1x');
  expect(first).toContain('painted:goblin:1x');
  const initialTexture = await page.evaluateHandle(() => window.__tarpit!.game.textures.get('painted:meadow:1x'));
  const expectReuse = async () => {
    expect(await textures()).toEqual(first);
    expect(await initialTexture.evaluate((texture) => texture === window.__tarpit!.game.textures.get('painted:meadow:1x'))).toBe(true);
  };
  const loaded = requests.length;
  expect(loaded).toBeGreaterThan(0);
  const lose = async () => {
    await api(page, (a) => {
      a.startWave();
      a.step(6000);
    });
    expect(await api(page, (a) => a.endScreen())).toBe('lost');
  };
  await lose();
  await click(page, 'playAgain');
  await expect.poll(() => state(page).then((s) => s.phase)).toBe('setup');
  expect(await painted(page)).toMatchObject({ active: true });
  await expectReuse();
  await lose();
  await click(page, 'menu');
  await waitForTitle(page);
  expect(await titleLook(page)).toBe('painted');
  await play(page);
  expect(await painted(page)).toMatchObject({ active: true });
  await expectReuse();
  expect(requests).toHaveLength(loaded);
});

test('changing maps reuses shared pieces and fetches just the new ground', async ({ page }) => {
  const requests: string[] = [];
  await page.route(paintedAsset, route => {
    requests.push(new URL(route.request().url()).pathname);
    return route.continue();
  });
  await openPainted(page);
  const goblin = await page.evaluateHandle(() => window.__tarpit!.game.textures.get('painted:goblin:1x'));
  for (const map of ['switchback', 'riverbend'] as const) {
    await api(page, a => { a.startWave(); a.step(6000); });
    await click(page, 'menu');
    await waitForTitle(page);
    await click(page, `title:map:${map}`);
    requests.length = 0;
    await play(page);
    expect(await painted(page)).toMatchObject({ active: true, density: 1 });
    expect(requests).toEqual([expect.stringContaining('/' + map + '-1x-')]);
    expect(await goblin.evaluate(texture => texture === window.__tarpit!.game.textures.get('painted:goblin:1x'))).toBe(true);
  }
});

test('offline Meadow falls back when cold and opens Painted after its first online game', async ({ page, context }) => {
  await page.goto('/');
  await waitForTitle(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await click(page, 'title:look:painted');
  await context.setOffline(true);
  await play(page);
  expect(await livePainted(page)).toBe(false);

  await context.setOffline(false);
  await page.reload();
  await waitForTitle(page);
  await play(page);
  expect(await livePainted(page)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await waitForTitle(page);
  await play(page);
  expect(await livePainted(page)).toBe(true);
});

test('an immediate first Painted game warms the offline cache while the worker is installing', async ({ page, context }) => {
  await page.addInitScript(() => {
    if (navigator.serviceWorker.controller) return;
    const original = ServiceWorkerContainer.prototype.register;
    ServiceWorkerContainer.prototype.register = async function (...args) {
      await new Promise<void>((release) =>
        window.addEventListener('release-worker-registration', () => release(), { once: true }));
      return original.apply(this, args);
    };
  });
  await page.goto('/');
  await waitForTitle(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await click(page, 'title:look:painted');
  await click(page, 'title:play');
  await page.waitForFunction(() => {
    const scene = window.__tarpit!.game.scene.getScene('title') as TitleScene;
    return scene.uiState().loading === 0;
  });
  // Hold the first install past the former three-second race. No art should
  // escape the worker while it is still installing the offline shell.
  await page.waitForTimeout(3200);
  expect(await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => entry.name.includes('/assets/painted/')).length)).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('release-worker-registration')));
  await waitForGame(page);
  expect(await livePainted(page)).toBe(true);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');

  await context.setOffline(true);
  await page.reload();
  await waitForTitle(page);
  await play(page);
  expect(await livePainted(page)).toBe(true);
});

test('Classic sprites use nearest filtering and Painted sheets use linear filtering', async ({ page }) => {
  await openPainted(page);
  const filters = await page.evaluate(() => {
    const textures = window.__tarpit!.game.textures;
    return ['goblin', 'painted:goblin:1x', 'painted:meadow:1x'].map((key) => ({
      loaded: textures.exists(key),
      mode: textures.get(key).source[0].scaleMode,
    }));
  });
  expect(filters).toEqual([
    { loaded: true, mode: 1 }, // Phaser NEAREST
    { loaded: true, mode: 0 }, // Phaser LINEAR
    { loaded: true, mode: 0 },
  ]);
});

test('a Painted hit brightens the same pose, preserves its detail and clears next tick', async ({ page }) => {
  await openPainted(page);
  const result = await api(page, (a) => {
    a.buildAt(7, 5, 'musketeer');
    a.startWave();
    a.step(1);
    a.state().enemies[0].hp = 30;
    a.step(151);
    const scene = a.game.scene.getScene('game') as unknown as {
      enemySprites: { views: Map<number, { sprite: Phaser.GameObjects.Sprite }> };
    };
    const sprite = scene.enemySprites.views.get(0)!.sprite;
    const hit = a.animState(0)!.flags.hit;
    const hitFrame = sprite.frame;
    const tintFill = sprite.tintFill;
    const blend = sprite.blendMode;
    a.step(1);
    const normal = sprite.frame;
    const source = normal.source.image as HTMLCanvasElement;
    const ctx = source.getContext('2d')!;
    const pixels = (f: Phaser.Textures.Frame) => ctx.getImageData(f.cutX, f.cutY, f.cutWidth, f.cutHeight).data;
    const before = pixels(normal);
    const after = pixels(hitFrame);
    let opaque = 0, errors = 0;
    for (let i = 0; i < before.length; i += 4) {
      if (before[i + 3] !== after[i + 3]) errors++;
      if (before[i + 3] !== 255) continue;
      opaque++;
      for (let c = 0; c < 3; c++) {
        const expected = before[i + c] * 0.72 + 255 * 0.28;
        if (Math.abs(after[i + c] - expected) > 2) errors++;
      }
    }
    return { hit, cleared: !a.animState(0)!.flags.hit, tintFill, blend, errors, opaque };
  });
  expect(result).toMatchObject({ hit: true, cleared: true, tintFill: false, blend: 0, errors: 0 });
  expect(result.opaque).toBeGreaterThan(40);
});
