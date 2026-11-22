// Difficulty levels (milestone 25, docs/SCOPE-v4.md "Difficulty"): the
// table, hp scaling per enemy type, createGame per level, determinism per
// level, and the SCOPE-v4 Easy and Hard targets, met in milestone 25c.
import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, DIFFICULTY_DEFS, enemyMaxHp, type Difficulty } from './difficulty';
import { ENEMY_STATS } from './enemies';
import { buildTower } from './actions';
import { createGame, startWave, tick } from './game';
import { ARCHETYPES, comboBuild, hardBuild, lazyBuild, noTowers, playScripted } from './headless';
import type { EnemyType } from './types';
import { WAVES } from './waves';

describe('difficulty table (docs/SCOPE-v4.md)', () => {
  it('Easy 0.75x hp, 150 gold, 30 lives; Normal 1x, 100, 20; Hard 1.1x, 80, 15 (milestone 25c)', () => {
    expect(DIFFICULTY_DEFS).toEqual({
      easy: { hpMultiplier: 0.75, startGold: 150, startLives: 30 },
      normal: { hpMultiplier: 1, startGold: 100, startLives: 20 },
      hard: { hpMultiplier: 1.1, startGold: 80, startLives: 15 },
    });
    expect(DIFFICULTIES).toEqual(['easy', 'normal', 'hard']);
    expect(DEFAULT_DIFFICULTY).toBe('normal');
  });

  it('enemy hp per type and level, rounded to whole numbers', () => {
    const table = Object.fromEntries(
      (Object.keys(ENEMY_STATS) as EnemyType[]).map((t) => [t, DIFFICULTIES.map((d) => enemyMaxHp(t, d))]),
    );
    expect(table).toEqual({
      goblin: [9, 12, 13],
      wolf: [13, 17, 19],
      troll: [375, 500, 550],
      harpy: [17, 22, 24],
      shieldbearer: [53, 70, 77],
      boss: [3000, 4000, 4400],
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
    ['easy', 150, 30],
    ['normal', 100, 20],
    ['hard', 80, 15],
  ] as const)('%s starts with %i gold and %i lives and records its level', (difficulty, gold, lives) => {
    expect(createGame({ difficulty })).toMatchObject({ difficulty, gold, lives, wave: 0, phase: 'setup' });
  });

  it.each([
    ['easy', 9],
    ['normal', 12],
    ['hard', 13],
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

describe('SCOPE-v4 difficulty targets (met in milestone 25c; milestone 28 rechecks them)', () => {
  it('(a) lazyBuild wins on Easy: won, 12 lives, 898 gold', () => {
    expect(end('easy', lazyBuild('easy'))).toEqual({ phase: 'won', wave: 10, lives: 12, gold: 898, refused: 0 });
  });

  it('(a) noTowers still loses on Easy', () => {
    expect(end('easy', noTowers())).toMatchObject({ phase: 'lost' });
  });

  it('(b) comboBuild on Hard loses at least 5 more lives than on Normal, or loses the game on wave 8 or later', () => {
    const normal = end('normal', comboBuild());
    const hard = end('hard', comboBuild('hard'));
    expect(hard.refused).toBe(0);
    const ok = (hard.phase === 'won' && normal.lives - hard.lives >= 5) || (hard.phase === 'lost' && hard.wave >= 8);
    expect(ok, JSON.stringify({ normal, hard })).toBe(true);
  });

  it('comboBuild on Hard: pinned at won, 3 lives, 480 gold (13 on Normal)', () => {
    expect(end('hard', comboBuild('hard'))).toEqual({ phase: 'won', wave: 10, lives: 3, gold: 480, refused: 0 });
  });

  it('(c) lazyBuild on Hard loses by wave 5: lost on wave 1', () => {
    const r = end('hard', lazyBuild('hard'));
    expect(r.phase).toBe('lost');
    expect(r.wave).toBeLessThanOrEqual(5);
    expect(r).toEqual({ phase: 'lost', wave: 1, lives: 0, gold: 38, refused: 0 });
  });

  it('(d) hardBuild wins on Hard: won, 11 lives, 500 gold', () => {
    expect(end('hard', hardBuild('hard'))).toEqual({ phase: 'won', wave: 10, lives: 11, gold: 500, refused: 0 });
  });
});
