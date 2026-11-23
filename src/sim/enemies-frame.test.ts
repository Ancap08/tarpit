// Pins the content of the e2e/visual.spec.ts `enemies.png` frame (wave 8 with
// all five enemy types since milestone 22) in the simulation, so a sim change that alters the
// frame fails here with numbers, not only as a pixel diff in the browser.
// Same setup as the browser test: 1000 gold, wave counter at 7, a Musketeer
// at legacy spot 2, a Cannon at 4, a Tar Pit at 7 and a Musketeer at 9 (as
// cells: (7,5), (10,5), (18,9), (23,8); src/game/legacySpots.ts), then Start
// Wave and 1680 ticks (milestone 8: was 1200 with the v1 spots; 1350 until
// milestone 25c, 1560 in its first pass; see e2e/visual.spec.ts).
import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { ENEMY_STATS } from './enemies';
import { createGame, startWave, tick } from './game';

describe('enemies.png frame content', () => {
  it('has 9 Goblins, 8 Wolves, 6 Trolls, 2 hurt Trolls, 2 slowed enemies, 4 Shieldbearers and 13 Harpies at tick 1680 of wave 8', () => {
    const s = createGame();
    s.gold = 1000;
    s.wave = 7;
    expect(buildTower(s, { col: 7, row: 5 }, 'musketeer').ok).toBe(true);
    expect(buildTower(s, { col: 10, row: 5 }, 'cannon').ok).toBe(true);
    expect(buildTower(s, { col: 18, row: 9 }, 'tarpit').ok).toBe(true);
    expect(buildTower(s, { col: 23, row: 8 }, 'musketeer').ok).toBe(true);
    expect(startWave(s).ok).toBe(true);
    for (let i = 0; i < 1680; i++) tick(s);
    const of = (type: string) => s.enemies.filter((e) => e.type === type);
    expect({
      wave: s.wave,
      goblins: of('goblin').length,
      wolves: of('wolf').length,
      trolls: of('troll').length,
      hurtTrolls: of('troll').filter((e) => e.hp < ENEMY_STATS.troll.hp).length,
      slowed: s.enemies.filter((e) => e.slowTicksLeft > 0).length,
      shieldbearers: of('shieldbearer').length,
      harpies: of('harpy').length,
    }).toEqual({ wave: 8, goblins: 9, wolves: 8, trolls: 6, hurtTrolls: 2, slowed: 2, shieldbearers: 4, harpies: 13 });
  });
});
