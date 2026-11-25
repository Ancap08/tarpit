// Generic headless players. Setup decisions use the same next-wave preview as
// the HUD. Fight decisions look at enemies already on the map.
import { barricadePlacement, guardsPlacement } from './blockers';
import { BOONS, type BoonId } from './boons';
import { ENEMY_STATS, isBoss } from './enemies';
import { repairStatus } from './gate';
import { tick } from './game';
import { buildableCells, cellCenter, cellFromKey, cellKey } from './grid';
import { applyAction, densestCluster, trailCellOrder, type BuildAction, type HeadlessStepResult, type SpecialAction } from './headless';
import { pathLength, positionAlongPath } from './map';
import { BIG_ENEMIES, POLICY_CHECK_TICKS, POLICY_MIN_HITS, chooseCrowdSpecial, chooseFeatherBarrel, policyCandidates } from './specialPolicy';
import { availableSpecials, specialRadius, ordinaryRechargeTicks, spendSpecialCharge, type SpecialType } from './specials';
import { TICKS_PER_SECOND } from './time';
import { TOWER_DEFS, TOWER_PATHS, allowedTowers, atTowerCap, towerBuildCost, maxTowerLevel, towerLevel, towerStatsAt } from './towers';
import type { GameState, MapDef, Point, TowerLevelStats, TowerType, UpgradePath } from './types';
import { nextWavePreview } from './waves';

const PATHS: readonly UpgradePath[] = ['A', 'B'];
const TRAIL_SAMPLE_SPACING = 24;
const BLOCK_AHEAD = 50;
const BLOCK_APPROACH = 140;
const SETUP_RESERVE = 30;

export interface BotPolicy {
  /** Spend a barrel turn and its charge, without applying its effects (C2 control). */
  leaveBarrelUnused?: boolean;
  /** Consider one repair before shopping in each setup. */
  repair?(state: GameState): boolean;
  purchase(state: GameState): BuildAction | undefined;
  /** Maximum number of upgrade purchases per setup, if limited. */
  upgradesPerSetup?: number;
  /** Time to choose and carry out one purchase in a timed planning run. */
  purchaseTicks?: number;
  reward(state: GameState): BoonId | undefined;
  special(state: GameState, lastZone?: SpecialType): SpecialAction | undefined;
}

export interface BotRun {
  /** Successful featherings during the feather bot’s trial. */
  feathered?: number;
  peakAlive: number;
  waveOneLives: number;
  setupTicks: number;
  state: GameState;
  log: HeadlessStepResult[];
  refused: number;
}

