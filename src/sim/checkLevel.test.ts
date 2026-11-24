import { afterEach, describe, expect, it, vi } from 'vitest';
import * as bots from './bots';
import { CAMPAIGN_CONTEXTS } from './campaignContexts';
import { checkCampaign, checkLevel, type LevelContext } from './checkLevel';
import type { LevelDef } from './levelTypes';
import { LEVELS } from './levels';

const base: LevelDef = {
  id: 101, map: 'meadow', startGold: 100, hpScale: 1, hpGrowthStart: null,
  allowedTowers: ['musketeer', 'longbow'], maxTowerLevel: 2, allowedSpecials: ['keg'], rewardWaves: [],
  waves: Array.from({ length: 6 }, () => ({ groups: [{ type: 'goblin', count: 24, interval: 2.5, delay: 0 }] })),
};
const intro: LevelContext = { band: 'intro', introduces: null };
const late: LevelContext = { band: 'late', introduces: null };
const fresh = (id = 101): LevelDef => ({ ...base, id });
afterEach(() => vi.restoreAllMocks());

/** Boundary tests use recorded outcomes. Shipped and additional levels run the actual bots. */
function stubBots(livesFor: (level: LevelDef, policy: bots.BotPolicy) => number, minutes = 6, peakAlive = 1, waveOneLives = 20): void {
  vi.spyOn(bots, 'runBot').mockImplementation((state, bot) => {
    state.lives = livesFor(state.level!, bot);
    state.phase = state.lives > 0 ? 'won' : 'lost';
    state.tick = minutes * 3600;
    return { state, log: [], refused: 0, setupTicks: 0, peakAlive, waveOneLives };
  });
}

