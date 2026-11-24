import { expect, it } from 'vitest';
import { LEVELS, type Difficulty } from '../../sim';
import { townCondition } from './townCondition';

it.each([
  ['campaign', 18, 12], ['easy', 32, 21], ['normal', 18, 12], ['hard', 14, 9],
] as const)('%s uses both star boundaries, including exact limits and an overshooting loss', (mode, high, mid) => {
  const level = mode === 'campaign' ? LEVELS[0] : undefined;
  const difficulty: Difficulty = mode === 'campaign' ? 'hard' : mode;
  for (const [lives, expected] of [[high, 'untouched'], [high - 1, 'scuffed'], [mid, 'scuffed'],
    [mid - 1, 'battered'], [1, 'battered'], [0, 'taken'], [-9, 'taken']] as const) {
    expect(townCondition({ difficulty, level, lives })).toBe(expected);
  }
});
