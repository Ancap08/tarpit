// docs/DESIGN.md is the frozen spec (milestone 36): its main tables are
// parsed from the markdown and compared with the constants, so the spec and
// the code cannot drift apart. Tables: maps (waypoints, length, buildable
// cells), difficulty rows, hp per level, enemy stats, tower and upgrade
// stats, boons, specials, the campaign waves and the first endless waves.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACT_TWO_HP_GROWTH, DIFFICULTIES, DIFFICULTY_DEFS, campaignHpFactor, enemyMaxHp } from './difficulty';
import { BARRICADE_END_EXCLUSION, BARRICADE_HP, BARRICADE_SNAP_RADIUS, GUARD_COUNT, GUARD_HP, GUARD_ATTACK_DPS, GUARD_LIFETIME_TICKS, GUARD_SPACING } from './blockers';
import { BOONS } from './boons';
import { PACK_INTERVAL_TICKS, PACK_SIZE } from './combat';
import { ENEMY_STATS, isBoss } from './enemies';
import { FEATHERS } from './feathers';
import { createGame, lastSpawnTick } from './game';
import { buildableCells } from './grid';
import { LEVELS } from './levels';
import { CAMPAIGN_START_LIVES, TWO_STAR_LIVES, THREE_STAR_LIVES } from './levelTypes';
import { BAND_RULES, GATE_LIMITS, TAX_RANGES } from './checkLevel';
import { botGood, botPerson, botBeginner, botGoodFeat, runBot } from './bots';
import { levelStars } from './campaignProgress';
import { MAPS, pathLength, type MapId } from './map';
import { BARREL_RECHARGE_TICKS, SPECIAL_DEFS, SPECIAL_RECHARGE_TICKS, ZONE_LINGER_TICKS, type SpecialType } from './specials';
import { POLICY_CHECK_TICKS, POLICY_MIN_HITS, POLICY_POINT_SPACING } from './specialPolicy';
import { TOWER_DEFS, TOWER_PATHS } from './towers';
import type { EnemyType, TowerLevelStats, TowerType } from './types';
import { ENDLESS_BASE_WAVES, ENDLESS_HP_GROWTH, ENDLESS_START_HP, endlessCycle, LAST_WAVE, waveDef, WAVES } from './waves';
import { EXPECTED_MATRIX } from './balance.suite';
import { MATRIX_ARCHETYPES } from './balanceRuns';
import { TARGETS } from './balanceTargets';

// This spec alone compares documentation with both the UI and the simulation.
// eslint-disable-next-line no-restricted-imports
import { LEVEL_NAMES, MAP_NAMES as MAP_LABELS, PATH_NAMES, pathDescription } from '../game/names';
// eslint-disable-next-line no-restricted-imports
import { PATH_MARKS } from '../game/draw/towers';

const md = readFileSync(new URL('../../docs/DESIGN.md', import.meta.url), 'utf8');

/** The body of the `## heading` section, up to the next `## `. */
function section(heading: string): string {
  const start = md.indexOf(`\n## ${heading}\n`);
  if (start < 0) throw new Error(`DESIGN.md has no section "${heading}"`);
  const end = md.indexOf('\n## ', start + 4);
  return md.slice(start, end < 0 ? undefined : end);
}

/**
 * The rows (cells trimmed, header and separator dropped) of the `nth`
 * table in `heading` whose header row starts with `first`.
 */
function table(heading: string, first: string, nth = 0): string[][] {
  const lines = section(heading).split('\n');
  const head = first === '' ? '| |' : `| ${first} |`;
  const at = lines.map((l, i) => (l.startsWith(head) ? i : -1)).filter((i) => i >= 0)[nth];
  if (at === undefined) throw new Error(`no table ${nth} starting "${head}" in "${heading}"`);
  const rows: string[][] = [];
  for (const line of lines.slice(at + 2)) {
    if (!line.startsWith('|')) break;
    rows.push(line.slice(1, -1).split('|').map((c) => c.trim()));
  }
  return rows;
}

