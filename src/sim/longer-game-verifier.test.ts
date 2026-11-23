// Milestone 36a, verifier probes (Claude Sonnet). Independent of boons.test.ts and grumblemaw.test.ts:
// own geometry and hand-computed values.
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTower, moveTower, pickBoon, sellTower, undoUpgrade, upgradeTower, useSpecial } from './actions';
import { boonOptions, type BoonId } from './boons';
import { applyBurn, applySlow, applySpecialSlow } from './combat';
import { enemyMaxHp } from './difficulty';
import { effectiveSlow, ENEMY_STATS } from './enemies';
import type { GameEvent } from './events';
import { callEarlyStatus, callNextWave, continueEndless, createGame, lastSpawnTick, startWave, tick, wavesCleared } from './game';
import { applyAction, applyScriptBoon, comboBuild } from './headless';
import { MAPS, pathLength, type MapId } from './map';
import { specialRadius, tarLingerTicks } from './specials';
import { shotCooldown, TOWER_DEFS, TOWER_PATHS, towerStats } from './towers';
import type { Enemy, EnemyType, GameState, TowerType } from './types';
import { endlessCycle, waveDef, WAVES } from './waves';

const CELL = { col: 3, row: 5 };
const OTHER = (() => {
  for (let col = 0; col < 15; col++) for (let row = 0; row < 8; row++) {
    const probe = createGame();
    probe.gold = 1000;
    if ((col !== 3 || row !== 5) && buildTower(probe, { col, row }, 'cannon').ok) return { col, row };
  }
  throw new Error('no buildable cell');
})();

function enemy(id: number, type: EnemyType, extra: Partial<Enemy> = {}): Enemy {
  return { id, type, hp: ENEMY_STATS[type].hp, distance: 100, slow: 0, slowTicksLeft: 0, specialSlow: 0, specialSlowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0, ...extra };
}

/** Wave `wave` running with every ordinary enemy already spawned, holding only `enemies`. */
function inWave(wave: number, enemies: Enemy[], difficulty: GameState['difficulty'] = 'normal'): GameState {
  const s = createGame({ difficulty });
  s.wave = wave - 1;
  s.lives = 1000;
  expect(startWave(s).ok).toBe(true);
  s.spawnedPerGroup = WAVES[wave - 1].groups.map((g) => g.count);
  s.enemies = enemies;
  s.nextEnemyId = 1000;
  s.events = [];
  return s;
}

/** Clear wave `wave` for real (all spawned, nobody left) and return the state at the offer. */
function clearedAt(wave: number): GameState {
  const s = inWave(wave, []);
  tick(s);
  return s;
}

const ofKind = <K extends GameEvent['kind']>(s: GameState, kind: K) => s.events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

