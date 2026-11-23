import type { Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

/** See src/sim/boss-frame.test.ts for the simulation frame receipt. */
export const GRUMBLEFOOT_STEPS = 5263;
/** The first lone, burning and slowed Grumblemaw with a Mortar hit two ticks
 * earlier and no hit on the frame, playing wave 20 without timed specials. */
const GRUMBLEMAW_STEPS = 4290;
export const FIRST_PACK_STEPS = 4546;
export const FIRST_PACK_FRAME = 4586;
export const FIRST_REWARD_STEPS = 5219;
export const ACT_TWO_STEPS = 6256;

/** Play the normal script up to this wave, then advance the requested ticks by hand. */
export async function beginVisualWave(page: Page, wave: number, steps: number) {
  return page.evaluate(async ({ wave, steps }) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    const phase = t.runScript('comboBuild', wave);
    t.startWave();
    t.step(steps);
    const state = t.state();
    return {
      phase,
      wave: state.wave,
      tick: state.waveTick,
      pending: state.pendingBoon,
      lives: state.lives,
      gold: state.gold,
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
