// Pins the content of the e2e/visual.spec.ts `enemies.png` frame (wave 8 with
// all three enemy types) in the simulation, so a sim change that alters the
// frame fails here with numbers, not only as a pixel diff in the browser.
// Same setup as the browser test: 1000 gold, wave counter at 7, a Musketeer
// at spot 2, a Cannon at 4, a Tar Pit at 7 and a Musketeer at 9, then Start
// Wave and 1200 ticks.
import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { ENEMY_STATS } from './enemies';
import { createGame, startWave, tick } from './game';

describe('enemies.png frame content', () => {
  it('has 8 Goblins, 5 Wolves, 4 Trolls, 2 hurt Trolls and 2 slowed enemies at tick 1200 of wave 8', () => {
    const s = createGame();
    s.gold = 1000;
    s.wave = 7;
    expect(buildTower(s, 2, 'musketeer').ok).toBe(true);
    expect(buildTower(s, 4, 'cannon').ok).toBe(true);
    expect(buildTower(s, 7, 'tarpit').ok).toBe(true);
    expect(buildTower(s, 9, 'musketeer').ok).toBe(true);
    expect(startWave(s).ok).toBe(true);
    for (let i = 0; i < 1200; i++) tick(s);
    const of = (type: string) => s.enemies.filter((e) => e.type === type);
    expect({
      wave: s.wave,
      goblins: of('goblin').length,
      wolves: of('wolf').length,
      trolls: of('troll').length,
      hurtTrolls: of('troll').filter((e) => e.hp < ENEMY_STATS.troll.hp).length,
      slowed: s.enemies.filter((e) => e.slowTicksLeft > 0).length,
    }).toEqual({ wave: 8, goblins: 8, wolves: 5, trolls: 4, hurtTrolls: 2, slowed: 2 });
  });
});
