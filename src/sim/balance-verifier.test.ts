// Independent verifier probes for the balance archetypes. Milestone 8 keeps
// only the checks that still apply on the grid: determinism of the sound
// build, and one mechanics probe (a Troll outlasts a lone Musketeer). The
// v1 probes that compared builds against wave targets (cannon-only worse
// than sound, tarpit-only cannot win, sound loses lives in waves 7 and 8)
// are suspended with the other balance pins until milestone 12.
import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { applyAction, playScripted, soundBuild } from './headless';
import { createGame, TICKS_PER_SECOND, WAVE_CLEAR_BONUS } from './game';
import { enemyPosition } from './combat';
import { cellCenter, type Cell } from './grid';
import { TOWER_DEFS } from './towers';
import { ENEMY_STATS } from './enemies';
import type { Enemy } from './types';

describe('balance verifier probes', () => {
  it('(a) soundBuild is deterministic: two runs give identical reports and state', () => {
    const a = playScripted(soundBuild());
    const b = playScripted(soundBuild());
    expect(b.waves).toEqual(a.waves);
    expect(b.state).toEqual(a.state);
  });

  it('(d) one Troll walking the whole path past one base Musketeer at cell (7,5) reaches the exit', () => {
    const cell: Cell = { col: 7, row: 5 }; // centre (240,176), v1 spot 2
    const s = createGame();
    s.gold = 10_000;
    s.phase = 'wave';
    s.wave = 1;
    s.spawnedPerGroup = [8]; // wave 1 has nothing left to spawn
    expect(buildTower(s, cell, 'musketeer').ok).toBe(true);
    s.gold = 0;
    const troll: Enemy = { id: 0, type: 'troll', hp: ENEMY_STATS.troll.hp, distance: 0, slow: 0, slowTicksLeft: 0 };
    s.enemies = [troll];
    s.nextEnemyId = 100;

    // Expected shots: time the Troll spends within 110 px of the cell centre, at 1 shot/s.
    const at = cellCenter(cell);
    const range = TOWER_DEFS.musketeer.base.range;
    let inRangeTicks = 0;
    for (let d = 0; d < 1500; d += 35 / TICKS_PER_SECOND) {
      const p = enemyPosition({ ...troll, distance: d });
      if (Math.hypot(p.x - at.x, p.y - at.y) <= range) inRangeTicks += 1;
    }
    const maxShots = Math.ceil(inRangeTicks / TICKS_PER_SECOND) + 1;
    expect(maxShots * TOWER_DEFS.musketeer.base.damage).toBeLessThan(ENEMY_STATS.troll.hp);

    for (let i = 0; i < 60 * 600 && s.enemies.length > 0; i++) {
      // tick via the headless runner's own loop would end the wave; call directly
      applyAction(s, { type: 'runUntilWaveEnds', maxTicks: 1 });
    }
    expect(s.enemies).toHaveLength(0);
    expect(s.lives).toBe(19);
    expect(s.gold).toBe(WAVE_CLEAR_BONUS); // only the clear bonus: no Troll bounty, it was never killed
  });
});
