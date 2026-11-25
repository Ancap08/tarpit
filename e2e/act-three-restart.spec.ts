import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { enemyArt, towerArt } from '../src/game/skin/frames';
import { api, press } from './campaign';
import { onScreen } from './campaignScreens';
import { paintedBar, settle } from './painted';
import { waitForFirstScreen } from './title';

type Look = 'painted' | 'classic' | 'showpiece';
type Restart = 'loss' | 'win' | 'pause';

async function open(page: Page, touch: boolean, look: Look, link = '', actThree = true, endingSeen = true) {
  await page.addInitScript(endingSeen => {
    const stars = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [i + 1, 3]));
    localStorage.setItem('tarpit.campaign', JSON.stringify({ v: 2, stars }));
    localStorage.setItem('tarpit.seenBroadsides', '["opening","secondAct","ending"]');
    localStorage.setItem('tarpit.seenSiegeBroadsides', JSON.stringify(endingSeen ? ['thirdAct', 'siegeEnding'] : ['thirdAct']));
  }, endingSeen);
  await page.goto(`/?test=1&look=${look}${actThree ? '&act3=1' : ''}${link}`);
  if (link) await readyGame(page, 21);
  else {
    await waitForFirstScreen(page, { showStory: true });
    await press(page, 'title:campaign', touch);
    await onScreen(page, 'levelMap');
  }
}

async function readyGame(page: Page, level: number) {
  await page.waitForFunction(level => {
    const t = window.__tarpit!;
    return t?.screen?.() === 'game' && t.state!().level?.id === level && !!t.uiRects()['startWave'];
  }, level);
  await expect(page.locator('#keep-status')).toBeHidden();
}

async function enter(page: Page, touch: boolean, level: number) {
  const key = `title:stop:${level}`;
  if (!(key in await api(page, t => t.uiRects()))) {
    await press(page, `title:act:${level === 1 ? 1 : 3}`, touch);
    await onScreen(page, 'levelMap');
  }
  await press(page, key, touch);
  await onScreen(page, 'levelCard');
  if (level >= 21) expect(await api(page, t => t.game.textures.exists('siege:thumbnails'))).toBe(true);
  await press(page, 'title:play', touch);
  await readyGame(page, level);
  expect(await api(page, t => t.game.textures.exists('siege:thumbnails'))).toBe(false);
}

async function finish(page: Page, win: boolean) {
  await page.evaluate(win => {
    // Reach the real result screen without replaying the whole campaign.
    const t = window.__tarpit!;
    const state = t.state!();
    state.wave = win ? state.level!.waves.length : 1;
    state.lives = win ? 15 : 0;
    state.phase = win ? 'won' : 'lost';
    t.step!(0);
  }, win);
  await onScreen(page, 'result');
  expect(await api(page, t => t.state().phase)).toBe(win ? 'won' : 'lost');
}

async function restart(page: Page, touch: boolean, level: number, route: Restart) {
  if (route === 'pause') {
    await press(page, 'pause', touch);
    expect(await api(page, t => t.paused())).toBe(true);
    await press(page, 'pause:restart', touch);
    await press(page, 'pause:restart', touch);
  } else {
    await finish(page, route === 'win');
    await press(page, 'playAgain', touch);
  }
  await page.waitForFunction(level => {
    const t = window.__tarpit!;
    if (t.screen?.() !== 'game') return false;
    const state = t.state!();
    return state.level?.id === level && state.phase === 'setup' && state.tick === 0 && !t.paused();
  }, level);
  await readyGame(page, level);
}

async function leave(page: Page, touch: boolean) {
  const fromKeep = await api(page, t => t.state().map.id === 'keep');
  await press(page, 'pause', touch);
  await press(page, 'pause:menu', touch);
  await onScreen(page, 'levelMap');
  await expect(page.locator('#game [aria-hidden=true] canvas')).toHaveCount(0);
  const keys = await api(page, t => t.game.textures.getTextureKeys());
  expect(keys.filter(key => /^(keep|siege):/.test(key))).toEqual([]);
  if (fromKeep) expect(keys.filter(key => key.startsWith('painted:'))).toEqual([]);
}