const ENEMY_NAMES: Record<string, EnemyType> = {
  Goblin: 'goblin',
  Wolf: 'wolf',
  Troll: 'troll',
  Harpy: 'harpy',
  Shieldbearer: 'shieldbearer',
  'Assessor Grumblefoot': 'boss',
  'Grumblefoot (boss)': 'boss',
  Grumblemaw: 'grumblemaw',
  'Grumblemaw (boss)': 'grumblemaw',
};
const TOWER_NAMES: Record<string, TowerType> = {
  Musketeer: 'musketeer',
  Cannon: 'cannon',
  'Tar Pit': 'tarpit',
  Longbow: 'longbow',
  Mortar: 'mortar',
  'Fire Pot': 'firepot',
};
const SPECIAL_NAMES: Record<string, SpecialType> = { 'Powder Keg': 'keg', Barricade: 'barricade', Guards: 'guards', 'Tar Barrel': 'tarBarrel', 'Fire Arrows': 'fireArrows' };
const MAP_NAMES: Record<string, MapId> = { Meadow: 'meadow', Switchback: 'switchback', Riverbend: 'riverbend' };

/** "1/3" or "2.5" as a number. */
const num = (s: string): number => {
  const [a, b] = s.split('/');
  return b === undefined ? Number(a) : Number(a) / Number(b);
};
/** "-" as 0, else the number. */
const opt = (s: string): number => (s === '-' ? 0 : num(s));
/** "40% for 2 s" as [0.4, 2]; "-" as [0, 0]. */
const slow = (s: string): [number, number] => {
  if (s === '-') return [0, 0];
  const m = /^(\d+)% for ([\d.]+) s$/.exec(s);
  if (!m) throw new Error(`slow "${s}"`);
  return [Number(m[1]) / 100, Number(m[2])];
};
/** "5/s for 3 s" as [5, 3]; "-" as [0, 0]. */
const burn = (s: string): [number, number] => {
  if (s === '-') return [0, 0];
  const m = /^(\d+)\/s for ([\d.]+) s$/.exec(s);
  if (!m) throw new Error(`burn "${s}"`);
  return [Number(m[1]), Number(m[2])];
};

