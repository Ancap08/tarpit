// The special policy (milestone 30): how the scripted players fire specials,
// the way a person would. It replaces the stored per-wave search of
// milestone 28 (specialSearch.ts, specialLists.ts).
//
// The rule (docs/DESIGN.md "Archetypes"), checked every POLICY_CHECK_TICKS
// wave ticks while the charge is ready. Candidate points lie every
// POLICY_POINT_SPACING px along the path; a point "works" for a special if
// its circle catches at least POLICY_MIN_HITS live enemies.
//   1. A big one (a Troll or the boss) in a crowd: the Tar Barrel and Fire
//      Arrows take turns (Tar Barrel first). If a point works for that
//      special with a big one inside, fire it there.
//   2. Otherwise a crowd of small ones: if a point works for the Powder
//      Keg, throw it there.
//   3. Otherwise wait for the next check.
// The best point is the one catching the most enemies; ties go to the point
// furthest along the path (nearest the exit). A forbidden or locked special
// is skipped (in rule 1 the other one takes its turns).
//
// Pure: it reads the state and returns a choice; the headless recorder
// (headless.ts recordScript) fires it and writes it into the script's
// `timed` list, so a replay is the same game.

import { enemyPosition } from './combat';
import { pathLength, positionAlongPath } from './map';
import { isSpecialUnlocked, specialRadius, type SpecialType } from './specials';
import type { EnemyType, GameState, MapDef, Point } from './types';

/** Wave ticks between two looks (0.5 s), so headless runs stay fast. */
export const POLICY_CHECK_TICKS = 30;
/** Fewest enemies the circle must catch for the policy to fire. */
export const POLICY_MIN_HITS = 3;
/** Spacing of the candidate points along the path, in pixels. */
export const POLICY_POINT_SPACING = 30;

export interface PolicyOptions {
  /** A special the policy never fires (target S2 forbids each in turn). */
  forbid?: SpecialType;
}

export interface PolicyChoice {
  special: SpecialType;
  x: number;
  y: number;
  /** Enemies inside the circle at the point. */
  hits: number;
}

const candidateCache = new WeakMap<MapDef, readonly Point[]>();

/** The candidate points of a map: every POLICY_POINT_SPACING px along the path from the spawn, nearest the exit first. */
export function policyCandidates(map: MapDef): readonly Point[] {
  let points = candidateCache.get(map);
  if (!points) {
    const out: Point[] = [];
    const length = pathLength(map);
    for (let d = POLICY_POINT_SPACING; d < length; d += POLICY_POINT_SPACING) out.push(positionAlongPath(map, d));
    points = out.reverse();
    candidateCache.set(map, points);
  }
  return points;
}

/** Enemy types the policy counts as big (rule 1). */
export const BIG_ENEMIES: ReadonlySet<EnemyType> = new Set<EnemyType>(['troll', 'boss', 'grumblemaw']);

const allowed = (type: SpecialType, wave: number, options: PolicyOptions): boolean => type !== options.forbid && isSpecialUnlocked(type, wave);

/**
 * Rule 1's special on `wave`: the Tar Barrel and Fire Arrows take turns, so
 * the one that is not `lastZone` (the last of the two fired; the Tar Barrel
 * when neither has been); a forbidden or locked one is skipped. Undefined
 * when neither is allowed.
 */
export function zoneTurn(wave: number, lastZone: SpecialType | undefined, options: PolicyOptions = {}): SpecialType | undefined {
  const order: SpecialType[] = lastZone === 'tarBarrel' ? ['fireArrows', 'tarBarrel'] : ['tarBarrel', 'fireArrows'];
  return order.find((type) => allowed(type, wave, options));
}

/** The best working point for a radius (most enemies, ties nearest the exit), optionally only points with a big one inside. */
function bestPoint(state: GameState, pos: readonly { p: Point; big: boolean }[], special: SpecialType, needBig: boolean): PolicyChoice | undefined {
  const r = specialRadius(special, state.boons);
  let best: PolicyChoice | undefined;
  for (const c of policyCandidates(state.map)) {
    let hits = 0;
    let big = false;
    for (const q of pos) {
      const dx = q.p.x - c.x;
      const dy = q.p.y - c.y;
      if (Math.abs(dx) > r || Math.abs(dy) > r) continue;
      if (Math.hypot(dx, dy) <= r) {
        hits += 1;
        big ||= q.big;
      }
    }
    if (hits >= POLICY_MIN_HITS && (big || !needBig) && (!best || hits > best.hits)) best = { special, x: c.x, y: c.y, hits };
  }
  return best;
}

/**
 * What the policy fires now, or undefined: not a check tick, not in a
 * wave, no charge, or no rule applies. `lastZone` is the last Tar Barrel or
 * Fire Arrows the policy fired in this game.
 */
export function policyChoice(state: GameState, lastZone: SpecialType | undefined, options: PolicyOptions = {}): PolicyChoice | undefined {
  if (state.phase !== 'wave' || state.specialCharges <= 0 || state.waveTick % POLICY_CHECK_TICKS !== 0) return undefined;
  if (state.enemies.length < POLICY_MIN_HITS) return undefined;
  const pos = state.enemies.map((e) => ({ p: enemyPosition(e, state.map), big: BIG_ENEMIES.has(e.type) }));
  const zone = zoneTurn(state.wave, lastZone, options);
  if (zone && pos.some((q) => q.big)) {
    const choice = bestPoint(state, pos, zone, true);
    if (choice) return choice;
  }
  return allowed('keg', state.wave, options) ? bestPoint(state, pos, 'keg', false) : undefined;
}
