import { describe, expect, it } from 'vitest';
import type { LevelFeat, TaxKind } from '../sim/levelTypes';
import { LEVELS } from '../sim/levels';
import { cardFeatText, featResultText, levelTaxLines, LEVEL_NAMES, LEVEL_STORY, levelTips, secondActNotice, TAX_NAMES } from './names';

// Vary one tax at a time, including both positions on every paired-tax card.
// A hard-coded numeral, fraction or spelled-out amount cannot pass the edit.
const edits: Record<TaxKind, [number, string, string]> = {
  windowTax: [0.07, '7%', '7%'],
  frozenPurse: [43, '43 gold', '43 gold'],
  forcedMarch: [0.23, '23%', '23%'],
  curfew: [0.13, '13%', '13%'],
  noLoitering: [11, 'eleven seconds', '11 seconds'],
  rationing: [4, 'Four', '4 towers'],
};

describe('the numbers printed for Act Two', () => {
  for (const level of LEVELS.filter(level => level.feat)) {
    it(`prints each tax from level ${level.id} on its notice and in-force list`, () => {
      const taxes = level.taxes!;
      expect(LEVEL_STORY[level.id].notice).toBe(secondActNotice(level));
      const lines = levelTaxLines(taxes);
      expect(lines).toHaveLength(Object.keys(taxes).length);
      for (const key of Object.keys(taxes) as TaxKind[]) {
        const [amount, noticeAmount, ruleAmount] = edits[key];
        const updated = { ...level, taxes: { ...taxes, [key]: amount } };
        const notice = secondActNotice(updated);
        expect(notice).not.toBe(LEVEL_STORY[level.id].notice);
        expect(notice).toContain(noticeAmount);
        const rule = levelTaxLines(updated.taxes).find(line => line.startsWith(TAX_NAMES[key] + ':'));
        expect(rule).toContain(ruleAmount);
        expect(lines).not.toContain(rule);
      }
    });

    it(`names the third star and explains its condition on level ${level.id}`, () => {
      const feat = level.feat!;
      const expected = {
        noLeaks: 'Not a penny: let no collector through.',
        noSpecials: 'Bare hands: win without using a special.',
        maxTowers: `Few hands: build at most ${feat.kind === 'maxTowers' ? feat.limit : ''} towers in all.`,
      }[feat.kind];
      expect(cardFeatText(feat)).toBe('Third star, ' + expected);
      expect(featResultText(feat, false)).toBe('Missed ' + expected);
      expect(featResultText(feat, true)).toBe('Earned: ' + expected.split(':')[0] + '.');
      if (feat.kind === 'maxTowers') {
        const changed: LevelFeat = { kind: 'maxTowers', limit: feat.limit + 1 };
        expect(cardFeatText(changed)).toContain(`at most ${changed.limit} towers`);
        expect(featResultText(changed, false)).toContain(`at most ${changed.limit} towers`);
      }
    });
  }

  it('keeps the names of Eight Bells and the permit levels in step with their taxes', () => {
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
      'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];
    for (const id of [13, 16, 18]) {
      const taxes = LEVELS.find(level => level.id === id)!.taxes!;
      const value = (taxes.noLoitering ?? taxes.rationing)!;
      const firstWord = LEVEL_NAMES[id].name.split(' ')[0].toLowerCase();
      expect(firstWord).toBe(words[value] ?? String(value));
    }
  });

  it('uses the standing-tower limit in the permit tactics and tips', () => {
    const number = (s: string) => {
      const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
      const token = s.match(/\b(\w+) (?:towers|permits)\b/)![1];
      return words.includes(token) ? words.indexOf(token) : Number(token);
    };
    for (const level of LEVELS.filter(level => level.taxes?.rationing)) {
      expect(number(LEVEL_NAMES[level.id].twist)).toBe(level.taxes?.rationing);
      if (level.id === 18) {
        for (const touch of [true, false]) expect(number(levelTips(level.id, touch)[0])).toBe(level.taxes?.rationing);
      }
    }
  });
});
