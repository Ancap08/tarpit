// Verifier (milestone 41, fourth pass): can the gate fail, and does it stay free of the ten shipped ids?
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as bots from './bots';
import { CAMPAIGN_CONTEXTS } from './campaignContexts';
import { checkCampaign, checkLevel, type LevelContext } from './checkLevel';
import type { LevelDef } from './levelTypes';
import { LEVELS } from './levels';
import type { GroupDef } from './types';
import { levelStars } from './campaignProgress';
import { createGame } from './game';

// These cases run the real bots over whole levels. The slowest takes about 9 s on a Mac and
// about 37 s on the CI runner, over the suite's 30 s limit, so this file sets its own.
vi.setConfig({ testTimeout: 180_000 });

afterEach(() => vi.restoreAllMocks());
const goblins = (count: number, interval: number, delay = 0): GroupDef => ({ type: 'goblin', count, interval, delay });
const withLastWave = (level: LevelDef, groups: GroupDef[]): LevelDef => ({
  ...level, waves: [...level.waves.slice(0, -1), { groups }],
});
const late: LevelContext = { band: 'late', introduces: null };

describe('gate rejects bad candidates (real bots, scratch levels)', () => {
  it('rejects a new thing that changes nothing', () => {
    // Cannon is allowed and declared new, on a level the Musketeers and Longbows already win.
    const level: LevelDef = { ...LEVELS[0], id: 201, allowedTowers: LEVELS[1].allowedTowers };
    const result = checkLevel(level, { band: 'intro', introduces: { towers: ['cannon'] } });
    expect(result.failed).toContain('L3');
    expect(result.ok).toBe(false);
  });

  it('rejects a scratch campaign that adds the useless Cannon without declaring it', () => {
    const level: LevelDef = { ...LEVELS[0], id: 210, allowedTowers: LEVELS[1].allowedTowers };
    expect(checkCampaign([LEVELS[0], level], [CAMPAIGN_CONTEXTS[0], { band: 'intro', introduces: null }]).failed).toContain('L3');
  });

  it('rejects a new thing the level does not even allow', () => {
    const result = checkLevel({ ...LEVELS[0], id: 202 }, { band: 'intro', introduces: { towers: ['mortar'] } });
    expect(result.failed).toContain('L3');
  });

  it('rejects a last wave of one Goblin', () => {
    const result = checkLevel(withLastWave({ ...LEVELS[4], id: 203 }, [goblins(1, 1)]), CAMPAIGN_CONTEXTS[4]);
    expect(result.endingCount).toBe(1);
    expect(result.failed).toContain('L5');
  });

  it('rejects a boss level without its boss', () => {
    for (const [level, boss, context] of [[LEVELS[8], 'boss', CAMPAIGN_CONTEXTS[8]], [LEVELS[9], 'grumblemaw', CAMPAIGN_CONTEXTS[9]]] as const) {
      const groups = level.waves.at(-1)!.groups.filter(group => group.type !== boss);
      const bossless = withLastWave({ ...level, id: 204 }, groups);
      expect(bossless.endingBoss).toBe(boss);
      expect(checkLevel(bossless, context).failed).toContain('L5');
    }
  });

  it('rejects a finale whose boss is replaced by one extra Goblin and a finale with no declared boss and a tiny end', () => {
    const level = withLastWave({ ...LEVELS[9], id: 205, endingBoss: undefined }, [goblins(3, 1)]);
    expect(checkLevel(level, CAMPAIGN_CONTEXTS[9]).failed).toContain('L5');
  });

  it('rejects an opening wave of more than 60 enemies that the schedule rules allow', () => {
    const groups = Array.from({ length: 7 }, (_, i) => goblins(10, 8, i * 1.2));
    const level: LevelDef = { ...LEVELS[0], id: 206, waves: [{ groups }, ...LEVELS[0].waves.slice(1)] };
    const result = checkLevel(level, { band: 'intro', introduces: null });
    expect(result.openingCount).toBe(70);
    expect(result.scheduleIssue).toBeUndefined();
    expect(result.failed).toContain('L5');
  });

  it('rejects a level that is much easier than its late band (Beginner three-stars it)', () => {
    const result = checkLevel({ ...LEVELS[0], id: 207 }, late);
    expect(result.beginner!.stars).toBe(3);
    expect(result.failed).toContain('L2');
  });

  it('rejects a level where Person finishes far behind Good (Hold the Bend at 1.2 hp, 150 gold)', () => {
    const level: LevelDef = { ...LEVELS[6], id: 208, hpScale: 1.2, startGold: 150 };
    const result = checkLevel(level, CAMPAIGN_CONTEXTS[6]);
    expect(result.good!.lives - result.person!.lives).toBeGreaterThan(6);
    expect(result.failed).toContain('P1');
  });

  it('rejects a level Person loses (Person recorded as losing; Good wins)', () => {
    const real = bots.runBot;
    vi.spyOn(bots, 'runBot').mockImplementation((state, bot, ...rest) => {
      const run = real(state, bot, ...rest);
      if (bot === bots.botPerson && state.level?.id === 209) {
        state.lives = 0;
        state.phase = 'lost';
      }
      return run;
    });
    const result = checkLevel({ ...LEVELS[0], id: 209 }, { band: 'intro', introduces: null });
    expect(result.person!.stars).toBe(0);
    expect(result.failed).toContain('P1');
  });
});

