// The real-time loop's accumulator, as a pure function so tests can pin it.
//
// GameScene.update() adds each frame's real time to an accumulator and asks
// ticksDue() how many simulation ticks to run. One tick is due per STEP_MS of
// accumulated time, times the speed; the time of every due tick is consumed
// and the remainder (under one step) carries to the next frame.
//
// The cap: after a long stall (a hidden tab, a debugger pause, a GC spike)
// the accumulator can hold seconds of time. Running all of it in one frame
// would make that frame slow, which builds more debt (the "spiral of death").
// The cap drops the ticks beyond it, so the game runs slower than real time
// for that frame instead. 20 ticks is a third of a second at 60 ticks/s: a
// slow device (software GL renders about 4 frames a second, 250 ms frames)
// still keeps real time at 1x (15 ticks a frame) and loses only part of 2x.
//
// Phaser clamps the delta before it gets here (core/TimeStep.js
// smoothDelta): for the first 120 frames after the loop starts or regains
// focus (panicMax) every delta is cut to 16.67 ms, a delta over 200 ms
// (1000 / minFps) is replaced by an earlier one, and deltas are averaged over
// 10 frames. So below 5 fps, and during that warm-up, the game runs slower
// than real time whatever this cap is.

import { TICKS_PER_SECOND } from '../sim';

/** Milliseconds of real time per simulation tick at 1x. */
export const STEP_MS = 1000 / TICKS_PER_SECOND;

/** The most ticks one frame runs; ticks due beyond it are dropped. */
export const MAX_TICKS_PER_FRAME = 20;

// 1000 / 60 is not exact in floating point: 250 / STEP_MS is
// 14.999999999999998. The tolerance counts whole steps that rounding hides.
const EPSILON = 1e-9;

export interface TicksDue {
  /** Ticks to run this frame (already multiplied by speed and capped). */
  ticks: number;
  /** Accumulated time left for the next frame, in [0, STEP_MS). */
  accMs: number;
}

/**
 * Given the accumulated real time (this frame's delta already added), the
 * speed and the cap, return the ticks to run and the time to carry over.
 */
export function ticksDue(accMs: number, speed: number, cap: number = MAX_TICKS_PER_FRAME): TicksDue {
  const steps = Math.floor(accMs / STEP_MS + EPSILON);
  const left = Math.max(0, accMs - steps * STEP_MS);
  return { ticks: Math.min(steps * speed, cap), accMs: left };
}
