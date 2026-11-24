// Milestone 48 verifier (independent of the implementer's levelTaxes.test.ts).
// Expected values are computed here by hand from the frozen tables in
// docs/DESIGN.md, not read back from the code under test.
import { describe, expect, it } from 'vitest';
import {
  CHEAT_GOLD, TOWER_DEFS, buildTower, callNextWave, createGame, grantCheatGold, moveTower, pathLength, pickBoon, sellTower,
  startWave, tick, towerStats, towerBuildCost, upgradeTower, LEVELS, botGood, runBot, parseProgress, serializeProgress, unlockedLevel, useSpecial, findTarget, levelStars, type EnemyType,
  type GameState, type LevelDef, type LevelFeat, type LevelTaxes, type TowerType,
} from '.';
import { buildableCells as buildMask, cellCenter, cellFromKey, type Cell } from './grid';
import type { MapDef } from './types';
const buildableCells = (map: MapDef): Cell[] => buildMask(map).flatMap((ok, key) => (ok ? [cellFromKey(key)] : []));
import { ENEMY_STATS } from './enemies';
import { enemyPosition } from './combat';
import { positionAlongPath } from './map';

const BASE_COST: Record<TowerType, number> = { musketeer: 50, cannon: 80, tarpit: 60, longbow: 40, mortar: 110, firepot: 70 };
const TYPES = Object.keys(BASE_COST) as TowerType[];
const one = { groups: [{ type: 'goblin' as EnemyType, count: 1, interval: 1, delay: 0 }] };
const ALL_T = TYPES as readonly TowerType[];
const ALL_S = ['keg', 'barricade', 'tarBarrel', 'guards', 'fireArrows'] as const;
const mk = (taxes: LevelTaxes | undefined, extra: Partial<LevelDef> = {}): LevelDef => ({
  id: 11, map: 'meadow', startGold: 100000, waves: [one, one, one], hpScale: 1, hpGrowthStart: null,
  allowedTowers: ALL_T, maxTowerLevel: 3, allowedSpecials: ALL_S, rewardWaves: [], ...(taxes ? { taxes } : {}), ...extra,
});
const ticks = (s: GameState, n: number) => { for (let i = 0; i < n; i++) tick(s); };

