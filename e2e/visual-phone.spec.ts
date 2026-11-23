import { frame as guardFrame } from './guards';
import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { GRUMBLEMAW_NAME } from '../src/game/names';
import { MAP_IDS } from '../src/sim/map';
import { fingerFor, liftPage, rectPage, rectPageSize, tap, tapCell, ui, worldPage } from './phone';
import { GRUMBLEFOOT_STEPS, beginVisualWave, finalBossFrame } from './visualCampaign';
import { expectOffer, visibleTexts } from './campaign';
import { midwave as paintedMidwave, openPainted } from './painted';
import { holdingFrame } from './barricade-crowd';
import { waitForTitle } from './title';
import { choiceVisual } from './upgradeChoice';

// Milestone 32b: portrait screenshot baselines for the phone project
// (390 x 844, touch), frozen in test mode as visual.spec.ts does. Baselines
// are generated on CI (update-snapshots.yml); local runs ignore them. The
// setups mirror visual.spec.ts where a landscape frame exists.

async function open(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await waitForTitle(page);
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => r(null)))));
}

const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
const shot = (page: Page, name: string) => expect(page.locator('canvas')).toHaveScreenshot(name);

/** The mid-wave frame's three towers (visual.spec.ts), on the wave after `wave`. */
async function threeTowers(page: Page, wave: number): Promise<void> {
  await page.evaluate(async (w) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.state().gold = 1000;
    t.state().wave = w;
    t.buildAt(7, 5, 'musketeer');
    t.buildAt(15, 9, 'cannon');
    t.buildAt(18, 9, 'tarpit');
  }, wave);
}

test('portrait title', async ({ page }) => {
  await open(page);
  await settle(page);
  await shot(page, 'phone-title.png');
});

for (const map of MAP_IDS) {
  test(`portrait ${map} before wave 1`, async ({ page }) => {
    await open(page);
    await page.evaluate((m) => (window.__tarpit as TarpitTestApi).startGame('normal', m), map);
    expect(await ui(page)).toMatchObject({ layout: 'portrait', map });
    await settle(page);
    await shot(page, `phone-${map}-wave0.png`);
  });
}

test('portrait mid wave 2 on Meadow with three towers', async ({ page }) => {
  await open(page);
  await threeTowers(page, 1);
  const n = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.startWave();
    t.step(600);
    return t.state().enemies.length;
  });
  expect(n).toBeGreaterThan(5);
  await settle(page);
  await shot(page, 'phone-midwave.png');
});

test('portrait placing: a Cannon dragged from the bar, the ghost lifted over cell (14,8)', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  const client = await page.context().newCDPSession(page);
  const from = await rectPage(page, 'bar:cannon');
  const finger = await fingerFor(page, { col: 14, row: 8 });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 10; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + ((finger.x - from.x) * i) / 10, y: from.y + ((finger.y - from.y) * i) / 10 }],
    });
  }
  expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'cannon', cell: { col: 14, row: 8 } });
  await settle(page);
  await shot(page, 'phone-placing.png');
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
});

test('portrait tower panel: an upgraded Musketeer selected', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.buildAt(7, 5, 'musketeer');
    t.upgradeAt(7, 5);
  });
  await tapCell(page, { col: 7, row: 5 });
  expect(await ui(page)).toMatchObject({ panelOpen: true, selectedCell: { col: 7, row: 5 } });
  await settle(page);
  await shot(page, 'phone-panel.png');
});

test('portrait special aim: a Tar Barrel held over the first climb on wave 4', async ({ page }) => {
  await open(page);
  await threeTowers(page, 3);
  await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.startWave();
    t.step(450);
  });
  await tap(page, 'special');
  await tap(page, 'special:tarBarrel');
  const client = await page.context().newCDPSession(page);
  const target = await worldPage(page, { x: 160, y: 131 });
  const finger = { x: target.x, y: target.y + (await liftPage(page)) };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [target] });
  for (let i = 1; i <= 6; i++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: target.x, y: target.y + ((finger.y - target.y) * i) / 6 }] });
  }
  const u = await ui(page);
  expect(u.special).toMatchObject({ aiming: 'tarBarrel', holding: true });
  await settle(page);
  await shot(page, 'phone-aim.png');
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
});

test('portrait tar zone: a Tar Barrel puddle one second after it lands on wave 7', async ({ page }) => {
  await open(page);
  await threeTowers(page, 6);
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.startWave();
    t.step(900);
    const res = t.useSpecialAt('tarBarrel', 160, 132);
    t.step(60);
    return { ok: res.ok, zones: t.ui().special.zones.length };
  });
  expect(r).toEqual({ ok: true, zones: 1 });
  await settle(page);
  await shot(page, 'phone-tar-zone.png');
});

