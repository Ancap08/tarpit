import { expect, test } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { SPECIAL_TYPES, TOWER_DEFS } from '../src/sim';

test('each campaign level starts its own first wave and enforces its loadout', async ({ page }) => {
  await page.goto('/?renderer=canvas&test=1');
  await page.waitForFunction(() => window.__tarpit?.titleReady());
  const towers = Object.keys(TOWER_DEFS) as (keyof typeof TOWER_DEFS)[];
  for (let id = 1; id <= 10; id++) {
    const result = await page.evaluate(async ({ id, towers, specials }) => {
      const api = window.__tarpit as TarpitTestApi;
      await api.startLevel(id);
      const initial = api.state();
      const level = initial.level!;
      const startingLives = initial.lives;
      const deniedTowers = towers.filter(tower => !level.allowedTowers.includes(tower));
      const buildings = deniedTowers.map(tower => api.buildAt(0, 0, tower));
      const phase = api.runBot('botGood', 1);
      const wave = api.state().wave;
      // Enter wave two with a fresh charge so the level restriction is the only obstacle.
      const offer = api.pendingBoon();
      if (offer) api.pickBoon(offer.options[0]);
      const started = api.startWave();
      const deniedSpecials = specials.filter(special => !level.allowedSpecials.includes(special));
      const casts = deniedSpecials.map(special => api.useSpecialAt(special, 100, 240));
      return { id: level.id, startingLives, phase, wave, started, buildings, casts,
        towers: level.allowedTowers, specials: level.allowedSpecials };
    }, { id, towers, specials: [...SPECIAL_TYPES] });
    expect(result).toMatchObject({ id, startingLives: 20, phase: 'setup', wave: 1, started: { ok: true, wave: 2 } });
    if (id >= 6) expect([...result.towers].sort()).toEqual([...towers].sort());
    else expect(result.buildings.length).toBeGreaterThan(0);
    if (id >= 8) expect([...result.specials].sort()).toEqual([...SPECIAL_TYPES].sort());
    else expect(result.casts.length).toBeGreaterThan(0);
    for (const refusal of result.buildings) expect(refusal).toEqual({ ok: false, reason: 'tower-locked' });
    for (const refusal of result.casts) expect(refusal).toEqual({ ok: false, reason: 'locked' });
  }
  const completion = await page.evaluate(async () => {
    const api = window.__tarpit as TarpitTestApi;
    await api.startLevel(1);
    const before = api.levelOpen(2);
    const phase = api.runBot('botGood');
    return { before, phase, stars: api.levelStars(), saved: api.progress()[1],
      open: api.levelOpen(2), freeScore: api.bestScore('normal', 'meadow') };
  });
  expect(completion).toEqual({ before: false, phase: 'won', stars: 3, saved: 3, open: true, freeScore: null });
});
