// Which way an enemy faces: the direction of its last tick of movement along
// the path (pure, so it is unit tested without Phaser).

import { MAP, positionAlongPath } from '../../sim';
import type { Facing } from './sheets';

/** Facing for a movement vector: the dominant axis (screen y grows downward); ties go horizontal. */
export function facingOf(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/**
 * Facing of an enemy at path distance `distance` that moved `step` px this
 * tick: from where it was (distance - step) to where it is. Before it has
 * moved (distance 0) it faces the way the path starts.
 */
export function facingAt(distance: number, step: number): Facing {
  const now = positionAlongPath(MAP, distance);
  const from = distance > 0 ? positionAlongPath(MAP, Math.max(0, distance - step)) : now;
  const to = distance > 0 ? now : positionAlongPath(MAP, 1);
  return facingOf(to.x - from.x, to.y - from.y);
}