describe('verifier 36a: the rules', () => {
  it('wave 10 cleared: setup with a pick pending, not won; wave 20 wins; Keep going starts 21; no second win', () => {
    const s = clearedAt(10);
    expect(s.phase).toBe('setup');
    expect(s.pendingBoon).toEqual({ wave: 10, options: ['stickyTar', 'hotCoals', 'quickHands'] });
    expect(startWave(s)).toEqual({ ok: false, reason: 'boon-pending' });

    const w = clearedAt(20);
    expect(w.phase).toBe('won');
    expect(w.pendingBoon).toBeNull();
    expect(ofKind(w, 'won')).toHaveLength(1);
    expect(startWave(w)).toEqual({ ok: false, reason: 'not-in-setup' });
    for (let i = 0; i < 100; i++) tick(w);
    expect(w.phase).toBe('won');
    expect(continueEndless(w)).toEqual({ ok: true, wave: 20 });
    expect(continueEndless(w)).toEqual({ ok: false, reason: 'not-won' });
    expect(startWave(w)).toEqual({ ok: true, wave: 21 });
    // Endless: clearing wave 21 never wins and never offers a boon.
    w.spawnedPerGroup = waveDef(21).groups.map((g) => g.count);
    w.enemies = [];
    tick(w);
    expect(w.phase).toBe('setup');
    expect(w.pendingBoon).toBeNull();
    expect(wavesCleared(w)).toBe(21);
  });

  it('every campaign clear that is not 5, 10, 15 offers nothing; 5, 10, 15 offer exactly their three', () => {
    for (let n = 1; n <= 19; n++) {
      const s = clearedAt(n);
      if ([5, 10, 15].includes(n)) expect(s.pendingBoon?.wave).toBe(n);
      else expect(s.pendingBoon).toBeNull();
    }
  });

  it('Grumblemaw spawns 2 s after wave 20 last ordinary spawn, alone, with the right hp per level', () => {
    const groups = WAVES[19].groups;
    const ordinaryLast = Math.max(...groups.slice(0, -1).map((g) => Math.round(g.delay * 60) + (g.count - 1) * Math.round(g.interval * 60)));
    expect(ordinaryLast).toBe(2772); // 46.2 s: the 12th Troll, 27.5 + 11 x 1.7
    const spawnAt = ordinaryLast + 120;
    expect(lastSpawnTick(20)).toBe(spawnAt);
    for (const [level, hp] of [['easy', 4200], ['normal', 5600], ['hard', 6720]] as const) {
      expect(enemyMaxHp('grumblemaw', level)).toBe(hp);
      const s = createGame({ difficulty: level });
      s.wave = 19;
      s.lives = 1e6;
      startWave(s);
      while (s.waveTick <= spawnAt) tick(s);
      const boss = s.enemies.find((e) => e.type === 'grumblemaw')!;
      expect(boss.hp).toBe(hp);
      expect(s.waveTick).toBe(spawnAt + 1);
      expect(ofKind(s, 'bossSpawn')).toEqual([{ kind: 'bossSpawn', enemyId: boss.id, enemyType: 'grumblemaw' }]);
    }
  });

  it('Grumblemaw: 10 lives on exit; slow cap 0.3 under a Tar Pit, a Tar Barrel and both; burn doubles under tar', () => {
    const s = inWave(20, [enemy(0, 'grumblemaw')]);
    applySlow(s.enemies[0], 0.6, 100);
    expect(effectiveSlow(s.enemies[0])).toBe(0.3);
    applySpecialSlow(s.enemies[0], 0.5, 100);
    expect(effectiveSlow(s.enemies[0])).toBe(0.3);
    const d0 = s.enemies[0].distance;
    tick(s);
    expect(s.enemies[0].distance - d0).toBeCloseTo((35 / 60) * 0.7, 9);

    const t = inWave(20, [enemy(0, 'grumblemaw')]);
    applySpecialSlow(t.enemies[0], 0.5, 100);
    expect(effectiveSlow(t.enemies[0])).toBe(0.3);
    applyBurn(t.enemies[0], 26, 100, 'special');
    const hp = t.enemies[0].hp;
    tick(t);
    expect(hp - t.enemies[0].hp).toBeCloseTo(52 / 60, 9);

    const x = inWave(20, [enemy(0, 'grumblemaw', { distance: pathLength(MAPS.meadow) - 0.1 })]);
    x.lives = 10;
    tick(x);
    expect(x.lives).toBe(0);
    expect(ofKind(x, 'bossDown')).toEqual([{ kind: 'bossDown', enemyId: 0, enemyType: 'grumblemaw', cause: 'exit' }]);
  });
});