describe('gate source is not keyed to the shipped levels', () => {
  it('checkLevel.ts and bots.ts never import or index the level table, and compare no ids', () => {
    for (const file of ['checkLevel.ts', 'bots.ts']) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from '\.\/levels'/);
      expect(source).not.toMatch(/\bLEVELS\b/);
      expect(source).not.toMatch(/\.id\s*(===|!==|==|<|>|<=|>=)\s*\d/);
      expect(source).not.toMatch(/\bid\s*(===|!==)\s*\d/);
    }
  });
});

describe('checkCampaign on other lengths', () => {
  const two = [LEVELS[2], LEVELS[9]];
  // In this shorter campaign the first stop supplies the starting kit and the second adds the rest.
  const twoContexts: LevelContext[] = [
    { ...CAMPAIGN_CONTEXTS[2], alsoIntroduces: ['wolf', 'musketeer', 'longbow', 'cannon', 'keg', 1, 2] },
    { ...CAMPAIGN_CONTEXTS[9], alsoIntroduces: ['firepot', 'mortar', 'tarBarrel', 'barricade', 'guards',
      'fireArrows', 3, 'goblin', 'troll', 'shieldbearer', 'harpy'] },
  ];

  it('accepts a one-level and a two-level campaign', () => {
    expect(checkCampaign([LEVELS[2]], [twoContexts[0]]).failed).toEqual([]);
    expect(checkCampaign(two, twoContexts).failed).toEqual([]);
  });

  it.each(['musketeer', 'keg', 2, 'wolf'] as const)('rejects an undeclared opening capability: %s', missing => {
    const context = { ...twoContexts[0], alsoIntroduces: twoContexts[0].alsoIntroduces!.filter(key => key !== missing) };
    expect(checkCampaign([LEVELS[2]], [context]).failed).toEqual(['L3']);
  });

  it('rejects a campaign that introduces the same tower twice', () => {
    const copy: LevelDef = { ...LEVELS[2], id: 301 };
    const result = checkCampaign([LEVELS[2], copy], [twoContexts[0], CAMPAIGN_CONTEXTS[2]]);
    expect(result.failed).toContain('L3');
  });

  it('rejects a campaign whose difficulty is flat', () => {
    const flat = [LEVELS[2], { ...LEVELS[2], id: 302 }, { ...LEVELS[2], id: 303 }];
    const none: LevelContext = { band: 'intro', introduces: null };
    const result = checkCampaign(flat, [CAMPAIGN_CONTEXTS[2], none, none]);
    expect(result.meanLivesDrop).toBe(0);
    expect(result.failed).toContain('L8');
  });

  it('rejects mismatched contexts, an empty list and duplicate ids', () => {
    expect(checkCampaign(LEVELS, CAMPAIGN_CONTEXTS.slice(1)).ok).toBe(false);
    expect(checkCampaign([], []).ok).toBe(false);
    expect(checkCampaign([LEVELS[2], LEVELS[2]], [CAMPAIGN_CONTEXTS[2], { band: 'intro', introduces: null }]).failed).toContain('L7');
  });
});

describe('Stand Fast keeps its two-star margin', () => {
  it('keeps two stars for Good at both HP and starting gold margins', () => {
    const level = LEVELS[7];
    for (const variant of [{ hpScale: level.hpScale * 0.98 }, { hpScale: level.hpScale * 1.02 },
      { startGold: level.startGold - 10 }, { startGold: level.startGold + 10 }]) {
      expect(levelStars(bots.runBot(createGame({ level: { ...level, ...variant } }), bots.botGood).state)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('recheck: L1m, undeclared first appearances, the changed fixture', () => {
  it('L1m is a real rule: the pre-fix Stand Fast data (gold 285, hp 1.3) fails only L1m', () => {
    const old: LevelDef = { ...LEVELS[7], id: 401, startGold: 285, hpScale: 1.3 };
    expect(checkLevel(old, CAMPAIGN_CONTEXTS[7]).failed).toEqual(['L1m']);
  });

  it('the ten levels pass every label, campaign and each level alone', () => {
    expect(checkCampaign(LEVELS, CAMPAIGN_CONTEXTS).failed).toEqual([]);
  });

  it.each([
    [0, 'musketeer'], [0, 'keg'], [0, 2], [0, 'goblin'], [2, 'wolf'], [3, 'shieldbearer'], [4, 'tarBarrel'], [5, 'troll'], [8, 'boss'],
  ] as const)('rejects the ten levels when context %i leaves out %s', (index, missing) => {
    const contexts = CAMPAIGN_CONTEXTS.map((context, i) => i === index
      ? { ...context, alsoIntroduces: context.alsoIntroduces!.filter(key => key !== missing) } : context);
    expect(checkCampaign(LEVELS, contexts).failed).toContain('L3');
  });

  it('the old twelve-level fixture (five extra Trolls, full gold) now fails L1m: the fixture changed, not the rule', () => {
    const lastLight = LEVELS[9];
    const heavy: LevelDef = { ...lastLight, id: 12, waves: lastLight.waves.map((w, i) => {
      if (i === 0) return { groups: w.groups.map(g => ({ ...g, interval: g.interval * 0.85 })) };
      return i === 3 ? { groups: w.groups.map((g, j) => j === 0 ? { ...g, count: g.count + 5 } : g) } : w;
    }) };
    expect(checkLevel(heavy, { band: 'finale', introduces: null }).failed).toContain('L1m');
  });
});
