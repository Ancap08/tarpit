// Pins the content of the e2e/visual.spec.ts `boss.png` frame (milestone 23)
// in the simulation, so a sim change that alters the frame fails here with
// numbers, not only as a pixel diff in the browser. Same setup as the browser
// test: the combo build's actions for waves 1 to 10 with waves 1 to 9 played
// out, then Start Wave and BOSS_STEPS ticks of wave 10. The step is the
// first of wave 10 at which he is alone, tarred, burning, between 30% and
// 90% of his hp, with a Mortar hit on him 2 ticks earlier and no hit on
// this tick (scripts: the frame scan in the milestone 28 DEVLOG).
// Milestone 25c: waves 1 to 9 fire the combo's cluster specials, as the
// browser's runScript does (milestone 28: the stored special list); wave
// 10 is stepped by hand, so it has none. The browser test reads the Mortar
// hit from the events of tick BOSS_STEPS - 2 (the splash is 2 ticks into
// its fade on the frame) and asserts no hit on him on tick BOSS_STEPS.
import { describe, expect, it } from 'vitest';
import { createGame, startWave, tick } from './game';
import { applyAction, applyScriptBoon, comboBuild } from './headless';
import { positionAlongPath, MAPS } from './map';

/** Simulation reference for the 36b browser frame. */
const BOSS_STEPS = 5215;

describe('boss.png frame content', () => {
  it(`at tick ${BOSS_STEPS} of wave 10 he is alone at (389,96), tarred, burning, 3599 hp on the bar, Mortar hit 2 ticks before, no hit now`, () => {
    const s = createGame();
    const script = comboBuild();
    for (let w = 0; w < 9; w++) {
      applyScriptBoon(s, script);
      for (const a of script[w] ?? []) expect(applyAction(s, a)).toMatchObject({ result: { ok: true } });
      expect(startWave(s).ok).toBe(true);
      for (let t = 0; s.phase === 'wave' && t < 60 * 600; t++) {
        for (const a of script.timed?.[w] ?? []) if (a.atWaveTick === s.waveTick) applyAction(s, a);
        tick(s);
      }
    }
    expect({ phase: s.phase, wave: s.wave }).toEqual({ phase: 'setup', wave: 9 });
    for (const a of script[9] ?? []) expect(applyAction(s, a)).toMatchObject({ result: { ok: true } });
    expect(startWave(s).ok).toBe(true);
    for (let t = 0; t < BOSS_STEPS - 2; t++) tick(s);
    const boss = s.enemies.find((e) => e.type === 'boss')!;
    const mortarHits2Before = s.events.filter((e) => e.kind === 'hit' && e.tower === 'mortar' && e.enemyId === boss.id).length;
    tick(s);
    tick(s);
    const pos = positionAlongPath(MAPS.meadow, boss.distance);
    expect({
      wave: s.wave,
      waveTick: s.waveTick,
      enemies: s.enemies.length,
      type: s.enemies[0].type,
      pos: { x: Math.round(pos.x), y: Math.round(pos.y) },
      burning: (boss.burnTicksLeft ?? 0) > 0,
      slowed: boss.slowTicksLeft > 0,
      slow: boss.slow,
      hpOnBar: Math.ceil(boss.hp),
      mortarHits2Before,
      hitNow: s.events.some((e) => e.kind === 'hit' && e.enemyId === boss.id),
      lives: s.lives,
    }).toEqual({
      wave: 10,
      waveTick: BOSS_STEPS,
      enemies: 1,
      type: 'boss',
      pos: { x: 389, y: 96 },
      burning: true,
      slowed: true,
      slow: 0.3,
      hpOnBar: 3599,
      mortarHits2Before: 1,
      hitNow: false,
      lives: 18,
    });
  });
});
