import type { Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

/** See src/sim/boss-frame.test.ts for the simulation frame receipt. */
export const GRUMBLEFOOT_STEPS = 5316;
/** The first lone, burning and slowed Grumblemaw with a Mortar hit two ticks
 * earlier and no hit on the frame, playing wave 20 without timed specials. */
const GRUMBLEMAW_STEPS = 4245;
export const FIRST_PACK_STEPS = 4366;
export const FIRST_PACK_FRAME = 4406;

/** Play the normal script up to this wave, then step it by hand. Omit steps to reach its reward. */
export async function beginVisualWave(page: Page, wave: number, steps?: number) {
  return page.evaluate(async ({ wave, steps }) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.runScript('comboBuild', wave);
    t.startWave();
    if (steps === undefined) {
      for (let i = 0; i < 600 && t.state().phase === 'wave'; i++) t.step(60);
    } else {
      t.step(steps);
    }
    const state = t.state();
    return {
      wave: state.wave,
      pending: state.pendingBoon,
    };
  }, { wave, steps });
}

export async function finalBossFrame(page: Page) {
  await beginVisualWave(page, 20, GRUMBLEMAW_STEPS - 2);
  return page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const state = t.state();
    const id = state.enemies.find((e) => e.type === 'grumblemaw')?.id;
    const mortar = t.events().some((e) => e.kind === 'hit' && e.tower === 'mortar' && e.enemyId === id);
    t.step(2);
    const enemies = t.state().enemies;
    const boss = enemies.find((e) => e.type === 'grumblemaw');
    return {
      wave: t.state().wave,
      enemies: enemies.length,
      bar: t.hudText().boss,
      texture: boss ? t.animState(boss.id)?.texture : null,
      slowed: (boss?.slowTicksLeft ?? 0) > 0,
      burning: (boss?.burnTicksLeft ?? 0) > 0,
      mortar,
      hitNow: t.events().some((e) => e.kind === 'hit' && e.enemyId === id),
    };
  });
}