async function combat(page: Page) {
  const result = await page.evaluate(() => {
    const t = window.__tarpit!;
    const scene = t.game.scene.getScene('game') as GameScene;
    const s = t.state!();
    s.gold = 100_000;
    const roster = s.level!.allowedTowers;
    const sites = s.map.buildSites ?? Array.from({ length: 10 }, (_, i) => ({ col: i + 2, row: 5 }));
    for (const type of roster) {
      if (!sites.some(site => scene.build(site, type).ok)) throw new Error(`No build site for ${type}`);
    }
    if (!t.startWave!().ok) throw new Error('Could not start wave');
    // Exercise every enemy sheet in the level and put the first target in
    // tower range, so the real sim produces a visible projectile.
    const enemies = [...new Set(s.level!.waves.flatMap(wave => wave.groups.map(group => group.type)))];
    if (s.level!.endingBoss === 'grumblemaw' && !enemies.includes('wolf')) enemies.push('wolf');
    for (const [id, type] of enemies.entries()) {
      s.enemies.push({ id, type, hp: 950, slow: 0, slowTicksLeft: 0,
        distance: (s.gate ? s.gate.distance - 30 : 240) - id * 24 });
    }
    s.nextEnemyId = enemies.length;
    if (s.gate) scene.useSpecialAt('guards', s.gate.x, s.gate.y);
    t.step!(1);
    return { enemies, roster, shots: s.shots.length };
  });
  return result;
}

async function checkTextures(page: Page) {
  const missing = await page.evaluate(() => {
    const t = window.__tarpit!;
    const { textures } = t.game;
    const roots = t.game.scene.getScene('game').children.list;
    function missingFrames(children: Phaser.GameObjects.GameObject[]): string[] {
      return children.flatMap(child => {
        if (child.type === 'Container' || child.type === 'Layer') {
          return missingFrames((child as Phaser.GameObjects.Container | Phaser.GameObjects.Layer).list);
        }
        if (child.type !== 'Image' && child.type !== 'Sprite' && child.type !== 'TileSprite') return [];
        const { texture, frame } = child as Phaser.GameObjects.Image;
        return texture && texture.key !== '__MISSING' && !texture.key.endsWith(':__MISSING') &&
          textures.exists(texture.key) && textures.get(texture.key) === texture &&
          frame && texture.has(frame.name) && texture.get(frame.name) === frame ? []
          : [`${child.name || child.type}: ${texture?.key} / ${frame?.name}`];
      });
    }
    return missingFrames(roots);
  });
  expect(missing, 'every displayed texture and frame is registered').toEqual([]);
}

async function frame(page: Page) {
  await page.mouse.move(0, 0);
  await settle(page);
  // Compare the battle canvas and composited plates at their native resolution.
  // Chromium can resample the same plates differently across tablet page visits.
  const surfaces = await page.evaluate(() => {
    const host = document.querySelector('#game')!;
    const plates = [...host.querySelectorAll<HTMLElement>('[aria-hidden=true], [aria-hidden=true] *')];
    return [
      window.__tarpit!.game.canvas.toDataURL(),
      ...plates.map(layer => [Array.from(layer.style).sort().map(name => [name, layer.style.getPropertyValue(name)]),
        layer.hidden,
        layer instanceof HTMLCanvasElement ? layer.toDataURL() : null]),
    ];
  });
  return createHash('sha256').update(JSON.stringify(surfaces)).digest('hex');
}

