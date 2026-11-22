// docs/DESIGN.md is the frozen spec (milestone 36): its main tables are
// parsed from the markdown and compared with the constants, so the spec and
// the code cannot drift apart. Tables: maps (waypoints, length, buildable
// cells), difficulty rows, hp per level, enemy stats, tower and upgrade
// stats, boons, specials, the campaign waves and the first endless waves.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, DIFFICULTY_DEFS, enemyMaxHp } from './difficulty';
import { BOONS } from './boons';
import { PACK_INTERVAL_TICKS, PACK_SIZE } from './combat';
import { ENEMY_STATS, isBoss } from './enemies';
import { lastSpawnTick } from './game';
import { buildableCells } from './grid';
import { MAPS, pathLength, type MapId } from './map';
import { SPECIAL_DEFS, SPECIAL_RECHARGE_TICKS, ZONE_LINGER_TICKS, type SpecialType } from './specials';
import { POLICY_CHECK_TICKS, POLICY_MIN_HITS, POLICY_POINT_SPACING } from './specialPolicy';
import { TOWER_DEFS } from './towers';
import type { EnemyType, TowerLevelStats, TowerType } from './types';
import { ENDLESS_BASE_WAVES, ENDLESS_HP_GROWTH, endlessCycle, LAST_WAVE, waveDef, WAVES } from './waves';
import { EXPECTED_MATRIX } from './balance.suite';
import { MATRIX_ARCHETYPES } from './balanceRuns';
import { TARGETS } from './balanceTargets';

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
  'Grumblefoot, the Troll King': 'boss',
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
const SPECIAL_NAMES: Record<string, SpecialType> = { 'Powder Keg': 'keg', 'Tar Barrel': 'tarBarrel', 'Fire Arrows': 'fireArrows' };
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
    expect(md).toMatch(/^# Tarpit: game design spec\n\n> \*\*Frozen as of milestone 36\.\*\*/);
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
    expect(Object.keys(rows)).toEqual(['Enemy hp', 'Start gold', 'Lives']);
    DIFFICULTIES.forEach((d, i) => {
      expect(num(rows['Enemy hp'][i].replace(/x$/, '')), d).toBe(DIFFICULTY_DEFS[d].hpMultiplier);
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
    for (const [name, hp, speed, bounty, lives, notes] of rows) {
      const s = ENEMY_STATS[ENEMY_NAMES[name]];
      expect([Number(hp), Number(speed), Number(bounty), Number(lives)], name).toEqual([s.hp, s.speed, s.bounty, s.livesCost]);
      expect(/flying/.test(notes), name).toBe(s.flying);
      expect(/shield/.test(notes), name).toBe(s.shield);
      if (s.slowCap !== undefined) expect(notes, name).toContain(`slows capped at ${s.slowCap * 100}%`);
    }
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

  it('boons: id, offer wave and effect value', () => {
    const rows = table('Boons', 'Boon');
    expect(rows.map(([, id, wave, value]) => ({ id, wave: Number(wave), value: Number(value) }))).toEqual(Object.values(BOONS));
  });

  it('specials: unlock wave, radius, damage, slow, burn, zone ticks', () => {
    const rows = table('Special attacks', 'Special');
    expect(rows.map((r) => SPECIAL_NAMES[r[0]])).toEqual(['keg', 'tarBarrel', 'fireArrows']);
    for (const [name, unlock, radius, damage, sl, burnDps, zoneTicks] of rows) {
      expect({ unlockWave: Number(unlock), radius: Number(radius), damage: opt(damage), slow: opt(sl), burnDps: opt(burnDps), zoneTicks: opt(zoneTicks) }, name).toEqual(
        SPECIAL_DEFS[SPECIAL_NAMES[name]],
      );
    }
    // The prose numbers: the recharge, the linger, the policy's look interval, threshold and spacing, the cheat.
    const flat = section('Special attacks').replace(/\s+/g, ' ');
    expect(flat).toContain(`${SPECIAL_RECHARGE_TICKS} wave ticks`);
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
      expect(Number(hp)).toBe(wave.groups.reduce((a, g) => a + g.count * ENEMY_STATS[g.type].hp, 0));
      expect(Number(bounty)).toBe(wave.groups.reduce((a, g) => a + g.count * ENEMY_STATS[g.type].bounty, 0));
      expect(last).toBe(`${lastSpawnTick(Number(n)) / 60} s`);
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
    const inDoc = new Set([...text.matchAll(/\*\*([A-Z]+\d+)\b/g)].map((m) => m[1]));
    expect([...inDoc].sort()).toEqual([...new Set(TARGETS.map((t) => t.id))].sort());
  });

  it('the endless hp line and the prose numbers the tables do not hold: cooldowns, sell refunds and campaign enemy count', () => {
    const cycles = [1, 2, 3].map((c) => ENDLESS_HP_GROWTH ** c);
    const hpLine = (['goblin', 'troll', 'harpy'] as const)
      .map((t) => `${t[0].toUpperCase()}${t.slice(1)} ${cycles.map((m) => DIFFICULTIES.map((d) => enemyMaxHp(t, d, m)).join('/')).join(', ')}`)
      .join('; ');
    expect(section('Endless mode').replace(/\s+/g, ' ')).toContain(`(Easy / Normal / Hard): ${hpLine}.`);
    expect(section('Endless mode')).toContain('(`ENDLESS_HP_GROWTH`)');
    const names = Object.entries(TOWER_NAMES) as [string, TowerType][];
    /** A section with every run of white space as one space (prose wraps). */
    const flat = (heading: string) => section(heading).replace(/\s+/g, ' ');
    expect(flat('Towers')).toContain(`(${names.map(([n, t]) => `${n} ${Math.round(60 / TOWER_DEFS[t].base.fireRate)}`).join(', ')})`);
    const refund = (t: TowerType) => Math.floor(((TOWER_DEFS[t].cost + TOWER_DEFS[t].upgradeCost) * 7) / 10);
    expect(flat('Towers')).toContain(`${names.map(([n, t]) => `${n} ${refund(t)}`).join(', ')}.`);
    expect(flat('Waves')).toContain(`waves hold ${WAVES.reduce((n, w) => n + w.groups.reduce((a, g) => a + g.count, 0), 0)} scheduled enemies.`);
  });

  it('the first endless waves: base wave, extra Harpies, enemies, hp multiplier, total hp, bounty, last spawn', () => {
    expect(section('Endless mode')).toContain(`\`${ENDLESS_HP_GROWTH} ^\n  cycle\``);
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
      expect(Number(hp)).toBe(w.groups.reduce((a, g) => a + g.count * enemyMaxHp(g.type, 'normal', w.hpMultiplier), 0));
      expect(Number(bounty)).toBe(w.groups.reduce((a, g) => a + g.count * ENEMY_STATS[g.type].bounty, 0));
      expect(last).toBe(`${lastSpawnTick(Number(n)) / 60} s`);
    }
  });
});
