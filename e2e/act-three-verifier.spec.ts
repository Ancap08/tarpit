import { expect, test, type Page } from '@playwright/test';
import { api, press } from './campaign';
import { onScreen } from './campaignScreens';
import { waitForFirstScreen } from './title';

// Verifier (Claude Sonnet), milestone 52c: saved progress and story across the
// Act Three switch. Desktop project, mouse. Each test sets a limit for a CI
// machine about four times slower than this one.

const wins = (n: number, extra: Record<number, number> = {}) => JSON.stringify({
  v: 2, stars: { ...Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, (i + 1) % 4])), ...extra },
});
const OLD_SEEN = '["opening","secondAct","ending"]';

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}
const storage = (page: Page) => page.evaluate(() =>
  Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
const seed = (page: Page, data: Record<string, string>) => page.addInitScript(d => {
  // Only the first document of the test; a reload keeps whatever the game wrote.
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v);
}, data);
async function win(page: Page) {
  await page.evaluate(() => {
    const t = window.__tarpit!; const s = t.state!();
    s.wave = s.level!.waves.length; s.lives = 15; s.phase = 'won'; t.step!(0);
  });
  await onScreen(page, 'result');
}

test('a save written with Act Three on loads and keeps everything with the switch off', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watch(page);
  const written = {
    'tarpit.campaign': wins(20, { 21: 3, 22: 2, 23: 1, 24: 3, 25: 3 }),
    'tarpit.seenBroadsides': OLD_SEEN,
  };
  await seed(page, written);
  await page.goto('/?test=1&act3=1');
  await waitForFirstScreen(page, { showStory: true });
  await press(page, 'title:campaign');
  await onScreen(page, 'thirdAct'); // marks the Act Three broadside as seen
  await press(page, 'title:continue');
  await onScreen(page, 'levelMap');
  const withSwitchOn = await storage(page);
  expect(withSwitchOn['tarpit.campaign']).toBe(written['tarpit.campaign']);
  expect(withSwitchOn['tarpit.seenSiegeBroadsides']).toContain('thirdAct');

  // The state every real player is in: switch off, save from a switch-on visit.
  await page.goto('/?test=1');
  await waitForFirstScreen(page, { showStory: true });
  await press(page, 'title:campaign');
  await onScreen(page, 'levelMap');
  const stops = await api(page, t => t.levelStops().map(s => [s.id, s.open, s.stars]));
  expect(stops.map(s => s[0])).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  expect(stops.every(s => s[1])).toBe(true);
  expect(await api(page, t => !!t.uiRects()['title:act:3'])).toBe(false);
  expect(stops.map(s => s[2])).toEqual([3, 0, 1, 2, 3, 0, 1, 2, 3, 0]);
  // Replay level 20 through the real route: the old ending is the close.
  await press(page, 'title:stop:20');
  await onScreen(page, 'levelCard');
  await press(page, 'title:play');
  await onScreen(page, 'game');
  await win(page);
  const result = await api(page, t => t.campaignResult());
  expect(result?.actClose).toBe('');
  expect(result?.nextId).toBeNull();
  expect(result?.complete).not.toBe('');
  const after = await storage(page);
  for (const key of Object.keys(withSwitchOn).filter(key => key !== 'tarpit.campaign')) expect(after[key], key).toBe(withSwitchOn[key]);
  // Level 20 was replayed for a better result (0 to 3 stars); levels 21 to 25 are untouched.
  const stars = JSON.parse(after['tarpit.campaign']!).stars;
  expect(Object.keys(stars)).toHaveLength(25);
  expect([21, 22, 23, 24, 25].map(id => stars[id])).toEqual([3, 2, 1, 3, 3]);
  expect(stars[20]).toBe(3);
  expect(errors).toEqual([]);
});

test('an old finished save meets the Act Three broadside once and stars for 21 persist', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watch(page);
  await seed(page, { 'tarpit.campaign': wins(20), 'tarpit.seenBroadsides': OLD_SEEN });
  await page.goto('/?test=1&act3=1');
  await waitForFirstScreen(page, { showStory: true });
  await press(page, 'title:campaign');
  await onScreen(page, 'thirdAct');
  await press(page, 'title:continue');
  await onScreen(page, 'levelMap');
  expect(await api(page, t => t.levelStops().map(s => s.id))).toEqual([21, 22, 23, 24, 25]);
  await press(page, 'title:stop:21');
  await onScreen(page, 'levelCard');
  await press(page, 'title:play');
  await onScreen(page, 'game');
  await win(page);
  expect((await storage(page))['tarpit.seenBroadsides']).toBe(OLD_SEEN);
  await page.reload();
  await waitForFirstScreen(page, { showStory: true });
  await press(page, 'title:campaign');
  await onScreen(page, 'levelMap'); // no broadside the second time
  expect(await api(page, t => t.levelStops().find(s => s.next)?.id)).toBe(22);
  expect(await api(page, t => t.progress()[21])).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a player in Act Two reaches Act Three through level 20 with the new close and no old ending', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watch(page);
  await seed(page, { 'tarpit.campaign': wins(14), 'tarpit.seenBroadsides': '["opening","secondAct"]' });
  await page.goto('/?test=1&act3=1');
  await waitForFirstScreen(page, { showStory: true });
  await press(page, 'title:campaign');
  await onScreen(page, 'levelMap');
  await press(page, 'title:act:3');
  expect(await api(page, t => t.levelStops()[0].id)).toBeLessThan(21);
  // Jump the saved progress to level 19 done and play level 20 for real.
  await page.evaluate(w => window.__tarpit!.setCampaignProgress!(JSON.parse(w).stars), wins(19));
  await onScreen(page, 'levelMap');
  await press(page, 'title:stop:20');
  await onScreen(page, 'levelCard');
  await press(page, 'title:play');
  await onScreen(page, 'game');
  await win(page);
  const result = await api(page, t => t.campaignResult());
  expect(result?.actClose).toBe('He will be back, and he is bringing the army.');
  expect(result?.complete).toBe('');
  expect(result?.nextId).toBe(21);
  await press(page, 'nextLevel');
  await onScreen(page, 'thirdAct');
  const data = await storage(page);
  expect(data['tarpit.seenSiegeBroadsides']).toBe('["thirdAct"]');
  expect(data['tarpit.seenBroadsides']).toBe('["opening","secondAct"]'); // 'ending' is still unseen for a switch-off visit
  expect(errors).toEqual([]);
});