describe('Window Tax, by hand', () => {
  // price(n) = base + round-half-up(base * pct * n / 100), pct an integer percent
  const price = (base: number, pct: number, n: number) => base + Math.floor((base * pct * n + 50) / 100);
  for (const pct of [5, 6, 7, 8, 9, 10]) {
    it(`${pct}% a tower: first to eighth of each type, sells in between`, () => {
      for (const type of TYPES) {
        const s = createGame({ level: mk({ windowTax: pct / 100 }) });
        const cells = buildableCells(s.map);
        const built: number[] = [];
        for (let n = 0; n < 8; n++) {
          const before = s.gold;
          const r = buildTower(s, cells[n], type);
          expect(r.ok).toBe(true);
          expect(before - s.gold, `${type} #${n + 1} at ${pct}%`).toBe(price(BASE_COST[type], pct, n));
          built.push(n);
          // sell every odd one at once (setup, full refund): the count must not go down
          if (n % 2 === 1) {
            const sold = sellTower(s, cells[n]);
            expect(sold).toMatchObject({ ok: true, refund: price(BASE_COST[type], pct, n) });
          }
        }
        expect(s.towersBuilt).toBe(8);
      }
    });
  }
  it('an upgrade and a move cost and count nothing', () => {
    const s = createGame({ level: mk({ windowTax: 0.1 }) });
    const [a, b, c] = buildableCells(s.map);
    buildTower(s, a, 'musketeer');
    const g = s.gold;
    upgradeTower(s, a);
    expect(g - s.gold).toBe(TOWER_DEFS.musketeer.upgradeCost);
    moveTower(s, a, b);
    expect(s.towersBuilt).toBe(1);
    const g2 = s.gold;
    buildTower(s, c, 'musketeer');
    expect(g2 - s.gold).toBe(55);
  });
  it('a locked tower sold in a wave refunds 70% of what it cost (the taxed price)', () => {
    const s = createGame({ level: mk({ windowTax: 0.1 }) });
    const cells = buildableCells(s.map);
    buildTower(s, cells[0], 'cannon');
    startWave(s);
    buildTower(s, cells[1], 'cannon'); // built in a wave: locked, paid 88
    expect(sellTower(s, cells[1])).toMatchObject({ refund: Math.floor(88 * 0.7) });
  });
  it('float rounding never differs from exact half-up arithmetic (every type, 5-10%, up to 40 builds)', () => {
    const bad: string[] = [];
    for (const pct of [5, 6, 7, 8, 9, 10]) for (const type of TYPES) for (let n = 0; n < 40; n++) {
      const s = createGame({ level: mk({ windowTax: pct / 100 }) });
      s.towersBuilt = n;
      const want = BASE_COST[type] + Math.floor((BASE_COST[type] * pct * n + 50) / 100);
      if (towerBuildCost(s, type) !== want) bad.push(`${type} ${pct}% n=${n}: got ${towerBuildCost(s, type)} want ${want}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('Frozen Purse, by hand', () => {
  it('kills pay nothing at all (shot, keg, bosses); a clear pays the lump; the early call adds only its bonus', () => {
    const lump = 37;
    const s = createGame({ level: mk({ frozenPurse: lump }, { startGold: 1000, waves: [one, one, { groups: [{ type: 'boss', count: 1, interval: 1, delay: 0 }] }, one] }) });
    startWave(s);
    tick(s);
    const g = s.gold;
    expect(useSpecial(s, 'keg', enemyPosition(s.enemies[0], s.map))).toMatchObject({ ok: true, kills: 1 });
    expect(s.gold).toBe(g); // goblin died, bounty 2, paid nothing
    ticks(s, 1);
    expect(s.phase).toBe('setup');
    expect(s.gold).toBe(g + lump);
    startWave(s);
    // let the second goblin spawn, then call early at the first moment allowed
    ticks(s, 1);
    expect(callNextWave(s)).toMatchObject({ ok: false });
  });
  it('an early call pays lump + bonus (not the 25)', () => {
    const lump = 37;
    const two = { groups: [{ type: 'goblin' as EnemyType, count: 1, interval: 1, delay: 0 }] };
    const s = createGame({ level: mk({ frozenPurse: lump }, { startGold: 1000, waves: [two, two, two] }) });
    startWave(s);
    ticks(s, 1);
    const g = s.gold;
    const r = callNextWave(s);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(s.gold - g).toBe(lump + r.bonus);
  });
  it('level without it still pays 25 and bounty', () => {
    const s = createGame({ level: mk(undefined, { startGold: 1000 }) });
    startWave(s); tick(s);
    const g = s.gold;
    useSpecial(s, 'keg', enemyPosition(s.enemies[0], s.map));
    expect(s.gold - g).toBe(ENEMY_STATS.goblin.bounty);
    tick(s);
    expect(s.gold - g).toBe(ENEMY_STATS.goblin.bounty + 25);
  });
});

describe('Forced March, every enemy type', () => {
  const groups = (['goblin', 'wolf', 'troll', 'harpy', 'shieldbearer', 'boss', 'grumblemaw'] as EnemyType[])
    .map(type => ({ type, count: 1, interval: 1, delay: 0 }));
  const run = (taxes: LevelTaxes | undefined) => {
    const s = createGame({ level: mk(taxes, { waves: [{ groups }], hpScale: 1 }) });
    startWave(s);
    const dist = new Map<number, number[]>();
    const seen = new Map<number, EnemyType>();
    const exit = new Map<number, number>();
    const alive = new Set<number>();
    let t = 0;
    while (s.phase === 'wave' && t < 60 * 60 * 30) {
      tick(s); t++;
      // the Grumblemaw's call for hounds needs damage; push the same pack record the sim makes
      if (t === 120) s.packs.push({ nextTick: s.waveTick + 1, remaining: 8 });
      const now = new Set<number>();
      for (const e of s.enemies) {
        now.add(e.id); seen.set(e.id, e.type);
        dist.set(e.id, [...(dist.get(e.id) ?? []), e.distance]);
      }
      for (const id of alive) if (!now.has(id) && !exit.has(id)) exit.set(id, t);
      alive.clear(); for (const id of now) alive.add(id);
    }
    return { dist, seen, exit };
  };
  for (const rate of [0.15, 0.2, 0.25]) {
    it(`speed x${1 + rate}: per-tick step and exit tick for every enemy (summons included)`, () => {
      const plain = run(undefined);
      const taxed = run({ forcedMarch: rate });
      expect(taxed.seen.size).toBe(plain.seen.size);
      expect(taxed.seen.size).toBeGreaterThan(7); // the boss's summoned pack is in the set
      const types = new Set(taxed.seen.values());
      for (const t of ['goblin', 'wolf', 'troll', 'harpy', 'shieldbearer', 'boss', 'grumblemaw']) expect(types.has(t as EnemyType)).toBe(true);
      for (const [id, d] of taxed.dist) {
        const type = taxed.seen.get(id)!;
        const per = (ENEMY_STATS[type].speed * (1 + rate)) / 60;
        for (let i = 1; i < d.length; i++) expect(d[i] - d[i - 1], `${type}#${id} tick ${i}`).toBeCloseTo(per, 9);
        // exit tick: spawn tick + ceil(path / step) within one tick of the hand figure
        const first = plain.dist.get(id)!.length; // plain lifetime in ticks
        const life = d.length;
        const expected = Math.ceil(pathLength(createGame({ level: mk(undefined) }).map) / per);
        expect(Math.abs(life - expected)).toBeLessThanOrEqual(1);
        expect(life).toBeLessThan(first);
      }
    }, 60_000);
  }
  it('a slowed enemy under Forced March is multiplied, not replaced', () => {
    const s = createGame({ level: mk({ forcedMarch: 0.25 }) });
    startWave(s); ticks(s, 2);
    s.enemies[0].slow = 0.5; s.enemies[0].slowTicksLeft = 10;
    const d = s.enemies[0].distance; tick(s);
    expect(s.enemies[0].distance - d).toBeCloseTo(60 * 1.25 * 0.5 / 60, 9);
  });
});

