import { expect, test, type Page } from '@playwright/test';
import { api, press } from './campaign';
import { painted, waitForGame } from './painted';
import { waitForFirstScreen } from './title';

async function readRoad(page: Page, first: number) {
  await page.waitForFunction(id => !!window.__tarpit!.uiRects()[`title:stop:${id}`], first);
  const road = await api(page, t => ({ stops: t.levelStops(), labels: t.campaignLabels(), buttons: t.uiRects() }));
  expect(road.stops.map(s => s.id)).toEqual(Array.from({ length: 10 }, (_, i) => first + i));
  return road;
}

test('the Showpiece switch leaves both roads and the taxed Meadow phone game as Painted', async ({ page, context }) => {
  const requests: string[] = [];
  context.on('request', request => {
    if (new URL(request.url()).pathname.includes('/assets/showpiece/')) requests.push(request.url());
  });
  const play = async (look: string) => {
    await page.goto('/?test=1&look=' + look);
    await waitForFirstScreen(page);
    await page.evaluate(() => window.__tarpit!.setCampaignProgress!(
      Object.fromEntries(Array.from({ length: 17 }, (_, i) => [i + 1, 2]))));
    await press(page, 'title:campaign', true);
    const second = await readRoad(page, 11);
    await press(page, 'title:act', true);
    const first = await readRoad(page, 1);
    await press(page, 'title:act', true);
    await readRoad(page, 11);
    await press(page, 'title:stop:18', true);
    await page.waitForFunction(() => !!window.__tarpit!.uiRects()['title:play']);
    await press(page, 'title:play', true);
    await waitForGame(page);
    expect(await painted(page)).toMatchObject({ active: true });
    expect(await api(page, t => t.showpiece?.())).toBe(look === 'showpiece' ? null : undefined);
    const game = await api(page, t => {
      const label = t.campaignLabels().find(l => l.text === 'Forced March · Rationing');
      t.startWave();
      t.step(240);
      return { label, map: t.state().map.id, level: t.state().level!.id, state: t.state(), hud: t.uiRects() };
    });
    expect(game).toMatchObject({ map: 'meadow', level: 18, label: { text: 'Forced March · Rationing' } });
    return { first, second, game };
  };
  const reference = await play('painted');
  expect(await play('showpiece')).toEqual(reference);
  expect(requests).toEqual([]);
});
