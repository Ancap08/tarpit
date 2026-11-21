import { describe, expect, it } from 'vitest';
import { MAX_TICKS_PER_FRAME, STEP_MS, ticksDue } from './loop';

describe('ticksDue', () => {
  it('caps at 20 ticks a frame', () => {
    expect(MAX_TICKS_PER_FRAME).toBe(20);
  });

  it('keeps real time at 4 fps and 1x: a 250 ms frame runs 15 ticks', () => {
    expect(ticksDue(250, 1)).toEqual({ ticks: 15, accMs: 0 });
  });

  it('caps a 250 ms frame at 2x from 30 ticks to 20', () => {
    expect(ticksDue(250, 2)).toEqual({ ticks: 20, accMs: 0 });
  });

  it('runs one tick per 60 fps frame', () => {
    expect(ticksDue(1000 / 60, 1)).toEqual({ ticks: 1, accMs: 0 });
    expect(ticksDue(1000 / 60, 2).ticks).toBe(2);
  });

  it('carries leftover time to the next frame', () => {
    const a = ticksDue(25, 1);
    expect(a.ticks).toBe(1);
    expect(a.accMs).toBeCloseTo(25 - STEP_MS, 9); // 8.33 ms
    const b = ticksDue(a.accMs + 25, 1); // 33.33 ms
    expect(b.ticks).toBe(2);
    expect(b.accMs).toBeCloseTo(0, 9);
  });

  it('runs nothing for less than one step and keeps the time', () => {
    expect(ticksDue(10, 2)).toEqual({ ticks: 0, accMs: 10 });
  });

  it('drops ticks beyond the cap after a stall instead of carrying them', () => {
    expect(ticksDue(5000, 1)).toEqual({ ticks: 20, accMs: 0 });
  });

  it('keeps real time over many slow frames at 1x', () => {
    let acc = 0;
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const r = ticksDue(acc + 250, 1);
      acc = r.accMs;
      total += r.ticks;
    }
    expect(total).toBe(600); // 10 s at 60 ticks/s
  });
});
