import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/sim/game';
import { ENEMY_STATS } from '../src/sim/enemies';
import { KEEP_LEVELS } from '../src/sim/keepLevels';
import { distanceOnRoad } from '../src/sim/roads';
import { LEVEL_STORY } from '../src/game/names';
import { waitForGame } from './painted';
import { rectPage } from './phone';
import { waitForTitle } from './title';

const review = process.env.PW_KEEP_LEVEL_REVIEW;
async function capture(page: Page, name: string) {
  if (review) await page.screenshot({ path: `${review}/390x844-${name}.png`, scale: 'css' });
}

for (const level of KEEP_LEVELS) {
  test(`private Keep level ${level.id} loads and plays its own waves`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?test=1&keep=${level.id}`);
    await waitForGame(page);
    const initial = await page.evaluate(() => {
      const state = window.__tarpit!.state!();
      return { level: state.level, gold: state.gold, lives: state.lives, map: state.map.id, roads: state.map.otherRoads?.length ?? 0,
        mainRoad: state.map.mainRoad, gateHp: state.gate?.hp, windows: state.windows?.length ?? 0, tax: state.wallSiteTax };
    });
    expect(initial).toMatchObject({
      level, gold: level.startGold, lives: 20, map: 'keep', roads: Number(level.keepRoads === 'both'),
      mainRoad: level.keepRoads === 'west' ? 'west' : 'east',
      gateHp: level.gate.maxHp, windows: level.windows?.length ?? 0,
    });
    expect(initial.tax).toEqual(level.wallSiteTax);
    await page.evaluate(() => {
      const api = window.__tarpit!;
      api.runBot!('botGood', 1);
      api.startWave!();
      api.step!(16 * 60);
    });
    expect(await page.evaluate(() => {
      const state = window.__tarpit!.state!();
      return [state.wave, state.phase, state.nextEnemyId > state.level!.waves[0].groups.reduce((n, group) => n + group.count, 0)];
    })).toEqual([2, 'wave', true]);
    await capture(page, `level-${level.id}-wave-2`);
  });
}

test('the actual finale groups put the Ram at the gate and the King in the yard', async ({ page }) => {
  test.setTimeout(120_000);
  const level = KEEP_LEVELS[4];
  const { map, gate } = createGame({ level });
  const finale = level.waves.at(-1)!;
  const ram = finale.groups.find(group => group.type === 'ram')!;
  const king = finale.groups.find(group => group.type === 'grumblemaw')!;
  const contactTick = (type: typeof ram | typeof king) =>
    Math.ceil(60 * (type.delay + distanceOnRoad(map, type.road, gate!)! / ENEMY_STATS[type.type].speed)) + 2;
  await page.goto('/?test=1&keep=25');
  await waitForGame(page);
  await page.evaluate(({ advance, groups }) => {
    const api = window.__tarpit!;
    const state = api.state!();
    state.wave = state.level!.waves.length - 1;
    api.startWave!();
    // Stage the two named groups from the finale without the escort.
    state.spawnedPerGroup = groups.map(group => ['ram', 'grumblemaw'].includes(group.type) ? 0 : group.count);
    api.step!(advance);
  }, { advance: contactTick(ram), groups: finale.groups });
  const atGate = await page.evaluate(() => {
    const state = window.__tarpit!.state!();
    return { ram: state.enemies.some(enemy => enemy.type === 'ram'), damaged: state.gate!.hp < state.gate!.maxHp, fallen: state.gate!.fallen };
  });
  expect(atGate).toEqual({ ram: true, damaged: true, fallen: false });
  await capture(page, 'level-25-ram-at-gate');
  await page.evaluate((advance) => {
    const api = window.__tarpit!;
    api.state!().gate!.hp = 1;
    api.step!(advance);
  }, contactTick(king) - contactTick(ram) + 45);
  const kingsDistance = await page.evaluate(() => window.__tarpit!.state!().enemies.find(enemy => enemy.type === 'grumblemaw')?.distance);
  expect(kingsDistance).toBeGreaterThan(distanceOnRoad(map, king.road, gate!)!);
  expect(await page.evaluate(() => window.__tarpit!.state!().gate!.fallen)).toBe(true);
  await capture(page, 'level-25-king-in-yard');
});

test('a private win shows the reply, saves nothing and offers another play of the same level', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem('tarpit.campaign', '{"v":2,"stars":{"1":3}}');
    localStorage.setItem('tarpit.seenTips', '["1"]');
  });
  await page.goto('/?test=1&keep=22');
  await waitForGame(page);
  const storage = () => page.evaluate(() => JSON.stringify(Object.entries({ ...localStorage }).sort()));
  const before = await storage();
  const won = await page.evaluate(() => window.__tarpit!.runBot!('botGood'));
  expect(won).toBe('won');
  expect(await page.evaluate(() => window.__tarpit!.campaignResult!())).toMatchObject({
    levelId: 22, nextId: null, complete: '', story: LEVEL_STORY[22].reply,
  });
  expect(await storage()).toEqual(before);
  const replay = await rectPage(page, 'playAgain');
  await page.touchscreen.tap(replay.x, replay.y);
  await page.waitForFunction(() => {
    const api = window.__tarpit;
    return api?.game.scene.isActive('game') && api.state!().phase === 'setup';
  });
  expect(await page.evaluate(() => window.__tarpit!.state!().level!.id)).toBe(22);
  expect(await storage()).toEqual(before);

  await page.goto('/?test=1&keep=26');
  await waitForTitle(page);
  expect(await page.evaluate(() => window.__tarpit!.keep?.())).toBeUndefined();
});
