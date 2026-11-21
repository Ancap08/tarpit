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
    s.wave = 3; // next is wave 4: 10 wolves, no delay
    startWave(s);
    tick(s);
    runTicks(s, 100);
    expect(s.enemies[0]).toMatchObject({ type: 'wolf', distance: 200 });
  });

  it('a troll moves 35/60 px per tick', () => {
    const s = createGame();
    s.wave = 8; // next is wave 9: 12 wolves and 8 trolls, both no delay
    startWave(s);
    tick(s);
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
  it('wave 1 spawns 8 goblins one second apart from waveTick 0, and no ninth', () => {
    const s = createGame();
    startWave(s);
    const seen = spawnTicks(s, 1500);
    expect(seen).toEqual([0, 60, 120, 180, 240, 300, 360, 420].map((wt, i) => ({ waveTick: wt, type: 'goblin', id: i })));
    expect(s.nextEnemyId).toBe(8);
  });

  it('wave 3 runs groups concurrently; wolves start after the 4 s delay', () => {
    const s = createGame();
    s.wave = 2;
    startWave(s);
    const seen = spawnTicks(s, 600);
    const wolves = seen.filter((e) => e.type === 'wolf').map((e) => e.waveTick);
    const goblins = seen.filter((e) => e.type === 'goblin').map((e) => e.waveTick);
    expect(wolves).toEqual([240, 276, 312, 348, 384, 420]);
    expect(goblins).toEqual([0, 60, 120, 180, 240, 300, 360, 420]);
    // At waveTick 240 both groups spawn; group order breaks the tie.
    const at240 = seen.filter((e) => e.waveTick === 240);
    expect(at240.map((e) => e.type)).toEqual(['goblin', 'wolf']);
    expect(at240[1].id).toBe(at240[0].id + 1);
    // And again at waveTick 420 (goblin 8 and wolf 6).
    expect(seen.filter((e) => e.waveTick === 420).map((e) => e.type)).toEqual(['goblin', 'wolf']);
  });

  it('enemy ids keep counting across waves', () => {
    const s = createGame();
    startWave(s);
    runWave(s);
    startWave(s);
    tick(s);
    expect(s.enemies[0].id).toBe(8);
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
    startWave(s);
    // Last goblin spawns at waveTick 420 and exits on waveTick 420 + 1584.
    expect(runWave(s)).toBe(2005);
    expect(s).toMatchObject({ phase: 'setup', gold: 125, lives: 12, wave: 1, enemies: [] });
    expect(startWave(s)).toEqual({ ok: true, wave: 2 });
    expect(s.phase).toBe('wave');
  });

  it('clearing wave 10 with lives left wins; startWave then fails', () => {
    const s = createGame();
    s.wave = 9;
    s.lives = 1000;
    startWave(s);
    runWave(s);
    expect(s.phase).toBe('won');
    expect(s.gold).toBe(125);
    expect(startWave(s)).toEqual({ ok: false, reason: 'not-in-setup' });
  });

  it('startWave fails with no-more-waves if wave 10 is done but phase is setup', () => {
    const s = { ...createGame(), wave: 10 };
    expect(startWave(s)).toEqual({ ok: false, reason: 'no-more-waves' });
  });
});