describe('Curfew, by hand', () => {
  // The frozen reach table (docs/DESIGN.md), typed here, with Long Barrels (+30%) on the artillery only.
  const RAW: Record<TowerType, Record<'base' | 'up' | 'A' | 'B', number>> = {
    musketeer: { base: 110, up: 125, A: 200, B: 125 }, cannon: { base: 105, up: 105, A: 105, B: 105 },
    tarpit: { base: 90, up: 105, A: 105, B: 145 }, longbow: { base: 150, up: 170, A: 170, B: 170 },
    mortar: { base: 220, up: 220, A: 220, B: 220 }, firepot: { base: 100, up: 100, A: 125, B: 100 },
  };
  it('every tower, level and path; Long Barrels before the cut; the Mortar keeps 70', () => {
    for (const cut of [0.1, 0.15, 0.2]) {
      const level = mk({ curfew: cut });
      for (const type of TYPES) for (const kind of ['base', 'up', 'A', 'B'] as const) for (const boon of [false, true]) {
        const tower = { type, upgraded: kind !== 'base', path: kind === 'A' || kind === 'B' ? kind : undefined };
        const artillery = type === 'mortar' || type === 'cannon';
        const expected = RAW[type][kind] * (boon && artillery ? 1.3 : 1) * (1 - cut);
        const got = towerStats(tower, boon ? ['longBarrels'] : [], level);
        expect(got.range, `${type} ${kind} boon=${boon} cut=${cut}`).toBeCloseTo(expected, 9);
        expect(got.minRange).toBe(type === 'mortar' ? 70 : 0);
      }
    }
  });
  it('the real targeting reach is the taxed ring: the furthest target is inside it and within 1 px of it, for every tower', () => {
    for (const type of TYPES) {
      const cut = 0.2;
      const level = mk({ curfew: cut });
      const s = createGame({ level });
      const mid = positionAlongPath(s.map, 400);
      const cell = buildableCells(s.map).map(c => ({ c, d: Math.hypot(cellCenter(c).x - mid.x, cellCenter(c).y - mid.y) })).sort((a, b) => a.d - b.d)[0].c;
      buildTower(s, cell, type);
      startWave(s); tick(s);
      const tower = s.towers[0];
      const c = cellCenter(cell);
      const e = s.enemies[0];
      const ring = RAW[type].base * (1 - cut);
      let furthest = 0;
      let nearest = Infinity;
      for (let d = 0; d < pathLength(s.map); d += 0.25) {
        e.distance = d;
        if (!findTarget(s, tower)) continue;
        const p = positionAlongPath(s.map, d);
        const dist = Math.hypot(p.x - c.x, p.y - c.y);
        furthest = Math.max(furthest, dist);
        nearest = Math.min(nearest, dist);
      }
      expect(furthest, type).toBeLessThanOrEqual(ring + 1e-6);
      expect(furthest, type).toBeGreaterThan(ring - 1);
      if (type === 'mortar') expect(nearest).toBeGreaterThanOrEqual(70 - 1e-6);
    }
  });
});

