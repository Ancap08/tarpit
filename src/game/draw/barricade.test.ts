import { expect, it } from 'vitest';
import { SPECIAL_DEFS } from '../../sim/specials';
import { TOWER_DEFS, TOWER_PATHS } from '../../sim/towers';
import { HELD_DRAW_CAP } from './barricade';

it('a blast or zone centred on any held sprite reaches its simulation position', () => {
  const specialRadii = Object.entries(SPECIAL_DEFS)
    .filter(([type]) => type !== 'barricade')
    .map(([, special]) => special.radius);
  const splashRadii = (['cannon', 'mortar'] as const).flatMap(type => [
    TOWER_DEFS[type].base, TOWER_DEFS[type].upgraded, TOWER_PATHS[type].A, TOWER_PATHS[type].B,
  ].map(stats => stats.splashRadius));
  expect(HELD_DRAW_CAP).toBeLessThanOrEqual(Math.min(...specialRadii, ...splashRadii));
});
