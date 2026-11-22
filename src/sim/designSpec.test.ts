// docs/DESIGN.md is the frozen spec (milestone 28): its main tables are
// parsed from the markdown and compared with the constants, so the spec and
// the code cannot drift apart. Tables: maps (waypoints, length, buildable
// cells), difficulty rows, hp per level, enemy stats, tower and upgrade
// stats, specials, the ten waves and the first endless waves.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, DIFFICULTY_DEFS, enemyMaxHp } from './difficulty';
import { ENEMY_STATS } from './enemies';
import { lastSpawnTick } from './game';
import { buildableCells } from './grid';
import { MAPS, pathLength, type MapId } from './map';
import { SPECIAL_DEFS, type SpecialType } from './specials';
import { TOWER_DEFS } from './towers';
import type { EnemyType, TowerLevelStats, TowerType } from './types';
import { ENDLESS_HP_GROWTH, waveDef, WAVES } from './waves';

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
    expect(md).toMatch(/^# Tarpit: game design spec\n\n> \*\*Frozen as of milestone 28\.\*\*/);
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

  it('specials: unlock wave, radius, damage, slow, burn', () => {
    const rows = table('Special attacks', 'Special');
    expect(rows.map((r) => SPECIAL_NAMES[r[0]])).toEqual(['keg', 'tarBarrel', 'fireArrows']);
    for (const [name, unlock, radius, damage, sl, slowTicks, burnDps, burnTicks] of rows) {
      expect(
        { unlockWave: Number(unlock), radius: Number(radius), damage: opt(damage), slow: opt(sl), slowTicks: opt(slowTicks), burnDps: opt(burnDps), burnTicks: opt(burnTicks) },
        name,
      ).toEqual(SPECIAL_DEFS[SPECIAL_NAMES[name]]);
    }
  });

  it('the ten waves: every group, enemies, total hp, bounty and last spawn', () => {
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

  it('the first endless waves: base wave, extra Harpies, enemies, hp multiplier, total hp, bounty, last spawn', () => {
    expect(section('Endless mode')).toContain(`\`${ENDLESS_HP_GROWTH} ^\n  cycle\``);
    const rows = table('Endless mode', 'Wave');
    expect(rows.map((r) => Number(r[0]))).toEqual([11, 12, 13, 14, 15, 16]);
    for (const [n, cycle, base, extra, enemies, mult, hp, bounty, last] of rows) {
      const w = waveDef(Number(n));
      const harpies = w.groups[w.groups.length - 1];
      expect([Number(cycle), extra], n).toEqual([Math.floor((Number(n) - 11) / 3) + 1, `${harpies.count} from ${harpies.delay} s`]);
      expect(w.groups.slice(0, -1), n).toEqual(WAVES[Number(base) - 1].groups.filter((g) => g.type !== 'boss'));
      expect(Number(enemies)).toBe(w.groups.reduce((a, g) => a + g.count, 0));
      expect(Number(mult)).toBe(Math.round(w.hpMultiplier! * 100) / 100);
      expect(Number(hp)).toBe(w.groups.reduce((a, g) => a + g.count * enemyMaxHp(g.type, 'normal', w.hpMultiplier), 0));
      expect(Number(bounty)).toBe(w.groups.reduce((a, g) => a + g.count * ENEMY_STATS[g.type].bounty, 0));
      expect(last).toBe(`${lastSpawnTick(Number(n)) / 60} s`);
    }
  });
});