// Fills trail cells with the cheapest allowed tower, then makes one fallback upgrade.
export const botBeginner: BotPolicy = {
  upgradesPerSetup: 1,
  purchase(state) {
    if (state.phase !== 'setup' || state.pendingBoon) return undefined;
    const tower = [...allowedTowers(state)].sort((a, b) => TOWER_DEFS[a].cost - TOWER_DEFS[b].cost)[0];
    if (tower && !atTowerCap(state) && towerBuildCost(state, tower) <= state.gold) {
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

function goodPurchase(state: GameState, rotate = false, buildLimit = Infinity, buildOnly?: TowerType): BuildAction | undefined {
  if (state.phase !== 'setup' || state.pendingBoon) return undefined;
  const { cells, samples } = trailGeometry(state.map);
  // With a sealed purse the next income arrives only after surviving the wave.
  const save = state.wave > 0 && state.level?.taxes?.frozenPurse === undefined;
  const budget = state.gold - (save ? SETUP_RESERVE : 0);
  const profile = threats(state);
  const defense = samples.map(() => ({ ground: 0, air: 0, burn: 0, slow: 0 }));
  const occupied = new Map(state.towers.map((tower) => [cellKey(tower.cell), tower]));
  const counts = new Map<TowerType, number>();
  for (const { key, distances } of cells) {
    const tower = occupied.get(key);
    if (!tower) continue;
    counts.set(tower.type, (counts.get(tower.type) ?? 0) + 1);
    const stats = towerStatsAt(state, tower);
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
  const placements = new Map<TowerType, { score: number; action: BuildAction }[]>();
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

  const allowed = atTowerCap(state) || (state.towersBuilt ?? state.towers.length) >= buildLimit ? [] : allowedTowers(state);
  const limit = maxTowerLevel(state);
  for (const { key, distances } of cells) {
    const cell = cellFromKey(key);
    const tower = occupied.get(key);
    if (!tower) {
      for (const type of allowed) {
        if (buildOnly && type !== buildOnly) continue;
        const cost = towerBuildCost(state, type);
        if (cost > budget) continue;
        const stats = towerStatsAt(state, { cell, type, upgraded: false });
        const variety = 1 + (counts.get(type) ?? 0) * 0.10;
        const first = !counts.has(type);
        const support = first && occupied.size > 1;
        const mix = (type === 'cannon' && support && profile.crowd >= 0.45)
          || (type === 'mortar' && support && profile.heavy > 0)
          || (type === 'tarpit' && support)
          || (type === 'firepot' && support && counts.has('tarpit'));
        const score = benefit(type, stats, distances) * (mix ? 2 : 1) / (cost * variety);
        if (rotate && score > 0) {
          const choices = placements.get(type) ?? [];
          choices.push({ score, action: { type: 'build', cell, tower: type } });
          placements.set(type, choices);
        }
        if (score > bestScore) {
          bestScore = score;
          best = { type: 'build', cell, tower: type };
        }
      }
      continue;
    }
    const level = towerLevel(tower);
    if (buildOnly || level >= limit) continue;
    const previous = towerStatsAt(state, tower);
    const cost = level === 1 ? TOWER_DEFS[tower.type].upgradeCost : TOWER_PATHS[tower.type].cost;
    if (cost > budget) continue;
    const paths = level === 1 ? [undefined] : PATHS;
    for (const path of paths) {
      const stats = towerStatsAt(state, { cell, type: tower.type, upgraded: true, path });
      const score = benefit(tower.type, stats, distances, previous) / cost;
      if (score > bestScore) {
        bestScore = score;
        best = path ? { type: 'upgrade', cell, path } : { type: 'upgrade', cell };
      }
    }
  }
  if (rotate && best?.type === 'build') {
    const choices = placements.get(best.tower)!;
    choices.sort((a, b) => b.score - a.score);
    return choices[state.towers.length % Math.min(3, choices.length)].action;
  }
  return best;
}

function goodReward(state: GameState): BoonId | undefined {
  const offer = state.pendingBoon;
  if (!offer) return undefined;
  const artillery = state.towers.filter((tower) => tower.type === 'mortar' || tower.type === 'cannon').length;
  const skills = state.towers.map((tower) => towerStatsAt(state, tower));
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
  return chooseSpecial(state, lastZone, policyCandidates(state.map));
}

function chooseSpecial(state: GameState, lastZone: SpecialType | undefined, points: readonly Point[], minHits = POLICY_MIN_HITS): SpecialAction | undefined {
  const available = availableSpecials(state);
  const burst = chooseCrowdSpecial(state, lastZone, { allow: available, points, minHits });
  let best = burst ? { type: 'special' as const, special: burst.special, x: burst.x, y: burst.y, atWaveTick: state.waveTick } : undefined;
  let bestScore = burst?.hits ?? 0;
  const ground = state.enemies.filter((enemy) => !ENEMY_STATS[enemy.type].flying);
  for (const special of ['guards', 'barricade'] as const) {
    if (!available.includes(special)) continue;
    const kind = special === 'barricade' ? 'barricade' : 'guard';
    if (state.blockers.some((blocker) => blocker.kind === kind)) continue;
    for (const point of points) {
      const placement = special === 'barricade' ? barricadePlacement(state.map, point) : guardsPlacement(state.map, point);
      if (!placement.ok) continue;
      const approaching = ground.filter((enemy) => placement.point.distance - enemy.distance >= BLOCK_AHEAD
        && placement.point.distance - enemy.distance <= BLOCK_APPROACH).length;
      if (approaching < POLICY_MIN_HITS) continue;
      const coverage = state.towers.filter((tower) => {
        const center = cellCenter(tower.cell);
        return inRange(Math.hypot(center.x - point.x, center.y - point.y), towerStatsAt(state, tower));
      });
      if (!coverage.length) continue;
      const splash = coverage.some((tower) => towerStatsAt(state, tower).splashRadius > 0);
      const score = approaching + Number(splash);
      if (score > bestScore) {
        best = { type: 'special', special, ...point, atWaveTick: state.waveTick };
        bestScore = score;
      }
    }
  }
  return best;
}

function shouldRepair(state: GameState, fraction: number, reserve: number): boolean {
  const { gate } = state;
  return !!gate && gate.hp <= gate.maxHp * fraction && state.gold - gate.repairCost >= reserve && repairStatus(state).ok;
}

export const botGood: BotPolicy = {
  purchase: goodPurchase,
  purchaseTicks: POLICY_CHECK_TICKS,
  reward: goodReward,
  special: goodSpecial,
  repair: state => shouldRepair(state, 0.6, 70),
};

// Open with damage, then put a Tar Pit where Good's defense benefits most.
// Save for its Feathers upgrade. Any further Tar Pits also take path B.
export const botFeathers: BotPolicy = {
  ...botGood,
  purchase(state) {
    if (state.phase !== 'setup' || state.pendingBoon) return undefined;
    if (maxTowerLevel(state) === 3 && allowedTowers(state).includes('tarpit')) {
      const pits = state.towers.filter(tower => tower.type === 'tarpit');
      const damageOpening = state.towers.filter(tower => tower.type !== 'tarpit' && tower.upgraded).length >= 2;
      const lastPermit = state.level?.taxes?.rationing === state.towers.length + 1;
      const next = pits.find(tower => !tower.path);
      if (damageOpening && next) {
        const cost = next.upgraded ? TOWER_PATHS.tarpit.cost : TOWER_DEFS.tarpit.upgradeCost;
        if (state.gold < cost) return undefined;
        return next.upgraded ? { type: 'upgrade', cell: next.cell, path: 'B' } : { type: 'upgrade', cell: next.cell };
      }
      if (!pits.length && (damageOpening || lastPermit) && !atTowerCap(state)) {
        return goodPurchase(state, false, Infinity, 'tarpit');
      }
    }
    const action = botGood.purchase(state);
    if (action?.type === 'upgrade' && action.path &&
        state.towers.some(t => t.type === 'tarpit' && cellKey(t.cell) === cellKey(action.cell))) {
      return { ...action, path: 'B' };
    }
    return action;
  },
  special(state, lastZone) {
    if (state.phase !== 'wave' || state.specialCharges <= 0 ||
      state.lastSpecialTick === state.tick || state.waveTick % POLICY_CHECK_TICKS !== 0) return undefined;
    if (availableSpecials(state).includes('tarBarrel')) {
      const enemies = state.enemies.filter(enemy => !enemy.feathered && !isBoss(enemy));
      const crowd = densestCluster({ ...state, enemies }, specialRadius('tarBarrel', state.boons));
      if (crowd && crowd.ids.length >= POLICY_MIN_HITS) {
        return { type: 'special', special: 'tarBarrel', ...crowd.centroid, atWaveTick: state.waveTick };
      }
    }
    return botGood.special(state, lastZone);
  },
};

export const PERSON_LOOK_TICKS = 3 * TICKS_PER_SECOND;
export const PERSON_REACTION_TICKS = 1.5 * TICKS_PER_SECOND;
export const PERSON_AIM_GRID = 48;
const coarseAims = new WeakMap<MapDef, readonly Point[]>();

function personAims(map: MapDef): readonly Point[] {
  const cached = coarseAims.get(map);
  if (cached) return cached;
  const points = new Map<string, Point>();
  for (const point of policyCandidates(map)) {
    const snap = (coordinate: number, limit: number) =>
      Math.min(Math.floor(coordinate / PERSON_AIM_GRID), Math.floor(limit / PERSON_AIM_GRID) - 1) * PERSON_AIM_GRID + PERSON_AIM_GRID / 2;
    const x = snap(point.x, map.width);
    const y = snap(point.y, map.height);
    points.set(`${x},${y}`, { x, y });
  }
  const aims = [...points.values()];
  coarseAims.set(map, aims);
  return aims;
}

// Setup consumes no simulation ticks. An early next-wave charge can fall
// inside the previous look interval, so keep the last planned opening cast.
const personLooks = new WeakMap<GameState, { tick: number; choice?: SpecialAction; opening?: SpecialAction }>();

function personSpecial(state: GameState, lastZone?: SpecialType): SpecialAction | undefined {
  if (state.phase !== 'wave' || state.specialCharges <= 0) return undefined;
  const waveStart = state.tick - state.waveTick;
  const previousCast = state.lastSpecialTick ?? -Infinity;
  const ready = state.barrelRecharge?.readyTick ??
    (previousCast >= waveStart ? previousCast + ordinaryRechargeTicks(state.boons) : waveStart);
  if (state.tick !== ready + PERSON_REACTION_TICKS) return undefined;
  const previous = personLooks.get(state);
  if (previous?.tick === state.tick) return previous.choice;
  if (previous && state.tick - previous.tick < PERSON_LOOK_TICKS) {
    return previous.opening && { ...previous.opening, atWaveTick: state.waveTick };
  }
  const choice = choosePersonCast(state, lastZone);
  personLooks.set(state, { tick: state.tick, choice, opening: ready === waveStart ? choice : previous?.opening });
  return choice;
}

function choosePersonCast(state: GameState, lastZone?: SpecialType): SpecialAction | undefined {
  const aims = personAims(state.map);
  const choice = chooseSpecial(state, lastZone, aims) ?? chooseSpecial(state, lastZone, aims, 1);
  if (choice) return choice;
  // The deadline also applies to an empty trail or a level with only blockers.
  const available = availableSpecials(state);
  for (const special of available) {
    const point = [...aims].reverse().find((aim) => {
      if (special === 'guards') return guardsPlacement(state.map, aim).ok;
      if (special === 'barricade') return barricadePlacement(state.map, aim).ok;
      return true;
    });
    if (point) return { type: 'special', special, ...point, atWaveTick: state.waveTick };
  }
  return undefined;
}

export const botPerson: BotPolicy = {
  purchase: (state) => goodPurchase(state, true),
  purchaseTicks: PERSON_LOOK_TICKS,
  reward: goodReward,
  special: personSpecial,
  repair: state => shouldRepair(state, 0.3, 0),
};

/** Keep the ordinary player's aim, timing and purchases while favoring feathers. */
export function preferFeathers(player: BotPolicy): BotPolicy {
  return {
    ...player,
    purchase(state) {
      const action = player.purchase(state);
      if (action?.type === 'upgrade' && action.path && state.towers.some(tower =>
        tower.type === 'tarpit' && cellKey(tower.cell) === cellKey(action.cell))) {
        return { ...action, path: 'B' };
      }
      return action;
    },
    special(state, lastZone) {
      const action = player.special(state, lastZone);
      if (!action || !availableSpecials(state).includes('tarBarrel')) return action;
      const points = player === botPerson ? personAims(state.map) : policyCandidates(state.map);
      const aim = chooseFeatherBarrel(state, points) ?? action;
      return { ...action, special: 'tarBarrel', x: aim.x, y: aim.y };
    },
  };
}

/** Keep the player's placement, reward and timing policy while pursuing the public feat. */
function pursueFeat(player: BotPolicy, rotatePlacements: boolean): BotPolicy {
  return {
    ...player,
    purchase(state) {
      const feat = state.level?.feat;
      return feat?.kind === 'maxTowers' ? goodPurchase(state, rotatePlacements, feat.limit) : player.purchase(state);
    },
    special(state, lastZone) {
      return state.level?.feat?.kind === 'noSpecials' ? undefined : player.special(state, lastZone);
    },
  };
}

export const botGoodFeat = pursueFeat(botGood, false);
export const botPersonFeat = pursueFeat(botPerson, true);

/** Run to a terminal state or stop between waves at the optional wave cap. */
export function runBot(state: GameState, bot: BotPolicy, throughWave = Infinity, maxTicks = 60 * 60 * TICKS_PER_SECOND, barrelImpact?: { casts: number; feathered: number }): BotRun {
  const log: HeadlessStepResult[] = [];
  let feathered = 0;
  function apply(action: Parameters<typeof applyAction>[1]): boolean {
    const step = applyAction(state, action);
    log.push(step);
    return !('result' in step) || step.result.ok;
  }

  let peakAlive = state.enemies.length;
  let waveOneLives = state.lives;
  let setupTicks = 0;
  // Run the same clock on both sides of a tax trial, including the untaxed
  // control. Earlier campaigns and Free play retain their original setup.
  const paced = Boolean(state.level?.feat || state.level?.taxes);
  let lastZone: SpecialType | undefined;
  const endTick = state.tick + maxTicks;
  while (state.tick < endTick && (state.phase === 'wave' || (state.phase === 'setup' && state.wave < throughWave))) {
    if (state.phase === 'setup') {
      const reward = bot.reward(state);
      if (reward && !apply({ type: 'pickBoon', boon: reward })) break;
      if (state.gate && bot.repair?.(state) && !apply({ type: 'repairGate' })) break;
      let upgrades = 0;
      for (let action = bot.purchase(state); action; action = bot.purchase(state)) {
        if (action.type === 'upgrade' && upgrades >= (bot.upgradesPerSetup ?? Infinity)) break;
        if (paced && state.wave > 0) {
          const readyAt = Math.min(endTick, state.tick + (bot.purchaseTicks ?? PERSON_LOOK_TICKS));
          while (state.phase === 'setup' && state.tick < readyAt) {
            tick(state);
            setupTicks++;
          }
          if (state.phase !== 'setup' || state.tick >= endTick) break;
        }
        if (!apply(action)) break;
        if (action.type === 'upgrade') upgrades++;
      }
      if (state.tick >= endTick) break;
      if (state.phase === 'setup' && !apply({ type: 'startWave' })) break;
    }
    const special = bot.special(state, lastZone);
    const eventsBeforeCast = state.events.length;
    if (special?.special === 'tarBarrel' && bot.leaveBarrelUnused) {
      spendSpecialCharge(state, 'tarBarrel');
      lastZone = 'tarBarrel';
    } else if (special && apply(special) && (special.special === 'tarBarrel' || special.special === 'fireArrows')) {
      lastZone = special.special;
      if (special.special === 'tarBarrel' && (barrelImpact || bot === botFeathers)) {
        const hits = state.events.slice(eventsBeforeCast).filter(event => event.kind === 'feathered').length;
        feathered += hits;
        if (barrelImpact) {
          barrelImpact.casts++;
          barrelImpact.feathered += hits;
        }
      }
    }
    tick(state);
    if (bot === botFeathers) {
      for (const event of state.events) if (event.kind === 'feathered') feathered++;
    }
    if (state.wave === 1) waveOneLives = state.lives;
    peakAlive = Math.max(peakAlive, state.enemies.length);
  }
  return { state, log, ...(bot === botFeathers && { feathered }), peakAlive, waveOneLives, setupTicks, refused: log.filter((step) => 'result' in step && !step.result.ok).length };
}
