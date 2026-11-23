import { buildTower, upgradeTower } from './actions';
import { fireTowers } from './combat';
import { enemyMaxHp } from './difficulty';
import { createGame, startWave, tick } from './game';
import type { Enemy, GameState, TowerType, UpgradePath } from './types';
import { waveDef } from './waves';

const CELL = { col: 2, row: 5 }; // centre (80, 176)
const PATHS = ['A', 'B'] as const;
const TROLL_HP = enemyMaxHp('troll', 'normal');
const GOBLIN_HP = enemyMaxHp('goblin', 'normal');

function prepare(tower: TowerType, path: UpgradePath) {
  const state = createGame();
  state.gold = 2000;
  if (!buildTower(state, CELL, tower).ok || !upgradeTower(state, CELL).ok || !upgradeTower(state, CELL, path).ok) {
    throw new Error(`Could not prepare ${tower} path ${path} encounter`);
  }
  return state;
}

function enemies(kind: 'troll' | 'goblin', distances: readonly number[]): Enemy[] {
  return distances.map((distance, id) => ({
    id, distance, type: kind, hp: kind === 'troll' ? TROLL_HP : GOBLIN_HP, slow: 0, slowTicksLeft: 0,
  }));
}

const pack = (distance: (index: number) => number) => Array.from({ length: 10 }, (_, i) => distance(i));

function stationary(tower: TowerType, path: UpgradePath, kind: 'troll' | 'goblin',
  distances: readonly number[], ticks: number) {
  const state = prepare(tower, path);
  // Distance on this straight path is exactly the distance east of the tower.
  state.map = { id: 'test', width: 960, height: 480, path: [{ x: 80, y: 176 }, { x: 960, y: 176 }] };
  state.enemies = enemies(kind, distances);
  for (let i = 0; i < ticks; i++) fireTowers(state);
  return state;
}

function moving(path: UpgradePath, kind: 'troll' | 'goblin', positions: number[], y: number, ticks: number) {
  const state = prepare('firepot', path);
  state.map = { id: 'test', width: 960, height: 480, path: [{ x: -800, y }, { x: 960, y }] };
  if (!startWave(state).ok) throw new Error('Could not start the Fire Pot encounter');
  state.spawnedPerGroup = waveDef(1).groups.map(({ count }) => count);
  state.enemies = enemies(kind, positions.map((x) => x + 800));
  for (let i = 0; i < ticks; i++) tick(state);
  return state;
}

const kills = (state: GameState) => state.towers[0].kills;
const damage = (state: GameState) => TROLL_HP - (state.enemies[0]?.hp ?? 0);

function score(tower: TowerType, troll: (path: UpgradePath) => number, goblins: (path: UpgradePath) => number,
  loneMetric: 'damage' | 'slow' = 'damage', packMetric: 'kills' | 'slowed' = 'kills') {
  const lone = PATHS.map(troll);
  const group = PATHS.map(goblins);
  const ok = (lone[0] - lone[1]) * (group[0] - group[1]) < 0;
  return { tower, lone, loneMetric, pack: group, packMetric, ok };
}

/** P3 measures a lone Troll and ten Goblins at Normal HP using the real combat loop. */
export function measurePathEncounters() {
  return [
    score('musketeer',
      (path) => damage(stationary('musketeer', path, 'troll', [140], 25)),
      (path) => kills(stationary('musketeer', path, 'goblin', pack((i) => 90 + i), 265))),
    score('cannon',
      (path) => damage(stationary('cannon', path, 'troll', [100], 127)),
      (path) => kills(stationary('cannon', path, 'goblin', pack((i) => 100 - 8 * i), 1))),
    score('tarpit',
      (path) => stationary('tarpit', path, 'troll', [100], 1).enemies[0].slow,
      (path) => stationary('tarpit', path, 'goblin', pack((i) => 125 + i), 1).enemies.filter(({ slow }) => slow > 0).length,
      'slow', 'slowed'),
    score('longbow',
      (path) => damage(stationary('longbow', path, 'troll', [100], 11)),
      (path) => kills(stationary('longbow', path, 'goblin', pack((i) => 90 + i), 105))),
    score('mortar',
      (path) => damage(stationary('mortar', path, 'troll', [210], 1)),
      (path) => kills(stationary('mortar', path, 'goblin', pack((i) => 210 - 14 * i), 1))),
    score('firepot',
      (path) => damage(moving(path, 'troll', [0], 176, 150)),
      (path) => kills(moving(path, 'goblin', pack((i) => 66 - 90 * i), 275.9, 1100))),
  ];
}
