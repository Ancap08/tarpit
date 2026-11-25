import { describe, expect, it } from 'vitest';
import { botPerson, runBot } from './bots';
import { checkKeep } from './checkKeep';
import { createGame } from './game';
import { LEVELS } from './levels';

/** W17: the only expected-miss list. W8 is locked by the public parity tests. */
const MISSES = ['W2', 'W3', 'W9'];

describe('Act Three targets (W17)', () => {
  it('matches the measured misses and pins the bot scores on all five levels', () => {
    const actTwo = LEVELS.slice(10);
    const previousMean = actTwo.reduce((sum, level) => sum + runBot(createGame({ level }), botPerson).state.lives, 0) / actTwo.length;
    const report = checkKeep(previousMean);
    expect(report.targets.map(target => target.label)).toEqual(
      ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W9', 'W10', 'W11', 'W12', 'W13', 'W14', 'W15', 'W16']);
    const details = report.targets.map(target => `${target.label} ${target.detail}`).join('\n');
    expect.soft(report.targets.filter(target => !target.ok).map(target => target.label), details).toEqual(MISSES);
    // Level, Good stars/lives and gate low, Person stars/lives, Beginner stars.
    expect(report.rows.map(({ level, good, person, beginner }) =>
      [level.id, good.stars, good.lives, good.lowestHp, person.stars, person.lives, beginner.stars])).toEqual([
      [21, 3, 20, 1969, 2, 12, 0],
      [22, 2, 13, 437, 2, 17, 0],
      [23, 2, 20, 0, 2, 14, 0],
      [24, 2, 19, 4539, 1, 8, 0],
      [25, 3, 20, 1406, 1, 10, 0],
    ]);
    expect(report.ok).toBe(MISSES.length === 0);
  }, 240_000);
});