test('portrait boss: Grumblefoot with his bar on wave 10', async ({ page }) => {
  await open(page);
  const bar = await page.evaluate((steps) => {
    const t = window.__tarpit as TarpitTestApi;
    return t.startGame().then(() => {
      t.runScript('comboBuild', 10);
      t.startWave();
      t.step(steps);
      return t.hudText().boss;
    });
  }, GRUMBLEFOOT_STEPS);
  expect(bar).toMatch(/^Grumblefoot 3400 \/ 4000$/);
  await settle(page);
  await shot(page, 'phone-boss.png');
});

test('portrait win screen after the combo build', async ({ page }) => {
  await open(page);
  const end = await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.runScript('comboBuild');
    return t.endScreen();
  });
  expect(end).toBe('won');
  await settle(page);
  await shot(page, 'phone-won.png');
});

test('portrait lose screen with no towers', async ({ page }) => {
  await open(page);
  const end = await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    for (let i = 0; i < 120 && t.state().phase !== 'lost'; i++) {
      if (t.state().phase === 'setup') t.startWave();
      t.step(500);
    }
    return t.endScreen();
  });
  expect(end).toBe('lost');
  await settle(page);
  await shot(page, 'phone-lost.png');
});

// Milestone 35: the drag magnifier and a snapped ghost (phone only).
test('portrait magnifier: a Cannon dragged beside the trail mid wave 2, the magnifier at the top away from the finger', async ({ page }) => {
  await open(page);
  await threeTowers(page, 1);
  await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.startWave();
    t.step(600);
  });
  const client = await page.context().newCDPSession(page);
  const from = await rectPage(page, 'bar:cannon');
  const finger = await fingerFor(page, { col: 10, row: 5 });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 10; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + ((finger.x - from.x) * i) / 10, y: from.y + ((finger.y - from.y) * i) / 10 }],
    });
  }
  const u = await ui(page);
  expect(u.dragging?.cell).toEqual({ col: 10, row: 5 });
  expect(u.magnifier).not.toBeNull();
  await settle(page);
  await shot(page, 'phone-magnifier.png');
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
});

test('portrait snap: a Musketeer dragged over the trail margin snaps to the cell beside it', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  const client = await page.context().newCDPSession(page);
  const from = await rectPage(page, 'bar:musketeer');
  // (4,2) is on Meadow's trail margin; the lifted point a little above its centre snaps to (4,1) (not toward the finger).
  const at = await worldPage(page, { x: 4 * 32 + 18, y: 2 * 32 + 7 });
  const finger = { x: at.x, y: at.y + (await liftPage(page)) };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 10; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + ((finger.x - from.x) * i) / 10, y: from.y + ((finger.y - from.y) * i) / 10 }],
    });
  }
  expect((await ui(page)).snap).toMatchObject({ cell: { col: 4, row: 1 } });
  await settle(page);
  await shot(page, 'phone-snap.png');
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
});

test('portrait reward cards are touch-sized and tapping chooses a reward', async ({ page }) => {
  await open(page);
  const reward = await beginVisualWave(page, 5);
  expect(reward.pending).toEqual({ wave: 5, options: ['longBarrels', 'keenArrows', 'warChest'] });
  await expectOffer(page, 5);
  await settle(page);
  await shot(page, 'phone-boon-pick.png');
  await tap(page, 'reward:longBarrels');
  const size = await rectPageSize(page, 'boon:longBarrels');
  expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(44);
  await tap(page, 'boon:longBarrels');
  expect((await ui(page)).boonTooltip).toBe('longBarrels');
  expect(await visibleTexts(page)).toContain('Cannons and Mortars reach 30% farther');
  await settle(page);
  await shot(page, 'phone-boon-icons.png');
});

test('portrait Grumblemaw keeps his bar and effects on wave 20', async ({ page }) => {
  await open(page);
  expect(await finalBossFrame(page)).toMatchObject({
    wave: 20,
    bar: `${GRUMBLEMAW_NAME} 16810 / 21280`,
    texture: 'boss',
    slowed: true,
    burning: true,
  });
  await settle(page);
  await shot(page, 'phone-grumblemaw.png');
});

choiceVisual(true, 'phone-upgrade-choice');

test('painted Meadow midwave in portrait', async ({ page }) => {
  await openPainted(page);
  await paintedMidwave(page);
  await expect(page.locator('canvas')).toHaveScreenshot('phone-painted-midwave.png');
});
test('phone-barricade-holding with fifteen walkers and the count beside the hp bar', async ({ page }) => holdingFrame(page, true));

test('phone-guards-holding', async ({ page }) => guardFrame(page, 'phone'));
