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

export interface KeepLevel extends LevelDef {
  readonly map: 'keep';
  readonly gate: GateDef;
  readonly keepRoads: KeepRoads;
  readonly keepSky: KeepSky;
  readonly feat: { readonly kind: 'unbroken' | 'noRepairs' };
}

const kit = { map: 'keep', featherBarrels: true, allowedTowers: allTowers,
  maxTowerLevel: 3, allowedSpecials: allSpecials, hpScale: 1, hpGrowthStart: null, rewardWaves: [] } as const;

const westWindows = [
  { position: { x: 540, y: 325 }, road: 'west', from: 170, to: 360 },
  { position: { x: 564, y: 170 }, road: 'west', from: 320, to: 510 },
] as const;
const twoRoadWindows = [{ ...westWindows[0], to: 420 }, westWindows[1]] as const;

export const KEEP_LEVELS: readonly KeepLevel[] = [
  {
    ...kit, id: 21, keepRoads: 'east', keepSky: 'dusk', feat: { kind: 'unbroken' },
    startGold: 290, gate: { maxHp: 15000, repairHp: 8300, repairCost: 49, yardLength: 275 },
    waves: [
      w(e('goblin', 42, 0.9)),
      w(e('troll', 8, 5.6), e('harpy', 14, 3.15, 5)),
      w(e('shieldbearer', 43, 0.95)),
      w(e('wolf', 45, 0.95), e('harpy', 14, 3.15, 8)),
      w(e('troll', 14, 3.65), e('goblin', 20, 2.4, 7)),
      w(e('shieldbearer', 52, 0.85), e('harpy', 26, 1.83, 0.4)),
    ],
  },
  {
    ...kit, id: 22, keepRoads: 'west', keepSky: 'dusk', feat: { kind: 'noRepairs' },
    startGold: 230, gate: { maxHp: 3850, repairHp: 750, repairCost: 46, yardLength: 275 },
    windows: westWindows,
    waves: [
      w(a('goblin', 40, 1)),
      w(a('shieldbearer', 49, 0.93), a('harpy', 14, 3.15, 8)),
      w(a('troll', 9, 6.3), a('wolf', 21, 2.2, 7)),
      w(a('wolf', 43, 0.96), a('harpy', 28, 1.55)),
      w(a('shieldbearer', 46, 0.95), a('troll', 12, 4.4, 3)),
      w(a('wolf', 52, 0.91), a('harpy', 49, 1.05)),
    ],
  },
  {
    ...kit, id: 23, keepRoads: 'both', keepSky: 'night storm', feat: { kind: 'unbroken' },
    startGold: 295, gate: { maxHp: 14500, repairHp: 7000, repairCost: 54, yardLength: 275 },
    windows: twoRoadWindows, wallSiteTax: { kind: 'royalSurvey', site: { col: 22, row: 10 } },
    waves: [
      w(e('goblin', 28, 1.6), a('goblin', 24, 1.9, 2)),
      w(e('troll', 8, 6.4), a('shieldbearer', 37, 1.37), a('harpy', 15, 3.2, 5)),
      w(e('shieldbearer', 31, 1.6), a('wolf', 32, 1.54)),
      w(e('wolf', 30, 1.6), a('wolf', 24, 2.1), e('harpy', 36, 1.45)),
      w(e('troll', 13, 4.4), a('troll', 10, 5.4, 4)),
      w(e('shieldbearer', 38, 1.5), a('shieldbearer', 33, 1.75), a('harpy', 41, 1.4)),
    ],
  },
  {
    ...kit, id: 24, keepRoads: 'both', keepSky: 'night storm', feat: { kind: 'noRepairs' },
    startGold: 290, gate: { maxHp: 15500, repairHp: 6400, repairCost: 58, yardLength: 275 },
    windows: twoRoadWindows, wallSiteTax: { kind: 'quartering', site: { col: 22, row: 10 }, price: 80 },
    waves: [
      w(e('goblin', 31, 1.5), a('goblin', 24, 1.9, 2)),
      w(a('troll', 8, 6.4), e('shieldbearer', 37, 1.37), a('harpy', 15, 3.2, 5)),
      w(a('shieldbearer', 36, 1.6), e('wolf', 35, 1.56)),
      w(a('wolf', 30, 1.6), e('wolf', 24, 2.1), a('harpy', 37, 1.45)),
      w(e('troll', 13, 4.8), a('troll', 12, 4.9, 3)),
      w(a('shieldbearer', 46, 1.45), e('shieldbearer', 33, 1.95), e('harpy', 42, 1.35)),
    ],
  },
  {
    ...kit, id: 25, keepRoads: 'both', keepSky: 'dawn', feat: { kind: 'unbroken' },
    startGold: 300, gate: { maxHp: 14500, repairHp: 6300, repairCost: 62, yardLength: 275, ramGateDps: 440 },
    windows: twoRoadWindows, endingBoss: 'grumblemaw',
    waves: [
      w(e('goblin', 31, 1.5), a('goblin', 26, 1.8, 2)),
      w(e('troll', 9, 6.1), a('shieldbearer', 39, 1.4), a('harpy', 15, 3.2, 5)),
      w(e('shieldbearer', 36, 1.7), a('wolf', 35, 1.6)),
      w(e('wolf', 32, 1.6), a('wolf', 27, 2.1), e('harpy', 39, 1.45)),
      w(e('troll', 13, 4.8), a('troll', 12, 5.2, 3)),
      w(a('ram', 1, 0, 13), e('shieldbearer', 29, 1.6), a('shieldbearer', 23, 2), a('harpy', 34, 1.6), e('harpy', 18, 2.8, 8), e('grumblemaw', 1, 0, 51)),
    ],
  },
];
