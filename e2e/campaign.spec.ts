import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { ACT_TWO_TEXT, blockedWaveLabel, boonDescription, BOON_PENDING_TEXT, BOON_WAVE_TEXT, BOSS_WAVE_NEXT_TEXT, heldBoonsText, LAST_WAVE_TEXT } from '../src/game/names';
import { api, buttonCentre, clearToOffer, expectActTwoPreviewsFit, expectOffer, expectStartLabelFits, mapPress, OFFERS, openCampaign, pickEachPosition, postSpawn, press, visibleTexts } from './campaign';
import { waitForTitle } from './title';

test('only three cards per offer, modal inputs, held tooltip and Long Barrels range', async ({ page }) => {
  await openCampaign(page);
  expect(await api(page, (t) => t.buildAt(7, 1, 'cannon'))).toMatchObject({ ok: true });
  await mapPress(page, 7, 1);
  expect(await api(page, (t) => t.ui().rangeRadius)).toBe(105);
  await clearToOffer(page, 5);
  await expectOffer(page, 5);
  const { gold, towers } = await api(page, (t) => t.state());
  await press(page, 'startWave');
  await press(page, 'bar:musketeer');
  await mapPress(page, 7, 1);
  await mapPress(page, 8, 1);
  await page.keyboard.press('Escape');
  await expectOffer(page, 5);
  expect(await api(page, (t) => t.state())).toMatchObject({ phase: 'setup', wave: 5, gold, towers });
  await expectStartLabelFits(page, blockedWaveLabel(true, BOON_PENDING_TEXT));
  expect(await api(page, (t) => t.startWave())).toEqual({ ok: false, reason: 'boon-pending' });
  expect(await api(page, (t) => t.pickBoon('stickyTar'))).toEqual({ ok: false, reason: 'boon-not-offered' });

  await press(page, 'reward:longBarrels');
  expect(await api(page, (t) => t.pendingBoon())).toBeNull();
  expect(await api(page, (t) => t.heldBoons())).toEqual(['longBarrels']);
  expect(await api(page, (t) => t.pickBoon('keenArrows'))).toEqual({ ok: false, reason: 'no-boon-pending' });
  expect(await api(page, (t) => Object.keys(t.uiRects()).filter((key) => key.startsWith('reward:')))).toEqual([]);
  const icon = await buttonCentre(page, 'boon:longBarrels');
  await page.mouse.move(icon.x, icon.y);
  await expect.poll(() => api(page, (t) => t.ui().boonTooltip)).toBe('longBarrels');
  expect((await visibleTexts(page)).join(' ')).toContain(boonDescription('longBarrels'));
  await mapPress(page, 7, 1);
  expect(await api(page, (t) => t.ui().rangeRadius)).toBe(136.5);
  expect(await api(page, (t) => t.buildAt(8, 1, 'cannon'))).toMatchObject({ ok: true });
  await mapPress(page, 8, 1);
  expect(await api(page, (t) => t.ui().rangeRadius)).toBe(136.5);

  await clearToOffer(page, 10);
  await expectOffer(page, 10);
  expect(await api(page, (t) => t.endScreen())).toBeNull();
  await page.keyboard.press('2');
  expect(await api(page, (t) => t.heldBoons())).toEqual(['longBarrels', 'hotCoals']);
  await press(page, 'startWave');
  expect(await api(page, (t) => t.hudText().wave)).toBe('Wave 11/20');
  // Allow the pick's short banner to yield and the act banner to fade in.
  await api(page, (t) => t.step(16));
  await api(page, (t) => t.step(10));
  expect(await api(page, (t) => t.ui().momentBanner)).toContain(ACT_TWO_TEXT);
  expect((await visibleTexts(page)).join(' ')).toContain(ACT_TWO_TEXT);
  await api(page, (t) => {
    for (let chunk = 0; chunk < 120 && t.state().phase === 'wave'; chunk++) t.step(120);
  });

  await clearToOffer(page, 15);
  await expectOffer(page, 15);
  const lives = await api(page, (t) => t.state().lives);
  await press(page, 'reward:stoneWalls');
  expect(await api(page, (t) => t.state())).toMatchObject({ lives: lives + 3, boons: ['longBarrels', 'hotCoals', 'stoneWalls'] });
});