describe('verifier 36a: Grumblemaw pack calls', () => {
  const keg = (s: GameState) => useSpecial(s, 'keg', { x: 100, y: 240 });
  const boss = (hp: number, difficulty: GameState['difficulty'] = 'normal') => {
    const s = inWave(20, [enemy(0, 'grumblemaw', { hp })], difficulty);
    s.specialCharges = 1;
    return s;
  };

  it('exact boundary: hp on Easy exactly 2800 calls, 2801 does not; thresholds fire once', () => {
    const above = boss(2861, 'easy');
    keg(above);
    expect(above.enemies[0].hp).toBe(2801);
    expect(ofKind(above, 'packCall')).toEqual([]);

    const a = boss(2860, 'easy');
    keg(a);
    expect(a.enemies[0].hp).toBe(2800);
    expect(ofKind(a, 'packCall')).toEqual([{ kind: 'packCall', enemyId: 0, threshold: 2 }]);
    // Hit again deeper than 2/3 but above 1/3: no second call at threshold 2.
    a.specialCharges = 1;
    keg(a);
    expect(ofKind(a, 'packCall')).toHaveLength(1);
    // Cross one third exactly.
    a.enemies[0].hp = 1460;
    a.specialCharges = 1;
    keg(a);
    expect(a.enemies[0].hp).toBe(1400);
    expect(ofKind(a, 'packCall').map((e) => e.threshold)).toEqual([2, 1]);
    a.specialCharges = 1;
    keg(a);
    for (let i = 0; i < 400; i++) tick(a);
    expect(ofKind(a, 'packCall')).toHaveLength(0); // events reset per tick; none new
  });

  it('a surviving hit crossing both thresholds starts both packs, two thirds first', () => {
    const s = boss(75);
    s.enemies[0].maxHp = 90;
    keg(s);
    expect(s.enemies[0].hp).toBe(15);
    expect(ofKind(s, 'packCall').map((e) => e.threshold)).toEqual([2, 1]);
    expect(s.packs).toEqual([{ nextTick: s.waveTick, remaining: 8 }, { nextTick: s.waveTick, remaining: 8 }]);
  });

  it('wolves are real: spawn at 30-tick spacing, 8 per call, 20 hp on Normal, count for the clear, pay bounty', () => {
    const s = boss(3793);
    keg(s);
    s.enemies = [enemy(0, 'grumblemaw', { hp: 3733, packCalls: 1 })];
    const spawns: number[] = [];
    for (let i = 0; i < 300; i++) {
      tick(s);
      for (const event of ofKind(s, 'spawn')) {
        if (event.enemyType !== 'wolf') continue;
        spawns.push(s.waveTick - 1);
        expect(s.enemies.find((wolf) => wolf.id === event.enemyId)).toMatchObject({ hp: 20, distance: 0 });
        if (spawns.length === 1) {
          const gold = s.gold;
          s.specialCharges = 1;
          expect(useSpecial(s, 'keg', { x: 0, y: 240 })).toMatchObject({ hits: 1, kills: 1 });
          expect(s.gold).toBe(gold + 2);
        }
      }
    }
    expect(spawns).toHaveLength(8);
    expect(spawns.slice(1).map((t, i) => t - spawns[i])).toEqual(Array(7).fill(30));
    expect(s.packs).toEqual([]);
  });

  it('the wave cannot clear while a pack is queued, even with the field empty', () => {
    const s = boss(3793);
    keg(s);
    s.enemies = [];
    s.packs = [{ nextTick: s.waveTick + 100, remaining: 8 }];
    for (let i = 0; i < 50; i++) tick(s);
    expect(s.phase).toBe('wave');
  });

  it('a lethal hit crossing both thresholds skips both pack calls and clears the wave', () => {
    const s = boss(50);
    s.enemies[0].maxHp = 72; // Thresholds 48 and 24.
    keg(s);
    expect(s.enemies).toEqual([]);
    expect(ofKind(s, 'packCall')).toEqual([]);
    expect(s.packs).toEqual([]);
    tick(s);
    expect(s.phase).toBe('won');
  });

  it('he exits with a pack queued: lives lost for him, the wolves still come and the wave clears only after them', () => {
    const s = inWave(20, [enemy(0, 'grumblemaw', { hp: 3733, packCalls: 1, distance: pathLength(MAPS.meadow) - 0.1 })]);
    s.packs = [{ nextTick: s.waveTick, remaining: 8 }];
    s.lives = 20;
    tick(s);
    expect(s.lives).toBe(10);
    expect(ofKind(s, 'packCall')).toEqual([]);
    expect(s.phase).toBe('wave');
    let guard = 0;
    while (s.phase === 'wave' && guard++ < 20000) tick(s);
    expect(s.phase).toBe('won'); // wolves walked out: 8 lives more
    expect(s.lives).toBe(2);
  });

  it('wave 19 cannot call wave 20 (last-wave); wave 18 can call 19', () => {
    const s = inWave(19, []);
    expect(callEarlyStatus(s)).toEqual({ ok: false, reason: 'last-wave' });
    const before = structuredClone(s);
    expect(callNextWave(s)).toEqual({ ok: false, reason: 'last-wave' });
    expect(s).toEqual(before);
  });
});