/** Estimated decoded RGBA bytes, counted once per retained Phaser or panorama source. */
const decodedBytes = (page: Page) => page.evaluate(() => {
  const { game } = window.__tarpit!;
  const sources = new Set<HTMLImageElement | HTMLCanvasElement>();
  for (const texture of Object.values(game.textures.list)) {
    for (const source of texture.source) sources.add(source.image as HTMLImageElement | HTMLCanvasElement);
  }
  for (const canvas of document.querySelectorAll<HTMLCanvasElement>('#game [aria-hidden=true] canvas')) sources.add(canvas);
  return [...sources].reduce((bytes, image) => bytes + ('naturalWidth' in image
    ? image.naturalWidth * image.naturalHeight : image.width * image.height) * 4, 0);
});

async function field(page: Page, actThree = true, look: Look = 'painted') {
  const { keep, painted, showpiece, actors, keys } = await api(page, t => ({
    keep: t.state().map.id === 'keep', painted: t.painted().active,
    showpiece: !!t.showpiece?.(), actors: !!(t.state().windows || t.state().wallSiteTax),
    keys: t.game.textures.getTextureKeys(),
  }));
  expect(painted).toBe(keep || look !== 'classic');
  expect(showpiece).toBe(!keep && look === 'showpiece');
  expect(keys.some(key => key.startsWith('showpiece:pasture:'))).toBe(!keep && look === 'showpiece');
  expect(keys.includes('siege:actors')).toBe(keep && actThree && actors);
  if (keep) {
    expect(keys).toEqual(expect.arrayContaining(['keep:mist', 'keep:glow', 'keep:plinth']));
    await expect(page.locator('#game [aria-hidden=true] canvas').first()).toBeVisible();
    expect(await page.locator('#game [aria-hidden=true] canvas').count()).toBeGreaterThan(3);
  } else {
    await expect(page.locator('#game [aria-hidden=true] canvas')).toHaveCount(0);
    if (painted) expect(keys.some(key => key.startsWith('painted:meadow:'))).toBe(true);
  }
  if (painted) {
    const bar = await paintedBar(page);
    expect(bar.map(({ name }) => name.slice(4))).toEqual(expect.arrayContaining(
      await api(page, t => [...t.state().level!.allowedTowers])));
    for (const { name, icons } of bar) {
      const art = towerArt(name.slice(4) as Parameters<typeof towerArt>[0]);
      expect(icons.map(icon => icon.key), name).toEqual([expect.stringMatching(`^painted:${art}:`)]);
    }
  }
  await checkTextures(page);
  const setup = await frame(page);
  const setupBytes = await decodedBytes(page);
  const { enemies, roster, shots } = await combat(page);
  expect(shots, 'the towers fired in the combat fixture').toBeGreaterThan(0);
  await checkTextures(page);
  if (painted) {
    const sprites = await api(page, t => t.painted().sprites.filter(s => s.visible).map(s => s.key));
    for (const type of roster) expect(sprites.some(key => key.includes(`painted:${towerArt(type)}:`)), type).toBe(true);
    for (const type of enemies) expect(sprites.some(key => key.includes(`painted:${enemyArt(type)}:`)), type).toBe(true);
    expect(sprites.some(key => /painted:(arrow|cannonball|flame|tar-glob|mortar-shell):|keep:siege-machines/.test(key)),
      'a painted projectile from the combat fixture').toBe(true);
  }
  return { setup, battle: await frame(page), setupBytes, battleBytes: await decodedBytes(page) };
}

const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page, context }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  function watch(tab: Page) {
    tab.on('pageerror', error => errors.push(error.message));
    tab.on('console', message => {
      if (message.type() === 'error' || /missing texture|texture.*not found|frame.*not found/i.test(message.text())) {
        errors.push(message.text());
      }
    });
  }
  watch(page);
  context.on('page', watch);
});

test.afterEach(({ page }) => expect(browserErrors.get(page)).toEqual([]));

for (const route of ['loss', 'win', 'pause'] as const) {
  test(`painted siege: restart from ${route} preserves the setup and combat frames`, async ({ page, hasTouch }) => {
    await open(page, hasTouch, 'painted');
    await enter(page, hasTouch, 21);
    const fresh = await field(page);
    await restart(page, hasTouch, 21, route);
    expect(await field(page)).toEqual(fresh);
  });
}

