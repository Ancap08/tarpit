// The campaign stops. All spawn times are in seconds.
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
    id: 2, map: 'meadow', startGold: 100, hpScale: 1.25, hpGrowthStart: 1,
    allowedTowers: artillery, maxTowerLevel: 2, allowedSpecials: keg, rewardWaves: [],
    waves: [
      w(...formation('goblin', 6, 3, 7, 0.025)),
      w(...formation('goblin', 18, 3, 7, 0.025)),
      w(...formation('goblin', 21, 3, 7, 0.025)),
      w(...formation('goblin', 42, 6, 3, 0), g('goblin', 3, 1.6, 34)),
      w(...formation('goblin', 60, 4, 4.75, 0.025)),
      w(...formation('goblin', 75, 5, 3.8, 0.025)),
    ],
  },
  {
    id: 3, map: 'switchback', startGold: 160, hpScale: 1.14, hpGrowthStart: 2,
    allowedTowers: slow, maxTowerLevel: 2, allowedSpecials: keg, rewardWaves: [],
    waves: [
      w(g('wolf', 47, 0.55)),
      w(g('wolf', 126, 0.5)),
      w(g('wolf', 49, 1.25)),
      w(g('wolf', 60, 1.05)),
      w(g('wolf', 74, 0.85)),
      w(g('wolf', 90, 0.7)),
      w(g('wolf', 126, 0.5)),
    ],
  },
  {
    id: 4, map: 'switchback', startGold: 285, hpScale: 1.35, hpGrowthStart: 3,
    allowedTowers: burn, maxTowerLevel: 2, allowedSpecials: keg, rewardWaves: [],
    waves: [
      w(g('goblin', 13, 2.4)),
      w(g('shieldbearer', 11, 2.92)),
      w(g('wolf', 33, 1.48)),
      w(g('shieldbearer', 23, 2)),
      w(g('shieldbearer', 37, 1.125)),
      w(g('wolf', 20, 2.05, 0.4), g('shieldbearer', 21, 2.7)),
      w(g('wolf', 24, 2.05, 0.4), g('shieldbearer', 24, 2.35)),
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
    id: 6, map: 'riverbend', startGold: 270, hpScale: 1, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 2, allowedSpecials: barrel, rewardWaves: [],
    waves: [
      w(g('goblin', 56, 1.19)),
      w(...formation('troll', 4, 2, 20, 0.06), g('goblin', 15, 3.71, 0.7)),
      w(g('troll', 4, 8), g('shieldbearer', 29, 1.8, 1)),
      w(g('troll', 6, 8.5), g('goblin', 40, 1.4, 1)),
      w(g('troll', 8, 7), g('harpy', 48, 1.17, 1)),
      w(g('troll', 8, 6.5), g('shieldbearer', 41, 1.4, 1)),
      w(g('troll', 20, 3.2), g('wolf', 52, 1.1, 1)),
    ],
  },
  {
    id: 7, map: 'meadow', startGold: 245, hpScale: 1.3, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 2, allowedSpecials: wall, rewardWaves: [],
    waves: [
      w(g('goblin', 53, 0.84)),
      w(...formation('shieldbearer', 100, 5, 3.5, 0.06)),
      w(...formation('wolf', 72, 6, 3.5, 0.06)),
      w(g('troll', 8, 5), g('shieldbearer', 40, 1.4)),
      w(g('goblin', 106, 0.5)),
      w(g('wolf', 108, 0.5)),
      w(g('goblin', 109, 0.5)),
      w(g('shieldbearer', 142, 0.5)),
    ],
  },
  {
    id: 8, map: 'switchback', startGold: 295, hpScale: 1.28, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 2, allowedSpecials: allSpecials, rewardWaves: [],
    waves: [
      w(g('wolf', 36, 1.23)),
      w(...formation('shieldbearer', 30, 3, 3.4, 0.06), g('harpy', 30, 1.97, 0.4)),
      w(...formation('wolf', 36, 3, 3.4, 0.06), g('harpy', 32, 1.87, 0.4)),
      w(g('wolf', 76, 0.67), g('harpy', 36, 1.41)),
      w(g('troll', 30, 2.3), g('shieldbearer', 42, 1.4, 0.4)),
      w(...formation('shieldbearer', 90, 5, 3.3, 0.06)),
      w(g('troll', 20, 3.35), g('wolf', 59, 1.1, 0.4)),
    ],
  },
  {
    id: 9, map: 'riverbend', startGold: 255, hpScale: 1, hpGrowthStart: 6, endingBoss: 'boss',
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [5],
    waves: [
      w(g('goblin', 30, 1.66), g('harpy', 12, 4.09, 0.4)),
      w(g('goblin', 31, 1.83), g('harpy', 40, 1.41)),
      w(g('shieldbearer', 42, 1.34), g('harpy', 50, 1.18, 0.4)),
      w(g('wolf', 43, 1.14), g('harpy', 36, 1.57)),
      w(g('troll', 18, 3.53), g('shieldbearer', 43, 1.36, 0.3)),
      w(...formation('harpy', 60, 4, 3.7, 0.06), g('troll', 16, 3)),
      w(...formation('harpy', 60, 4, 3.2, 0.06), g('shieldbearer', 40, 1.49), g('troll', 13, 3.7, 1), g('boss', 1, 0, 78)),
    ],
  },
  {
    id: 10, map: 'meadow', startGold: 280, hpScale: 0.925, hpGrowthStart: 5, endingBoss: 'grumblemaw',
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [5],
    waves: [
      w(g('shieldbearer', 36, 1.74)),
      w(g('troll', 7, 6), g('goblin', 49, 1.17, 0.26)),
      w(...formation('shieldbearer', 42, 3, 3.3, 0.06), g('harpy', 33, 1.66, 0.21)),
      w(g('troll', 20, 2.1), g('wolf', 33, 1.69, 0.42)),
      w(g('troll', 17, 3.3), g('shieldbearer', 56, 0.93, 0.33)),
      w(g('wolf', 104, 0.5), g('harpy', 66, 0.8)),
      w(g('shieldbearer', 88, 0.7), g('harpy', 65, 0.94), g('grumblemaw', 1, 0, 63)),
    ],
  },
  {
    id: 11, map: 'riverbend', startGold: 245, hpScale: 0.91, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [1],
    taxes: { windowTax: 0.085 }, feat: { kind: 'noSpecials' },
    endingBoss: 'boss',
    waves: [
      w(g('harpy', 21, 1.5)),
      w(g('wolf', 21, 0.75), g('harpy', 23, 2.32, 0.35)),
      w(g('harpy', 16, 2.4), g('shieldbearer', 74, 0.85, 0.35)),
      w(g('wolf', 20, 0.75), g('harpy', 31, 1.83, 0.35)),
      w(g('shieldbearer', 62, 0.8), g('harpy', 18, 2.5, 0.35)),
      w(g('troll', 21, 1.05), g('harpy', 18, 2, 0.35), g('boss', 1, 0, 52)),
    ],
  },
  {
    id: 12, map: 'switchback', startGold: 260, hpScale: 1.14, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [1],
    taxes: { forcedMarch: 0.2 }, feat: { kind: 'maxTowers', limit: 5 },
    waves: [
      w(g('shieldbearer', 38, 1.15)),
      w(g('troll', 5, 3), g('goblin', 40, 1.28, 0.35)),
      w(g('harpy', 35, 0.8), g('shieldbearer', 31, 1.6, 0.35)),
      w(g('shieldbearer', 27, 1), g('harpy', 17, 2.94, 0.35)),
      w(g('wolf', 57, 0.75), g('harpy', 37, 1.31, 0.35)),
      w(g('shieldbearer', 68, 0.8), g('troll', 21, 1.7, 1.7)),
      w(g('wolf', 64, 0.8), g('harpy', 26, 2, 0.35)),
    ],
  },
  {
    id: 13, map: 'riverbend', startGold: 285, hpScale: 0.85, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [1],
    taxes: { noLoitering: 8 }, feat: { kind: 'noLeaks' },
    waves: [
      w(g('shieldbearer', 31, 1.35)),
      w(g('goblin', 55, 0.65), g('harpy', 8, 3.54, 0.35)),
      w(g('wolf', 44, 1), g('harpy', 39, 1.21, 0.35)),
      w(g('harpy', 24, 0.85), g('troll', 8, 6.86, 0.35)),
      w(g('troll', 15, 2.1), g('wolf', 26, 2.24, 0.35)),
      w(g('troll', 4, 3), g('goblin', 18, 3.24, 0.35)),
      w(g('troll', 23, 1.1), g('harpy', 24, 2, 0.35)),
    ],
  },
  {
    id: 14, map: 'meadow', startGold: 240, hpScale: 0.93, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [],
    taxes: { curfew: 0.15 }, feat: { kind: 'noLeaks' },
    waves: [
      w(g('goblin', 27, 1.15)),
      w(g('shieldbearer', 53, 0.75), g('harpy', 16, 3.67, 0.35)),
      w(g('troll', 3, 5), g('goblin', 36, 1.49, 0.35)),
      w(g('goblin', 44, 0.55), g('harpy', 16, 3.53, 0.35)),
      w(g('harpy', 25, 0.9), g('troll', 8, 6.71, 0.35)),
      w(g('shieldbearer', 65, 0.68), g('harpy', 26, 1.9, 0.35), g('troll', 12, 4.1, 0.5)),
    ],
  },
  {
    id: 15, map: 'riverbend', startGold: 255, hpScale: 1.08, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [2],
    taxes: { frozenPurse: 80 }, feat: { kind: 'noSpecials' },
    endingBoss: 'boss',
    waves: [
      w(g('goblin', 40, 0.55)),
      w(g('shieldbearer', 32, 1.25), g('harpy', 13, 3.24, 16)),
      w(g('troll', 3, 3.5), g('goblin', 28, 1.3, 0.3)),
      w(g('wolf', 42, 0.72, 4), g('harpy', 21, 1.5, 0.3)),
      w(g('shieldbearer', 75, 0.55)),
      w(g('troll', 4, 1.7), g('wolf', 26, 1.55, 0.35), g('boss', 1, 0, 64)),
    ],
  },
  {
    id: 16, map: 'meadow', startGold: 245, hpScale: 1, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [1],
    taxes: { rationing: 3 }, feat: { kind: 'noSpecials' },
    endingBoss: 'boss',
    waves: [
      w(g('goblin', 40, 0.65)),
      w(g('shieldbearer', 30, 0.85), g('harpy', 27, 2, 0.3)),
      w(g('troll', 5, 3.5), g('goblin', 33, 1.3, 0.3)),
      w(g('wolf', 42, 0.9), g('harpy', 25, 2, 0.3)),
      w(g('shieldbearer', 46, 0.55)),
      w(g('troll', 8, 2.04, 6), g('wolf', 35, 1.3, 0.35), g('boss', 1, 0, 64)),
    ],
  },
  {
    id: 17, map: 'switchback', startGold: 220, hpScale: 0.94, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [1],
    taxes: { noLoitering: 8, curfew: 0.2 }, feat: { kind: 'maxTowers', limit: 2 },
    waves: [
      w(g('shieldbearer', 58, 0.7)),
      w(g('harpy', 30, 1), g('shieldbearer', 22, 2.57, 0.35)),
      w(g('shieldbearer', 41, 0.85), g('harpy', 25, 1.96, 0.35)),
      w(g('troll', 5, 4), g('goblin', 24, 1.91, 0.35)),
      w(g('troll', 7, 4.5), g('harpy', 36, 1.25, 0.5)),
      w(g('goblin', 35, 0.85), g('harpy', 15, 3.43, 0.35)),
      w(g('wolf', 51, 1), g('harpy', 38, 1.43, 0.35)),
    ],
  },
  {
    id: 18, map: 'meadow', startGold: 260, hpScale: 1, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [3],
    taxes: { rationing: 3, forcedMarch: 0.18 }, feat: { kind: 'noSpecials' },
    waves: [
      w(g('goblin', 49, 1.65)),
      w(g('shieldbearer', 28, 0.85), g('harpy', 19, 2, 0.3)),
      w(g('troll', 5, 3.5), g('goblin', 34, 1.3, 0.3)),
      w(g('wolf', 45, 0.9), g('wolf', 25, 2, 1.5)),
      w(g('shieldbearer', 39, 0.55)),
      w(g('troll', 9, 1.7), g('wolf', 27, 1.3, 0.35)),
    ],
  },
  {
    id: 19, map: 'meadow', startGold: 245, hpScale: 0.94, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [1],
    taxes: { windowTax: 0.05, curfew: 0.1 }, feat: { kind: 'maxTowers', limit: 5 },
    waves: [
      w(g('harpy', 47, 1.15)),
      w(g('shieldbearer', 36, 0.55), g('harpy', 43, 1.08, 0.35)),
      w(g('troll', 11, 1.75), g('goblin', 38, 1.51, 0.35)),
      w(g('troll', 11, 4.72), g('shieldbearer', 10, 5.2), g('shieldbearer', 10, 5.2, 0.12)),
      w(g('shieldbearer', 65, 0.7), g('harpy', 34, 1.61, 0.35)),
      w(g('troll', 12, 1.75), g('harpy', 33, 1.47, 0.35)),
    ],
  },
  {
    id: 20, map: 'riverbend', startGold: 245, hpScale: 0.925, hpGrowthStart: null,
    allowedTowers: allTowers, maxTowerLevel: 3, allowedSpecials: allSpecials, rewardWaves: [],
    taxes: { frozenPurse: 80, curfew: 0.2 }, feat: { kind: 'noSpecials' },
    endingBoss: 'grumblemaw',
    waves: [
      w(g('goblin', 53, 1.35)),
      w(g('shieldbearer', 29, 1), g('harpy', 24, 2.22, 0.35)),
      w(g('shieldbearer', 56, 0.65), g('harpy', 21, 2.35, 0.35)),
      w(g('harpy', 35, 0.9), g('shieldbearer', 37, 1.36, 0.35)),
      w(g('wolf', 30, 0.85), g('harpy', 29, 1.89, 0.35)),
      w(g('troll', 5, 3), g('goblin', 32, 1.52, 0.35)),
      w(g('harpy', 60, 0.85), g('shieldbearer', 26, 2.12, 0.35), g('boss', 1, 0, 62)),
      w(g('wolf', 32, 0.8), g('harpy', 22, 0.9, 0.3), g('grumblemaw', 1, 0, 26)),
    ],
  },
];