describe('docs/DESIGN.md matches the code', () => {
  it('has the frozen banner', () => {
    expect(md).toMatch(/^# Tarpit: game design spec\n\n> \*\*Frozen as of milestone 42\.\*\*/);
  });

  it('uses one starting life count and star rule across the campaign', () => {
    expect(table('Levels and campaign', 'Starting lives')).toEqual([
      [CAMPAIGN_START_LIVES, TWO_STAR_LIVES, THREE_STAR_LIVES].map(String),
    ]);
  });

  it('matches campaign difficulty bands and gate limits', () => {
    expect(table('Levels and campaign', 'Band')).toEqual(Object.entries(BAND_RULES)
      .map(([band, [good, person, floor, cap, noSpecials]]) =>
        [band, good, person, floor, cap, noSpecials ? 'yes' : 'no'].map(String)));
    const limits = GATE_LIMITS;
    expect(table('Levels and campaign', 'Gate measure').map(row => row[1])).toEqual([
      limits.levelMinutes, limits.averageMinutes, limits.waveCount, limits.hpScale, limits.startGold,
      limits.finaleLives, limits.lastSpawnSeconds, limits.peakAlive, limits.openingCount, limits.closingCount,
      limits.maxPersonDeficit, limits.goodFeatureLives, limits.personFeatureLives, limits.meanLivesDrop,
      limits.featureHp, limits.featureGold, limits.sensitivityHp, limits.sensitivityGold, limits.taxBiteLives,
      limits.featSpecialLives, limits.featExtraBuilds, limits.singleTowerMaxStars, limits.twoStarHeadroom,
      limits.priorStops, limits.actMeanDrop, limits.maxPersonCliff, limits.maxFeatherAdvantage,
    ].map(value => Array.isArray(value) ? value.join('–') : String(value)));
  });

  it('lists exactly the campaign stops in order', () => {
    expect(table('Levels and campaign', 'ID').map(row => Number(row[0]))).toEqual(LEVELS.map(level => level.id));
  });

  it('matches the Act Two wave groups listed for the feather-barrel retune', () => {
    const rows = table('Levels and campaign', 'Level');
    expect(rows).toHaveLength(9);
    for (const [id, wave, group, enemy, count, interval] of rows) {
      const level = LEVELS[Number(id) - 1];
      expect(level.featherBarrels).toBe(true);
      expect(level.waves[Number(wave) - 1].groups[Number(group) - 1],
        `level ${id}, wave ${wave}, group ${group}`).toMatchObject({
        type: ENEMY_NAMES[enemy], count: Number(count), interval: Number(interval),
      });
    }
  });

  it.each(LEVELS)('campaign level $id matches its printed rules and measured outcomes', level => {
    const row = table('Levels and campaign', 'ID').find(row => Number(row[0]) === level.id);
    const [good, person, beginner] = [botGood, botPerson, botBeginner].map(bot => runBot(createGame({ level }), bot));
    expect(row).toEqual([level.id, LEVEL_NAMES[level.id].name, MAP_LABELS[level.map], level.waves.length, good.state.nextEnemyId,
      level.startGold, level.hpScale, level.hpGrowthStart ?? '—', level.maxTowerLevel,
      level.rewardWaves.join(', ') || '—',
      `${levelStars(good.state)}/${good.state.lives}`, `${levelStars(person.state)}/${person.state.lives}`,
      `${levelStars(beginner.state)}/${Math.max(0, beginner.state.lives)}`,
      ((good.state.tick - good.setupTicks) / 3600).toFixed(2), good.peakAlive,
      level.waves[0].groups.reduce((sum, group) => sum + group.count, 0)].map(String));
  });

  it('guards the tuning ranges and every tax, feat and deliberate third star', () => {
    const { windowTax, forcedMarch, curfew, noLoitering } = TAX_RANGES;
    expect(table('Levels and campaign', 'Tunable rate or delay').map(row => row.slice(1).map(Number)))
      .toEqual([windowTax, forcedMarch, curfew, noLoitering]);
    expect(table('Levels and campaign', 'Stop')).toEqual(LEVELS.slice(10).map(level => {
      const t = level.taxes!;
      const feat = level.feat!;
      const { state } = runBot(createGame({ level }), botGoodFeat);
      return [level.id, t.windowTax, t.frozenPurse, t.forcedMarch, t.curfew, t.noLoitering, t.rationing,
        feat.kind, feat.kind === 'maxTowers' ? feat.limit : undefined, `${levelStars(state)}/${state.lives}`]
        .map(value => String(value ?? '—'));
    }));
  });

  it('maps: waypoints, path length and buildable cells', () => {
    const rows = table('Maps', 'Map');
    expect(rows.map((r) => MAP_NAMES[r[0]])).toEqual(['meadow', 'switchback', 'riverbend']);
    for (const [name, waypoints, length, buildable] of rows) {
      const map = MAPS[MAP_NAMES[name]];
      const points = [...waypoints.matchAll(/\((\d+),(\d+)\)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
      expect(points, name).toEqual(map.path);
      expect(Number(length), name).toBe(pathLength(map));
      expect(Number(buildable), name).toBe(buildableCells(map).filter(Boolean).length);
    }
  });

  it('difficulty rows: hp multiplier, start gold, lives', () => {
    const rows = Object.fromEntries(table('Difficulty', '').map((r) => [r[0], r.slice(1)]));
    expect(Object.keys(rows)).toEqual(['Enemy hp', 'Added HP per act-2 wave', 'Start gold', 'Lives']);
    DIFFICULTIES.forEach((d, i) => {
      expect(num(rows['Enemy hp'][i].replace(/x$/, '')), d).toBe(DIFFICULTY_DEFS[d].hpMultiplier);
      expect(Number.parseFloat(rows['Added HP per act-2 wave'][i]) / 100, d).toBe(ACT_TWO_HP_GROWTH[d]);
      expect(Number(rows['Start gold'][i]), d).toBe(DIFFICULTY_DEFS[d].startGold);
      expect(Number(rows.Lives[i]), d).toBe(DIFFICULTY_DEFS[d].startLives);
    });
  });

  it('hp per enemy and level', () => {
    const rows = table('Difficulty', 'Enemy');
    expect(rows.map((r) => ENEMY_NAMES[r[0]]).sort()).toEqual(Object.keys(ENEMY_STATS).sort());
    for (const [name, ...hp] of rows) expect(hp.map(Number), name).toEqual(DIFFICULTIES.map((d) => enemyMaxHp(ENEMY_NAMES[name], d)));
  });

  it('enemy stats: hp, speed, bounty, lives cost, flying and shield', () => {
    const rows = table('Enemies', 'Type');
    expect(rows.map((r) => ENEMY_NAMES[r[0]]).sort()).toEqual(Object.keys(ENEMY_STATS).sort());
    for (const [name, hp, speed, bounty, lives, dps, notes] of rows) {
      const s = ENEMY_STATS[ENEMY_NAMES[name]];
      expect([Number(hp), Number(speed), Number(bounty), Number(lives)], name).toEqual([s.hp, s.speed, s.bounty, s.livesCost]);
      expect(Number(dps), name).toBe(s.blockerDps);
      expect(/flying/.test(notes), name).toBe(s.flying);
      expect(/shield/.test(notes), name).toBe(s.shield);
      if (s.slowCap !== undefined) expect(notes, name).toContain(`slows capped at ${s.slowCap * 100}%`);
    }
  });

  it('feathers: run and flinch durations', () => {
    expect(table('Enemies', 'Tower run ticks')).toEqual([
      [FEATHERS.runTicks, FEATHERS.barrelRunTicks, FEATHERS.flinchTicks].map(String),
    ]);
  });

  it('Grumblemaw packs: size and spawn interval', () => {
    const enemies = section('Enemies').replace(/\s+/g, ' ');
    expect(enemies).toContain(`schedules ${PACK_SIZE} Wolves`);
    expect(enemies).toContain(`the rest every ${PACK_INTERVAL_TICKS} ticks`);
  });

  const level = (stats: TowerLevelStats) => ({
    range: stats.range,
    damage: stats.damage,
    splash: stats.splashRadius,
    slow: [stats.slow, stats.slowDuration],
    burn: [stats.burnDps, stats.burnDuration],
  });

  it('tower stats: cost, range, minimum range, damage, fire rate, splash, slow, burn', () => {
    const rows = table('Towers', 'Tower');
    expect(rows.map((r) => TOWER_NAMES[r[0]]).sort()).toEqual(Object.keys(TOWER_DEFS).sort());
    for (const [name, cost, range, minRange, damage, rate, splash, sl, bu] of rows) {
      const def = TOWER_DEFS[TOWER_NAMES[name]];
      expect(Number(cost), name).toBe(def.cost);
      expect(opt(minRange), name).toBe(def.base.minRange);
      expect(num(rate), name).toBeCloseTo(def.base.fireRate, 12);
      expect({ range: Number(range), damage: Number(damage), splash: opt(splash), slow: slow(sl), burn: burn(bu) }, name).toEqual(level(def.base));
    }
  });

  it('upgrades: cost, range, damage, splash, slow, burn (fire rate and minimum range unchanged)', () => {
    const rows = table('Towers', 'Tower', 1);
    expect(rows.map((r) => TOWER_NAMES[r[0]]).sort()).toEqual(Object.keys(TOWER_DEFS).sort());
    for (const [name, cost, range, damage, splash, sl, bu] of rows) {
      const def = TOWER_DEFS[TOWER_NAMES[name]];
      expect(Number(cost), name).toBe(def.upgradeCost);
      expect([def.upgraded.fireRate, def.upgraded.minRange], name).toEqual([def.base.fireRate, def.base.minRange]);
      expect({ range: Number(range), damage: Number(damage), splash: opt(splash), slow: slow(sl), burn: burn(bu) }, name).toEqual(level(def.upgraded));
    }
  });

  it('paths: both complete stat rows and prices for every level 3 tower', () => {
    const rows = table('Towers', 'Tower', 2);
    expect(rows.map(([name, path]) => `${TOWER_NAMES[name]}:${path}`).sort()).toEqual(
      Object.keys(TOWER_PATHS).flatMap((type) => [`${type}:A`, `${type}:B`]).sort(),
    );
    for (const [name, path, , cost, range, minRange, damage, rate, splash, sl, bu] of rows) {
      if (path !== 'A' && path !== 'B') throw new Error(`unknown path "${path}"`);
      const def = TOWER_PATHS[TOWER_NAMES[name]];
      const stats = def[path];
      const label = `${name} ${path}`;
      expect(Number(cost), label).toBe(def.cost);
      expect(opt(minRange), label).toBe(stats.minRange);
      expect(num(rate), label).toBe(stats.fireRate);
      expect({ range: Number(range), damage: Number(damage), splash: opt(splash), slow: slow(sl), burn: burn(bu) }, label).toEqual(level(stats));
    }
  });

  it('upgrade panels: all twelve labels and both path marks', () => {
    const paths = ['A', 'B'] as const;
    const types = Object.keys(TOWER_PATHS) as TowerType[];
    expect(table('Towers', 'Path name')).toEqual(types.flatMap((type) => paths.map((path) => [
      PATH_NAMES[type][path], pathDescription(type, path),
    ])));
    expect(table('Towers', 'Path mark')).toEqual(paths.map((path) => {
      const { shape, color } = PATH_MARKS[path];
      return [path, shape, `#${color.toString(16).padStart(6, '0')}`];
    }));
    expect(section('Towers').replace(/\s+/g, ' ')).toContain(
      `${PATH_MARKS.centerX} map px right and ${-PATH_MARKS.centerY} px above its centre`,
    );
  });

  it('boons: id, offer wave and effect value', () => {
    const rows = table('Boons', 'Boon');
    expect(rows.map(([, id, wave, value]) => ({ id, wave: Number(wave), value: Number(value) }))).toEqual(Object.values(BOONS));
  });

  it('specials: unlock wave, radius, damage, slow, burn, zone ticks', () => {
    const rows = table('Special attacks', 'Special');
    expect(rows.map((r) => SPECIAL_NAMES[r[0]])).toEqual(['keg', 'barricade', 'tarBarrel', 'guards', 'fireArrows']);
    for (const [name, unlock, radius, damage, sl, burnDps, zoneTicks] of rows) {
      expect({ unlockWave: Number(unlock), radius: Number(radius), damage: opt(damage), slow: opt(sl), burnDps: opt(burnDps), zoneTicks: opt(zoneTicks) }, name).toEqual(
        SPECIAL_DEFS[SPECIAL_NAMES[name]],
      );
    }
    expect(table('Special attacks', 'Blocker')).toEqual([
      ['Barricade', String(BARRICADE_HP), String(BARRICADE_SNAP_RADIUS), String(BARRICADE_END_EXCLUSION)],
    ]);
    expect(table('Special attacks', 'Squad')).toEqual([
      ['Guards', ...[GUARD_COUNT, GUARD_HP, GUARD_ATTACK_DPS, GUARD_LIFETIME_TICKS, GUARD_SPACING].map(String)],
    ]);
    // The prose numbers: the recharge, the linger, the policy's look interval, threshold and spacing, the cheat.
    const flat = section('Special attacks').replace(/\s+/g, ' ');
    expect(flat).toContain(`The squad spans ${(GUARD_COUNT - 1) * GUARD_SPACING} trail px.`);
    expect(flat).toContain(`The shared ${BARRICADE_END_EXCLUSION} px cave clearance`);
    expect(flat).toContain('Shields do not reduce guard damage.');
    expect(flat).toContain(`${SPECIAL_RECHARGE_TICKS} wave ticks`);
    expect(flat).toContain(`${BARREL_RECHARGE_TICKS} wave ticks`);
    expect(flat).toContain(`${Math.round(SPECIAL_RECHARGE_TICKS * BOONS.quickHands.value)} ticks (11.4 s)`);
    expect(flat).toContain(`${ZONE_LINGER_TICKS} ticks after`);
    const arche = section('Archetypes').replace(/\s+/g, ' ');
    expect(arche).toContain(`every ${POLICY_CHECK_TICKS} wave ticks`);
    expect(arche).toContain(`at least ${POLICY_MIN_HITS} enemies`);
    expect(arche).toContain(`every ${POLICY_POINT_SPACING} px along the path`);
  });

  it('the twenty waves: every group, enemies, total hp, bounty and last spawn', () => {
    const rows = table('Waves', 'Wave');
    expect(rows.map((r) => Number(r[0]))).toEqual(WAVES.map((_, i) => i + 1));
    for (const [n, groups, enemies, hp, bounty, last] of rows) {
      const wave = WAVES[Number(n) - 1];
      const parsed = groups.split('; ').map((g) => {
        const m = /^(\d+) ([A-Za-z ,()]+?)(?: every ([\d.]+) s)?(?:, delay ([\d.]+) s)?$/.exec(g);
        if (!m) throw new Error(`wave ${n} group "${g}"`);
        return { type: ENEMY_NAMES[m[2]], count: Number(m[1]), interval: Number(m[3] ?? 0), delay: Number(m[4] ?? 0) };
      });
      expect(parsed, `wave ${n}`).toEqual(wave.groups.map((g) => ({ type: g.type, count: g.count, interval: g.interval, delay: g.delay })));
      expect(Number(enemies)).toBe(wave.groups.reduce((a, g) => a + g.count, 0));
      expect(Number(hp)).toBe(wave.groups.reduce((a, g) => a + g.count * enemyMaxHp(g.type, 'normal', campaignHpFactor(Number(n), 'normal')), 0));
      expect(Number(bounty)).toBe(wave.groups.reduce((a, g) => a + g.count * ENEMY_STATS[g.type].bounty, 0));
      expect(last).toBe(`${Number((lastSpawnTick(Number(n)) / 60).toFixed(3))} s`);
    }
  });

  // Verifier (milestone 28): the measured matrix and the target list were not guarded.
  it('measured matrix: every cell is the result the balance suite pins (EXPECTED_MATRIX)', () => {
    const lines = section('Measured matrix').split('\n');
    const head = lines.find((l) => l.startsWith('| Archetype |'))!;
    const columns = head.slice(1, -1).split('|').map((c) => c.trim().toLowerCase()).slice(1);
    expect(columns).toEqual(['meadow', 'switchback', 'riverbend'].flatMap((m) => DIFFICULTIES.map((d) => `${m} ${d}`)));
    const rows = table('Measured matrix', 'Archetype');
    expect(rows.map((r) => r[0])).toEqual([...MATRIX_ARCHETYPES]);
    for (const [name, ...cells] of rows) {
      const want = EXPECTED_MATRIX[name as keyof typeof EXPECTED_MATRIX] as Record<string, string | undefined>;
      expect(cells, name).toEqual(columns.map((c) => want[c]?.split(',')[0] ?? '-'));
    }
  });

  it('balance targets: every target label the suite asserts is in the spec, and no other', () => {
    const text = section('Balance targets') + section('Waves');
    const inDoc = new Set([...text.matchAll(/\*\*([A-Z]+\d+[a-z]?)\b/g)].map((m) => m[1]));
    const separateChecks = ['N10c', 'N10d', 'P1', 'P2', 'P3', 'P4', 'K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'];
    expect([...inDoc].sort()).toEqual([...new Set([...TARGETS.map((t) => t.id), ...separateChecks])].sort());
  });

  it('the endless hp line and the prose numbers the tables do not hold: cooldowns, sell refunds and campaign enemy count', () => {
    const cycles = [0, 1, 2].map((completedCycles) => ENDLESS_START_HP * ENDLESS_HP_GROWTH ** completedCycles);
    const hpLine = (['goblin', 'troll', 'harpy'] as const)
      .map((t) => `${t[0].toUpperCase()}${t.slice(1)} ${cycles.map((m) => DIFFICULTIES.map((d) => enemyMaxHp(t, d, campaignHpFactor(LAST_WAVE, d) * m)).join('/')).join(', ')}`)
      .join('; ');
    expect(section('Endless mode').replace(/\s+/g, ' ')).toContain(`(Easy / Normal / Hard): ${hpLine}.`);
    expect(section('Endless mode')).toContain('`ENDLESS_START_HP`, then `ENDLESS_HP_GROWTH`');
    const names = Object.entries(TOWER_NAMES) as [string, TowerType][];
    /** A section with every run of white space as one space (prose wraps). */
    const flat = (heading: string) => section(heading).replace(/\s+/g, ' ');
    expect(flat('Towers')).toContain(`(${names.map(([n, t]) => `${n} ${Math.round(60 / TOWER_DEFS[t].base.fireRate)}`).join(', ')})`);
    const lockedRefunds = (withPath: boolean) => {
      const gold = names.map(([, type]) => {
        const { cost, upgradeCost } = TOWER_DEFS[type];
        const total = cost + upgradeCost + (withPath ? TOWER_PATHS[type].cost : 0);
        return Math.floor((total * 7) / 10);
      });
      return `${gold.slice(0, -1).join(', ')} and ${gold.at(-1)} gold.`;
    };
    expect(flat('Towers')).toContain(`sell for ${lockedRefunds(false)}`);
    expect(flat('Towers')).toContain(`At level 3 their locked refunds are ${lockedRefunds(true)}`);
    expect(flat('Waves')).toContain(`waves hold ${WAVES.reduce((n, w) => n + w.groups.reduce((a, g) => a + g.count, 0), 0)} scheduled enemies.`);
  });

  it('the first endless waves: base wave, extra Harpies, enemies, hp multiplier, total hp, bounty, last spawn', () => {
    expect(section('Endless mode')).toContain(`\`${ENDLESS_START_HP} x ${ENDLESS_HP_GROWTH} ^ (cycle - 1)\``);
    const rows = table('Endless mode', 'Wave');
    expect(rows.map((r) => Number(r[0]))).toEqual(Array.from({ length: 6 }, (_, i) => LAST_WAVE + 1 + i));
    for (const [n, cycle, base, extra, enemies, mult, hp, bounty, last] of rows) {
      const w = waveDef(Number(n));
      const harpies = w.groups[w.groups.length - 1];
      expect(Number(cycle), n).toBe(endlessCycle(Number(n)));
      expect(Number(base), n).toBe(ENDLESS_BASE_WAVES[(Number(n) - LAST_WAVE - 1) % ENDLESS_BASE_WAVES.length]);
      expect(extra, n).toBe(`${harpies.count} from ${Number(harpies.delay.toFixed(8))} s`);
      expect(w.groups.slice(0, -1), n).toEqual(WAVES[Number(base) - 1].groups.filter((g) => !isBoss(g)));
      expect(Number(enemies)).toBe(w.groups.reduce((a, g) => a + g.count, 0));
      expect(Number(mult)).toBe(Math.round(w.hpMultiplier! * 100) / 100);
      expect(Number(hp)).toBe(w.groups.reduce((a, g) => a + g.count * enemyMaxHp(g.type, 'normal', campaignHpFactor(LAST_WAVE, 'normal') * w.hpMultiplier!), 0));
      expect(Number(bounty)).toBe(w.groups.reduce((a, g) => a + g.count * ENEMY_STATS[g.type].bounty, 0));
      expect(last).toBe(`${Number((lastSpawnTick(Number(n)) / 60).toFixed(3))} s`);
    }
  });
});
