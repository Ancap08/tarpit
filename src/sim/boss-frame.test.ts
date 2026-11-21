// Pins the content of the e2e/visual.spec.ts `boss.png` frame (milestone 23)
// in the simulation, so a sim change that alters the frame fails here with
// numbers, not only as a pixel diff in the browser. Same setup as the browser
// test: the combo build's actions for waves 1 to 10 with waves 1 to 9 played
// out, then Start Wave and 3562 ticks of wave 10. The browser test reads the
// Mortar hit from the events of tick 3560 (the splash is 2 ticks into its
// fade on the frame) and asserts no hit on him on tick 3562.
import { describe, expect, it } from 'vitest';
import { createGame, startWave, tick } from './game';
import { applyAction, comboBuild } from './headless';
import { positionAlongPath, MAP } from './map';

describe('boss.png frame content', () => {
  it('at tick 3562 of wave 10 he is alone at (420,241), tarred, burning, 2374 hp on the bar, Mortar hit on tick 3560, no hit on 3562', () => {
    const s = createGame();
    const script = comboBuild();
    for (let w = 0; w < 9; w++) {
      for (const a of script[w] ?? []) expect(applyAction(s, a)).toMatchObject({ result: { ok: true } });
      expect(startWave(s).ok).toBe(true);
      for (let t = 0; s.phase === 'wave' && t < 60 * 600; t++) tick(s);
    }
    expect({ phase: s.phase, wave: s.wave }).toEqual({ phase: 'setup', wave: 9 });
    for (const a of script[9] ?? []) expect(applyAction(s, a)).toMatchObject({ result: { ok: true } });
    expect(startWave(s).ok).toBe(true);
    for (let t = 0; t < 3560; t++) tick(s);
    const boss = s.enemies.find((e) => e.type === 'boss')!;
    const mortarHitsAt3560 = s.events.filter((e) => e.kind === 'hit' && e.tower === 'mortar' && e.enemyId === boss.id).length;
    tick(s);
    tick(s);
    const pos = positionAlongPath(MAP, boss.distance);
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
      mortarHitsAt3560,
      hitNow: s.events.some((e) => e.kind === 'hit' && e.enemyId === boss.id),
      lives: s.lives,
    }).toEqual({
      wave: 10,
      waveTick: 3562,
      enemies: 1,
      type: 'boss',
      pos: { x: 420, y: 241 },
      burning: true,
      slowed: true,
      slow: 0.3,
      hpOnBar: 2374,
      mortarHitsAt3560: 1,
      hitNow: false,
      lives: 12,
    });
  });
});
