// The fixed campaign offers, in menu and default headless-pick order.
// Values are multipliers except for the two immediate grants.
export const BOONS = {
  longBarrels: { id: 'longBarrels', wave: 5, value: 1.3 },
  keenArrows: { id: 'keenArrows', wave: 5, value: 1.11 },
  warChest: { id: 'warChest', wave: 5, value: 80 },
  stickyTar: { id: 'stickyTar', wave: 10, value: 2 },
  hotCoals: { id: 'hotCoals', wave: 10, value: 2.1 },
  quickHands: { id: 'quickHands', wave: 10, value: 0.57 },
  stoneWalls: { id: 'stoneWalls', wave: 15, value: 4 },
  veteranCrews: { id: 'veteranCrews', wave: 15, value: 1.11 },
  biggerBlasts: { id: 'biggerBlasts', wave: 15, value: 1.3 },
} as const;

export type BoonId = keyof typeof BOONS;
export interface BoonOffer {
  wave: number;
  options: BoonId[];
}

export function boonOptions(wave: number): BoonId[] {
  return Object.values(BOONS).filter((b) => b.wave === wave).map((b) => b.id);
}

// All multipliers in the table are whole percentages. Multiply by the
// integer numerator first so e.g. 105 px at 115% is exactly 120.75 px.
export function boonScale(base: number, held: readonly BoonId[], id: Exclude<BoonId, 'warChest' | 'stoneWalls'>): number {
  return held.includes(id) ? base * Math.round(100 * BOONS[id].value) / 100 : base;
}