describe('No Loitering, to the tick', () => {
  const waves = [one, one, one, one];
  const clearWave = (s: GameState) => { let n = 0; while (s.phase === 'wave' && n++ < 100000) { for (const e of s.enemies) e.hp = 0; tick(s); if (s.enemies.length === 0 && s.phase === 'wave') tick(s); } };
  it('wave 1 waits; the next wave starts on exactly the 480th setup tick after the clear; the last never auto-starts', () => {
    const s = createGame({ level: mk({ noLoitering: 8 }, { waves }) });
    ticks(s, 5000);
    expect(s).toMatchObject({ phase: 'setup', wave: 0 });
    startWave(s);
    // run until clear
    let guard = 0;
    while (s.phase === 'wave' && guard++ < 10000) { tick(s); if (s.enemies.length) { s.enemies[0].hp = 0; } }
    expect(s.phase).toBe('setup');
    const clearTick = s.tick;
    let startedAt = -1;
    for (let i = 1; i <= 600; i++) {
      tick(s);
      if (s.phase === 'wave') { startedAt = i; break; }
    }
    expect(startedAt).toBe(480);
    expect(s.tick - clearTick).toBe(480);
    expect(s.wave).toBe(2);
    clearWave(s);
    expect(s.phase).toBe('setup');
    startedAt = -1;
    for (let i = 1; i <= 600; i++) { tick(s); if (s.phase === 'wave') { startedAt = i; break; } }
    expect(startedAt).toBe(480); // wave 3 starts by itself
    clearWave(s);
    ticks(s, 2000);
    expect(s).toMatchObject({ phase: 'setup', wave: 3 }); // wave 4 is the last: waits for the player
    expect(startWave(s)).toMatchObject({ ok: true });
  });
  it('seconds are real seconds at 8, 11.5 and 15', () => {
    for (const secs of [8, 11.5, 15]) {
      const s = createGame({ level: mk({ noLoitering: secs }, { waves }) });
      startWave(s);
      let guard = 0;
      while (s.phase === 'wave' && guard++ < 10000) { tick(s); if (s.enemies.length) s.enemies[0].hp = 0; }
      const t0 = s.tick;
      while (s.phase === 'setup') tick(s);
      expect(s.tick - t0).toBe(Math.round(secs * 60));
    }
  });
  it('a pending reward holds the clock at its full value; the pick restarts nothing and loses nothing', () => {
    const s = createGame({ level: mk({ noLoitering: 8 }, { waves, rewardWaves: [1] }) });
    startWave(s);
    let guard = 0;
    while (s.phase === 'wave' && guard++ < 10000) { tick(s); if (s.enemies.length) s.enemies[0].hp = 0; }
    expect(s.pendingBoon).not.toBeNull();
    ticks(s, 10_000);
    expect(s.phase).toBe('setup');
    const held = s.autoWaveTicks;
    expect(held).toBe(480);
    pickBoon(s, s.pendingBoon!.options[0]);
    ticks(s, 479);
    expect(s.phase).toBe('setup');
    tick(s);
    expect(s.phase).toBe('wave');
  });
  it('an early call mid-wave does not leave a stale timer, and the wave it called is timed from its own clear', () => {
    const s = createGame({ level: mk({ noLoitering: 8 }, { waves: [one, one, one, one, one] }) });
    startWave(s);
    ticks(s, 1);
    expect(callNextWave(s)).toMatchObject({ ok: true });
    expect(s.autoWaveTicks).toBeUndefined();
    expect(s.wave).toBe(2);
  });
  it('Start pressed during the countdown deletes it', () => {
    const s = createGame({ level: mk({ noLoitering: 8 }, { waves }) });
    startWave(s);
    let guard = 0;
    while (s.phase === 'wave' && guard++ < 10000) { tick(s); if (s.enemies.length) s.enemies[0].hp = 0; }
    ticks(s, 100);
    expect(startWave(s)).toMatchObject({ ok: true, wave: 2 });
    expect(s.autoWaveTicks).toBeUndefined();
  });
});

