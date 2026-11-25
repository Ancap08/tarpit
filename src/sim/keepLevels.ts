// Act Three is a separate list until its campaign screens ship.
// Each spawn group specifies the approach and its timing in seconds.
import type { GateDef, KeepRoads, KeepSky, LevelDef } from './levelTypes';
import { allSpecials, allTowers } from './levels';
import type { GroupDef, WaveDef } from './types';

const w = (...groups: GroupDef[]): WaveDef => ({ groups });
const group = (road: 'east' | 'west') =>
  (type: GroupDef['type'], count: number, interval: number, delay = 0): GroupDef =>
    ({ road, type, count, interval, delay });
const e = group('east');
const a = group('west');

// A flight arrives together, with a gap for the next flight to form.
function harpyFlights(road: 'east' | 'west', flights: number, first: number, gap: number): GroupDef[] {
  const spawn = group(road);
  return Array.from({ length: flights }, (_, index) => spawn('harpy', 4, 0.2, first + index * gap));
}

export interface KeepLevel extends LevelDef {
  readonly map: 'keep';
  readonly gate: GateDef;
  readonly keepRoads: KeepRoads;
  readonly keepSky: KeepSky;
  readonly feat: { readonly kind: 'unbroken' | 'noRepairs' };
}

const kit = { map: 'keep', featherBarrels: true, allowedTowers: allTowers,
  maxTowerLevel: 3, allowedSpecials: allSpecials, hpScale: 1, hpGrowthStart: null, rewardWaves: [] } as const;

const twoRoadWindows = [
  { position: { x: 540, y: 325 }, road: 'west', from: 170, to: 420 },
  { position: { x: 564, y: 170 }, road: 'west', from: 320, to: 510 },
] as const;
const featherBedsWindows = [
  { position: { x: 540, y: 325 }, road: 'west', from: 572, to: 620 },
  { position: { x: 564, y: 170 }, road: 'west', from: 690, to: 751 },
] as const;
const quarteringWindows = [
  { ...twoRoadWindows[0], from: 443, to: 472 },
  { ...twoRoadWindows[1], from: 510, to: 605 },
] as const;

