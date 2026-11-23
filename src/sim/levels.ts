// The ten campaign stops. All spawn times are in seconds.
import type { LevelDef } from './levelTypes';
import type { GroupDef, WaveDef } from './types';

function g(type: GroupDef['type'], count: number, interval: number, delay = 0): GroupDef {
  return { type, count, interval, delay };
}

function w(...groups: GroupDef[]): WaveDef {
  return { groups };
}

// Interleave the groups so one formation arrives together, then leave a gap.
function formation(type: GroupDef['type'], total: number, width: number, interval: number, stagger: number): GroupDef[] {
  return Array.from({ length: Math.min(total, width) }, (_, i) =>
    g(type, Math.ceil((total - i) / width), interval, i * stagger));
}

function goblinPacks(count: number, interval: number, packSize = 4): WaveDef {
  return w(...formation('goblin', count * packSize, packSize, interval, 0.025));
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
      w(...formation('goblin', 44, 4, 5, 0.16)), w(...formation('goblin', 48, 4, 4.75, 0.16)),
      w(...formation('goblin', 52, 4, 4.5, 0.16)), w(...formation('goblin', 56, 4, 4.25, 0.16)),
      w(...formation('goblin', 60, 4, 4, 0.16)), w(...formation('goblin', 64, 4, 3.75, 0.16)),
    ],
  },
  {
    id: 2, map: 'meadow', startGold: 150, hpScale: 1.979, hpGrowthStart: null,
    allowedTowers: artillery, maxTowerLevel: 2, allowedSpecials: keg, rewardWaves: [],
    waves: [
      w(...formation('goblin', 48, 3, 3.3, 0.025)), w(...formation('goblin', 48, 6, 3, 0)), goblinPacks(19, 3.35),
      goblinPacks(19, 3.3), goblinPacks(20, 3.2), goblinPacks(20, 3.15),
    ],
  },
  {
    id: 3, map: 'switchback', startGold: 220, hpScale: 1.375, hpGrowthStart: null,
    allowedTowers: slow, maxTowerLevel: 2, allowedSpecials: keg, rewardWaves: [],
    waves: [
      w(g('wolf', 17, 3.03), g('wolf', 17, 3.03, 0.95), g('wolf', 17, 3.03, 0.47),
        g('wolf', 17, 3.03, 0.9), g('wolf', 16, 3.03, 1.6), g('wolf', 17, 3.03, 2.16)),
      w(g('wolf', 56, 1)),
      w(g('wolf', 49, 1.25)),
      w(g('wolf', 60, 1.05)),
      w(g('wolf', 74, 0.85)),
      w(g('wolf', 90, 0.7)),
      w(g('wolf', 126, 0.5)),
    ],
  },
  {
    id: 4, map: 'switchback', startGold: 270, hpScale: 1.33, hpGrowthStart: null,
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
    id: 5, map: 'riverbend', startGold: 180, hpScale: 1.27, hpGrowthStart: null,
    allowedTowers: burn, maxTowerLevel: 2, allowedSpecials: barrel, rewardWaves: [],
    waves: [
      w(...formation('harpy', 25, 4, 10.4, 0.15)),
      w(...formation('harpy', 34, 4, 7.8, 0.15), g('goblin', 42, 1.6)),
      w(...formation('harpy', 40, 4, 6.4, 0.15), g('wolf', 47, 1.4)),
      w(...formation('harpy', 45, 4, 5.92, 0.15), g('goblin', 55, 1.2)),
      w(...formation('harpy', 53, 4, 5, 0.15), g('shieldbearer', 35, 1.9)),
      w(...formation('harpy', 66, 4, 4, 0.15), g('wolf', 65, 1.05)),
      w(...formation('harpy', 89, 4, 3, 0.15), g('shieldbearer', 60, 1.1)),
    ],
  },
  {
    id: 6, map: 'riverbend', startGold: 280, hpScale: 1, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 2, allowedSpecials: barrel, rewardWaves: [],
    waves: [
      w(g('goblin', 48, 1.2), g('troll', 1, 0, 20)),
      w(g('troll', 2, 0.55), g('troll', 2, 0.55, 51), g('goblin', 25, 2.2, 0.25)),
      w(g('troll', 5, 11), g('shieldbearer', 29, 1.8, 1)),
      w(g('troll', 6, 8.5), g('goblin', 40, 1.4, 1)),
      w(g('troll', 7, 7.5), g('harpy', 40, 1.4, 1)),
      w(g('troll', 8, 6.5), g('shieldbearer', 41, 1.4, 1)),
      w(g('troll', 11, 5.5), g('wolf', 52, 1.1, 1)),
    ],
  },
  {
    id: 7, map: 'meadow', startGold: 145, hpScale: 1.3, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 2, allowedSpecials: wall, rewardWaves: [],
    waves: [
      w(g('goblin', 165, 0.5)),
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
    id: 8, map: 'switchback', startGold: 300, hpScale: 1.3, hpGrowthStart: null,
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
    id: 9, map: 'riverbend', startGold: 285, hpScale: 1, hpGrowthStart: 6,
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [5],
    waves: [
      w(g('wolf', 34, 1.67), g('shieldbearer', 19, 3.07)),
      w(g('troll', 8, 8.23), g('harpy', 35, 1.62)),
      w(g('shieldbearer', 86, 0.66), g('harpy', 42, 1.32)),
      w(g('troll', 12, 5.14), g('wolf', 72, 0.85, 0.34)),
      w(g('troll', 17, 3.62), g('shieldbearer', 61, 1, 0.4)),
      w(g('wolf', 114, 0.5), g('harpy', 59, 1.01)),
      w(g('shieldbearer', 108, 0.68), g('harpy', 64, 1.12), g('boss', 1, 0, 75)),
    ],
  },
  {
    id: 10, map: 'meadow', startGold: 300, hpScale: 0.925, hpGrowthStart: 5,
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [5],
    waves: [
      w(g('wolf', 66, 1.05), g('shieldbearer', 47, 1.5)),
      w(g('troll', 9, 6.48), g('goblin', 73, 0.72, 0.26)),
      w(g('shieldbearer', 85, 0.6), g('harpy', 44, 1.21)),
      w(g('troll', 14, 4), g('wolf', 68, 0.76, 0.27)),
      w(g('troll', 17, 3.3), g('shieldbearer', 56, 0.93, 0.33)),
      w(g('wolf', 104, 0.5), g('harpy', 66, 0.8)),
      w(g('shieldbearer', 88, 0.7), g('harpy', 65, 0.94), g('grumblemaw', 1, 0, 63)),
    ],
  },
];
