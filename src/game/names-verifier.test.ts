import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { KEEP_LEVELS } from '../sim/keepLevels';
import { ENEMY_NAMES, ENEMY_SHORT_NAMES, GATE_TEXT } from './names';

it('W16 warns about the first repair only on the Not a nail levels', () => {
  for (const level of KEEP_LEVELS) {
    expect(GATE_TEXT.repairWarning(level.feat, undefined)).toBe(
      [22, 24].includes(level.id) ? 'Costs the third star' : '',
    );
    expect(GATE_TEXT.repairWarning(level.feat, true)).toBe('');
  }
});

// Milestone 44a verifier: the guard in names.test.ts reads only names.ts. These
// tests widen it to every string a player could read from src/game and README.md.
const THEMED = /\b(?:Goblin Collectors?|Revenue Hounds?|Redcoat Shieldbearers?|Royal (?:Harpy|Harpies)|Toll Trolls?|Assessor Grumblefoot|King Grumblemaw)\b/g;
// Capitalised only: lowercase singular words are internal ids ('goblin', 'harpy').
const STALE = /\b(?:Goblins?|Wolf|Wolves|Shieldbearers?|Harpy|Harpies|Trolls?|Troll King|Grumblefoot|Grumblemaw)\b/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.ts$/.test(name) && !/\.(test|d)\.ts$/.test(name) ? [path] : [];
  });
}

describe('milestone 44a verifier: no stale enemy names a player can read', () => {
  it('has no old bare name in any string literal under src/game except the compact table', () => {
    const found: string[] = [];
    for (const file of sources('src/game')) {
      const tree = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isVariableDeclaration(node) && node.name.getText() === 'ENEMY_SHORT_NAMES') return;
        if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
          // Both story lines use the approved wording verbatim.
          const words = node.text.replace(/^(?:A toll on this road: one Troll per traveller\.|No quarter without consent\. He bunks with the Trolls\.)$/, '');
          if (STALE.test(words.replace(THEMED, ''))) found.push(`${file}: ${node.text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
    }
    expect(found).toEqual([]);
  });

  it('has no old bare name anywhere in README.md', () => {
    const stale = readFileSync('README.md', 'utf8').split('\n').filter((line) => STALE.test(line.replace(THEMED, '')));
    expect(stale).toEqual([]);
  });

  it('keeps each compact name a recognisable part of its full name, with the approved Ram name as the exception', () => {
    for (const type of Object.keys(ENEMY_NAMES) as (keyof typeof ENEMY_NAMES)[]) {
      if (type === 'ram') expect([ENEMY_NAMES[type], ENEMY_SHORT_NAMES[type]]).toEqual(['The Final Notice', 'Ram']);
      else expect(ENEMY_NAMES[type], type).toContain(ENEMY_SHORT_NAMES[type]);
    }
  });
});
