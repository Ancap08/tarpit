// The ten campaign stops. All spawn times are in seconds.
import type { LevelDef } from './levelTypes';
import type { GroupDef, WaveDef } from './types';

function g(type: GroupDef['type'], count: number, interval: number, delay = 0): GroupDef {
  return { type, count, interval, delay };
}

function w(...groups: GroupDef[]): WaveDef {
  return { groups };
}

function goblinPacks(count: number, interval: number): WaveDef {
  return w(...[0, 0.025, 0.05, 0.075].map(delay => g('goblin', count, interval, delay)));
}

const bowsAndGuns = ['musketeer', 'longbow'] as const;
const artillery = [...bowsAndGuns, 'cannon'] as const;
const slow = [...artillery, 'tarpit'] as const;
const burn = [...slow, 'firepot'] as const;
const allTowers = [...burn, 'mortar'] as const;
const keg = ['keg'] as const;
const barrel = [...keg, 'tarBarrel'] as const;
const wall = [...barrel, 'barricade'] as const;
const allSpecials = [...wall, 'guards', 'fireArrows'] as const;

export const LEVELS: readonly LevelDef[] = [
  {
    id: 1, map: 'meadow', startGold: 100, hpScale: 1, hpGrowthStart: null,
    allowedTowers: bowsAndGuns, maxTowerLevel: 2, allowedSpecials: keg, rewardWaves: [],
    waves: [
      w(g('goblin', 24, 2.5)), w(g('goblin', 32, 1.85)), w(g('goblin', 38, 1.5)),
      w(g('goblin', 48, 1.25)), w(g('goblin', 50, 1.2)), w(g('goblin', 55, 1.1)),
    ],
  },
  {
    id: 2, map: 'meadow', startGold: 240, hpScale: 4, hpGrowthStart: null,
    allowedTowers: artillery, maxTowerLevel: 2, allowedSpecials: keg, rewardWaves: [],
    waves: [
      goblinPacks(15, 3.6), goblinPacks(18, 3.4), goblinPacks(19, 3.35),
      goblinPacks(19, 3.3), goblinPacks(20, 3.2), goblinPacks(20, 3.15),
    ],
  },
  {
    id: 3, map: 'switchback', startGold: 250, hpScale: 4.1, hpGrowthStart: null,
    allowedTowers: slow, maxTowerLevel: 2, allowedSpecials: keg, rewardWaves: [],
    waves: [
      w(g('wolf', 32, 1.9)),
      w(g('wolf', 56, 1)),
      w(g('wolf', 49, 1.25)),
      w(g('wolf', 60, 1.05)),
      w(g('wolf', 74, 0.85)),
      w(g('wolf', 90, 0.7)),
      w(g('wolf', 126, 0.5)),
    ],
  },
  {
    id: 4, map: 'switchback', startGold: 380, hpScale: 1.7, hpGrowthStart: null,
    allowedTowers: burn, maxTowerLevel: 2, allowedSpecials: keg, rewardWaves: [],
    waves: [
      w(g('shieldbearer', 16, 2.8)),
      w(g('shieldbearer', 50, 1.1)),
      w(g('shieldbearer', 27, 1.8), g('wolf', 31, 1.6, 0.3)),
      w(g('shieldbearer', 31, 1.6), g('wolf', 37, 1.35, 0.3)),
      w(g('shieldbearer', 36, 1.35), g('wolf', 43, 1.15, 0.3)),
      w(g('shieldbearer', 42, 1.15), g('wolf', 48, 1.05, 0.3)),
      w(g('shieldbearer', 51, 1), g('wolf', 50, 1, 0.3)),
    ],
  },
  {
    id: 5, map: 'riverbend', startGold: 180, hpScale: 1.4, hpGrowthStart: null,
    allowedTowers: burn, maxTowerLevel: 2, allowedSpecials: barrel, rewardWaves: [],
    waves: [
      w(g('harpy', 25, 2.6)),
      w(g('harpy', 34, 1.95), g('goblin', 42, 1.6)),
      w(g('harpy', 40, 1.6), g('wolf', 47, 1.4)),
      w(g('harpy', 45, 1.48), g('goblin', 55, 1.2)),
      w(g('harpy', 53, 1.25), g('shieldbearer', 35, 1.9)),
      w(g('harpy', 66, 1), g('wolf', 65, 1.05)),
      w(g('harpy', 89, 0.75), g('shieldbearer', 60, 1.1)),
    ],
  },
  {
    id: 6, map: 'riverbend', startGold: 400, hpScale: 0.7, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 2, allowedSpecials: barrel, rewardWaves: [],
    waves: [
      w(g('troll', 4, 12), g('goblin', 28, 1.7, 1)),
      w(g('troll', 3, 0.55), g('troll', 3, 0.55, 12), g('troll', 3, 0.55, 25), g('troll', 3, 0.55, 38), g('troll', 3, 0.55, 51)),
      w(g('troll', 8, 6.5), g('shieldbearer', 29, 1.8, 1)),
      w(g('troll', 10, 5), g('goblin', 40, 1.4, 1)),
      w(g('troll', 12, 4.5), g('harpy', 40, 1.4, 1)),
      w(g('troll', 14, 3.9), g('shieldbearer', 41, 1.4, 1)),
      w(g('troll', 18, 3.25), g('wolf', 52, 1.1, 1)),
    ],
  },
  {
    id: 7, map: 'meadow', startGold: 180, hpScale: 2, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 2, allowedSpecials: wall, rewardWaves: [],
    waves: [
      w(g('goblin', 80, 0.65)),
      w(g('wolf', 78, 0.68)),
      w(g('goblin', 105, 0.5)),
      w(g('shieldbearer', 52, 1.06)),
      w(g('goblin', 106, 0.5)),
      w(g('wolf', 108, 0.5)),
      w(g('goblin', 109, 0.5)),
      w(g('shieldbearer', 142, 0.5)),
    ],
  },
  {
    id: 8, map: 'switchback', startGold: 300, hpScale: 1.15, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 2, allowedSpecials: allSpecials, rewardWaves: [],
    waves: [
      w(g('shieldbearer', 40, 1.7), g('wolf', 45, 1.5)),
      w(g('troll', 6, 9.22), g('goblin', 68, 0.8, 0.29)),
      w(g('shieldbearer', 68, 0.76), g('harpy', 35, 1.47)),
      w(g('wolf', 76, 0.67), g('harpy', 36, 1.41)),
      w(g('troll', 12, 4.71), g('shieldbearer', 50, 1.1, 0.4)),
      w(g('shieldbearer', 86, 0.6), g('harpy', 45, 1.17)),
      w(g('troll', 20, 3.35), g('wolf', 59, 1.1, 0.4)),
    ],
  },
  {
    id: 9, map: 'riverbend', startGold: 300, hpScale: 1, hpGrowthStart: 6,
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [5],
    waves: [
      w(g('wolf', 34, 1.67), g('shieldbearer', 19, 3.07)),
      w(g('troll', 8, 8.23), g('harpy', 35, 1.62)),
      w(g('shieldbearer', 86, 0.66), g('harpy', 42, 1.32)),
      w(g('troll', 12, 5.14), g('wolf', 72, 0.85, 0.34)),
      w(g('troll', 17, 3.62), g('shieldbearer', 61, 1, 0.4)),
      w(g('wolf', 114, 0.5), g('harpy', 59, 1.01)),
      w(g('shieldbearer', 108, 0.68), g('harpy', 64, 1.12), g('boss', 1, 0, 59.2)),
    ],
  },
  {
    id: 10, map: 'meadow', startGold: 300, hpScale: 1, hpGrowthStart: 5,
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [5],
    waves: [
      w(g('wolf', 66, 1.05), g('shieldbearer', 47, 1.5)),
      w(g('troll', 9, 6.48), g('goblin', 73, 0.72, 0.26)),
      w(g('shieldbearer', 85, 0.6), g('harpy', 44, 1.21)),
      w(g('troll', 14, 4), g('wolf', 68, 0.76, 0.27)),
      w(g('troll', 17, 3.3), g('shieldbearer', 56, 0.93, 0.33)),
      w(g('wolf', 104, 0.5), g('harpy', 66, 0.8)),
      w(g('shieldbearer', 88, 0.7), g('harpy', 65, 0.94), g('grumblemaw', 1, 0, 52.56)),
    ],
  },
];
