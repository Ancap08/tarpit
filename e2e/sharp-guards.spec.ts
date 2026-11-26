import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import type { PaintedName, PaintedSheet } from '../src/game/skin/loading';
import type { PaintedSkin } from '../src/game/skin/painted';
import { GUARD_COUNT, MAPS, SPECIAL_DEFS, positionAlongPath } from '../src/sim';
import { api, press } from './campaign';
import { castAt } from './barricade';
import { waitForFirstScreen, waitForTitle } from './title';

const cases = [
  { name: 'campaign level 8', level: 8 },
  { name: 'campaign level 1 with the gold cheat', level: 1, cheat: true },
  ...Object.keys(MAPS).map(map => ({ name: 'Free play ' + map, map })),
  { name: 'Showpiece Free play', map: 'meadow', showpiece: true },
];

for (const entry of cases) {
  test('Lifted Guards draw on ' + entry.name, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const level = 'level' in entry ? entry.level : undefined;
    const showpiece = 'showpiece' in entry && entry.showpiece;
    const cheat = 'cheat' in entry && entry.cheat;
    await page.addInitScript(() => {
      localStorage.setItem('tarpit.campaign', JSON.stringify({ v: 2,
        stars: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i + 1, 3])) }));
    });
    await page.goto('/?test=1&ui=new&look=' + (showpiece ? 'showpiece' : 'painted'));
    if (level) {
      await waitForFirstScreen(page);
      await press(page, 'title:campaign');
      await page.waitForFunction(() => window.__tarpit?.titleReady() && window.__tarpit.screen?.() === 'levelMap');
      await press(page, 'title:stop:' + level);
      await page.waitForFunction(() => window.__tarpit?.titleReady() && window.__tarpit.screen?.() === 'levelCard');
    } else {
      await waitForTitle(page);
      if ('map' in entry) await press(page, 'title:map:' + entry.map);
    }
    await press(page, 'title:play');
    await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') && !!window.__tarpit.uiRects().startWave);
    expect(await api(page, t => t.painted().active)).toBe(true);
    if (showpiece) expect(await api(page, t => t.showpiece?.())).not.toBeNull();
    if (cheat) expect(await api(page, t => t.cheatGold())).toMatchObject({ ok: true });
    const wave = level && !cheat ? 1 : SPECIAL_DEFS.guards.unlockWave;
    expect(await page.evaluate(wave => {
      const t = window.__tarpit!;
      const scene = t.game.scene.getScene('game') as GameScene;
      scene.state.wave = wave - 1;
      return scene.startWave();
    }, wave)).toMatchObject({ ok: true });

    const canvas = page.locator('canvas:not([data-interface-ink])');
    const map = await api(page, t => (t.game.scene.getScene('game') as GameScene).state.map);
    const target = positionAlongPath(map, 160);
    await press(page, 'special');
    await press(page, 'special:guards');
    await castAt(page, target);
    const result = await api(page, t => {
      const guards = t.painted().sprites.filter(s => s.visible && s.key.startsWith('painted:sharp:guard-'));
      return {
        blockers: t.state().blockers.filter(b => b.kind === 'guard').length,
        guards,
        registered: guards.every(g => t.game.textures.exists(g.key)),
        tick: t.state().tick,
      };
    });
    expect(errors).toEqual([]);
    expect(result.blockers).toBe(GUARD_COUNT);
    expect(result.guards).toHaveLength(GUARD_COUNT);
    expect(result.registered).toBe(true);
    expect(result.guards.map(guard => guard.key)).toEqual(Array(GUARD_COUNT).fill('painted:sharp:guard-2x'));
    expect(new Set(result.guards.map(g => Math.floor(g.frame / 8))).size).toBe(GUARD_COUNT);
    const squad = await canvas.screenshot();
    await api(page, t => {
      const scene = t.game.scene.getScene('game') as unknown as Phaser.Scene & { painted: PaintedSkin };
      scene.events.on('postupdate', () => {
        for (const object of scene.painted.standing.list) {
          const image = object as Phaser.GameObjects.Image;
          if (image.texture?.key === 'painted:sharp:guard-2x') image.setVisible(false);
        }
      });
    });
    const withoutSquad = await canvas.screenshot();
    expect(squad).not.toEqual(withoutSquad);
    expect(await api(page, t => t.state().tick)).toBe(result.tick);
  });
}

test('missing Guard and enemy sheets draw fallback pieces and the battle keeps ticking', async ({ page }) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning' && message.text().startsWith('Painted sheet is missing')) warnings.push(message.text());
  });
  await page.goto('/?test=1&ui=new&look=painted');
  await waitForTitle(page);
  await press(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') && !!window.__tarpit.uiRects().startWave);

  const result = await page.evaluate(wave => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const { painted } = scene as unknown as { painted: PaintedSkin };
    const sheets = painted.assets.sheets as Partial<Record<PaintedName, PaintedSheet>>;
    // A missing texture and a missing catalogue entry take the same safe path.
    if (!sheets.guard || !sheets.goblin) throw new Error('Cannot remove unregistered fixture art');
    scene.textures.remove(sheets.guard.key);
    delete sheets.goblin;
    scene.state.wave = wave - 1;
    const start = scene.startWave();
    const cast = scene.useSpecialAt('guards', 160, 240);
    scene.advance(90);
    return {
      start, cast, tick: scene.state.tick, phase: scene.state.phase,
      guards: scene.uiState().special.guards.map(guard => guard.texture),
      sprites: scene.paintedState().sprites.filter(sprite => sprite.key === 'painted:sharp:fallback' && sprite.visible),
    };
  }, SPECIAL_DEFS.guards.unlockWave);
  expect(result).toMatchObject({ start: { ok: true }, cast: { ok: true }, tick: 90, phase: 'wave' });
  expect(result.guards).toEqual(Array(GUARD_COUNT).fill('painted:sharp:fallback'));
  expect(result.sprites.length).toBeGreaterThan(GUARD_COUNT);
  expect(result.sprites.every(sprite => sprite.frame === 0)).toBe(true);
  expect(warnings.sort()).toEqual(['Painted sheet is missing: goblin', 'Painted sheet is missing: guard']);
  expect(errors).toEqual([]);
});
