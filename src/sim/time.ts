// Fixed-step time. game.ts re-exports these; combat.ts uses them without
// importing game.ts (which imports combat.ts).

export const TICKS_PER_SECOND = 60;

/** Seconds to the nearest whole tick. */
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND);
}
