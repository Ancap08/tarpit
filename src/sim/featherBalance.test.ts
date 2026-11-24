import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { comboBuild, comboIdleBarrel, comboWithoutSpecial, playScripted, type RecordedOutcome } from './headless';
import { SPECIAL_RECHARGE_TICKS } from './specials';
import { MAP_IDS, type MapId } from './map';

function measure(map: MapId) {
  const lives: number[] = [];
  const record = (outcome: RecordedOutcome, refused: number) => {
    expect(refused, map).toBe(0);
    expect(['won', 'lost'], map).toContain(outcome.phase);
    lives.push(Math.max(0, outcome.lives));
  };
  const alternating = comboBuild('normal', map, undefined, record);
  const idle = comboIdleBarrel(map, record);
  const barrels = comboWithoutSpecial('fireArrows', 'normal', map, undefined, record);
  const arrows = comboWithoutSpecial('tarBarrel', 'normal', map, undefined, record);
  const casts = (script: typeof idle) => script.timed?.flat().flatMap(action => action.type === 'special' ? [action.special] : []);
  // Both policies see the same board up to the first skipped opportunity.
  const wave = alternating.timed!.findIndex(actions => actions.some(a => a.type === 'special' && a.special === 'tarBarrel'));
  const firstBarrel = alternating.timed![wave].find(a => a.type === 'special' && a.special === 'tarBarrel')!;
  expect(idle.timed!.slice(0, wave)).toEqual(alternating.timed!.slice(0, wave));
  expect(idle.timed![wave].filter(a => a.atWaveTick < firstBarrel.atWaveTick))
    .toEqual(alternating.timed![wave].filter(a => a.atWaveTick < firstBarrel.atWaveTick));
  expect(idle.timed![wave].some(a => a.atWaveTick >= firstBarrel.atWaveTick &&
    a.atWaveTick < firstBarrel.atWaveTick + SPECIAL_RECHARGE_TICKS)).toBe(false);
  expect(casts(idle)).not.toContain('tarBarrel');
  expect(casts(idle)).toContain('fireArrows');
  expect(casts(barrels)).toContain('tarBarrel');
  expect(casts(barrels)).not.toContain('fireArrows');
  expect(casts(arrows)).toContain('fireArrows');
  expect(casts(arrows)).not.toContain('tarBarrel');
  const [standard, unused, barrelOnly, arrowsOnly] = lives;
  return { map, standard, unused, barrelOnly, arrowsOnly };
}

describe('Tar Barrel Free play targets', () => {
  const results = new Map<MapId, ReturnType<typeof measure>>();
  function row(map: MapId) {
    if (!results.has(map)) results.set(map, measure(map));
    return results.get(map)!;
  }
  it.each([['meadow', 4], ['switchback', 3], ['riverbend', 4]] as const)('C2: casting beats resting on %s by at least %i lives', (map, margin) => {
    const r = row(map);
    expect(r.standard - r.unused, JSON.stringify(r)).toBeGreaterThanOrEqual(margin);
  });
  it('C3: giving Fire Arrows turns to the barrel beats the reverse somewhere', () => {
    const rows = MAP_IDS.map(row);
    expect(rows.some(r => r.barrelOnly > r.arrowsOnly), JSON.stringify(rows)).toBe(true);
  });
});

// SHA-256 over the raw JSON state, action log and wave results from d517ac8.
it.each([
  ['meadow', 'b8279e170cf541bbd446e3392bf1d5fe5b2b9a18ea8f8de7c3c6172d237bb0ca'],
  ['riverbend', 'ff38761eaeb51449bcd22e18a5c328d6760a2ff2e6209812415d624ae3f942f0'],
] as const)('R7: a complete %s Free play run without feathers keeps its original bytes', (map, hash) => {
  const script = comboWithoutSpecial('tarBarrel', 'normal', map);
  const tarCells = new Set(script.flat().filter(a => a.type === 'build' && a.tower === 'tarpit').map(a => JSON.stringify(a.cell)));
  expect(script.flat().some(a => a.type === 'upgrade' && a.path === 'B' && tarCells.has(JSON.stringify(a.cell)))).toBe(false);
  expect(script.timed?.flat().some(a => a.type === 'special' && a.special === 'tarBarrel')).toBe(false);
  expect(createHash('sha256').update(JSON.stringify(playScripted(script, undefined, 'normal'))).digest('hex')).toBe(hash);
});
