import { describe, expect, it } from 'vitest';
import { COPY_WITNESSES, PATH_WITNESSES, measurePathWitness } from './pathBalance';
import { TOWER_DEFS } from './towers';
import type { TowerType } from './types';

const types = Object.keys(TOWER_DEFS) as TowerType[];

describe('U6: paths versus another level-two tower', () => {
  it.each(types)('%s has a same-budget tie or a strict result in both directions', (tower) => {
    const witnesses = COPY_WITNESSES.filter((witness) => witness.tower === tower);
    expect(witnesses.some((witness) => witness.tie) ||
      (witnesses.some((witness) => witness.winner === 'copy') && witnesses.some((witness) => witness.other === 'copy'))).toBe(true);
    for (const witness of witnesses) {
      expect((witness.winner === 'copy') !== (witness.other === 'copy')).toBe(true);
      const result = measurePathWitness(witness);
      const note = JSON.stringify({ witness, ...result });
      expect(result.valid, note).toBe(true);
      if (witness.tie) expect(result.delta, note).toBe(0);
      else expect(result.delta, note).toBeGreaterThan(0);
    }
  });
});

describe('U4: both paths of every tower have a strict win', () => {
  it.each(types)('%s has a same-budget witness for A and B', (tower) => {
    const witnesses = PATH_WITNESSES.filter((witness) => witness.tower === tower);
    for (const winner of ['A', 'B'] as const) {
      const witness = witnesses.find((witness) => witness.winner === winner && witness.other === (winner === 'A' ? 'B' : 'A'));
      expect(witness, `Missing ${tower} path ${winner} witness`).toBeDefined();
      const result = measurePathWitness(witness!);
      const note = JSON.stringify({ witness, ...result });
      expect(result.valid, note).toBe(true);
      expect(result.winnerCount, note).toBe(result.winnerBuilt);
      expect(result.otherCount, note).toBe(result.otherBuilt);
      expect(result.delta, note).toBeGreaterThan(0);
    }
  });
});
