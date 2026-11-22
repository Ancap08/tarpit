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
  it('Easy 0.75x hp, 150 gold, 30 lives; Normal 1x, 100, 20; Hard 1.2x, 80, 15 (milestone 25c)', () => {
    expect(DIFFICULTY_DEFS).toEqual({
      easy: { hpMultiplier: 0.75, startGold: 150, startLives: 30 },
      normal: { hpMultiplier: 1, startGold: 100, startLives: 20 },
      hard: { hpMultiplier: 1.2, startGold: 80, startLives: 15 },
    });
    expect(DIFFICULTIES).toEqual(['easy', 'normal', 'hard']);
    expect(DEFAULT_DIFFICULTY).toBe('normal');
  });

  it('enemy hp per type and level, rounded to whole numbers', () => {
    const table = Object.fromEntries(
      (Object.keys(ENEMY_STATS) as EnemyType[]).map((t) => [t, DIFFICULTIES.map((d) => enemyMaxHp(t, d))]),
    );
    expect(table).toEqual({
      goblin: [14, 19, 23],
      wolf: [15, 20, 24],
      troll: [675, 900, 1080],
      harpy: [27, 36, 43],
      shieldbearer: [53, 70, 84],
      boss: [3000, 4000, 4800],
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
    ['easy', 14],
    ['normal', 19],
    ['hard', 23],
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

  // Verifier (milestone 25c): 48 archetype games take about 4 s on the horde
  // waves and timed out at the default 5 s in a full run (vitest.config.ts now sets 30 s for all).
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
  it('(a) lazyBuild wins on Easy: won, 9 lives, 964 gold', () => {
    expect(end('easy', lazyBuild('easy'))).toEqual({ phase: 'won', wave: 10, lives: 9, gold: 964, refused: 0 });
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

  it('comboBuild on Hard: pinned at lost on wave 8, 284 gold (13 lives on Normal)', () => {
    expect(end('hard', comboBuild('hard'))).toEqual({ phase: 'lost', wave: 8, lives: 0, gold: 284, refused: 0 });
  });

  // Milestone 25c second pass: it must survive wave 1 and lose on 2 to 5.
  it('(c) lazyBuild on Hard survives wave 1 and loses on wave 2 to 5: lost on wave 5', () => {
    const r = end('hard', lazyBuild('hard'));
    expect(r.phase).toBe('lost');
    expect(r.wave).toBeGreaterThanOrEqual(2);
    expect(r.wave).toBeLessThanOrEqual(5);
    expect(r).toEqual({ phase: 'lost', wave: 5, lives: 0, gold: 128, refused: 0 });
  });

  it('(d) hardBuild wins on Hard: won, 9 lives, 464 gold', () => {
    expect(end('hard', hardBuild('hard'))).toEqual({ phase: 'won', wave: 10, lives: 9, gold: 464, refused: 0 });
  });

  // Milestone 25c second pass: no enemy's Hard hp sits 1 or 2 points above
  // a multiple of the Musketeer's 12 or the Longbow's 4 (the Hard Goblin at
  // 13 made every Musketeer opening lose on wave 1), nor above the Cannon's
  // 25 or the Mortar's 45. The Tar Pit's 3 is left out: every whole number
  // is 0, 1 or 2 above a multiple of 3.
  it('no Hard hp is 1 or 2 above a multiple of 12, 4, 25 or 45', () => {
    for (const t of ['goblin', 'wolf', 'troll', 'harpy', 'shieldbearer'] as const) {
      const hp = enemyMaxHp(t, 'hard');
      for (const d of [12, 4, 25, 45]) expect([1, 2], `${t} ${hp} mod ${d}`).not.toContain(hp % d);
    }
  });

  // The verifier found Hard balanced on one Wolf hp; the second pass holds
  // the Hard combo target with Goblin and Wolf hp one point either way.
  it('the Hard combo target holds with Goblin or Wolf hp one point up or down', () => {
    const normalLives = end('normal', comboBuild()).lives;
    for (const [type, d] of [['goblin', 1], ['goblin', -1], ['wolf', 1], ['wolf', -1]] as const) {
      const stats = ENEMY_STATS[type] as { hp: number };
      const hp0 = stats.hp;
      stats.hp = hp0 + d;
      try {
        const n = end('normal', comboBuild());
        const h = end('hard', comboBuild('hard'));
        const ok = (h.phase === 'won' && n.lives - h.lives >= 5) || (h.phase === 'lost' && h.wave >= 8);
        expect(ok, `${type} ${d}: ${JSON.stringify({ n, h })}`).toBe(true);
        expect(end('hard', hardBuild('hard')).phase, `${type} ${d}`).toBe('won');
      } finally {
        stats.hp = hp0;
      }
    }
    expect(end('normal', comboBuild()).lives).toBe(normalLives);
  });
});
