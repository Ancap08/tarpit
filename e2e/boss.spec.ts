import { expect, test, type Page } from '@playwright/test';
import { BOSS_NAME, ENEMY_NAMES } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Milestone 23: Grumblefoot, the Troll King, at the end of wave 10, with the
// HUD boss bar. Test mode (?test=1): time only passes through step().
//
// He spawns on the tick with waveTick 1560 (26 s into wave 10), so after
// 1561 steps. The combo build's Longbows aim at the enemy furthest along
// the path, so he walks untouched behind the rest of the wave until about
// step 2538, when the Fire Pot at (10,4) first hits him on the top run;
// the test steps 300 at a time until the bar shows lost hp. The combo
// build kills him at waveTick 4639 (src/sim/balance.test.ts).

const BOSS_SPAWN_STEPS = 1561;

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

const hud = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).hudText());

test('the combo build meets Grumblefoot in wave 10: preview, bar, hp drop, kill, win', async ({ page }) => {
  await startGame(page);
  const before = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const phase = t.runScript('comboBuild', 10);
    return { phase, wave: t.state().wave };
  });
  expect(before).toEqual({ phase: 'setup', wave: 9 });
  const wave10 = `Next: 8 ${ENEMY_NAMES.wolf}, 12 ${ENEMY_NAMES.troll}, 5 ${ENEMY_NAMES.harpy}, 4 ${ENEMY_NAMES.shieldbearer} + ${BOSS_NAME}`;
  expect(await hud(page)).toMatchObject({ next: wave10, boss: null });

  const spawn = await page.evaluate((steps) => {
    const t = window.__tarpit as TarpitTestApi;
    t.startWave();
    t.step(steps - 1);
    const early = t.state().enemies.some((e) => e.type === 'boss');
    t.step(1);
    const ev = t.events().find((e) => e.kind === 'bossSpawn');
    return { early, waveTick: t.state().waveTick, bossId: ev && 'enemyId' in ev ? ev.enemyId : null };
  }, BOSS_SPAWN_STEPS);
  expect(spawn.early).toBe(false);
  expect(spawn.waveTick).toBe(BOSS_SPAWN_STEPS);
  expect(spawn.bossId).not.toBeNull();
  const label = (await hud(page)).boss;
  expect(label).toContain(BOSS_NAME);
  expect(label).toContain('4000 / 4000');

  const hurt = await page.evaluate((id) => {
    const t = window.__tarpit as TarpitTestApi;
    let chunks = 0;
    do {
      t.step(300);
      chunks += 1;
    } while (chunks < 10 && t.state().enemies.find((e) => e.id === id)?.hp === 4000);
    return { chunks, boss: t.hudText().boss, anim: t.animState(id) };
  }, spawn.bossId as number);
  expect(hurt.chunks).toBe(4); // untouched for 900 steps, hit by step 1200
  const hp = Number(/(\d+) \/ 4000/.exec(hurt.boss ?? '')?.[1]);
  expect(hp).toBeLessThan(4000);
  expect(hp).toBeGreaterThan(0);
  expect(hurt.boss).toContain(BOSS_NAME);
  expect(hurt.anim).toMatchObject({ texture: 'boss', scale: 2, frame: 0 });

  const end = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    let down: unknown = null;
    for (let i = 0; i < 60_000 && down === null; i++) {
      t.step(1);
      down = t.events().find((e) => e.kind === 'bossDown') ?? null;
    }
    return { down, phase: t.state().phase, lives: t.state().lives, screen: t.endScreen(), boss: t.hudText().boss };
  });
  expect(end).toEqual({
    down: { kind: 'bossDown', enemyId: spawn.bossId, cause: 'shot' },
    phase: 'won',
    lives: 12,
    screen: 'won',
    boss: null,
  });
});

test('Grumblefoot exits with 5 lives left: 0 lives, lost', async ({ page }) => {
  await startGame(page);
  // No towers. Wave 10's other 29 enemies cost 1 life each, so 34 lives
  // leave exactly 5 when he is the last one on the map.
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const s = t.state();
    s.wave = 9; // test setup: the next Start Wave plays wave 10
    s.lives = 34;
    t.startWave();
    let alone = -1;
    let livesAlone = -1;
    let down: unknown = null;
    for (let i = 0; i < 60_000 && down === null; i++) {
      t.step(1);
      const e = t.state().enemies;
      if (alone < 0 && e.length === 1 && e[0].type === 'boss' && t.state().waveTick > 1560) {
        alone = i;
        livesAlone = t.state().lives;
      }
      down = t.events().find((x) => x.kind === 'bossDown') ?? null;
    }
    return { livesAlone, down, phase: t.state().phase, lives: t.state().lives, screen: t.endScreen(), boss: t.hudText().boss };
  });
  expect(r).toEqual({
    livesAlone: 5,
    down: { kind: 'bossDown', enemyId: expect.any(Number), cause: 'exit' },
    phase: 'lost',
    lives: 0,
    screen: 'lost',
    boss: null,
  });
});
