import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { comboWithoutSpecial, playScripted } from './headless';

// SHA-256 over the raw JSON state, action log and wave results from d517ac8.
it.each([
  ['meadow', 'b8279e170cf541bbd446e3392bf1d5fe5b2b9a18ea8f8de7c3c6172d237bb0ca'],
  ['riverbend', 'ff38761eaeb51449bcd22e18a5c328d6760a2ff2e6209812415d624ae3f942f0'],
] as const)('R7: a complete %s campaign without feathers keeps its original bytes', (map, hash) => {
  const script = comboWithoutSpecial('tarBarrel', 'normal', map);
  const tarCells = new Set(script.flat().filter(a => a.type === 'build' && a.tower === 'tarpit').map(a => JSON.stringify(a.cell)));
  expect(script.flat().some(a => a.type === 'upgrade' && a.path === 'B' && tarCells.has(JSON.stringify(a.cell)))).toBe(false);
  expect(script.timed?.flat().some(a => a.type === 'special' && a.special === 'tarBarrel')).toBe(false);
  expect(createHash('sha256').update(JSON.stringify(playScripted(script, undefined, 'normal'))).digest('hex')).toBe(hash);
});
