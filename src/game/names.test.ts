import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ENEMY_SHORT_NAMES, GUARD_NAMES, LEVEL_NEW, LEVEL_STORY, STORY_TEXT, levelTips } from './names';

describe('the King’s collectors', () => {
  it('keeps the compact HUD labels and Guard names in their approved forms', () => {
    expect(ENEMY_SHORT_NAMES).toEqual({
      goblin: 'Collector', wolf: 'Hound', shieldbearer: 'Redcoat', harpy: 'Harpy',
      troll: 'Toll Troll', boss: 'Grumblefoot', grumblemaw: 'Grumblemaw',
    });
    expect(GUARD_NAMES).toEqual(['Axeman', 'Swordsman', 'Archer', 'Captain']);
  });

  it('prints the notice and reply for each of the ten levels exactly as commissioned', () => {
    const scope = readFileSync('docs/SCOPE-v5.md', 'utf8').split('## Milestone 46:')[1].split('## Milestone 47:')[0];
    const rows = [...scope.matchAll(/^\| (Opening|Ending|Any loss|\d+) \|(.*?)\|(.*?)\|$/gm)]
      .map(([, id, notice, reply]) => [id, notice.trim(), reply.trim()]);
    expect(Object.keys(LEVEL_STORY)).toEqual(rows.filter(([id]) => /^\d+$/.test(id)).map(([id]) => id));
    for (const [id, notice, reply] of rows) {
      if (id === 'Opening') expect([STORY_TEXT.openingNotice, STORY_TEXT.openingReply]).toEqual([notice, reply]);
      else if (id === 'Ending') expect(STORY_TEXT.ending).toBe(reply);
      else if (id === 'Any loss') expect(STORY_TEXT.loss).toBe(notice);
      else expect(LEVEL_STORY[Number(id)]).toEqual({
        notice, reply: id === '10' ? STORY_TEXT.ending.split('. ')[0] + '.' : reply,
      });
    }
    expect(rows).toHaveLength(13);
  });

  it.each([false, true])('uses plural enemy names in cards and tips (touch=%s)', touch => {
    expect(levelTips(1, touch).join(' ')).toContain('Goblin Collectors');
    expect(levelTips(3, touch).join(' ')).toContain('Revenue Hounds');
    expect(LEVEL_NEW[4]).toContain('Redcoat Shieldbearers');
    expect(LEVEL_NEW[5]).toContain('Royal Harpies');
    expect(LEVEL_NEW[6]).toContain('Toll Trolls');
  });

  it('uses current enemy names in every string literal and template in names.ts', () => {
    const source = ts.createSourceFile('names.ts', readFileSync('src/game/names.ts', 'utf8'), ts.ScriptTarget.Latest, true);
    const themed = /\b(?:Goblin Collectors?|Revenue Hounds?|Redcoat Shieldbearers?|Royal (?:Harpy|Harpies)|Toll Trolls?|Assessor Grumblefoot|King Grumblemaw)\b/gi;
    const stale = /\b(?:goblins?|wolf|wolves|shieldbearers?|harpy|harpies|trolls?|grumblefoot|grumblemaw)\b/i;
    function check(node: ts.Node): void {
      // The compact table intentionally contains three historical names. Its exact contents are checked above.
      if (ts.isVariableDeclaration(node) && node.name.getText() === 'ENEMY_SHORT_NAMES') return;
      if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
        // The King's level-six toll bills the player in Trolls, verbatim from the notice.
        const words = node.text.replace(/^A toll on this road: one Troll per traveller\.$/, '');
        expect(words.replace(themed, ''), node.text).not.toMatch(stale);
      }
      ts.forEachChild(node, check);
    }
    check(source);
  });
});