describe('Rationing, by hand', () => {
  it('refuses at the cap with tower-cap even if gold is short; sell frees; upgrades and moves are free of the cap', () => {
    const s = createGame({ level: mk({ rationing: 2 }) });
    const [a, b, c, d] = buildableCells(s.map);
    expect(buildTower(s, a, 'musketeer').ok).toBe(true);
    expect(buildTower(s, b, 'cannon').ok).toBe(true);
    expect(buildTower(s, c, 'musketeer')).toEqual({ ok: false, reason: 'tower-cap' });
    s.gold = 0;
    expect(buildTower(s, c, 'musketeer')).toEqual({ ok: false, reason: 'tower-cap' });
    s.gold = 1000;
    expect(upgradeTower(s, a).ok).toBe(true);
    expect(upgradeTower(s, a, 'A').ok).toBe(true);
    expect(moveTower(s, b, d).ok).toBe(true);
    expect(sellTower(s, a).ok).toBe(true);
    expect(buildTower(s, a, 'musketeer').ok).toBe(true);
    expect(s.towersBuilt).toBe(3);
    // a wave-time build is refused too
    startWave(s);
    expect(buildTower(s, c, 'musketeer')).toEqual({ ok: false, reason: 'tower-cap' });
  });
  it('the gold cheat does not lift the cap', () => {
    const s = createGame({ level: mk({ rationing: 1 }, { startGold: 100 }) });
    const [a, b] = buildableCells(s.map);
    buildTower(s, a, 'musketeer');
    grantCheatGold(s);
    expect(s.gold).toBeGreaterThanOrEqual(CHEAT_GOLD);
    expect(buildTower(s, b, 'mortar')).toEqual({ ok: false, reason: 'tower-cap' });
  });
});

describe('stars, every combination', () => {
  const stars = (feat: LevelFeat | undefined, o: { won?: boolean; lives: number; leaks?: number; special?: boolean; built?: number; cheated?: boolean }) => {
    const s = createGame({ level: mk(undefined, { ...(feat ? { feat } : {}), startGold: 100 }) });
    Object.assign(s, { phase: o.won === false ? 'lost' : 'won', lives: o.lives, cheated: o.cheated ?? false });
    if (feat?.kind === 'noLeaks') s.leaks = o.leaks ?? 0;
    if (feat) s.towersBuilt = o.built ?? 0;
    if (o.special) s.lastSpecialTick = 99;
    return levelStars(s);
  };
  const featsList: (LevelFeat | undefined)[] = [undefined, { kind: 'noLeaks' }, { kind: 'noSpecials' }, { kind: 'maxTowers', limit: 3 }];
  it('old rule without a feat: 12 and 18 lives; with a feat: the feat decides the third', () => {
    for (const feat of featsList) for (const lives of [11, 12, 17, 18, 20]) for (const earned of [true, false]) {
      const o = feat?.kind === 'noLeaks' ? { leaks: earned ? 0 : 2 } : feat?.kind === 'noSpecials' ? { special: !earned } : feat?.kind === 'maxTowers' ? { built: earned ? 3 : 4 } : {};
      const got = stars(feat, { lives, ...o });
      const two = lives >= 12;
      const want = !two ? 1 : feat ? (earned ? 3 : 2) : lives >= 18 ? 3 : 2;
      expect(got, `${feat?.kind} lives=${lives} earned=${earned}`).toBe(want);
      expect(stars(feat, { lives, won: false, ...o })).toBe(0);
      expect(stars(feat, { lives, cheated: true, ...o })).toBe(0);
    }
  });
  it('a feat with 17 lives and the feat earned is still only two stars? (the feat needs two stars, not three-star lives)', () => {
    expect(stars({ kind: 'maxTowers', limit: 3 }, { lives: 12, built: 3 })).toBe(3);
  });
  it('maxTowers counts a refused build as nothing, a sold tower as one, an upgrade as nothing', () => {
    const s = createGame({ level: mk({ rationing: 5 }, { feat: { kind: 'maxTowers', limit: 3 }, startGold: 100000 }) });
    const [a, b, c, d] = buildableCells(s.map);
    buildTower(s, a, 'musketeer');
    buildTower(s, a, 'musketeer'); // occupied: refused
    upgradeTower(s, a); upgradeTower(s, a, 'A');
    s.gold = 1;
    buildTower(s, b, 'mortar'); // too dear: refused
    s.gold = 10000;
    buildTower(s, b, 'musketeer'); sellTower(s, b); buildTower(s, b, 'musketeer');
    expect(s.towersBuilt).toBe(3);
    buildTower(s, c, 'musketeer');
    expect(s.towersBuilt).toBe(4);
    void d;
  });
  it('noSpecials: a refused cast (no charge, bad point, locked) is not a use; a real cast is', () => {
    const level = mk(undefined, { feat: { kind: 'noSpecials' }, allowedSpecials: ['keg'] });
    const s = createGame({ level });
    startWave(s);
    expect(useSpecial(s, 'guards', { x: 0, y: 0 }).ok).toBe(false); // locked
    expect(useSpecial(s, 'keg', { x: -50, y: -50 }).ok).toBe(false);
    expect(s.lastSpecialTick).toBeUndefined();
    expect(useSpecial(s, 'keg', { x: 10, y: 10 }).ok).toBe(true);
    expect(s.lastSpecialTick).toBeDefined();
  });
});


