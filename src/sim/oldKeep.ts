// Private board data. The title and balance runners enumerate only MAP_IDS.
import { createGame } from './game';
import type { GateDef, PillowWindowDef, WallSiteTax } from './levelTypes';
import type { GameState, WaveDef } from './types';

const gate: GateDef = { maxHp: 480, repairCost: 30, repairHp: 160, yardLength: 360 };
const windows: readonly PillowWindowDef[] = [
  { position: { x: 540, y: 325 }, road: 'west', from: 160, to: 390 },
  { position: { x: 564, y: 170 }, road: 'east', from: 290, to: 520 },
];
const site = { col: 13, row: 7 };
const quartering: WallSiteTax = { kind: 'quartering', site, price: 35 };
const survey: WallSiteTax = { kind: 'royalSurvey', sites: [site] };
const waves: readonly WaveDef[] = [
  { groups: [
    { type: 'goblin', count: 6, interval: 0.85, delay: 0, road: 'east' },
    { type: 'goblin', count: 6, interval: 0.85, delay: 0, road: 'west' },
  ] },
  { groups: [
    { type: 'wolf', count: 10, interval: 0.9, delay: 0, road: 'west' },
    { type: 'shieldbearer', count: 5, interval: 1.7, delay: 3, road: 'east' },
  ] },
  { groups: [
    { type: 'goblin', count: 16, interval: 0.6, delay: 0, road: 'west' },
    { type: 'troll', count: 4, interval: 2.8, delay: 2, road: 'east' },
    { type: 'harpy', count: 6, interval: 1.3, delay: 4, road: 'east' },
    { type: 'ram', count: 1, interval: 0, delay: 1, road: 'west' },
  ] },
];

export function createKeep(surveyed = false): GameState {
  return {
    ...createGame({ map: 'keep', gate, windows, wallSiteTax: surveyed ? survey : quartering }),
    fixedWaves: waves,
    fixedFeat: { kind: 'noRepairs' },
    fixedSpecialUnlocks: { tarBarrel: 2, guards: 3 },
    gold: 240,
  };
}
