import { describe, expect, it } from 'vitest';
import { buildTower, useSpecial } from './actions';
import { enemyMaxHp } from './difficulty';
import { cappedSlow, ENEMY_STATS, isBoss } from './enemies';
import type { GameEvent } from './events';
import { createGame, lastSpawnTick, spawnTick, startWave, tick, WAVE_CLEAR_BONUS } from './game';
import { MAPS, pathLength } from './map';
import type { GameState } from './types';
import { WAVES } from './waves';

function arena(difficulty: GameState['difficulty'] = 'normal'): GameState {
  const state = createGame({ difficulty });
  state.wave = 19;
  startWave(state);
  state.spawnedPerGroup = WAVES[19].groups.map((group) => group.count);
  state.enemies = [{
    id: 0,
    type: 'grumblemaw',
    hp: enemyMaxHp('grumblemaw', difficulty),
    distance: 80,
    slow: 0,
    slowTicksLeft: 0,
  }];
  state.nextEnemyId = 1;
  state.events = [];
  return state;
}

const packCalls = (state: GameState) => state.events.filter((event) => event.kind === 'packCall');
const wolfSpawns = (events: GameEvent[]) => events.filter((event): event is Extract<GameEvent, { kind: 'spawn' }> => event.kind === 'spawn' && event.enemyType === 'wolf');

