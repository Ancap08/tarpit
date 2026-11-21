// Independent verifier probes for milestone 6a. These do not tune anything;
// they check the balance claims from a second angle.
import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { applyAction, KID_SPOT_ORDER, playScripted, soundBuild } from './headless';
import { createGame, TICKS_PER_SECOND, WAVE_CLEAR_BONUS } from './game';
import { enemyPosition } from './combat';
import { MAP } from './map';
import { TOWER_DEFS } from './towers';
import { WAVES } from './waves';
import type { Enemy, TowerType } from './types';

/** Play all waves buying only `tower` (base) in kid spot order while affordable. */
function singleTypeBuild(tower: TowerType) {
  const state = createGame();
  const waves: { wave: number; lives: number; gold: number }[] = [];
  for (let i = 0; i < WAVES.length && state.phase === 'setup'; i++) {
    for (const spotId of KID_SPOT_ORDER) {
      if (state.gold < TOWER_DEFS[tower].cost) break;
      if (state.towers.some((t) => t.spotId === spotId)) continue;
      expect(buildTower(state, spotId, tower).ok).toBe(true);
    }
    applyAction(state, { type: 'startWave' });
    applyAction(state, { type: 'runUntilWaveEnds', maxTicks: 60 * 600 });
    waves.push({ wave: state.wave, lives: state.lives, gold: state.gold });
  }
  return { state, waves };
}

describe('balance verifier probes', () => {
  it('(a) soundBuild is deterministic: two runs give identical reports and state', () => {
    const a = playScripted(soundBuild());
    const b = playScripted(soundBuild());
    expect(b.waves).toEqual(a.waves);
    expect(b.state).toEqual(a.state);
  });

  it('(b) a cannon-only build ends worse than soundBuild', () => {
    const sound = playScripted(soundBuild()).state;
    const cannon = singleTypeBuild('cannon').state;
    const worse = cannon.phase === 'lost' || cannon.lives < sound.lives;
    expect(worse, `cannon-only ${cannon.phase} ${cannon.lives} lives; sound ${sound.phase} ${sound.lives} lives`).toBe(true);
  });

  it('(c) a tarpit-only build cannot win', () => {
    const { state } = singleTypeBuild('tarpit');
    expect(state.phase, `tarpit-only ${state.phase} on wave ${state.wave}, ${state.lives} lives`).toBe('lost');
  });

  it('(d) one Troll walking the whole path past one base Musketeer at spot 2 reaches the exit', () => {
    const s = createGame();
    s.gold = 10_000;
    s.phase = 'wave';
    s.wave = 1;
    s.spawnedPerGroup = [8]; // wave 1 has nothing left to spawn
    expect(buildTower(s, 2, 'musketeer').ok).toBe(true);
    s.gold = 0;
    const troll: Enemy = { id: 0, type: 'troll', hp: 500, distance: 0, slow: 0, slowTicksLeft: 0 };
    s.enemies = [troll];
    s.nextEnemyId = 100;

    // Expected shots: time the Troll spends within 110 px of spot 2, at 1 shot/s.
    const spot = MAP.buildSpots[2];
    const range = TOWER_DEFS.musketeer.base.range;
    let inRangeTicks = 0;
    for (let d = 0; d < 1500; d += 35 / TICKS_PER_SECOND) {
      const p = enemyPosition({ ...troll, distance: d });
      if (Math.hypot(p.x - spot.x, p.y - spot.y) <= range) inRangeTicks += 1;
    }
    const maxShots = Math.ceil(inRangeTicks / TICKS_PER_SECOND) + 1;
    expect(maxShots * TOWER_DEFS.musketeer.base.damage).toBeLessThan(500);

    for (let i = 0; i < 60 * 600 && s.enemies.length > 0; i++) {
      // tick via the headless runner's own loop would end the wave; call directly
      applyAction(s, { type: 'runUntilWaveEnds', maxTicks: 1 });
    }
    expect(s.enemies).toHaveLength(0);
    expect(s.lives).toBe(19);
    expect(s.gold).toBe(WAVE_CLEAR_BONUS); // only the clear bonus: no Troll bounty, it was never killed
  });

  it('(e) soundBuild loses at least one life in each of waves 7 and 8', () => {
    const w = playScripted(soundBuild()).waves;
    const lost = (n: number) => w[n - 2].lives - w[n - 1].lives;
    expect(lost(7), JSON.stringify(w)).toBeGreaterThanOrEqual(1);
    expect(lost(8), JSON.stringify(w)).toBeGreaterThanOrEqual(1);
  });
});