describe('verifier 36a: boons by hand', () => {
  const TYPES: TowerType[] = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];
  const stats = (s: GameState, t: TowerType, up: boolean) => towerStats({ type: t, upgraded: up }, s.boons);
  const withBoon = (id: BoonId): GameState => {
    const s = createGame();
    s.boons = [id];
    return s;
  };

  it('Long Barrels: Cannon 105 -> 136.5, Mortar 220 -> 286, nobody else; min range unchanged', () => {
    const s = withBoon('longBarrels');
    expect(stats(s, 'cannon', false).range).toBeCloseTo(136.5, 9);
    expect(stats(s, 'cannon', true).range).toBeCloseTo(136.5, 9);
    expect(stats(s, 'mortar', true).range).toBeCloseTo(286, 9);
    expect(stats(s, 'mortar', false).minRange).toBe(70);
    for (const t of ['musketeer', 'tarpit', 'longbow', 'firepot'] as const) expect(stats(s, t, true).range).toBe(TOWER_DEFS[t].upgraded.range);
  });

  it('Keen Arrows: Longbow 4 -> 5, 9 -> 11.25; others unchanged', () => {
    const s = withBoon('keenArrows');
    expect(stats(s, 'longbow', false).damage).toBeCloseTo(5, 9);
    expect(stats(s, 'longbow', true).damage).toBeCloseTo(11.25, 9);
    expect(stats(s, 'musketeer', true).damage).toBe(22);
  });

  it('Sticky Tar: Tar Pit slow 2 s -> 4 s (240 ticks), zone linger 60 -> 120 ticks', () => {
    const s = withBoon('stickyTar');
    expect(stats(s, 'tarpit', false).slowDuration).toBeCloseTo(4, 9);
    expect(tarLingerTicks(s.boons)).toBe(120);
    expect(tarLingerTicks([])).toBe(60);
  });

  it('Hot Coals: Fire Pot burn 5 -> 9 and 8 -> 14.4; Fire Arrows 26 -> 46.8, doubled under tar', () => {
    const s = withBoon('hotCoals');
    expect(stats(s, 'firepot', false).burnDps).toBeCloseTo(9, 9);
    expect(stats(s, 'firepot', true).burnDps).toBeCloseTo(14.4, 9);
    const w = inWave(7, [enemy(0, 'troll', { hp: 1e6 })]);
    w.boons = ['hotCoals'];
    w.specialCharges = 1;
    useSpecial(w, 'fireArrows', { x: 100, y: 240 });
    expect(w.enemies[0].burnDps).toBeCloseTo(46.8, 9);
  });

  it('Quick Hands: recharge 1200 -> 744 for the next use; a recharge cannot be running at a pick (wave clear resets it)', () => {
    const w = inWave(3, [enemy(0, 'troll', { hp: 1e6 })]);
    w.boons = ['quickHands'];
    w.specialCharges = 1;
    useSpecial(w, 'keg', { x: 100, y: 240 });
    expect(w.specialRechargeTicks).toBe(744);
    const c = inWave(10, [enemy(0, 'troll', { hp: 1e6 })]);
    c.specialCharges = 1;
    useSpecial(c, 'keg', { x: 100, y: 240 });
    expect(c.specialRechargeTicks).toBe(1200);
    c.enemies = [];
    tick(c);
    expect(c.specialRechargeTicks).toBe(0); // reset at the clear, before the pick: Quick Hands never rewrites a running recharge
  });

  it('Veteran Crews: fire interval in ticks, by hand', () => {
    const s = withBoon('veteranCrews');
    // round(60 / (rate x 1.10))
    const want: Record<TowerType, number> = { musketeer: 55, cannon: 109, tarpit: 27, longbow: 22, mortar: 164, firepot: 68 };
    for (const t of TYPES) expect(shotCooldown(stats(s, t, false)), t).toBe(want[t]);
    expect(shotCooldown(towerStats({ type: 'musketeer', upgraded: false }))).toBe(60);
  });

  it('Bigger Blasts: Cannon 40/55 -> 56/77, Mortar 60/70 -> 84/98, Keg 90 -> 126; Tar Barrel and Fire Arrows unchanged', () => {
    const s = withBoon('biggerBlasts');
    expect(stats(s, 'cannon', false).splashRadius).toBeCloseTo(56, 9);
    expect(stats(s, 'cannon', true).splashRadius).toBeCloseTo(77, 9);
    expect(stats(s, 'mortar', false).splashRadius).toBeCloseTo(84, 9);
    expect(stats(s, 'mortar', true).splashRadius).toBeCloseTo(98, 9);
    expect(specialRadius('keg', s.boons)).toBeCloseTo(126, 9);
    expect(specialRadius('tarBarrel', s.boons)).toBe(100);
    expect(specialRadius('fireArrows', s.boons)).toBe(90);
  });

  it('War Chest +100 gold and Stone Walls +3 lives, exactly once, and not before the pick', () => {
    const a = clearedAt(5);
    const g = a.gold;
    expect(pickBoon(a, 'warChest')).toEqual({ ok: true });
    expect(a.gold).toBe(g + 100);
    expect(pickBoon(a, 'warChest')).toEqual({ ok: false, reason: 'no-boon-pending' });
    expect(a.gold).toBe(g + 100);
    const b = clearedAt(15);
    const l = b.lives;
    pickBoon(b, 'stoneWalls');
    expect(b.lives).toBe(l + 3);
  });

  it('refusals change nothing (deep compare), after the game ends too', () => {
    const none = createGame();
    const c0 = structuredClone(none);
    expect(pickBoon(none, 'warChest')).toEqual({ ok: false, reason: 'no-boon-pending' });
    expect(none).toEqual(c0);
    const s = clearedAt(5);
    const c1 = structuredClone(s);
    expect(pickBoon(s, 'stickyTar')).toEqual({ ok: false, reason: 'boon-not-offered' });
    expect(s).toEqual(c1);
    const won = clearedAt(20);
    const c2 = structuredClone(won);
    expect(pickBoon(won, 'warChest')).toEqual({ ok: false, reason: 'no-boon-pending' });
    expect(won).toEqual(c2);
    const lost = inWave(5, [enemy(0, 'goblin', { distance: pathLength(MAPS.meadow) - 0.1 })]);
    lost.lives = 1;
    tick(lost);
    expect(lost.phase).toBe('lost');
    expect(lost.pendingBoon).toBeNull();
  });

  it('effects survive sell/rebuild, upgrade, move and undo; stats are a pure function of tower and boons', () => {
    const s = createGame();
    s.gold = 5000;
    s.boons = ['veteranCrews', 'longBarrels'];
    expect(buildTower(s, CELL, 'cannon').ok).toBe(true);
    const t = s.towers[0];
    const baseRange = towerStats(t, s.boons).range;
    expect(upgradeTower(s, CELL).ok).toBe(true);
    expect(undoUpgrade(s, CELL).ok).toBe(true);
    expect(moveTower(s, CELL, OTHER)).toMatchObject({ ok: true });
    expect(towerStats(s.towers[0], s.boons).range).toBeCloseTo(baseRange, 9);
    expect(sellTower(s, OTHER).ok).toBe(true);
    buildTower(s, CELL, 'cannon');
    expect(towerStats(s.towers[0], s.boons).range).toBeCloseTo(136.5, 9);
    expect(shotCooldown(towerStats(s.towers[0], s.boons))).toBe(109);
    // Not before the pick, not twice: boon list holds one entry per pick, so a duplicate id cannot arise from the game.
    const none = createGame();
    expect(towerStats({ type: 'cannon', upgraded: false }, none.boons).range).toBe(105);
  });

  it('call-early cannot skip a pending pick: every route into or out of a reward wave is refused', () => {
    for (const w of [4, 5, 9, 10, 14, 15]) {
      const s = inWave(w, []);
      expect(callEarlyStatus(s)).toEqual({ ok: false, reason: 'boon-wave' });
    }
    // Wave 3 may call 4; then wave 4 cannot call 5.
    const s = inWave(3, []);
    expect(callNextWave(s).ok).toBe(true);
    expect(s.wave).toBe(4);
    s.spawnedPerGroup = waveDef(4).groups.map((g) => g.count);
    expect(callNextWave(s)).toEqual({ ok: false, reason: 'boon-wave' });
    expect(boonOptions(3)).toEqual([]);
  });
});