describe('Grumblemaw', () => {
  it('is bigger than Grumblefoot and shares its 30% slow cap', () => {
    expect(isBoss({ type: 'grumblemaw' })).toBe(true);
    expect(cappedSlow({ type: 'grumblemaw' }, 0.5)).toBe(0.3);
    expect(ENEMY_STATS.grumblemaw).toEqual({ hp: 13500, speed: 25, bounty: 300, flying: false, shield: false, livesCost: 6, slowCap: 0.3 });
  });

  it('spawns once as wave 20’s last enemy, 120 ticks after the last normal enemy', () => {
    const groups = WAVES[19].groups;
    const last = groups.at(-1)!;
    expect(last).toMatchObject({ type: 'grumblemaw', count: 1 });
    expect(lastSpawnTick(20)).toBe(Math.max(...groups.slice(0, -1).map((g) => spawnTick(g, g.count - 1))) + 120);
    for (const wave of WAVES.slice(0, 19)) expect(wave.groups.some((g) => g.type === 'grumblemaw')).toBe(false);

    const state = createGame();
    state.wave = 19;
    state.lives = 1000;
    startWave(state);
    while (state.waveTick <= lastSpawnTick(20)) tick(state);
    const spawn = state.events.find((e): e is Extract<GameEvent, { kind: 'spawn' }> => e.kind === 'spawn' && e.enemyType === 'grumblemaw')!;
    expect(state.events.at(-1)).toEqual({ kind: 'bossSpawn', enemyId: spawn.enemyId, enemyType: 'grumblemaw' });
    expect(state.enemies.at(-1)?.hp).toBe(13500);
  });

  it.each([[7, 'won'], [6, 'lost']] as const)('an exit costs six lives with %i left, ending %s', (lives, phase) => {
    const state = arena();
    state.lives = lives;
    state.enemies[0].distance = pathLength(MAPS.meadow) - 0.1;
    const gold = state.gold;
    tick(state);
    expect(state.lives).toBe(lives - 6);
    expect(state.phase).toBe(phase);
    expect(state.events.slice(0, 2)).toEqual([
      { kind: 'exit', enemyId: 0 },
      { kind: 'bossDown', enemyId: 0, enemyType: 'grumblemaw', cause: 'exit' },
    ]);
    expect(packCalls(state)).toEqual([]);
    expect(state.gold).toBe(gold + (phase === 'won' ? WAVE_CLEAR_BONUS : 0));
  });

  it('uses difficulty-scaled max HP for both thresholds and emits each only once', () => {
    const state = arena('hard');
    const boss = state.enemies[0];
    const hardMaxHp = boss.hp;
    expect(hardMaxHp).toBe(16200);
    // A base Musketeer hits for 12. Its first shot lands exactly at two thirds.
    buildTower(state, { col: 2, row: 5 }, 'musketeer');
    const tower = state.towers[0];
    boss.hp = 2 * hardMaxHp / 3 + 12;
    tick(state);
    expect(packCalls(state)).toEqual([{ kind: 'packCall', enemyId: 0, threshold: 2 }]);
    tower.cooldownTicks = 0;
    tick(state);
    expect(packCalls(state)).toEqual([]);
    expect(state.enemies.filter((enemy) => enemy.type === 'wolf')).toEqual([
      expect.objectContaining({ hp: 24 }),
    ]);

    boss.hp = hardMaxHp / 3 + 1;
    tower.cooldownTicks = 0;
    tick(state);
    expect(packCalls(state)).toEqual([{ kind: 'packCall', enemyId: 0, threshold: 1 }]);
    tower.cooldownTicks = 0;
    tick(state);
    expect(packCalls(state)).toEqual([]);
  });

  it.each(['special', 'burn', 'shot'] as const)('a lethal %s crossing both thresholds queues both packs and postpones the win until they are gone', (cause) => {
    function play() {
      const state = arena();
      const events: GameEvent[] = [];
      const spawnTimes: number[] = [];
      const gold = state.gold;
      const absorb = (at: number) => {
        events.push(...state.events);
        for (const spawn of wolfSpawns(state.events)) {
          expect(state.enemies.find((e) => e.id === spawn.enemyId)?.distance).toBe(0);
          spawnTimes.push(at);
        }
      };
      const boss = state.enemies[0];
      if (cause === 'special') {
        boss.hp = 60;
        useSpecial(state, 'keg', { x: 80, y: 240 });
        absorb(-1);
      } else if (cause === 'burn') {
        boss.hp = 1;
        boss.burnDps = 60;
        boss.burnTicksLeft = 1;
      } else {
        boss.hp = 12;
        buildTower(state, { col: 2, row: 5 }, 'musketeer');
        // Keep the tower's purchases in the accounting independently.
        absorb(-1);
      }
      for (let frame = 0; frame < 2000 && state.phase === 'wave'; frame++) {
        tick(state);
        absorb(frame);
      }

      expect(events.filter((e) => e.kind === 'packCall')).toEqual([
        { kind: 'packCall', enemyId: 0, threshold: 2 },
        { kind: 'packCall', enemyId: 0, threshold: 1 },
      ]);
      expect(events.filter((e) => e.kind === 'bossDown')).toEqual([
        { kind: 'bossDown', enemyId: 0, enemyType: 'grumblemaw', cause },
      ]);
      const wolves = wolfSpawns(events);
      expect(wolves).toHaveLength(16);
      expect(spawnTimes[0]).toBeLessThanOrEqual(1);
      for (let i = 0; i < spawnTimes.length; i += 2) {
        expect(spawnTimes[i]).toBe(spawnTimes[0] + (i / 2) * 30);
        expect(spawnTimes[i + 1]).toBe(spawnTimes[i]);
      }
      expect(new Set(wolves.map((e) => e.enemyId)).size).toBe(16);
      expect(events.filter((e) => e.kind === 'exit').length + events.filter((e) => e.kind === 'kill' && e.enemyType === 'wolf').length).toBe(16);
      expect(state.phase).toBe('won');
      expect(events.at(-1)).toEqual({ kind: 'won' });
      const bounty = events.reduce((total, event) => total + (event.kind === 'kill' ? event.bounty : 0), 0);
      expect(state.gold).toBe(gold + bounty + WAVE_CLEAR_BONUS - (cause === 'shot' ? 50 : 0));
      return { state, events };
    }
    expect(play()).toEqual(play());
  });
});