export const KEEP_LEVELS: readonly KeepLevel[] = [
  {
    ...kit, id: 21, keepRoads: 'east', keepSky: 'dusk', feat: { kind: 'unbroken' },
    startGold: 290, gate: { maxHp: 8160, repairHp: 2600, repairCost: 90, yardLength: 275 },
    waves: [
      w(e('goblin', 42, 0.9)),
      w(e('troll', 8, 5.6), ...harpyFlights('east', 8, 8, 6.3)),
      w(e('shieldbearer', 43, 0.95), ...harpyFlights('east', 3, 8, 8.2)),
      w(e('wolf', 45, 0.95), ...harpyFlights('east', 8, 5, 5.6)),
      w(e('troll', 10, 3.5), e('goblin', 20, 2.4, 7), ...harpyFlights('east', 6, 8, 7)),
      w(e('shieldbearer', 52, 0.85), ...harpyFlights('east', 10, 5, 5.1)),
    ],
  },
  {
    ...kit, hpScale: 1.12, id: 22, keepRoads: 'west', keepSky: 'dusk', feat: { kind: 'noRepairs' },
    startGold: 232, gate: { maxHp: 4700, repairHp: 1150, repairCost: 66, yardLength: 160 },
    windows: featherBedsWindows,
    waves: [
      w(a('goblin', 28, 1.3)),
      w(a('shieldbearer', 34, 1.26), ...harpyFlights('west', 9, 7, 4.45)),
      w(a('troll', 9, 5.8), a('wolf', 16, 2.8, 8), ...harpyFlights('west', 8, 11, 4.8)),
      w(a('troll', 6, 4.6, 4), a('wolf', 31, 1.51, 4), a('harpy', 34, 0.8, 2)),
      w(a('shieldbearer', 38, 1.23), a('troll', 10, 4.8, 3), ...harpyFlights('west', 5, 8, 8.8)),
      w(a('troll', 6, 0.3, 4), a('troll', 13, 1.75, 8), a('shieldbearer', 22, 1.8, 12), ...harpyFlights('west', 9, 7, 5.35)),
    ],
  },
  {
    ...kit, hpScale: 1.08, id: 23, keepRoads: 'both', keepSky: 'night storm', feat: { kind: 'unbroken' },
    startGold: 275, gate: { maxHp: 16900, repairHp: 3700, repairCost: 72, yardLength: 330 },
    windows: twoRoadWindows, wallSiteTax: { kind: 'royalSurvey', sites: [{ col: 22, row: 7 }, { col: 23, row: 13 }] },
    waves: [
      w(e('goblin', 28, 1.6), a('goblin', 24, 1.9, 2)),
      w(e('troll', 5, 7), a('shieldbearer', 26, 1.6), ...harpyFlights('west', 8, 7, 5.1)),
      w(e('shieldbearer', 30, 1.65), a('troll', 8, 6.1), ...harpyFlights('east', 9, 6, 4.5)),
      w(e('wolf', 30, 1.6), a('wolf', 24, 2.05), ...harpyFlights('west', 11, 1, 4.4)),
      w(e('troll', 13, 2.7), a('troll', 13, 2.7, 4), ...harpyFlights('east', 6, 9, 7.2)),
      w(e('shieldbearer', 36, 1.46), a('shieldbearer', 29, 1.84), ...harpyFlights('west', 8, 6, 6.1)),
    ],
  },
  {
    ...kit, id: 24, keepRoads: 'both', keepSky: 'night storm', feat: { kind: 'noRepairs' },
    startGold: 285, gate: { maxHp: 16200, repairHp: 4200, repairCost: 80, yardLength: 290 },
    windows: quarteringWindows, wallSiteTax: { kind: 'quartering', site: { col: 22, row: 10 }, price: 80 },
    waves: [
      w(e('goblin', 31, 1.5), a('goblin', 24, 1.9, 2)),
      w(a('troll', 6, 7), e('shieldbearer', 33, 1.5), ...harpyFlights('west', 4, 14, 8.3)),
      w(a('shieldbearer', 35, 1.45), e('troll', 9, 5.9), ...harpyFlights('east', 8, 10, 5.1)),
      w(a('wolf', 30, 1.6), e('wolf', 24, 2.05), ...harpyFlights('west', 8, 3, 6.1)),
      w(e('troll', 11, 4), a('troll', 15, 3.9, 9), ...harpyFlights('east', 7, 6, 6.8)),
      w(a('shieldbearer', 41, 1.35), e('shieldbearer', 32, 1.8), a('troll', 5, 3.8, 3), ...harpyFlights('east', 9, 4, 5.8)),
    ],
  },
  {
    ...kit, hpScale: 1.25, id: 25, keepRoads: 'both', keepSky: 'dawn', feat: { kind: 'unbroken' },
    startGold: 295, gate: { maxHp: 16100, repairHp: 4300, repairCost: 105, yardLength: 295, ramGateDps: 375 },
    windows: twoRoadWindows, endingBoss: 'grumblemaw',
    waves: [
      w(e('goblin', 31, 1.5), a('goblin', 26, 1.8, 2)),
      w(e('troll', 7, 6.4), a('shieldbearer', 34, 1.51), ...harpyFlights('west', 5, 7, 8)),
      w(e('shieldbearer', 32, 1.58), a('troll', 9, 5.8), ...harpyFlights('east', 7, 6, 7.3)),
      w(e('wolf', 30, 1.6), a('wolf', 25, 2.05), ...harpyFlights('west', 8, 4, 6.1)),
      w(e('troll', 10, 4.8), a('troll', 10, 4.8, 3), ...harpyFlights('east', 6, 10, 8)),
      w(
        a('ram', 1, 0, 12),
        e('shieldbearer', 28, 1.8),
        a('shieldbearer', 22, 2.35),
        ...harpyFlights('east', 13, 6, 4.55),
        e('grumblemaw', 1, 0, 24),
      ),
    ],
  },
];
