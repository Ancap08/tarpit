import { expect, it } from 'vitest';
import { SPECIAL_DEFS } from '../../sim/specials';
import { TOWER_DEFS, TOWER_PATHS } from '../../sim/towers';
import { HELD_DRAW_CAP } from './barricade';
import { GUARD_ACROSS_OFFSET, GUARD_ALONG_OFFSET } from './guards';

it('a blast or zone centred on a held enemy or staggered guard reaches its simulation position', () => {
  const specialRadii = Object.entries(SPECIAL_DEFS)
    .filter(([, special]) => special.radius > 0)
    .map(([, special]) => special.radius);
  const splashRadii = (['cannon', 'mortar'] as const).flatMap(type => [
    TOWER_DEFS[type].base, TOWER_DEFS[type].upgraded, TOWER_PATHS[type].A, TOWER_PATHS[type].B,
  ].map(stats => stats.splashRadius));
  const smallestRadius = Math.min(...specialRadii, ...splashRadii);
  expect(HELD_DRAW_CAP).toBeLessThanOrEqual(smallestRadius);
  expect(Math.hypot(GUARD_ALONG_OFFSET, GUARD_ACROSS_OFFSET)).toBeLessThan(smallestRadius);
});
