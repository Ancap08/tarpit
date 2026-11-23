// Generic headless players. Setup decisions use the same next-wave preview as
// the HUD. Fight decisions look at enemies already on the map.
import { barricadePlacement, guardsPlacement } from './blockers';
import { BOONS, type BoonId } from './boons';
import { ENEMY_STATS } from './enemies';
import { tick } from './game';
import { buildableCells, cellCenter, cellFromKey, cellKey } from './grid';
import { applyAction, trailCellOrder, type BuildAction, type HeadlessStepResult, type SpecialAction } from './headless';
import { pathLength, positionAlongPath } from './map';
import { BIG_ENEMIES, POLICY_CHECK_TICKS, POLICY_MIN_HITS, policyCandidates, policyChoice } from './specialPolicy';
import { availableSpecials, type SpecialType } from './specials';
import { TICKS_PER_SECOND } from './time';
import { TOWER_DEFS, TOWER_PATHS, towerLevel, towerStats } from './towers';
import type { GameState, MapDef, Point, TowerLevelStats, TowerType, UpgradePath } from './types';
import { nextWavePreview } from './waves';

const TOWERS = Object.keys(TOWER_DEFS) as TowerType[];
const PATHS: readonly UpgradePath[] = ['A', 'B'];
const TRAIL_SAMPLE_SPACING = 24;
const BLOCK_AHEAD = 50;
const BLOCK_APPROACH = 140;
const SETUP_RESERVE = 30;

export interface BotPolicy {
  purchase(state: GameState): BuildAction | undefined;
  /** Maximum number of upgrade purchases per setup, if limited. */
  upgradesPerSetup?: number;
  reward(state: GameState): BoonId | undefined;
  special(state: GameState, lastZone?: SpecialType): SpecialAction | undefined;
}

export interface BotRun {
  peakAlive: number;
  state: GameState;
  log: HeadlessStepResult[];
  refused: number;
}

function allowedTowers(state: GameState): readonly TowerType[] {
  return state.level?.allowedTowers ?? TOWERS;
}

function maxTowerLevel(state: GameState): number {
  return state.level?.maxTowerLevel ?? 3;
}

// Fills trail cells with the cheapest allowed tower, then makes one fallback upgrade.
export const botBeginner: BotPolicy = {
  upgradesPerSetup: 1,
  purchase(state) {
    if (state.phase !== 'setup' || state.pendingBoon) return undefined;
    const tower = [...allowedTowers(state)].sort((a, b) => TOWER_DEFS[a].cost - TOWER_DEFS[b].cost)[0];
    if (tower && TOWER_DEFS[tower].cost <= state.gold) {
      const cell = trailCellOrder(state.map).find((cell) => !state.towers.some((t) => cellKey(t.cell) === cellKey(cell)));
      if (cell) return { type: 'build', tower, cell };
    }
    const limit = maxTowerLevel(state);
    for (const tower of state.towers) {
      const level = towerLevel(tower);
      if (level >= limit) continue;
      if (level === 1 && TOWER_DEFS[tower.type].upgradeCost <= state.gold) return { type: 'upgrade', cell: tower.cell };
      if (level === 2 && TOWER_PATHS[tower.type].cost <= state.gold) return { type: 'upgrade', cell: tower.cell, path: 'A' };
    }
    return undefined;
  },
  reward: (state) => state.pendingBoon?.options[0],
  special: () => undefined,
};

interface TrailGeometry {
  samples: readonly Point[];
  cells: readonly { key: number; distances: readonly number[] }[];
}
const trailCache = new WeakMap<MapDef, TrailGeometry>();

function trailGeometry(map: MapDef): TrailGeometry {
  const known = trailCache.get(map);
  if (known) return known;
  const samples = Array.from({ length: Math.ceil(pathLength(map) / TRAIL_SAMPLE_SPACING) },
    (_, index) => positionAlongPath(map, index * TRAIL_SAMPLE_SPACING));
  const cells = buildableCells(map).flatMap((open, key) => {
    if (!open) return [];
    const center = cellCenter(cellFromKey(key));
    return [{ key, distances: samples.map((p) => Math.hypot(p.x - center.x, p.y - center.y)) }];
  });
  const geometry = { samples, cells };
  trailCache.set(map, geometry);
  return geometry;
}

function threats(state: GameState) {
  const preview = nextWavePreview(state);
  const air = preview.filter((entry) => ENEMY_STATS[entry.type].flying).reduce((sum, entry) => sum + entry.count, 0);
  const crowd = preview.filter((entry) => !ENEMY_STATS[entry.type].flying && !BIG_ENEMIES.has(entry.type))
    .reduce((sum, entry) => sum + entry.count, 0);
  const heavy = preview.filter((entry) => BIG_ENEMIES.has(entry.type)).reduce((sum, entry) => sum + entry.count, 0);
  return { air: air ? 0.5 + Math.min(1, air / 20) : 0.25, crowd: Math.min(1, crowd / 45), heavy: Math.min(1, heavy / 8) };
}

