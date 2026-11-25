import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { audio, count, countContexts, contexts, press } from './sound';
import { waitForFirstScreen } from './title';

test.describe.configure({ timeout: 60_000 });

async function waitForKeep(page: Page) {
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game')
    && !!window.__tarpit.uiRects()['startWave']
    && document.querySelector<HTMLElement>('#keep-status')?.hidden,
  undefined, { timeout: 40_000 });
}

async function openKeep(page: Page, options: string) {
  await page.goto(`/?keep=22&renderer=canvas${options}`);
  await waitForKeep(page);
  await page.mouse.click(1, 1);
}

function siegeCues(counts: Record<string, number>) {
  return Object.keys(counts).filter(name => name.startsWith('siege.'));
}

test('the HUD mute button silences the active siege drum and restores it', async ({ page }) => {
  await openKeep(page, '&act3=1');
  await page.waitForFunction(() => window.__tarpit!.audio().context === 'running');
  await press(page, 'startWave', false);
  await page.waitForFunction(() => !!window.__tarpit!.audio().played['siege.drum']);
  await press(page, 'mute', false);
  const muted = await audio(page);
  expect(muted.muted).toBe(true);
  await page.waitForFunction(before => window.__tarpit!.audio().requested['siege.drum'] > before,
    muted.requested['siege.drum']);
  expect(await count(page, 'played', 'siege.drum')).toBe(muted.played['siege.drum']);
  await press(page, 'mute', false);
  await page.waitForFunction(before => window.__tarpit!.audio().played['siege.drum'] > before,
    muted.played['siege.drum']);
});

test('with Act Three off, the hidden siege continues to use the old sound set', async ({ page }) => {
  await openKeep(page, '&act3=0');
  await page.waitForFunction(() => window.__tarpit!.audio().context === 'running');
  await press(page, 'startWave', false);
  expect(await count(page, 'played', 'waveStart')).toBe(1);
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    scene.state.gate!.hp = scene.state.gate!.maxHp / 10;
  });
  await page.waitForFunction(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    return scene.state.waveTick > 75;
  });
  const heard = await audio(page);
  expect(siegeCues(heard.requested)).toEqual([]);
  expect(siegeCues(heard.played)).toEqual([]);
});

test('test mode plays no siege cues and creates no audio context', async ({ page }) => {
  await countContexts(page);
  await openKeep(page, '&act3=1&test=1');
  await page.evaluate(() => {
    const api = window.__tarpit!;
    api.startWave!();
    api.state!().gate!.hp = 0;
    api.step!(180);
  });
  expect(await audio(page)).toMatchObject({ enabled: false, context: 'none', requested: {}, played: {} });
  expect(await contexts(page)).toBe(0);
});

test('the first ending honours the mute choice in the siege HUD', async ({ page }) => {
  await page.addInitScript(() => {
    const stars = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [index + 1, 3]));
    localStorage.setItem('tarpit.campaign', JSON.stringify({ v: 2, stars }));
    localStorage.setItem('tarpit.seenBroadsides', '["opening","secondAct","ending"]');
    localStorage.setItem('tarpit.seenSiegeBroadsides', '["thirdAct"]');
    localStorage.setItem('tarpit.seenSiegeTips', '[25]');
  });
  await page.goto('/?act3=1&renderer=canvas');
  await waitForFirstScreen(page, { showStory: true, showTips: true });
  await press(page, 'title:campaign', false);
  await page.waitForFunction(() => window.__tarpit?.titleReady() && !!window.__tarpit.uiRects()['title:stop:25']);
  await press(page, 'title:stop:25', false);
  await page.waitForFunction(() => window.__tarpit?.titleReady() && !!window.__tarpit.uiRects()['title:play']);
  await press(page, 'title:play', false);
  await waitForKeep(page);
  await page.waitForFunction(() => window.__tarpit!.audio().context === 'running');
  await press(page, 'mute', false);
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const state = scene.state;
    state.phase = 'won';
    state.wave = state.level!.waves.length;
    scene.advance(0);
  });
  await press(page, 'menu', false);
  await page.waitForFunction(() => window.__tarpit?.titleReady() && !!window.__tarpit.uiRects()['title:continue']);
  const ending = await audio(page);
  expect(ending.muted).toBe(true);
  expect(ending.requested['siege.ending']).toBe(1);
  expect(ending.played['siege.ending']).toBeUndefined();
  await press(page, 'title:continue', false);
  await page.waitForFunction(() => window.__tarpit?.titleReady() && !!window.__tarpit.uiRects()['title:stop:25']);
  expect((await audio(page)).muted).toBe(false);
});
