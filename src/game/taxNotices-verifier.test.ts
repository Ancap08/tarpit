// Every numerical claim in the King's notices and permit tips follows the playable level.
import { describe, expect, it } from 'vitest';
import { LEVELS, type LevelDef } from '../sim';
import { LEVEL_NAMES, LEVEL_STORY, levelFeatText, levelTips, royalTaxNotice } from './names';

const WORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const FRACTION: Record<string, number> = { 'one fifth': 20, 'a tenth': 10, 'one tenth': 10, 'a quarter': 25, 'one quarter': 25 };

function stated(text: string): { percent: number[]; seconds: number[]; gold: number[]; words: number[] } {
  const percent = [...text.matchAll(/(\d+(?:\.\d+)?)%/g)].map(m => Number(m[1]));
  for (const [phrase, value] of Object.entries(FRACTION)) if (text.toLowerCase().includes(phrase)) percent.push(value);
  const seconds = [...text.matchAll(/(\w+) seconds/gi)].map(m => WORD[m[1].toLowerCase()] ?? Number(m[1]));
  const gold = [...text.matchAll(/(\d+|ninety|thirty-five) gold/gi)].map(m => ({ ninety: 90, 'thirty-five': 35 } as Record<string, number>)[m[1].toLowerCase()] ?? Number(m[1]));
  const words = [...text.matchAll(/\b(two|three|four|five|six|seven|eight|nine|ten)\b/gi)].map(m => WORD[m[1].toLowerCase()]);
  return { percent, seconds, gold, words };
}

describe('the King\'s second-act notices tell the truth about the level data', () => {
  it('reads retuned tax values from the supplied record', () => {
    const notice = (taxes: LevelDef['taxes']) => stated(royalTaxNotice({ ...LEVELS[10], taxes }));
    expect(notice({ windowTax: 0.075, curfew: 0.17 }).percent).toEqual([7.5, 17]);
    expect(notice({ forcedMarch: 0.23, frozenPurse: 47 })).toMatchObject({ percent: [23], gold: [47] });
    expect(notice({ noLoitering: 12, rationing: 4 })).toMatchObject({ seconds: [12], words: [4] });
  });

  for (const level of LEVELS.slice(10) as LevelDef[]) {
    it(`level ${level.id}: ${LEVEL_NAMES[level.id].name}`, () => {
      const t = level.taxes ?? {};
      const s = stated(LEVEL_STORY[level.id].notice);
      const percents = [t.windowTax, t.forcedMarch, t.curfew].filter((v): v is number => v !== undefined).map(v => Number((v * 100).toFixed(6)));
      expect(s.percent.sort(), 'percentages in the notice').toEqual(percents.sort());
      expect(s.seconds, 'seconds in the notice').toEqual(t.noLoitering === undefined ? [] : [t.noLoitering]);
      expect(s.gold, 'gold in the notice').toEqual(t.frozenPurse === undefined ? [] : [t.frozenPurse]);
      // number words that are not seconds: the permit count
      const permits = s.words.filter(n => !(t.noLoitering !== undefined && n === t.noLoitering));
      expect(permits, 'permit words in the notice').toEqual(t.rationing === undefined ? [] : [t.rationing]);
      // the three-towers wording in the twist and the tips
      const loose = [LEVEL_NAMES[level.id].twist, ...levelTips(level.id, false)].flatMap(line => [...line.matchAll(/\b(two|three|four|five|six|seven|eight|nine|ten) (?:tower|permit)s?\b/gi)].map(m => WORD[m[1].toLowerCase()]));
      for (const n of loose) expect(n, 'a number word in a twist or tip must be the cap').toBe(t.rationing);
      // the feat line is derived from the data
      if (level.feat?.kind === 'maxTowers') expect(levelFeatText(level.feat)).toContain(String(level.feat.limit));
    });
  }
});
