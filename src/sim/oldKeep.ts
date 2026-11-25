// Private board data. The title and balance runners enumerate only MAP_IDS.
import { createGame } from './game';
import { MAP_HEIGHT, MAP_WIDTH } from './map';
import site from './keepSite.json';
import type { GameState, MapDef, WaveDef } from './types';

const keep: MapDef = { id: 'keep', width: MAP_WIDTH, height: MAP_HEIGHT, ...site };
const waves: readonly WaveDef[] = [
  { groups: [{ type: 'goblin', count: 12, interval: 0.85, delay: 0 }] },
  { groups: [
    { type: 'wolf', count: 10, interval: 0.9, delay: 0 },
    { type: 'shieldbearer', count: 5, interval: 1.7, delay: 3 },
  ] },
  { groups: [
    { type: 'goblin', count: 16, interval: 0.6, delay: 0 },
    { type: 'troll', count: 4, interval: 2.8, delay: 2 },
    { type: 'harpy', count: 6, interval: 1.3, delay: 4 },
  ] },
];

export function createKeep(): GameState {
  return { ...createGame({ map: keep }), fixedWaves: waves, gold: 240 };
}
