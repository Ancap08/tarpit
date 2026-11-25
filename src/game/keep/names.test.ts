import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KEEP_LEVELS } from '../../sim/keepLevels';
import { LEVEL_NAMES, LEVEL_STORY, cardFeatText, levelTips, siegeRuleLines } from '../names';
import { keepSelection } from './switch';

const scope = readFileSync('docs/SCOPE-v5.md', 'utf8').split('## Milestone 52: the wall')[1];
const [levels, words] = scope.split('### Words (coordinator)');
const cells = (section: string, id: number) => section.split('\n')
  .find(line => line.startsWith(`| ${id} |`))!.split('|').slice(2, -1).map(cell => cell.trim());

describe('private Act Three words and route', () => {
  it.each(KEEP_LEVELS)('uses the commissioned words and bounded tips for level $id', level => {
    const [notice, reply] = cells(words, level.id);
    expect(LEVEL_STORY[level.id]).toEqual({ notice, reply });
    expect(LEVEL_NAMES[level.id].name).toBe(cells(levels, level.id)[0]);
    expect(words).toContain(`\`${cardFeatText(level.feat)}\``);
    for (const line of siegeRuleLines(level)) {
      const template = level.wallSiteTax?.kind === 'quartering' ? line.replace(` ${level.wallSiteTax.price} gold`, ' NN gold') : line;
      expect(words).toContain(`\`${template}\``);
    }
    for (const touch of [false, true]) {
      const tips = levelTips(level.id, touch);
      expect(tips.length).toBeGreaterThan(0);
      expect(tips.length).toBeLessThanOrEqual(3);
      expect(Math.max(...tips.map(tip => tip.length))).toBeLessThanOrEqual(61);
    }
    expect(keepSelection(`?keep=${level.id}`)?.level).toBe(level);
  });

  it('only accepts exact private level ids and the existing exhibition switch', () => {
    expect(keepSelection('?keep=1')).toEqual({ level: undefined });
    for (const query of ['', '?keep', '?keep=20', '?keep=26', '?keep=021', '?survey=1']) {
      expect(keepSelection(query)).toBeUndefined();
    }
  });
});