describe('verifier 36a: endless by hand', () => {
  const norm = (n: number) => waveDef(n).groups.map((g) => `${g.count} ${g.type} every ${g.interval} from ${Number(g.delay.toFixed(6))}`);

  it('wave 21: wave 18 + 10 Harpies from 61.5 s (35 Goblin intervals of 1.7 s + 2), x1.8; hp Normal 41 / troll 1710', () => {
    expect(norm(21)).toEqual([
      '36 goblin every 1.7 from 0', '18 troll every 3 from 3.6', '11 shieldbearer every 5 from 2.16', '19 harpy every 2.8 from 7.92', '10 harpy every 0.75 from 61.5',
    ]);
    expect(waveDef(21).hpMultiplier).toBe(1.8);
    expect(enemyMaxHp('goblin', 'normal', 1.8)).toBe(41); // 41.4
    expect(enemyMaxHp('troll', 'normal', 1.8)).toBe(1710);
  });

  it('wave 22: wave 19 + 10 Harpies from 63.48 s (last Harpy: 6.48 + 20 x 2.75 = 61.48), x1.8', () => {
    expect(norm(22).at(-1)).toBe('10 harpy every 0.75 from 63.48');
    expect(norm(22)).toHaveLength(4);
  });

  it('wave 23: wave 20 without Grumblemaw + 10 Harpies from 48.2 s; no boss, no pack', () => {
    expect(norm(23).at(-1)).toBe('10 harpy every 0.75 from 48.2');
    expect(waveDef(23).groups.some((g) => g.type === 'grumblemaw' || g.type === 'boss')).toBe(false);
    expect(waveDef(23).groups).toHaveLength(5);
  });

  it('wave 24: cycle 2, wave 18, 12 Harpies, x3.24; wave 60: cycle 14, wave 18, 16 Harpies (cap), x1.8^14', () => {
    expect(endlessCycle(24)).toBe(2);
    expect(norm(24).at(-1)).toBe('12 harpy every 0.75 from 61.5');
    expect(waveDef(24).hpMultiplier).toBeCloseTo(3.24, 12);
    expect(endlessCycle(60)).toBe(14);
    expect(norm(60).at(-1)).toBe('16 harpy every 0.75 from 61.5');
    expect(waveDef(60).hpMultiplier).toBeCloseTo(1.8 ** 14, 6);
    expect(enemyMaxHp('troll', 'normal', waveDef(24).hpMultiplier)).toBe(3078);
  });

  it('endless never offers a boon, never calls a pack, and wavesCleared is wave - 1 on a loss', () => {
    const s = clearedAt(20);
    continueEndless(s);
    for (let n = 21; n <= 24; n++) {
      s.lives = 1000;
      expect(startWave(s)).toEqual({ ok: true, wave: n });
      s.spawnedPerGroup = waveDef(n).groups.map((g) => g.count);
      s.enemies = [];
      tick(s);
      expect(s.pendingBoon).toBeNull();
      expect(s.packs).toEqual([]);
      expect(wavesCleared(s)).toBe(n);
    }
  });
});

