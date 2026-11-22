// Milestone 26: the endless words (names.ts).
import { describe, expect, it } from 'vitest';
import { bestScoreText, DIFFICULTY_LABELS, END_TEXT, reachedWaveText, waveCounterText } from './names';

describe('endless words (milestone 26)', () => {
  it('wave counter: "Wave 3/10", and "Wave 11" in an endless game', () => {
    expect(waveCounterText(3, false, 10)).toBe('Wave 3/10');
    expect(waveCounterText(10, true, 10)).toBe('Wave 10');
    expect(waveCounterText(11, true, 10)).toBe('Wave 11');
  });

  it('lose line: "of 10" only outside endless', () => {
    expect(reachedWaveText(7, false, 10)).toBe(`${END_TEXT.lostWave} 7 of 10`);
    expect(reachedWaveText(14, true, 10)).toBe(`${END_TEXT.lostWave} 14`);
  });

  it('title best line, singular for one wave', () => {
    expect(bestScoreText('normal', 12)).toBe(`Best on ${DIFFICULTY_LABELS.normal}: 12 waves`);
    expect(bestScoreText('easy', 1)).toBe(`Best on ${DIFFICULTY_LABELS.easy}: 1 wave`);
  });

  it('Keep going is a names.ts word', () => {
    expect(END_TEXT.keepGoing).toBe('Keep going');
  });
});
