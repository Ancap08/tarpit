import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { BOSS_NAME } from '../src/game/names';
import { lastSpawnTick } from '../src/sim';
import { api, buttonCentre, clearToOffer, mapPress, press, visibleTexts } from './campaign';
import { cellPage, fingerFor, rectPageSize, touchDrag, touchHold } from './phone';
import { waitForFirstScreen, waitForTitle } from './title';

export async function setPageHidden(page: Page, hidden: boolean) {
  await page.evaluate(hidden => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

async function frozenGame(page: Page, campaign = false) {
  await page.goto('/?test=1');
  await waitForFirstScreen(page);
  if (campaign) await api(page, t => t.startLevel(3));
  else await api(page, t => t.startGame('hard', 'riverbend'));
}

const paused = (page: Page) => api(page, t => t.paused());

export function pauseSuite(touch: boolean) {
  for (const campaign of [false, true]) {
    test(`pause between waves: resume, confirmed restart and leave ${campaign ? 'a level' : 'Free play'}`, async ({ page }, info) => {
      await frozenGame(page, campaign);
      await setPageHidden(page, true);
      await setPageHidden(page, false);
      expect(await paused(page), 'frozen tests opt in to automatic pause').toBe(false);
      if (info.project.name === 'phone') {
        const size = await rectPageSize(page, 'pause');
        expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(44);
      }
      const initial = await api(page, t => t.state());
      await api(page, t => t.cheatGold());
      await press(page, 'pause', touch);
      expect(await paused(page)).toBe(true);
      expect(await visibleTexts(page)).toEqual(expect.arrayContaining(['Paused', 'Resume', 'Restart', campaign ? 'Level map' : 'Menu']));
      await press(page, 'pause:restart', touch);
      expect(await visibleTexts(page)).toContain('Confirm restart');
      expect(await api(page, t => t.state().cheated)).toBe(true);
      await press(page, 'pause:resume', touch);
      expect(await paused(page)).toBe(false);

      await page.keyboard.press('p');
      expect(await visibleTexts(page)).toContain('Restart');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Space');
      expect(await visibleTexts(page)).toContain('Confirm restart');
      await press(page, 'pause:restart', touch);
      await page.waitForFunction(() => window.__tarpit?.state?.().cheated === false);
      expect(await api(page, t => t.state())).toEqual(initial);
      expect(await paused(page)).toBe(false);

      await page.keyboard.press('p');
      if (campaign) {
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
      } else await press(page, 'pause:menu', touch);
      await page.waitForFunction(screen => window.__tarpit?.titleReady() && window.__tarpit.screen?.() === screen,
        campaign ? 'levelMap' : 'freePlay');
      expect(await paused(page)).toBe(false);
    });
  }

  test('pause blocks map, HUD and game actions; cancel holds and preserve the wave on rotation', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/?test=1&autoPause=1');
    await waitForFirstScreen(page);
    await api(page, t => t.startGame());
    const client = touch ? await page.context().newCDPSession(page) : undefined;
    const speed = await buttonCentre(page, 'speed');
    const pauseWhileHeld = async () => {
      await page.waitForFunction(() => window.__tarpit?.speed?.() === 3);
      await page.keyboard.press('p');
      expect(await paused(page)).toBe(true);
    };
    await api(page, t => t.setSpeed(2));
    if (client) await touchHold(page, client, speed, 450, pauseWhileHeld);
    else {
      await page.mouse.move(speed.x, speed.y);
      await page.mouse.down();
      await pauseWhileHeld();
      await page.mouse.up();
    }
    expect(await api(page, t => t.speed())).toBe(2);
    await page.keyboard.press('Escape');

    const bar = await buttonCentre(page, 'bar:musketeer');
    const cell = { col: 7, row: 5 };
    const dragTo = touch ? await fingerFor(page, cell) : await cellPage(page, cell);
    const pauseDrag = async () => {
      expect(await api(page, t => t.ui().dragging?.cell)).toEqual(cell);
      await page.keyboard.press('p');
      expect(await api(page, t => t.ui().dragging)).toBeNull();
    };
    if (client) await touchDrag(page, client, bar, dragTo, pauseDrag);
    else {
      await page.mouse.move(bar.x, bar.y);
      await page.mouse.down();
      await page.mouse.move(dragTo.x, dragTo.y, { steps: 4 });
      await pauseDrag();
      await page.mouse.up();
    }
    await page.keyboard.press('p');
    expect(await api(page, t => t.state().towers)).toEqual([]);
    expect(await api(page, t => t.buildAt(2, 5, 'musketeer').ok)).toBe(true);
    await press(page, 'startWave', touch);
    await api(page, t => t.step(30));
    await press(page, 'special', touch);
    expect(await api(page, t => t.ui().special.aiming)).toBe('keg');
    const hud = await Promise.all(['bar:musketeer', 'speed', 'special', 'startWave'].map(key => buttonCentre(page, key)));
    await setPageHidden(page, true);
    await setPageHidden(page, false);
    expect(await paused(page)).toBe(true);
    expect(await api(page, t => t.ui().special.aiming)).toBeNull();
    const before = await api(page, t => t.state());
    const speedBefore = await api(page, t => t.speed());
    for (const point of hud) {
      if (touch) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
    }
    await mapPress(page, 2, 5, touch);
    await mapPress(page, 7, 5, touch);
    await mapPress(page, 7, 5, touch);
    expect(await api(page, t => t.ui())).toMatchObject({ pick: null, panelOpen: false, special: { aiming: null, menuOpen: false } });
    expect(await api(page, t => t.speed())).toBe(speedBefore);
    const blocked = await api(page, t => {
      t.step(600);
      return [t.buildAt(7, 5, 'musketeer'), t.upgradeAt(2, 5), t.sellAt(2, 5),
        t.setTargetingAt(2, 5, 'last'), t.useSpecialAt('keg', 100, 240)];
    });
    expect(blocked).toEqual(Array(5).fill({ ok: false, reason: 'paused' }));
    expect(await api(page, t => t.state())).toEqual(before);
    await press(page, 'mute', touch);
    expect(await api(page, t => t.audio().muted)).toBe(true);
    const { width, height } = page.viewportSize()!;
    await page.setViewportSize({ width: height, height: width });
    await page.waitForFunction(layout => window.__tarpit?.ui?.().layout === layout, height > width ? 'landscape' : 'portrait');
    expect(await paused(page)).toBe(true);
    expect(await api(page, t => t.game.scene.getScenes(true).map(scene => scene.scene.key))).toEqual(['game']);
    expect(await api(page, t => t.state())).toEqual(before);
    await press(page, 'pause:resume', touch);
    expect(await paused(page)).toBe(false);
    await api(page, t => t.step(1));
    expect(await api(page, t => t.state().tick)).toBe(before.tick + 1);
  });

  test('reward survives pause; tips and results keep their own screens', async ({ page }) => {
    await page.goto('/?test=1');
    await waitForFirstScreen(page, { showTips: true });
    await press(page, 'title:campaign', touch);
    await page.waitForFunction(() => window.__tarpit?.titleReady() && !!window.__tarpit.uiRects()['title:stop:1']);
    await press(page, 'title:stop:1', touch);
    await page.waitForFunction(() => window.__tarpit?.titleReady() && window.__tarpit.screen?.() === 'levelCard');
    await press(page, 'title:play', touch);
    await page.waitForFunction(() => window.__tarpit?.titleReady() && window.__tarpit.screen?.() === 'levelTips'
      && window.__tarpit.game.scene.getScene('title').input.enabled);
    await page.keyboard.press('p');
    expect(await api(page, t => [t.paused(), t.screen()])).toEqual([false, 'levelTips']);

    await frozenGame(page);
    await clearToOffer(page, 5);
    const offer = await api(page, t => t.pendingBoon());
    expect(offer?.wave).toBe(5);
    await press(page, 'pause', touch);
    expect(await paused(page)).toBe(true);
    await page.keyboard.press('1');
    expect(await api(page, t => t.pendingBoon())).toEqual(offer);
    await page.keyboard.press('Escape');
    await page.keyboard.press('1');
    expect(await api(page, t => t.heldBoons())).toEqual([offer!.options[0]]);
    await api(page, t => { t.state().phase = 'lost'; t.step(0); });
    await page.keyboard.press('p');
    expect(await api(page, t => [t.paused(), t.screen(), t.endScreen()])).toEqual([false, 'result', 'lost']);
  });

  test('boss entrance, animation, effects, audio and recharge freeze together until resume', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/?renderer=canvas');
    await waitForTitle(page);
    await press(page, 'title:play', touch);
    await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') && window.__tarpit.audio().context === 'running');
    await page.evaluate(steps => {
      const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
      scene.state.wave = 9;
      scene.state.lives = 1000;
      scene.startWave();
      scene.advance(steps);
      // Spend the fresh charge so this wave has a running recharge timer.
      scene.useSpecialAt('keg', 200, 240);
    }, lastSpawnTick(10) + 1);
    await page.waitForFunction(boss => {
      const t = window.__tarpit!;
      if (t.fx()?.banner !== boss) return false;
      t.pause();
      return t.paused();
    }, BOSS_NAME, { timeout: 45_000 });
    await page.waitForFunction(() => window.__tarpit!.audio().context === 'suspended');
    const snapshot = () => page.evaluate(() => {
      const t = window.__tarpit!;
      const scene = t.game.scene.getScene('game') as GameScene;
      const boss = scene.state.enemies.find(enemy => enemy.type === 'boss')!;
      return { tick: scene.state.tick, recharge: scene.state.specialRechargeTicks, anim: t.animState(boss.id),
        fx: t.fx(), decorTime: t.decor()?.t, played: t.audio().played, voices: t.audio().voices };
    });
    const before = await snapshot();
    expect(before.recharge).toBeGreaterThan(0);
    expect(before.anim).not.toBeNull();
    expect(before.fx?.banner).toBe(BOSS_NAME);
    expect(before.voices).toBe(0);
    await press(page, 'mute', touch);
    await press(page, 'mute', touch);
    await page.waitForTimeout(350);
    expect(await snapshot()).toEqual(before);
    expect(await api(page, t => t.audio().context)).toBe('suspended');
    await page.evaluate(() => window.__tarpit!.resume());
    await page.waitForFunction(() => window.__tarpit!.audio().context === 'running');
    await page.waitForFunction(tick => (window.__tarpit!.game.scene.getScene('game') as GameScene).state.tick > tick, before.tick);
    expect((await snapshot()).recharge).toBeLessThan(before.recharge);
  });
}
