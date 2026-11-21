// Difficulty levels (milestone 25, docs/SCOPE-v4.md "Difficulty"): the
// table, hp scaling per enemy type, createGame per level, determinism per
// level, and the two SCOPE-v4 targets the balance milestone (28) owns.
import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, DIFFICULTY_DEFS, enemyMaxHp, type Difficulty } from './difficulty';
import { ENEMY_STATS } from './enemies';
import { buildTower } from './actions';
import { createGame, startWave, tick } from './game';
import { ARCHETYPES, comboBuild, lazyBuild, playScripted } from './headless';
import type { EnemyType } from './types';
import { WAVES } from './waves';

describe('difficulty table (docs/SCOPE-v4.md)', () => {
  it('Easy 0.75x hp, 150 gold, 25 lives; Normal 1x, 100, 20; Hard 1.3x, 80, 15', () => {
    expect(DIFFICULTY_DEFS).toEqual({
      easy: { hpMultiplier: 0.75, startGold: 150, startLives: 25 },
      normal: { hpMultiplier: 1, startGold: 100, startLives: 20 },
      hard: { hpMultiplier: 1.3, startGold: 80, startLives: 15 },
    });
    expect(DIFFICULTIES).toEqual(['easy', 'normal', 'hard']);
    expect(DEFAULT_DIFFICULTY).toBe('normal');
  });

  it('enemy hp per type and level, rounded to whole numbers', () => {
    const table = Object.fromEntries(
      (Object.keys(ENEMY_STATS) as EnemyType[]).map((t) => [t, DIFFICULTIES.map((d) => enemyMaxHp(t, d))]),
    );
    expect(table).toEqual({
      goblin: [23, 30, 39],
      wolf: [21, 28, 36],
      troll: [525, 700, 910],
      harpy: [30, 40, 52],
      shieldbearer: [90, 120, 156],
      boss: [3000, 4000, 5200],
    });
    for (const t of Object.keys(ENEMY_STATS) as EnemyType[]) expect(enemyMaxHp(t)).toBe(ENEMY_STATS[t].hp);
  });
});

describe('createGame per level', () => {
  it('defaults to Normal: 100 gold, 20 lives, difficulty normal', () => {
    expect(createGame()).toMatchObject({ difficulty: 'normal', gold: 100, lives: 20 });
    expect(createGame({})).toEqual(createGame());
    expect(createGame({ difficulty: 'normal' })).toEqual(createGame());
  });

  it.each([
    ['easy', 150, 25],
    ['normal', 100, 20],
    ['hard', 80, 15],
  ] as const)('%s starts with %i gold and %i lives and records its level', (difficulty, gold, lives) => {
    expect(createGame({ difficulty })).toMatchObject({ difficulty, gold, lives, wave: 0, phase: 'setup' });
  });

  it.each([
    ['easy', 23],
    ['normal', 30],
    ['hard', 39],
  ] as const)('%s: the first Goblin of wave 1 spawns with %i hp', (difficulty, hp) => {
    const s = createGame({ difficulty });
    startWave(s);
    tick(s);
    expect(s.enemies.map((e) => ({ type: e.type, hp: e.hp }))).toEqual([{ type: 'goblin', hp }]);
  });

  /** Spawn hp of every enemy in all 10 waves, with no towers and lives too high to lose. */
  function spawnHp(difficulty: Difficulty): Record<string, number[]> {
    const s = createGame({ difficulty });
    s.lives = 1e9;
    const seen: Record<string, Set<number>> = {};
    for (let w = 0; w < WAVES.length; w++) {
      startWave(s);
      while (s.phase === 'wave') {
        tick(s);
        for (const e of s.events) {
          if (e.kind !== 'spawn') continue;
          const enemy = s.enemies.find((x) => x.id === e.enemyId);
          (seen[e.enemyType] ??= new Set()).add(enemy!.hp);
        }
      }
    }
    return Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...v]]));
  }

  it.each(DIFFICULTIES)('%s: every enemy of every wave spawns with enemyMaxHp of its type', (difficulty) => {
    const want = Object.fromEntries((Object.keys(ENEMY_STATS) as EnemyType[]).map((t) => [t, [enemyMaxHp(t, difficulty)]]));
    expect(spawnHp(difficulty)).toEqual(want);
  });

  it('speeds and bounties do not depend on the level', () => {
    const run = (difficulty: Difficulty) => {
      const s = createGame({ difficulty });
      buildTower(s, { col: 7, row: 5 }, 'musketeer');
      startWave(s);
      const bounties: number[] = [];
      for (let i = 0; i < 600; i++) {
        tick(s);
        for (const e of s.events) if (e.kind === 'kill') bounties.push(e.bounty);
      }
      return { bounties: [...new Set(bounties)] };
    };
    for (const d of DIFFICULTIES) expect(run(d).bounties).toEqual([ENEMY_STATS.goblin.bounty]);
    const moved = (difficulty: Difficulty) => {
      const s = createGame({ difficulty });
      startWave(s);
      for (let i = 0; i < 120; i++) tick(s);
      return s.enemies.map((e) => ({ id: e.id, distance: e.distance }));
    };
    expect(moved('easy')).toEqual(moved('normal'));
    expect(moved('hard')).toEqual(moved('normal'));
  });
});

