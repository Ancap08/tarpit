// Verifier (Claude Sonnet) for milestone 52b. `npm run sim:keep` is the only
// place the fourteen Act Three targets (W1 to W14) run, and CI does not run
// it, so a green `npm test` said nothing about them: changing a level's gate
// to 100 times its health, or a Quartering price to 1 gold, left every
// implementer test green. This pins the measured state: which targets miss,
// and what each bot scores on each level. A change to levels 21 to 25 turns it
// red on purpose. When the coordinator decides W6, W9 and W12, update MISSES.
import { describe, expect, it } from 'vitest';
import { botPerson, runBot } from './bots';
import { checkKeep } from './checkKeep';
import { createGame } from './game';
import { LEVELS } from './levels';

/** Open misses at c3c9c45, by the implementer's report and the verifier's own run. */
const MISSES = ['W6', 'W9', 'W12'];

describe('Act Three targets, pinned at the state of milestone 52b', () => {
  it('passes every target except the three open misses, and each bot scores what it scored', () => {
    const actTwo = LEVELS.slice(10);
    const previousMean = actTwo.reduce((sum, level) => sum + runBot(createGame({ level }), botPerson).state.lives, 0) / actTwo.length;
    const report = checkKeep(previousMean);
    expect(report.targets.filter(target => !target.ok).map(target => target.label)).toEqual(MISSES);
    expect(report.targets.map(target => target.label)).toEqual(
      ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W9', 'W10', 'W11', 'W12', 'W13', 'W14']);
    // [level, good stars, good lives, person stars, person lives, beginner stars]
    expect(report.rows.map(({ level, good, person, beginner }) =>
      [level.id, good.stars, good.lives, person.stars, person.lives, beginner.stars])).toEqual([
      [21, 3, 18, 1, 11, 1],
      [22, 2, 16, 1, 10, 0],
      [23, 3, 20, 2, 15, 0],
      [24, 2, 18, 1, 8, 0],
      [25, 3, 20, 2, 15, 0],
    ]);
    expect(report.ok).toBe(false);
  }, 240_000);
});