function inRange(distance: number, stats: TowerLevelStats): boolean {
  return distance >= stats.minRange && distance <= stats.range;
}

function towerPower(type: TowerType, stats: TowerLevelStats, profile: ReturnType<typeof threats>) {
  // Splash gains value with crowds; sustained single-target power matters
  // more against heavy enemies. Tar and burn are valued separately below.
  const splash = 1 + Math.min(2, stats.splashRadius / 45) * (profile.crowd * 0.8 + profile.heavy * 0.3);
  const direct = stats.damage * stats.fireRate;
  const air = type === 'longbow' || type === 'musketeer' || type === 'firepot';
  return { ground: direct * splash, air: air ? direct : 0, burn: stats.burnDps, slow: stats.slow };
}

function goodPurchase(state: GameState): BuildAction | undefined {
  if (state.phase !== 'setup' || state.pendingBoon) return undefined;
  const { cells, samples } = trailGeometry(state.map);
  const budget = state.gold - (state.wave === 0 ? 0 : SETUP_RESERVE);
  const profile = threats(state);
  const defense = samples.map(() => ({ ground: 0, air: 0, burn: 0, slow: 0 }));
  const occupied = new Map(state.towers.map((tower) => [cellKey(tower.cell), tower]));
  const counts = new Map<TowerType, number>();
  for (const { key, distances } of cells) {
    const tower = occupied.get(key);
    if (!tower) continue;
    counts.set(tower.type, (counts.get(tower.type) ?? 0) + 1);
    const stats = towerStats(tower, state.boons);
    const power = towerPower(tower.type, stats, profile);
    for (const [index, distance] of distances.entries()) {
      if (!inRange(distance, stats)) continue;
      const sample = defense[index];
      sample.ground += power.ground;
      sample.air += power.air;
      sample.burn = Math.max(sample.burn, power.burn);
      sample.slow = Math.max(sample.slow, power.slow);
    }
  }

  let best: BuildAction | undefined;
  let bestScore = 0;
  const effectiveGround = (ground: number, burn: number, slow: number) =>
    (ground + burn * (slow > 0 ? 2 : 1)) / (1 - slow * 0.65);
  function benefit(type: TowerType, stats: TowerLevelStats, distances: readonly number[], previous?: TowerLevelStats): number {
    const power = towerPower(type, stats, profile);
    const old = previous ? towerPower(type, previous, profile) : undefined;
    let value = 0;
    for (const [index, distance] of distances.entries()) {
      const covers = inRange(distance, stats);
      const covered = previous && inRange(distance, previous);
      if (!covers && !covered) continue;
      const local = defense[index];
      const ground = local.ground + (covers ? power.ground : 0) - (covered ? old!.ground : 0);
      const air = local.air + (covers ? power.air : 0) - (covered ? old!.air : 0);
      const slow = Math.max(local.slow, covers ? power.slow : 0);
      const burn = Math.max(local.burn, covers ? power.burn : 0);
      const groundGain = effectiveGround(ground, burn, slow) - effectiveGround(local.ground, local.burn, local.slow);
      const airGain = air - local.air;
      // Existing concentration helps enemies die before monopolizing fire.
      const groundWeight = 1 + Math.min(0.35, local.ground / 180);
      // Extra anti-air coverage is worth most where little exists.
      const airWeight = profile.air / (1 + local.air / 50);
      value += (groundGain * groundWeight + airGain * airWeight) * (1.2 - 0.4 * index / samples.length);
    }
    return value;
  }

  const allowed = allowedTowers(state);
  const limit = maxTowerLevel(state);
  for (const { key, distances } of cells) {
    const cell = cellFromKey(key);
    const tower = occupied.get(key);
    if (!tower) {
      for (const type of allowed) {
        const { cost } = TOWER_DEFS[type];
        if (cost > budget) continue;
        const stats = towerStats({ type, upgraded: false }, state.boons);
        const variety = 1 + (counts.get(type) ?? 0) * 0.10;
        const first = !counts.has(type);
        const support = first && occupied.size > 1;
        const mix = (type === 'cannon' && support && profile.crowd >= 0.45)
          || (type === 'mortar' && support && profile.heavy > 0)
          || (type === 'tarpit' && support)
          || (type === 'firepot' && support && counts.has('tarpit'));
        const score = benefit(type, stats, distances) * (mix ? 2 : 1) / (cost * variety);
        if (score > bestScore) {
          bestScore = score;
          best = { type: 'build', cell, tower: type };
        }
      }
      continue;
    }
    const level = towerLevel(tower);
    if (level >= limit) continue;
    const previous = towerStats(tower, state.boons);
    const cost = level === 1 ? TOWER_DEFS[tower.type].upgradeCost : TOWER_PATHS[tower.type].cost;
    if (cost > budget) continue;
    const paths = level === 1 ? [undefined] : PATHS;
    for (const path of paths) {
      const stats = towerStats({ type: tower.type, upgraded: true, path }, state.boons);
      const score = benefit(tower.type, stats, distances, previous) / cost;
      if (score > bestScore) {
        bestScore = score;
        best = path ? { type: 'upgrade', cell, path } : { type: 'upgrade', cell };
      }
    }
  }
  return best;
}