describe('saved progress and open levels', () => {
  it('a main-format save (version 2 and version 1) loads with its stars; open levels are a prefix up to 20', () => {
    const stars = { 1: 3, 2: 3, 3: 2, 4: 1, 5: 3, 6: 2, 7: 2, 8: 1, 9: 3, 10: 2 } as const;
    const v2 = parseProgress(JSON.stringify({ v: 2, stars }));
    expect(v2).toEqual(stars);
    expect(parseProgress(JSON.stringify({ v: 1, stars: { 1: 1, 2: 2, 3: 0 } }))).toEqual({ 1: 1, 2: 2 });
    expect(parseProgress(serializeProgress(v2))).toEqual(stars);
    expect(unlockedLevel(v2, 11)).toBe(true);
    expect(unlockedLevel(v2, 12)).toBe(false);
    const nineteen: Partial<Record<number, 0 | 1 | 2 | 3>> = Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i + 1, 1]));
    expect(unlockedLevel(nineteen, 20)).toBe(true);
    expect(unlockedLevel(nineteen, 21)).toBe(false);
    expect(unlockedLevel({ 1: 3, 3: 2 }, 3)).toBe(false); // a hole is not a prefix
    expect(LEVELS.length).toBe(20);
  });
  it('a level 1-10 win keeps its old stars exactly (12 and 18 lives)', () => {
    for (const level of LEVELS.slice(0, 10)) for (const lives of [11, 12, 17, 18, 20]) {
      const s = createGame({ level });
      Object.assign(s, { phase: 'won', lives });
      expect(levelStars(s)).toBe(lives >= 18 ? 3 : lives >= 12 ? 2 : 1);
    }
  });
});

describe('determinism', () => {
  it('the same bot on a taxed level twice gives the same final state (Window Tax + Curfew, No Loitering)', () => {
    for (const id of [13, 19]) {
      const level = LEVELS[id - 1];
      const a = runBot(createGame({ level }), botGood, Infinity, 3600 * 40);
      const b = runBot(createGame({ level }), botGood, Infinity, 3600 * 40);
      expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
      expect(a.setupTicks).toBe(b.setupTicks);
    }
  }, 60_000);
});

describe('feats: a life lost and regained', () => {
  it('Stone Walls restoring lives does not hide a leak (Not a penny)', () => {
    const level = mk(undefined, { feat: { kind: 'noLeaks' }, waves: [one], startGold: 0, rewardWaves: [1] });
    const s = createGame({ level });
    startWave(s);
    let guard = 0;
    while (s.phase === 'wave' && guard++ < 20000) tick(s);
    expect(s.phase).toBe('won');
    expect(s.leaks).toBe(1);
    expect(s.lives).toBe(19);
    s.lives = 23; // Stone Walls (+4) would take it past the start
    expect(levelStars(s)).toBe(2);
  });
});
