// Which way an enemy faces: the direction of its last tick of movement along
// the path, as seen on the screen (pure, so it is unit tested without Phaser).

import { positionAlongPath, type MapDef } from '../../sim';
import { LANDSCAPE, type Layout } from '../layout';
import type { Facing } from './sheets';

/** Facing for a movement vector: the dominant axis (screen y grows downward); ties go horizontal. */
export function facingOf(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/**
 * Facing of an enemy at path distance `distance` that moved `step` px this
 * tick on `map`: from where it was (distance - step) to where it is. Before
 * it has moved (distance 0) it faces the way the path starts.
 */
export function facingAt(map: MapDef, distance: number, step: number, layout: Layout = LANDSCAPE): Facing {
  const now = positionAlongPath(map, distance);
  const from = distance > 0 ? positionAlongPath(map, Math.max(0, distance - step)) : now;
  const to = distance > 0 ? now : positionAlongPath(map, 1);
  // Milestone 32b: the facing is the way the enemy moves on the screen, so a turned map turns it.
  const d = layout.screenDir(to.x - from.x, to.y - from.y);
  return facingOf(d.x, d.y);
}
