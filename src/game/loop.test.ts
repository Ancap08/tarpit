import { describe, expect, it } from 'vitest';
import { buildTower, createGame, startWave, tick, useSpecial } from '../sim';
import { GameClock, MAX_TICKS_PER_FRAME, STEP_MS, ticksDue } from './loop';

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

  // Milestone 30: holding the speed button runs 3x; at 60 fps that is 3
  // ticks a frame, far under the cap, so 60 frames run exactly 180 ticks.
  it('3x at 60 fps runs 3 ticks a frame and never meets the cap', () => {
    let acc = 0;
    let total = 0;
    for (let i = 0; i < 60; i++) {
      const due = ticksDue(acc + 1000 / 60, 3);
      expect(due.ticks).toBeLessThan(MAX_TICKS_PER_FRAME);
      acc = due.accMs;
      total += due.ticks;
    }
    expect(total).toBe(180);
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

describe('the pause clock', () => {
  it('keeps the fractional step and excludes paused time even when no frames arrive until Resume', () => {
    let wall = 0;
    const clock = new GameClock(() => wall);
    expect(clock.frame(11, 2, 20)).toBe(0);
    clock.paused = true;
    wall += 500;
    expect(clock.frame(500, 3)).toBe(0);
    expect([clock.nowMs, clock.accMs, clock.deltaMs]).toEqual([20, 11, 0]);
    wall += 80_000;
    clock.paused = false;
    wall += 9;
    clock.paused = false; // A second Resume must keep the same active interval.
    expect(clock.frame(100, 2, 80_009)).toBe(2);
    expect(clock.nowMs).toBe(29);
    expect(clock.deltaMs).toBe(9);
    expect(clock.accMs).toBeCloseTo(20 - STEP_MS);
  });

  it('plays a scripted Free play run to the exact same last tick and state across several pauses', () => {
    function play(pauseTicks: number[]) {
      let wall = 0;
      const clock = new GameClock(() => wall);
      const state = createGame();
      expect(buildTower(state, { col: 2, row: 5 }, 'musketeer').ok).toBe(true);
      const frame = (ms: number) => {
        wall += ms;
        const due = clock.frame(ms, 1);
        for (let i = 0; i < due; i++) tick(state);
      };
      const stops = new Set(pauseTicks);
      let frames = 0;
      for (; frames < 60_000 && state.phase !== 'lost' && state.phase !== 'won'; frames++) {
        if (stops.delete(state.tick)) {
          clock.paused = true;
          const before = structuredClone(state);
          frame(4);
          frame(75_000);
          expect(state).toEqual(before);
          clock.paused = false;
        }
        if (state.phase === 'setup') expect(startWave(state).ok).toBe(true);
        if (state.waveTick === 30) expect(useSpecial(state, 'keg', state.map.path[0]).ok).toBe(true);
        frame(STEP_MS);
      }
      expect(stops.size).toBe(0);
      expect(state.phase).toBe('lost');
      return { frames, state };
    }
    const uninterrupted = play([]);
    expect(play([0, 1, 31, 299, 950, 3000])).toEqual(uninterrupted);
  });
});