describe('campaign acceptance gate', () => {
  it.each(LEVELS.map((level, i) => ({ level, context: CAMPAIGN_CONTEXTS[i], id: level.id })))(
    'accepts shipped level $id', ({ level, context }) => {
      expect(checkLevel(level, context).failed).toEqual([]);
    }, 60_000,
  );

  it('accepts the combined duration and slope of the campaign', () => {
    const result = checkCampaign(LEVELS, CAMPAIGN_CONTEXTS);
    expect(result.failed).toEqual([]);
    const horde = result.levels[6].good!;
    for (const [i, row] of result.levels.slice(0, 10).entries()) {
      if (i !== 6) expect(horde.spawned).toBeGreaterThan(row.good!.spawned);
    }
  });

  it('rechecks the historical twelve-level candidates against the new margins', () => {
    const standFast = LEVELS[7];
    const lastLight = LEVELS[9];
    function reinforce(wave: LevelDef['waves'][number], extra: number) {
      return { groups: wave.groups.map((g, i) => i === 0 ? { ...g, count: g.count + extra } : g) };
    }
    // The Switchback rematch adds a Shieldbearer to the second wave's formation.
    const extraLate = { ...standFast, id: 11, waves: standFast.waves.map((w, i) => i === 1 ? reinforce(w, 1) : w) };
    // The Meadow finale tightens the opening cadence and adds two mid-level Trolls with ten less starting gold.
    const extraFinale = { ...lastLight, id: 12, startGold: lastLight.startGold - 10, waves: lastLight.waves.map((w, i) => {
      if (i === 0) return { groups: w.groups.map(g => ({ ...g, interval: g.interval * 0.85 })) };
      return i === 3 ? reinforce(w, 2) : w;
    }) };
    const finale: LevelContext = { band: 'finale', introduces: null };
    expect(checkLevel(extraLate, late).failed).toEqual(['L1m']);
    expect(checkLevel(extraFinale, finale).failed).toEqual(['L1m']);
    const levels = [...LEVELS.slice(0, 10), extraLate, extraFinale];
    const contexts = [...CAMPAIGN_CONTEXTS.slice(0, 10), late, finale];
    expect(checkCampaign(levels, contexts).failed).toContain('L1m');
  }, 120_000);

  it('schedules each boss after its escort on the last wave', () => {
    for (const [level, boss] of [[LEVELS[8], 'boss'], [LEVELS[9], 'grumblemaw']] as const) {
      const groups = level.waves.at(-1)!.groups;
      const leader = groups.find(group => group.type === boss)!;
      expect(level.endingBoss).toEqual(boss);
      expect(leader.count).toBe(1);
      for (const group of groups.filter(group => group !== leader)) {
        expect(leader.delay).toBeGreaterThan(group.delay + (group.count - 1) * group.interval);
      }
    }
  });

  it('rejects a first level whose enemies are much too strong', () => {
    const result = checkLevel({ ...LEVELS[0], waves: [
      { groups: [{ type: 'troll', count: 30, interval: 2, delay: 0 }] }, ...LEVELS[0].waves.slice(1),
    ] }, intro);
    expect(result.failed).toEqual(expect.arrayContaining(['L1', 'L2', 'L5', 'P1', 'P2']));
    expect(result.good?.phase).toBe('lost');
  });

  it.each([{ hpScale: 0.98 }, { hpScale: 1.02 }, { startGold: 90 }, { startGold: 110 }])(
    'L1m checks the intro band minimum at %o without an introduction', variant => {
      stubBots((level, policy) => policy === bots.botGood &&
        (level.hpScale === variant.hpScale || level.startGold === variant.startGold) ? 17 : 20);
      expect(checkLevel(fresh(), intro).failed).toEqual(['L1m']);
    },
  );

  it('L2 rejects a trivial later level', () => {
    const result = checkLevel({ ...LEVELS[4], hpScale: 1, startGold: 300 }, CAMPAIGN_CONTEXTS[4]);
    expect(result.failed).toContain('L2');
    expect(result.beginner?.stars).toBe(3);
  });

  it('L3 rejects a level when removing its featured tower makes no difference', () => {
    const result = checkLevel({ ...LEVELS[2], hpScale: 1, startGold: 250,
      waves: Array.from({ length: 6 }, () => ({ groups: [{ type: 'wolf', count: 20, interval: 2.8, delay: 0 }] })),
    }, CAMPAIGN_CONTEXTS[2]);
    expect(result.failed).toContain('L3');
    expect(result.good?.lives).toBe(result.forbidden?.lives);
    expect(result.good?.stars).toBe(result.forbidden?.stars);
  });

  it('judges P1 and P2 independently for each band', () => {
    stubBots((level, policy) => policy === bots.botPerson ? level.allowedSpecials.length ? 11 : 0 : 18);
    for (const band of ['intro', 'middle', 'transition', 'late', 'finale'] as const) {
      const failed = checkLevel(fresh(), { band, introduces: null }).failed;
      expect(failed).toContain('P1');
      expect(failed.includes('P2')).toBe(['intro', 'middle', 'transition'].includes(band));
    }
    stubBots((_, policy) => policy === bots.botPerson ? 12 : 18);
    expect(checkLevel(fresh(), intro).failed).not.toContain('P1');
  });

  it.each([['middle', 17, 18], ['transition', 11, 12], ['late', 11, 12]] as const)(
    'applies the beginner star cap for %s independently of ID', (band, pass, fail) => {
      const ctx = { band, introduces: null };
      for (const lives of [0, pass, fail]) {
        stubBots((_, policy) => policy === bots.botBeginner ? lives : 18);
        expect(checkLevel(fresh(), ctx).failed.includes('L2')).toBe(lives === fail);
      }
    },
  );

  it('L3 checks the feature at each small perturbation for each bot', () => {
    const context = { ...late, introduces: { specials: ['keg'] as const } };
    for (const policy of [bots.botGood, bots.botPerson]) {
      stubBots((level, bot) => level.allowedSpecials.length ? 16 :
        level.startGold === 110 && bot === policy ? (bot === bots.botGood ? 15 : 16) : 14);
      const result = checkLevel(fresh(), context);
      expect(result.failed).toContain('L3');
      expect(result.featureTrials).toHaveLength(5);
    }
  });

  it('L3 accepts a one-life Good margin only when it also earns another star', () => {
    const ctx: LevelContext = { ...late, introduces: { specials: ['keg'] } };
    for (const lives of [17, 18]) {
      stubBots(level => level.allowedSpecials.length ? lives : lives - 1);
      expect(checkLevel(fresh(), ctx).failed.includes('L3')).toBe(lives === 17);
    }
  });

  it('T1 removes one tax at a time and requires the margin at each nudge', () => {
    const pair = { ...fresh(), taxes: { rationing: 3, curfew: 0.15 } };
    stubBots((level, bot) => {
      if (bot !== bots.botPerson || Object.keys(level.taxes ?? {}).length === 2) return 13;
      return level.startGold === 110 && level.taxes?.rationing ? 15 : 16;
    });
    const row = checkLevel(pair, late);
    expect(row.failed).toContain('T1');
    expect(row.taxTrials).toHaveLength(10);
    expect(row.taxTrials?.filter(t => t.personWithout.lives - t.person.lives < 3)
      .map(t => [t.tax, t.variant])).toEqual([['curfew', 'gold+10']]);
  });

  it('T1 accepts a star even when the life advantage is less than three', () => {
    stubBots(level => level.taxes?.rationing ? 17 : 18);
    expect(checkLevel({ ...fresh(), taxes: { rationing: 3 } }, late).failed).not.toContain('T1');
  });

  it('T2 requires two stars at nominal and a win at all four nudges', () => {
    for (const [nominal, nudged, fails] of [[11, 5, true], [12, 0, true], [12, 1, false]] as const) {
      stubBots((level, bot) => bot === bots.botPerson && level.taxes?.curfew
        ? level.startGold === 90 ? nudged : nominal : 16);
      expect(checkLevel({ ...fresh(), taxes: { curfew: 0.15 } }, late).failed.includes('T2')).toBe(fails);
    }
  });

  it('F1 rejects a feat lost at any one nudge while ordinary Good keeps two stars', () => {
    const feat = { kind: 'noSpecials' } as const;
    for (const miss of [(l: LevelDef) => l.hpScale === 0.98, (l: LevelDef) => l.hpScale === 1.02,
      (l: LevelDef) => l.startGold === 90, (l: LevelDef) => l.startGold === 110]) {
      stubBots((level, bot) => bot === bots.botGoodFeat && miss(level) ? 11 : 16);
      const row = checkLevel({ ...fresh(), feat }, late);
      expect(row.featGood?.stars).toBe(3);
      expect(row.featTrials?.filter(trial => trial.good.stars !== 3)).toHaveLength(1);
      expect(row.failed).toContain('F1');
    }
  });

  it('F2 and F3 reject a Bare hands feat Person earns by giving up ineffective casts', () => {
    const row = checkLevel({ ...LEVELS[0], feat: { kind: 'noSpecials' } }, late);
    expect(row.person?.stars).toBe(2);
    expect(row.featPerson?.stars).toBe(3);
    expect(row.person!.lives - row.featPerson!.lives).toBeLessThan(3);
    expect(row.failed).toEqual(expect.arrayContaining(['F2', 'F3']));
  }, 60_000);

  it('V1 rejects a single-type winner in either advanced band', () => {
    for (const band of ['late', 'finale'] as const) {
      const row = checkLevel(fresh(), { band, introduces: null });
      expect(row.singleTowerTrials?.map(trial => trial.tower)).toEqual(base.allowedTowers);
      expect(row.singleTowerTrials?.some(trial => trial.good.stars >= 2)).toBe(true);
      expect(row.failed).toContain('V1');
    }
  }, 60_000);

  it('L1m rejects Good or taxed Person on the two-star line at a nudge', () => {
    for (const player of [bots.botPerson, bots.botGood]) {
      stubBots((level, bot) => level.startGold === 90 && player === bot ? 12 : 13);
      expect(checkLevel({ ...fresh(), taxes: { curfew: 0.1 } }, late).failed).toContain('L1m');
    }
  });

  it('S1 rejects a second act that repeats an easy opening', () => {
    const repeat = { ...LEVELS[0], id: 743 };
    const result = checkCampaign([...LEVELS.slice(0, 3), repeat], [...CAMPAIGN_CONTEXTS.slice(0, 3), late]);
    expect(result.levels.map(row => row.person?.lives)).toEqual([20, 20, 20, 20]);
    expect(result.failed).toContain('S1');
  }, 90_000);

  it('S1 measures the handover, mean drop and largest cliff separately in play order', () => {
    // The preceding three stops average 16. The last of the three has 13 lives.
    for (const [second, accepted] of [
      [[13, 16], true], [[13, 17], false], [[12, 13], false], [[18, 12, 12], false],
      [[18, 13, 12], true],
    ] as const) {
      const lives = [16, 19, 13, ...second];
      const levels = lives.map((_, i) => fresh(710 - i));
      stubBots(level => lives[levels.findIndex(l => l.id === level.id)]);
      const contexts = lives.map((_, i) => ({ ...late, frozenFirstAct: i < 3 }));
      expect(checkCampaign(levels, contexts).failed.includes('S1')).toBe(!accepted);
    }
  });

  it('L3 requires each declared capability to exist in the candidate', () => {
    stubBots(level => level.allowedSpecials.length ? 16 : 12);
    for (const introduces of [
      { specials: ['keg', 'guards'] }, { towers: ['cannon'] }, { maxTowerLevel: 2 },
      { enemy: 'harpy', control: { specials: ['keg'] } },
    ] as const) {
      expect(checkLevel(fresh(), { ...late, introduces }).failed).toContain('L3');
    }
  });

  it('L3 rejects introducing a capability that an earlier level already allowed', () => {
    const levels = [fresh(), fresh(202)];
    const withKeg: LevelContext = { ...late, introduces: { specials: ['keg'] } };
    stubBots(level => level.allowedSpecials.length ? 16 : 12);
    expect(checkLevel(levels[1], withKeg).failed).not.toContain('L3');
    expect(checkCampaign(levels, [late, withKeg]).failed).toContain('L3');
    expect(checkCampaign(levels, [withKeg, withKeg]).failed).toContain('L3');
  });

  it('L4 rejects a two-star beginner jump or two consecutive Good lives increases', () => {
    const levels = [fresh(90), fresh(19), fresh(76)];
    stubBots((level, policy) => policy === bots.botBeginner ? level.id === 19 ? 12 : 0 : 16);
    expect(checkCampaign(levels, levels.map(() => late)).failed).toContain('L4');
    stubBots(level => level.id === 90 ? 14 : level.id === 19 ? 15 : 16);
    expect(checkCampaign(levels.map(level => ({ ...level })), levels.map(() => late)).failed).toContain('L4');
  });

  it('L5 rejects schedules over the spawn rate or last spawn limit before running bots', () => {
    for (const [count, interval, delay] of [[7, 0.49, 0], [2, 60, 31]]) {
      const result = checkLevel({ ...base, waves: [
        { groups: [{ type: 'goblin', count, interval, delay }] }, ...base.waves.slice(1),
      ] }, intro);
      expect(result.failed).toEqual(['L5']);
      expect(result.scheduleIssue).toEqual(count === 7
        ? { wave: 1, quantity: 'walkersIn3s', actual: 7, limit: 6 }
        : { wave: 1, quantity: 'lastSpawnTick', actual: 5460, limit: 5400 });
      expect(result.good).toBeUndefined();
    }
  });

  it('L5 accepts 40 alive or 60 in the opening, rejecting one more', () => {
    for (const [peak, count, pass] of [[40, 60, true], [41, 60, false], [40, 61, false]] as const) {
      stubBots(() => 20, 6, peak);
      const candidate: LevelDef = { ...base, waves: [
        { groups: [{ type: 'goblin', count, interval: 1, delay: 0 }] }, ...base.waves.slice(1),
      ] };
      expect(checkLevel(candidate, intro).failed.includes('L5')).toBe(!pass);
    }
  });

  it('L5 rejects one life lost in the opening even when Person wins', () => {
    stubBots(() => 19, 6, 2, 19);
    const result = checkLevel(fresh(), intro);
    expect(result.failed).toContain('L5');
    expect(result.person?.waveOneLives).toBe(19);
  });

  it('L5 checks 6–8 minutes per stop independently of campaign length', () => {
    for (const minutes of [5.99, 6, 8, 8.01]) {
      stubBots(() => 19, minutes);
      expect(checkCampaign([fresh()], [intro]).failed.includes('L5')).toBe(minutes < 6 || minutes > 8);
    }
  });

  it('L6 exercises both bots at all four gold and HP extremes', () => {
    for (const policy of [bots.botGood, bots.botPerson]) {
      for (const extreme of [(l: LevelDef) => l.hpScale >= 1.05, (l: LevelDef) => l.hpScale <= 0.95,
        (l: LevelDef) => l.startGold === 85, (l: LevelDef) => l.startGold === 115]) {
        stubBots((level, bot) => bot === policy && extreme(level) ? 11 : 18);
        expect(checkLevel(fresh(), intro).failed).toContain('L6');
      }
    }
  });

  it('L7 rejects malformed data and starting gold outside 100–300', () => {
    for (const candidate of [
      { ...base, hpScale: Infinity }, { ...base, hpScale: 0.849 }, { ...base, hpScale: 1.351 },
      { ...base, waves: [] }, { ...base, waves: base.waves.map(wave => ({ ...wave, hpMultiplier: 2 })) },
      { ...base, startGold: 99 }, { ...base, startGold: 301 },
    ]) {
      expect(checkLevel(candidate, intro).failed).toEqual(['L7']);
    }
    stubBots(() => 20);
    for (const startGold of [100, 300]) expect(checkLevel({ ...base, startGold }, intro).good).toBeDefined();
  });

  it.each([[0, false], [11, false], [12, true], [16, true], [17, false]] as const)(
    'L8 accepts finale Good lives %i = %s', (lives, accepted) => {
      stubBots(() => lives);
      expect(checkLevel(fresh(), { ...late, band: 'finale' }).failed.includes('L8')).toBe(!accepted);
    },
  );

  it('L8 checks the first and last thirds by position, for a three-life mean drop', () => {
    for (const last of [16, 17]) {
      stubBots(level => level.id >= 600 ? last : 19);
      const levels = [511, 65, 4, 3, 777, 666].map(fresh);
      expect(checkCampaign(levels, levels.map(() => late)).failed.includes('L8')).toBe(last > 16);
    }
  });
});