test('an act-two loss shows the campaign total and Menu clears the run', async ({ page }) => {
  await openCampaign(page);
  await clearToOffer(page, 10);
  await press(page, 'reward:quickHands');
  await api(page, (t) => { t.state().lives = 1; });
  await press(page, 'startWave');
  await api(page, (t) => t.step(6000));
  expect(await api(page, (t) => t.endScreen())).toBe('lost');
  expect(await visibleTexts(page)).toContain('Reached wave 11 of 20');
  expect(await visibleTexts(page)).toContain(heldBoonsText(['quickHands']));
  await press(page, 'menu');
  await waitForTitle(page);
  await press(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
  expect(await api(page, (t) => t.state())).toMatchObject({ wave: 0, tick: 0, boons: [], pendingBoon: null, packs: [] });
  expect(await api(page, (t) => t.ui().momentBanner)).toBeNull();
});

test('a true wave-20 victory carries its boons into wave 21 and Play again clears them', async ({ page }) => {
  test.setTimeout(90_000);
  await openCampaign(page);
  expect(await api(page, (t) => t.runScript('comboBuild'))).toBe('won');
  const held = ['longBarrels', 'stickyTar', 'stoneWalls'] as const;
  expect(await api(page, (t) => t.state())).toMatchObject({ wave: 20, phase: 'won', boons: held, lives: 19, gold: 2847 });
  expect(await visibleTexts(page)).toContain(heldBoonsText(held));
  await press(page, 'keepGoing');
  expect(await api(page, (t) => t.state())).toMatchObject({ wave: 20, phase: 'setup', endless: true, boons: held });
  await press(page, 'startWave');
  expect(await api(page, (t) => t.hudText().wave)).toBe('Wave 21');
  expect(await api(page, (t) => t.bossOnField())).toBeNull();
  await api(page, (t) => {
    t.state().lives = 0;
    t.step(1);
  });
  expect(await api(page, (t) => t.endScreen())).toBe('lost');
  await press(page, 'playAgain');
  await page.waitForFunction(() => window.__tarpit?.state?.().wave === 0);
  expect(await api(page, (t) => t.state())).toMatchObject({ wave: 0, endless: false, boons: [], pendingBoon: null, packs: [] });
  expect(await api(page, (t) => Object.keys(t.uiRects()).filter((key) => /^(boon|reward):/.test(key)))).toEqual([]);
});

test('Call next refuses reward boundaries and the last boss wave, with the reason on the HUD', async ({ page }) => {
  await openCampaign(page);
  expect(await api(page, (t) => t.callNextWave())).toEqual({ ok: false, reason: 'not-in-wave' });
  for (const wave of [4, 5, 9, 10, 14, 15, 19, 20]) {
    await postSpawn(page, wave);
    expect(await api(page, (t) => t.callNextWave()), `wave ${wave}`).toEqual({ ok: false, reason: wave >= 19 ? 'last-wave' : 'boon-wave' });
    const reason = wave === 20 ? LAST_WAVE_TEXT : wave === 19 ? BOSS_WAVE_NEXT_TEXT : BOON_WAVE_TEXT;
    await expectStartLabelFits(page, blockedWaveLabel(false, reason));
    await press(page, 'startWave');
    expect(await api(page, (t) => t.state().wave)).toBe(wave);
  }
  await api(page, (t) => {
    t.state().lives = 0;
    t.step(1);
  });
  expect(await api(page, (t) => t.callNextWave())).toEqual({ ok: false, reason: 'game-over' });
});

for (const input of ['mouse', 'key'] as const) {
  test(`all three card positions accept ${input} input`, ({ page }) => pickEachPosition(page, input));
}

test('offers appear only after waves 5, 10 and 15', async ({ page }) => {
  await openCampaign(page);
  for (let wave = 1; wave <= 20; wave++) {
    await page.evaluate((wave) => {
      const t = window.__tarpit!;
      const s = t.state!();
      s.wave = wave - 1;
      t.startWave!();
      // Fixture: clear the last tick with no surviving enemies.
      s.spawnedPerGroup.fill(9999);
      t.step!(1);
    }, wave);
    if (wave === 5 || wave === 10 || wave === 15) {
      await expectOffer(page, wave);
      await press(page, `reward:${OFFERS[wave][0]}`);
    } else {
      expect(await api(page, (t) => t.pendingBoon()), `after wave ${wave}`).toBeNull();
      expect(await api(page, (t) => Object.keys(t.uiRects()).filter((key) => key.startsWith('reward:')))).toEqual([]);
    }
  }
});

test('pending modal input cannot leak across scene restart or Menu', async ({ page }) => {
  await openCampaign(page);
  await clearToOffer(page, 5);
  await press(page, 'reward:warChest');
  await clearToOffer(page, 10);
  const oldCard = await buttonCentre(page, 'reward:quickHands');
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    scene.playAgain();
  });
  await page.waitForFunction(() => window.__tarpit?.state?.().wave === 0);
  await page.keyboard.press('3');
  await page.mouse.click(oldCard.x, oldCard.y);
  expect(await api(page, (t) => t.state())).toMatchObject({ wave: 0, boons: [], pendingBoon: null });
  await clearToOffer(page, 5);
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    scene.toMenu();
  });
  await waitForTitle(page);
  await press(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
  await page.keyboard.press('1');
  expect(await api(page, (t) => t.state())).toMatchObject({ wave: 0, boons: [], pendingBoon: null });
});

test('all act-two previews fit in landscape', async ({ page }) => {
  await openCampaign(page);
  await expectActTwoPreviewsFit(page);
});

test('scripted campaign replay honors requested picks across all three offers', async ({ page }) => {
  await openCampaign(page);
  const phase = await api(page, (t) => t.runScript('comboBuild', 16, {
    5: 'warChest', 10: 'quickHands', 15: 'biggerBlasts',
  }));
  expect(phase).toBe('setup');
  expect(await api(page, (t) => t.state())).toMatchObject({
    wave: 15, phase: 'setup', boons: ['warChest', 'quickHands', 'biggerBlasts'], pendingBoon: null,
  });
  expect(await api(page, (t) => t.heldBoons())).toEqual(['warChest', 'quickHands', 'biggerBlasts']);
});
