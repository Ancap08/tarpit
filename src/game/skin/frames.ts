import type { Facing } from '../anim/sheets';
import type { Layout } from '../layout';
import type { EnemyType, Point, TowerType } from '../../sim';

export const towerArt = (type: TowerType) => type === 'tarpit' ? 'tar-pit' : type === 'firepot' ? 'fire-pot' : type;
export const enemyArt = (type: EnemyType) => type === 'boss' ? 'grumblefoot' : type;

/** The atlas starts at north and runs clockwise. Game angles start at world east. */
export function bearingFrame(angle: number, layout: Layout): number {
  const sector = Math.round(angle / (Math.PI / 8)) + (layout.turned ? 8 : 4);
  return ((sector % 16) + 16) % 16;
}

const rows = { up: 0, right: 1, down: 2, left: 3 };
export function walkFrame(facing: Facing, distance: number, frozen: boolean): number {
  return rows[facing] * 4 + (frozen ? 0 : Math.floor(distance / 6) % 4);
}

/** Flyers have their own layer. Everyone standing on the board sorts by ground contact. */
export function footDepth(world: Point, layout: Layout): number {
  return layout.toScreen(world).y;
}