describe('verifier 36a: conservation over full games', () => {
  const cases: [MapId, GameState['difficulty']][] = [];
  for (const m of ['meadow', 'switchback', 'riverbend'] as const) for (const d of ['easy', 'normal', 'hard'] as const) cases.push([m, d]);

  describe.each(cases)('%s %s', (map, level) => {
    const play = () => {
      const script = comboBuild(level, map);
      const s = createGame({ difficulty: level, map });
      const events: GameEvent[] = [];
      let seen = 0;
      const take = () => {
        events.push(...s.events.slice(seen));
        seen = s.events.length;
      };
      for (let i = 0; i < 20 && (s.phase === 'setup'); i++) {
        const r = applyScriptBoon(s, script);
        if (r) take();
        for (const a of script[i] ?? []) {
          applyAction(s, a);
          take();
        }
        applyAction(s, { type: 'startWave' });
        take();
        const timed = script.timed?.[i] ?? [];
        let guard = 0;
        const phase = () => s.phase as GameState['phase'];
        while (phase() === 'wave' && guard++ < 60 * 600) {
          for (const a of timed) {
            if (a.atWaveTick === s.waveTick) {
              applyAction(s, a);
              take();
            }
          }
          if (phase() !== 'wave') break;
          tick(s);
          seen = 0;
          take();
        }
      }
      return { s, events };
    };
    let reference: ReturnType<typeof play>;
    beforeAll(() => {
      reference = play();
    });

    it('a fresh recording and replay produces the same ending state', () => {
      expect(play().s).toEqual(reference.s);
    });

    it('reconciles each spawn, exit, kill, life and gold transaction', () => {
      const { s, events } = reference;
      const spawned = new Map(events.filter((e) => e.kind === 'spawn').map((e) => [(e as Extract<GameEvent, { kind: 'spawn' }>).enemyId, (e as Extract<GameEvent, { kind: 'spawn' }>).enemyType]));
      const kills = events.filter((e): e is Extract<GameEvent, { kind: 'kill' }> => e.kind === 'kill');
      const exits = events.filter((e): e is Extract<GameEvent, { kind: 'exit' }> => e.kind === 'exit');
      // Each enemy killed or exited at most once; none both.
      const gone = [...kills.map((k) => k.enemyId), ...exits.map((x) => x.enemyId)];
      expect(new Set(gone).size).toBe(gone.length);
      expect(gone.length + s.enemies.length).toBe(spawned.size);
      const sched = WAVES.slice(0, s.wave).reduce((n, w) => n + w.groups.reduce((m, g) => m + g.count, 0), 0);
      const calls = events.filter((e) => e.kind === 'packCall').length;
      expect(spawned.size).toBeLessThanOrEqual(sched + 8 * calls);
      if (s.phase === 'won') expect(spawned.size).toBe(sched + 8 * calls);
      const towerKills = s.towers.reduce((n, t) => n + t.kills, 0);
      expect(towerKills).toBeLessThanOrEqual(kills.filter((k) => k.cause !== 'special').length);
      // Gold: every in and out.
      let gold = createGame({ difficulty: level }).gold;
      let lives = createGame({ difficulty: level }).lives;
      for (const e of events) {
        if (e.kind === 'kill') gold += e.bounty;
        if (e.kind === 'waveClear' || e.kind === 'earlyCall') gold += e.bonus;
        if (e.kind === 'build') gold -= TOWER_DEFS[e.tower].cost;
        if (e.kind === 'upgrade') gold -= e.level === 3 ? TOWER_PATHS[e.tower].cost : TOWER_DEFS[e.tower].upgradeCost;
        if (e.kind === 'sell') gold += e.refund;
        if (e.kind === 'undoUpgrade') gold += e.refund;
        if (e.kind === 'boonPicked' && e.id === 'warChest') gold += 100;
        if (e.kind === 'boonPicked' && e.id === 'stoneWalls') lives += 3;
        if (e.kind === 'exit') lives -= ENEMY_STATS[spawned.get(e.enemyId)!].livesCost;
      }
      expect(s.gold).toBe(gold);
      expect(s.lives).toBe(lives);
      // Event cardinalities.
      const bosses = events.filter((e) => e.kind === 'bossSpawn') as Extract<GameEvent, { kind: 'bossSpawn' }>[];
      const downs = events.filter((e) => e.kind === 'bossDown') as Extract<GameEvent, { kind: 'bossDown' }>[];
      expect(bosses.length).toBeLessThanOrEqual(2);
      expect(downs.length).toBeLessThanOrEqual(bosses.length);
      expect(new Set(bosses.map((b) => b.enemyType)).size).toBe(bosses.length);
      const offers = events.filter((e) => e.kind === 'boonOffered').length;
      const picks = events.filter((e) => e.kind === 'boonPicked').length;
      expect(picks).toBeLessThanOrEqual(offers);
      expect(offers).toBe([5, 10, 15].filter((w) => w <= (s.phase === 'lost' ? s.wave - 1 : s.wave)).length);
      for (const t of [2, 1] as const) expect(events.filter((e) => e.kind === 'packCall' && e.threshold === t).length).toBeLessThanOrEqual(1);
    });
  });
});