for (const look of ['classic', 'showpiece'] as const) {
  test(`${look} switch: siege replay keeps the keep's combat art`, async ({ page, hasTouch }) => {
    await open(page, hasTouch, look);
    await enter(page, hasTouch, 23);
    const fresh = await field(page, true, look);
    await restart(page, hasTouch, 23, 'pause');
    expect(await field(page, true, look)).toEqual(fresh);
  });
}

for (const actThree of [true, false]) {
  test(`direct keep link ${actThree ? 'with' : 'without'} the Act Three switch survives restart`, async ({ page, hasTouch }) => {
    await open(page, hasTouch, 'painted', '&keep=21', actThree);
    const fresh = await field(page, actThree);
    await restart(page, hasTouch, 21, 'loss');
    expect(await field(page, actThree)).toEqual(fresh);
  });
}

test('map revisits and five restarts keep the right sky and a stable decoded footprint', async ({ page, hasTouch, context }, info) => {
  test.setTimeout(90_000);
  const fresh = new Map<number, Awaited<ReturnType<typeof field>>>();
  for (const level of [1, 23, 25]) {
    const reference = await context.newPage();
    await open(reference, hasTouch, 'painted');
    await enter(reference, hasTouch, level);
    fresh.set(level, await field(reference));
    await reference.close();
  }

  await open(page, hasTouch, 'painted');
  await enter(page, hasTouch, 21);
  const dusk = await field(page);
  fresh.set(21, dusk);
  for (const route of ['loss', 'pause', 'win', 'pause', 'loss'] as const) {
    await restart(page, hasTouch, 21, route);
    expect(await field(page)).toEqual(dusk);
  }
  await leave(page, hasTouch);
  for (const level of [21, 23, 25, 1, 21]) {
    await enter(page, hasTouch, level);
    const revisit = await field(page);
    expect(revisit, `revisited level ${level}`).toEqual(fresh.get(level));
    await leave(page, hasTouch);
  }
  if (info.project.name === 'phone') {
    const measured = [...fresh].map(([level, { setupBytes, battleBytes }]) => ({ level, setupBytes, battleBytes }));
    for (const { level, setupBytes, battleBytes } of measured.filter(entry => entry.level >= 21)) {
      expect(setupBytes, `level ${level} setup`).toBeLessThan(60_000_000);
      expect(battleBytes, `level ${level} combat`).toBeLessThan(60_000_000);
    }
    console.log('[phone retained decoded RGBA bytes]', JSON.stringify(measured));
  }
});

test('Showpiece pasture is released on siege entry and comes back on the ordinary level', async ({ page, hasTouch }) => {
  await open(page, hasTouch, 'showpiece');
  await enter(page, hasTouch, 1);
  const meadow = await field(page, true, 'showpiece');
  await leave(page, hasTouch);
  await enter(page, hasTouch, 23);
  await field(page, true, 'showpiece');
  await leave(page, hasTouch);
  await enter(page, hasTouch, 1);
  expect(await field(page, true, 'showpiece')).toEqual(meadow);
});

test('the first finale win takes Play again through the ending and reloads the fight', async ({ page, hasTouch }) => {
  await open(page, hasTouch, 'painted', '', true, false);
  await enter(page, hasTouch, 25);
  const fresh = await field(page);
  await finish(page, true);
  await press(page, 'playAgain', hasTouch);
  await onScreen(page, 'siegeEnding');
  const keys = await api(page, t => t.game.textures.getTextureKeys());
  expect(keys.filter(key => /^(painted|keep):/.test(key))).toEqual([]);
  expect(keys).toContain('siege:actors');
  const portrait = await api(page, t => t.layout() === 'portrait');
  expect(keys.includes('siege:ending-portrait')).toBe(portrait);
  await press(page, 'title:continue', hasTouch);
  await readyGame(page, 25);
  expect(await api(page, t => t.game.textures.exists('siege:ending-portrait'))).toBe(false);
  expect(await field(page)).toEqual(fresh);
});
