// Difficulty levels (milestone 25, docs/SCOPE-v4.md "Difficulty"): the
// table, hp scaling per enemy type, createGame per level, determinism per
// level; the Easy and Hard targets are in balance.suite.ts (milestone 28).
import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, DIFFICULTY_DEFS, campaignHpFactor, enemyMaxHp, type Difficulty } from './difficulty';
import { ENEMY_STATS } from './enemies';
import { buildTower } from './actions';
import { createGame, startWave, tick } from './game';
import { applyScriptBoon, ARCHETYPES, comboBuild, hardBuild, playScripted } from './headless';
import type { EnemyType } from './types';
import { WAVES } from './waves';

describe('difficulty table (docs/SCOPE-v4.md)', () => {
  it('Easy 0.75x hp, 150 gold, 35 lives; Normal 1x, 100, 20; Hard 1.2x, 80, 15 (milestone 28)', () => {
    expect(DIFFICULTY_DEFS).toEqual({
      easy: { hpMultiplier: 0.75, startGold: 150, startLives: 35 },
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
      goblin: [17, 23, 28],
      wolf: [15, 20, 24],
      troll: [713, 950, 1140],
      harpy: [27, 36, 43],
      shieldbearer: [53, 70, 84],
      boss: [3000, 4000, 4800],
      grumblemaw: [4200, 5600, 6720],
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
    ['easy', 150, 35],
    ['normal', 100, 20],
    ['hard', 80, 15],
  ] as const)('%s starts with %i gold and %i lives and records its level', (difficulty, gold, lives) => {
    expect(createGame({ difficulty })).toMatchObject({ difficulty, gold, lives, wave: 0, phase: 'setup' });
  });

  it.each([
    ['easy', 17],
    ['normal', 23],
    ['hard', 28],
  ] as const)('%s: the first Goblin of wave 1 spawns with %i hp', (difficulty, hp) => {
    const s = createGame({ difficulty });
    startWave(s);
    tick(s);
    expect(s.enemies.map((e) => ({ type: e.type, hp: e.hp }))).toEqual([{ type: 'goblin', hp }]);
  });

  it.each(DIFFICULTIES)('%s: every enemy of every campaign wave spawns at full hp for its wave', (difficulty) => {
    const s = createGame({ difficulty });
    s.lives = 1e9;
    for (let w = 1; w <= WAVES.length; w++) {
      applyScriptBoon(s);
      startWave(s);
      while (s.phase === 'wave') {
        tick(s);
        for (const e of s.events) {
          if (e.kind !== 'spawn') continue;
          const enemy = s.enemies.find((x) => x.id === e.enemyId)!;
          const full = enemyMaxHp(enemy.type, difficulty, campaignHpFactor(w, difficulty));
          if (enemy.hp !== full || (enemy.maxHp ?? enemyMaxHp(enemy.type, difficulty)) !== full) {
            throw new Error(`Wave ${w} ${enemy.type} spawned with ${enemy.hp} / ${enemy.maxHp} hp, expected ${full}`);
          }
        }
      }
    }
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
  // Each level's combo game played twice: difficulty-verifier.test.ts (g).
  // Verifier (milestone 25c): Normal by argument and by default. Milestone
  // 28: one test per archetype, comparing the recorded scripts (the whole
  // game is a function of the script), so no test plays more than two games.
  for (const [name, archetype] of Object.entries(ARCHETYPES)) {
    it(`Normal by argument equals Normal by default: ${name}`, () => {
      expect(archetype('normal')).toEqual(archetype());
    });
  }

  it('playScripted on Normal by argument equals playScripted by default', () => {
    const script = comboBuild();
    expect(playScripted(script, undefined, 'normal').state).toEqual(playScripted(script).state);
  });
});

const end = (difficulty: Difficulty, script: ReturnType<typeof comboBuild>) => {
  const r = playScripted(script, undefined, difficulty);
  const refused = r.log.filter((l) => 'result' in l && !l.result.ok);
  return { phase: r.state.phase, wave: r.state.wave, lives: r.state.lives, gold: r.state.gold, refused: refused.length };
};

function withHpChange(type: EnemyType, delta: number, check: () => void) {
  const stats = ENEMY_STATS[type] as { hp: number };
  const hp = stats.hp;
  stats.hp += delta;
  try {
    check();
  } finally {
    stats.hp = hp;
  }
}

// The exact results for the frozen difficulties are in balance.suite.ts.
describe('Hard campaign robustness against one-point HP changes', () => {
  for (const [type, d] of [['goblin', -1], ['wolf', 1], ['wolf', -1]] as const) {
    const label = `${type} hp ${d > 0 ? '+' : ''}${d}`;

    it(`${label}: the Hard combo target holds`, () => {
      withHpChange(type, d, () => {
        const normal = end('normal', comboBuild());
        const hard = end('hard', comboBuild('hard'));
        const ok = (hard.phase === 'won' && normal.lives - hard.lives >= 5) || (hard.phase === 'lost' && hard.wave >= 12);
        expect(ok, JSON.stringify({ normal, hard })).toBe(true);
      });
    });

    it(`${label}: hardBuild wins`, () => {
      withHpChange(type, d, () => expect(end('hard', hardBuild('hard')).phase).toBe('won'));
    });
  }
});

describe('thin margin (milestone 28): Goblin hp +1', () => {
  // Goblin 24 makes the Hard Goblin 29 (1 over a multiple of 4: against the
  // Hard hp rule). Before milestone 30 the Hard combo then lost on Meadow on
  // wave 7, breaking H3; with the milestone 30 specials it loses on wave 8,
  // so only H4 breaks. hardBuild still wins on Meadow.
  it('Goblin 24 rounds to 29 on Hard, violating the multiple-of-four hp rule', () => {
    const stats = ENEMY_STATS.goblin as { hp: number };
    const hp0 = stats.hp;
    stats.hp = hp0 + 1;
    try {
      expect(enemyMaxHp('goblin', 'hard')).toBe(29);
      expect(enemyMaxHp('goblin', 'hard') % 4).toBe(1);
    } finally {
      stats.hp = hp0;
    }
  });
});