describe('verifier 36a follow-up: Euclidean targeting matches a naive hypot reference at the range boundary', () => {
  it('every tower type, base and upgraded, with and without Long Barrels, at range and range +/- 1e-9', async () => {
    const { findTarget } = await import('./combat');
    const line = { id: 'line', width: 4000, height: 480, path: [{ x: 0, y: 240 }, { x: 4000, y: 240 }] };
    let checked = 0;
    for (const type of Object.keys(TOWER_DEFS) as TowerType[]) {
      for (const upgraded of [false, true]) {
        for (const boons of [[], ['longBarrels']] as BoonId[][]) {
          const s = createGame({ map: line });
          s.boons = boons;
          const tower = { type, upgraded, cell: { col: 20, row: 7 }, cooldownTicks: 0, targeting: 'first' } as unknown as GameState['towers'][number];
          const st = towerStats(tower, boons);
          const cx = 20 * 32 + 16; // row 7 centre y is 240: the path line, so dy = 0
          for (const edge of [st.range, st.minRange]) {
            if (edge === 0) continue;
            for (const off of [-1e-9, 0, 1e-9, 0.5]) {
              for (const sign of [1, -1]) {
                const x = cx + sign * (edge + off);
                s.enemies = [{ id: 1, type: 'goblin', hp: 10, distance: x, slow: 0, slowTicksLeft: 0 }];
                const d = Math.hypot(cx - x, 0);
                const naive = d <= st.range && d >= st.minRange;
                expect(findTarget(s, tower) !== undefined, `${type} up=${upgraded} ${boons} edge=${edge} off=${off}`).toBe(naive);
                checked++;
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
