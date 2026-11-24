// Milestone 46 verifier: the rules did not move, and the town's lives bands
// are the ones the scope states, checked from the sim's own numbers.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildableCells, CELL, createGame, DIFFICULTY_DEFS, GRID_COLS, LEVELS, MAP_IDS, MAPS,
  type Difficulty,
} from '../sim';
import { LEVEL_NAMES, LEVEL_NEW, LEVEL_STORY, STORY_TEXT } from './names';
import { townCondition } from './decor/townCondition';

// Hashes taken from the buildable masks on 5a24b12 (the scope commit) and
// again on the milestone tip: the mask did not move.
const MASK_AT_SCOPE_COMMIT = {
  meadow: { open: 344, sha1: 'e28eb51a957f' },
  switchback: { open: 334, sha1: '8ae87db7ee4c' },
  riverbend: { open: 312, sha1: '6c0219cce8da' },
} as const;

describe('milestone 46 leaves the rules alone', () => {
  it.each(MAP_IDS)('%s: the buildable grid is the one from the scope commit', id => {
    const mask = buildableCells(MAPS[id]);
    expect(mask).toHaveLength(450);
    expect(mask.filter(Boolean)).toHaveLength(MASK_AT_SCOPE_COMMIT[id].open);
    expect(createHash('sha1').update(JSON.stringify(mask)).digest('hex').slice(0, 12)).toBe(MASK_AT_SCOPE_COMMIT[id].sha1);
  });

  // The town sprite frame is 64 x 64 around (exit - (32, 43)), but its drawn
  // strip is 62 x 42; every cell that strip touches must be refused. (The
  // browser suite checks the real pixels; this is the geometry.)
  it.each(MAP_IDS)('%s: the town strip touches no buildable cell, in world space', id => {
    const map = MAPS[id];
    const exit = map.path[map.path.length - 1];
    const box = { x0: exit.x - 63, x1: exit.x - 1, y0: exit.y - 64, y1: exit.y - 22 };
    const mask = buildableCells(map);
    const touched: string[] = [];
    for (let col = Math.floor(box.x0 / CELL); col <= Math.floor((box.x1 - 1e-9) / CELL); col++) {
      for (let row = Math.floor(box.y0 / CELL); row <= Math.floor((box.y1 - 1e-9) / CELL); row++) {
        if (col >= 0 && col < GRID_COLS && row >= 0 && row < 15 && mask[row * GRID_COLS + col]) touched.push(`${col},${row}`);
      }
    }
    expect(touched).toEqual([]);
  });
});

describe('the town bands, from the sim starting lives', () => {
  const rows: [string, Difficulty, boolean, number][] = [
    ['campaign level', 'normal', true, 20],
    ['Free play easy', 'easy', false, DIFFICULTY_DEFS.easy.startLives],
    ['Free play normal', 'normal', false, DIFFICULTY_DEFS.normal.startLives],
    ['Free play hard', 'hard', false, DIFFICULTY_DEFS.hard.startLives],
  ];
  it.each(rows)('%s: untouched at 90%% of start, scuffed at 60%%, battered above 0', (_name, difficulty, campaign, start) => {
    expect(createGame({ difficulty, ...(campaign ? { level: LEVELS[0] } : {}) }).lives).toBe(start);
    const level = campaign ? LEVELS[0] : undefined;
    const kinds: string[] = [];
    for (let lives = start; lives >= 0; lives--) kinds.push(townCondition({ difficulty, level, lives }));
    // Independent rule: lives / start against 18/20 and 12/20, exact fractions.
    const want = (lives: number) => lives * 20 >= 18 * start ? 'untouched' : lives * 20 >= 12 * start ? 'scuffed' : lives > 0 ? 'battered' : 'taken';
    expect(kinds).toEqual(Array.from({ length: start + 1 }, (_, i) => want(start - i)));
    // Only ever worsens as lives fall, and every state is reached.
    expect(new Set(kinds)).toEqual(new Set(['untouched', 'scuffed', 'battered', 'taken']));
  });
});

describe('the story copy', () => {
  it('has the commissioned opening, loss and ending and a notice and reply for ten levels', () => {
    expect(STORY_TEXT.openingNotice).toBe('Hear ye. By order of King Grumblemaw, all gold in this town now belongs to the Crown. Collectors are on their way.');
    expect(STORY_TEXT.openingReply).toBe("We counted it. It's ours.");
    expect(STORY_TEXT.loss).toBe('The Crown thanks you for your contribution.');
    expect(STORY_TEXT.ending).toBe('The King went home with empty pockets. The gold stayed where it was earned. Taxation is theft.');
    expect(Object.keys(LEVEL_STORY).map(Number)).toEqual(LEVELS.map(level => level.id));
  });

  it('keeps the tactical twist and the new-this-level line for every level', () => {
    for (const level of LEVELS) {
      expect(LEVEL_NAMES[level.id].twist.length, `twist ${level.id}`).toBeGreaterThan(10);
      expect(LEVEL_NEW[level.id].length, `new ${level.id}`).toBeGreaterThan(5);
    }
  });
});
