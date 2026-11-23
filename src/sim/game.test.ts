import { describe, expect, it } from 'vitest';
import { createGame, startWave, tick } from './game';
import type { GameState } from './types';

/** Run `n` ticks and return the waveTicks on which new enemies appeared. */
function spawnTicks(state: GameState, n: number): { waveTick: number; type: string; id: number }[] {
  const seen: { waveTick: number; type: string; id: number }[] = [];
  let known = state.nextEnemyId;
  for (let i = 0; i < n; i++) {
    const wt = state.waveTick;
    tick(state);
    for (const e of state.enemies) {
      if (e.id >= known) seen.push({ waveTick: wt, type: e.type, id: e.id });
    }
    known = state.nextEnemyId;
  }
  return seen;
}

function runTicks(state: GameState, n: number): void {
  for (let i = 0; i < n; i++) tick(state);
}

/** Run until the phase leaves 'wave'; returns ticks taken. */
function runWave(state: GameState): number {
  let n = 0;
  while (state.phase === 'wave' && n < 100_000) {
    tick(state);
    n += 1;
  }
  return n;
}

describe('createGame', () => {
  it('starts with 100 gold, 20 lives, wave 0, setup, tick 0', () => {
    const s = createGame();
    expect(s).toMatchObject({ gold: 100, lives: 20, wave: 0, phase: 'setup', tick: 0 });
    expect(s.enemies).toEqual([]);
  });
});

describe('enemy movement', () => {
  it('a goblin moves exactly 1 px per tick', () => {
    const s = createGame();
    startWave(s);
    tick(s); // waveTick 0: goblin 0 spawns at distance 0
    expect(s.enemies[0]).toMatchObject({ id: 0, type: 'goblin', distance: 0 });
    runTicks(s, 1);
    expect(s.enemies[0].distance).toBe(1);
    runTicks(s, 499);
    expect(s.enemies[0].distance).toBe(500);
  });

  it('a wolf moves 2 px per tick', () => {
    const s = createGame();
    s.wave = 8; // next is wave 9: its first group is 30 wolves, no delay (milestone 25c)
    startWave(s);
    tick(s);
    runTicks(s, 100);
    expect(s.enemies[0]).toMatchObject({ type: 'wolf', distance: 200 });
  });

  it('a troll moves 35/60 px per tick', () => {
    const s = createGame();
    s.wave = 8; // next is wave 9: 30 wolves, then 10 trolls from 2 s (waveTick 120)
    startWave(s);
    runTicks(s, 121); // the first troll spawns on waveTick 120
    runTicks(s, 120);
    const troll = s.enemies.find((e) => e.type === 'troll');
    expect(troll?.distance).toBeCloseTo(70, 10);
  });

  it('an active slow multiplies speed by (1 - slow) until it expires', () => {
    const s = createGame();
    startWave(s);
    tick(s);
    s.enemies[0].slow = 0.5;
    s.enemies[0].slowTicksLeft = 2;
    runTicks(s, 3);
    expect(s.enemies[0].distance).toBe(2); // 0.5 + 0.5 + 1
    expect(s.enemies[0].slowTicksLeft).toBe(0);
    expect(s.enemies[0].slow).toBe(0);
  });
});

describe('wave spawning', () => {
  it('wave 1 spawns 20 goblins 2.5 s (150 ticks) apart from waveTick 0, and no 21st (milestone 28)', () => {
    const s = createGame();
    startWave(s);
    const seen = spawnTicks(s, 3000);
    expect(seen).toEqual(Array.from({ length: 20 }, (_, i) => ({ waveTick: 150 * i, type: 'goblin', id: i })));
    expect(s.nextEnemyId).toBe(20);
  });

  it('wave 3 runs groups concurrently; wolves start after the 4 s delay', () => {
    const s = createGame();
    s.wave = 2;
    startWave(s);
    const seen = spawnTicks(s, 600);
    const wolves = seen.filter((e) => e.type === 'wolf').map((e) => e.waveTick);
    const goblins = seen.filter((e) => e.type === 'goblin').map((e) => e.waveTick);
    // Milestone 25c: Goblins every 1 s (60 ticks), Wolves every 1.5 s (90) from 4.5 s.
    expect(wolves).toEqual([270, 360, 450, 540]);
    expect(goblins).toEqual(Array.from({ length: 10 }, (_, k) => 60 * k));
    // At waveTick 360 both groups spawn (goblin 6, wolf 1); group order breaks the tie.
    const at360 = seen.filter((e) => e.waveTick === 360);
    expect(at360.map((e) => e.type)).toEqual(['goblin', 'wolf']);
    expect(at360[1].id).toBe(at360[0].id + 1);
  });

  it('enemy ids keep counting across waves', () => {
    const s = createGame();
    startWave(s);
    s.lives = 1000; // a towerless wave 1 would lose (milestone 25c)
    runWave(s);
    startWave(s);
    tick(s);
    expect(s.enemies[0].id).toBe(20);
  });
});

describe('life loss', () => {
  it('an enemy reaching the exit is removed and costs 1 life', () => {
    const s = createGame();
    startWave(s);
    runTicks(s, 1584); // waveTicks 0..1583: goblin 0 at 1583 of 1584 px
    expect(s.enemies[0]).toMatchObject({ id: 0, distance: 1583 });
    expect(s.lives).toBe(20);
    runTicks(s, 1); // reaches 1584, the exit
    expect(s.enemies.find((e) => e.id === 0)).toBeUndefined();
    expect(s.lives).toBe(19);
  });

  it('lives reaching 0 sets phase lost at once and stops the game', () => {
    const s = createGame();
    s.lives = 1;
    startWave(s);
    runTicks(s, 1585);
    expect(s.lives).toBe(0);
    expect(s.phase).toBe('lost');
    const before = structuredClone(s);
    runTicks(s, 10);
    expect(s).toEqual(before);
  });
});

describe('startWave and wave clear', () => {
  it('fails while a wave is active', () => {
    const s = createGame();
    expect(startWave(s)).toEqual({ ok: true, wave: 1 });
    expect(startWave(s)).toEqual({ ok: false, reason: 'not-in-setup' });
    expect(s.wave).toBe(1);
  });

  it('clearing a wave pays +25 and returns to setup; the next startWave works', () => {
    const s = createGame();
    s.lives = 100; // 20 exits would lose a 20-life game (milestone 25c)
    startWave(s);
    // Last goblin spawns at waveTick 19 * 150 = 2850 and exits on waveTick 2850 + 1584.
    expect(runWave(s)).toBe(4435);
    expect(s).toMatchObject({ phase: 'setup', gold: 125, lives: 80, wave: 1, enemies: [] });
    expect(startWave(s)).toEqual({ ok: true, wave: 2 });
    expect(s.phase).toBe('wave');
  });

  it('clearing wave 20 with lives left wins; startWave then fails', () => {
    const s = createGame();
    s.wave = 19;
    s.lives = 1000;
    startWave(s);
    runWave(s);
    expect(s.phase).toBe('won');
    expect(s.gold).toBe(125);
    expect(startWave(s)).toEqual({ ok: false, reason: 'not-in-setup' });
  });

  it('startWave fails with no-more-waves if wave 20 is done but phase is setup', () => {
    const s = { ...createGame(), wave: 20 };
    expect(startWave(s)).toEqual({ ok: false, reason: 'no-more-waves' });
  });
});