describe('determinism per level', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`${difficulty}: the combo build plays a full game identically twice`, () => {
      const a = playScripted(comboBuild(difficulty), undefined, difficulty);
      const b = playScripted(comboBuild(difficulty), undefined, difficulty);
      expect(['won', 'lost']).toContain(a.state.phase);
      expect(a.state.difficulty).toBe(difficulty);
      expect(b.state).toEqual(a.state);
      expect(b.waves).toEqual(a.waves);
      expect(b.log).toEqual(a.log);
    });
  }

  it('Normal by argument equals Normal by default for every archetype', () => {
    for (const archetype of Object.values(ARCHETYPES)) {
      expect(playScripted(archetype('normal'), undefined, 'normal').state).toEqual(playScripted(archetype()).state);
    }
  });
});

const end = (difficulty: Difficulty, script: ReturnType<typeof comboBuild>) => {
  const r = playScripted(script, undefined, difficulty);
  const refused = r.log.filter((l) => 'result' in l && !l.result.ok);
  return { phase: r.state.phase, wave: r.state.wave, lives: r.state.lives, gold: r.state.gold, refused: refused.length };
};

describe('SCOPE-v4 difficulty targets (balance milestone 28 owns them)', () => {
  // milestone 28 target: lazyBuild wins on Easy. With the SCOPE-v4 numbers
  // it misses: it reaches wave 10 and loses there with -1 lives (the boss
  // exits for 5 lives with 4 left). Pinned as it is; milestone 28 tunes.
  it('(a) lazyBuild on Easy: pinned at lost on wave 10, -1 lives, 603 gold (target: won)', () => {
    expect(end('easy', lazyBuild('easy'))).toEqual({ phase: 'lost', wave: 10, lives: -1, gold: 603, refused: 0 });
  });

  it('(b) comboBuild on Hard loses at least 5 more lives than on Normal, or loses the game', () => {
    const normal = end('normal', comboBuild());
    const hard = end('hard', comboBuild('hard'));
    expect(hard.refused).toBe(0);
    expect(hard.phase === 'lost' || normal.lives - hard.lives >= 5, JSON.stringify({ normal, hard })).toBe(true);
  });

  // Pinned (no target yet): Hard is harsh with the SCOPE-v4 numbers; the
  // combo build is lost on wave 3. Milestone 28 retunes.
  it('comboBuild on Hard: pinned at lost on wave 3, 0 lives, 68 gold', () => {
    expect(end('hard', comboBuild('hard'))).toEqual({ phase: 'lost', wave: 3, lives: 0, gold: 68, refused: 0 });
  });
});