function goodReward(state: GameState): BoonId | undefined {
  const offer = state.pendingBoon;
  if (!offer) return undefined;
  const held = state.boons;
  const artillery = state.towers.filter((tower) => tower.type === 'mortar' || tower.type === 'cannon').length;
  const skills = state.towers.map((tower) => towerStats(tower, held));
  const available = availableSpecials({ level: state.level, wave: state.wave + 1 });
  const powers: Record<BoonId, number> = {
    longBarrels: artillery * 2,
    keenArrows: state.towers.filter((tower) => tower.type === 'longbow').length,
    warChest: BOONS.warChest.value / 20,
    stickyTar: skills.filter((stats) => stats.slow > 0).length
      + Number(available.includes('tarBarrel')),
    hotCoals: skills.filter((stats) => stats.burnDps > 0).length * 2
      + Number(available.includes('fireArrows')) * 2,
    quickHands: available.length ? 3 : 0,
    stoneWalls: state.lives <= BOONS.stoneWalls.value ? 12 : 5,
    veteranCrews: state.towers.length / 3,
    biggerBlasts: artillery + Number(available.includes('keg')),
  };
  return offer.options.reduce((best, choice) => powers[choice] > powers[best] ? choice : best, offer.options[0]);
}

function goodSpecial(state: GameState, lastZone?: SpecialType): SpecialAction | undefined {
  if (state.phase !== 'wave' || state.specialCharges <= 0 || state.lastSpecialTick === state.tick
    || state.waveTick % POLICY_CHECK_TICKS !== 0 || state.enemies.length === 0) return undefined;
  const available = availableSpecials(state);
  const burst = policyChoice(state, lastZone, { allow: available });
  let best = burst ? { type: 'special' as const, special: burst.special, x: burst.x, y: burst.y, atWaveTick: state.waveTick } : undefined;
  let bestScore = burst?.hits ?? 0;
  const ground = state.enemies.filter((enemy) => !ENEMY_STATS[enemy.type].flying);
  for (const special of ['guards', 'barricade'] as const) {
    if (!available.includes(special)) continue;
    const kind = special === 'barricade' ? 'barricade' : 'guard';
    if (state.blockers.some((blocker) => blocker.kind === kind)) continue;
    for (const point of policyCandidates(state.map)) {
      const placement = special === 'barricade' ? barricadePlacement(state.map, point) : guardsPlacement(state.map, point);
      if (!placement.ok) continue;
      const approaching = ground.filter((enemy) => placement.point.distance - enemy.distance >= BLOCK_AHEAD
        && placement.point.distance - enemy.distance <= BLOCK_APPROACH).length;
      if (approaching < POLICY_MIN_HITS) continue;
      const coverage = state.towers.filter((tower) => {
        const center = cellCenter(tower.cell);
        return inRange(Math.hypot(center.x - point.x, center.y - point.y), towerStats(tower, state.boons));
      });
      if (!coverage.length) continue;
      const splash = coverage.some((tower) => towerStats(tower, state.boons).splashRadius > 0);
      const score = approaching + Number(splash);
      if (score > bestScore) {
        best = { type: 'special', special, ...point, atWaveTick: state.waveTick };
        bestScore = score;
      }
    }
  }
  return best;
}

export const botGood: BotPolicy = { purchase: goodPurchase, reward: goodReward, special: goodSpecial };

/** Run to a terminal state or stop between waves at the optional wave cap. */
export function runBot(state: GameState, bot: BotPolicy, throughWave = Infinity, maxTicks = 60 * 60 * TICKS_PER_SECOND): BotRun {
  const log: HeadlessStepResult[] = [];
  function apply(action: Parameters<typeof applyAction>[1]): boolean {
    const step = applyAction(state, action);
    log.push(step);
    return !('result' in step) || step.result.ok;
  }

  let peakAlive = state.enemies.length;
  let lastZone: SpecialType | undefined;
  const endTick = state.tick + maxTicks;
  while (state.tick < endTick && (state.phase === 'wave' || (state.phase === 'setup' && state.wave < throughWave))) {
    if (state.phase === 'setup') {
      const reward = bot.reward(state);
      if (reward && !apply({ type: 'pickBoon', boon: reward })) break;
      let upgrades = 0;
      for (let action = bot.purchase(state); action; action = bot.purchase(state)) {
        if (action.type === 'upgrade' && upgrades >= (bot.upgradesPerSetup ?? Infinity)) break;
        if (!apply(action)) break;
        if (action.type === 'upgrade') upgrades++;
      }
      if (!apply({ type: 'startWave' })) break;
    }
    const special = bot.special(state, lastZone);
    if (special && apply(special) && (special.special === 'tarBarrel' || special.special === 'fireArrows')) {
      lastZone = special.special;
    }
    tick(state);
    peakAlive = Math.max(peakAlive, state.enemies.length);
  }
  return { state, log, peakAlive, refused: log.filter((step) => 'result' in step && !step.result.ok).length };
}
