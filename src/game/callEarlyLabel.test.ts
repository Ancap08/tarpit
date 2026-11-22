// Milestone 25c: the call-early and kill count words (names.ts) and the
// call label's fit in the 130 px Start Wave button at 14 px.
import { describe, expect, it } from 'vitest';
import { EARLY_CALL_MAX_BONUS } from '../sim';
import { CALL_EARLY_TEXT, callEarlyLabel, KILLS_TEXT, killsLabel } from './names';

describe('call-early and kill count words', () => {
  it('reads "Call next  +14" and "Kills 43"', () => {
    expect(callEarlyLabel(14)).toBe(`${CALL_EARLY_TEXT}  +14`);
    expect(callEarlyLabel(14)).toBe('Call next  +14');
    expect(killsLabel(43)).toBe(`${KILLS_TEXT} 43`);
    expect(killsLabel(0)).toBe('Kills 0');
  });

  it('the longest call label fits the 130 px Start Wave button at 14 px with 4 px a side (Courier: 0.6 em a character)', () => {
    const widest = Math.max(...Array.from({ length: EARLY_CALL_MAX_BONUS + 1 }, (_, b) => callEarlyLabel(b).length));
    expect(widest * 0.6 * 14).toBeLessThanOrEqual(130 - 8);
  });
});
