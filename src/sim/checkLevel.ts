// Headless campaign acceptance checks. Only scores, never game states, are cached.
import { maxIn3s } from './balanceTargets';
import { BOON_OFFER_WAVES } from './boons';
import { levelStars } from './campaignProgress';
import { canTarget } from './combat';
import { botBeginner, botGood, runBot } from './bots';
import { ENEMY_STATS } from './enemies';
import { createGame, spawnTick } from './game';
import { TWO_STAR_LIVES, type LevelDef } from './levelTypes';
import { MAP_IDS } from './map';
import { SPECIAL_DEFS, type SpecialType } from './specials';
import { TICKS_PER_SECOND } from './time';
import { TOWER_DEFS } from './towers';
import type { GameState, TowerType } from './types';

type GateLabel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8';

export type LevelFeature =
  | { readonly towers: readonly TowerType[]; readonly mustLose?: boolean }
  | { readonly specials: readonly SpecialType[] }
  | { readonly maxTowerLevel: 2 };

const NEW_FEATURE: Readonly<Partial<Record<number, LevelFeature>>> = {
  2: { towers: ['cannon'] },
  3: { towers: ['tarpit'] },
  4: { towers: ['firepot'] },
  5: { towers: Object.keys(TOWER_DEFS).map(type => type as TowerType).filter(type => canTarget(type, { type: 'harpy' })), mustLose: true },
  6: { towers: ['mortar'] },
  7: { specials: ['barricade'] },
  8: { specials: ['guards', 'fireArrows'] },
  9: { maxTowerLevel: 2 },
  10: { specials: Object.keys(SPECIAL_DEFS).map(type => type as SpecialType) },
};

export interface LevelScore {
  readonly peakAlive: number;
  readonly spawned: number;
  readonly phase: GameState['phase'];
  readonly lives: number;
  readonly tick: number;
  readonly stars: 0 | 1 | 2 | 3;
  readonly refused: number;
}

export interface LevelCheck {
  ok: boolean;
  failed: readonly GateLabel[];
  good?: LevelScore;
  beginner?: LevelScore;
  forbidden?: LevelScore;
  lowerHp?: LevelScore;
  higherHp?: LevelScore;
}

const MINUTE = 60 * TICKS_PER_SECOND;
const MIN_LEVEL_MINUTES = 4;
const MAX_LEVEL_MINUTES = 9;
const MIN_CAMPAIGN_MINUTES = 60;
const MAX_CAMPAIGN_MINUTES = 80;
const MIN_WAVES = 5;
const MAX_WAVES = 10;
const LAST_SPAWN_SECONDS = 90;
const HEALTH_VARIANTS = [0.95, 1.05] as const;
const MAX_PEAK_ALIVE = 40;
const MIN_HP_SCALE = 0.85;
const DEFAULT_MAX_HP_SCALE = 1.35;
// Only these authored encounters have a measured exception to the default band.
const HP_SCALE_EXCEPTIONS: Readonly<Partial<Record<number, number>>> = { 2: 1.979, 3: 1.375 };
const START_GOLD_MIN = 100;
const START_GOLD_MAX = 300;
const FINALE = 10;
const FINALE_LIVES_MAX = 16;
const EARLY_LEVELS = [1, 2, 3];
const LATE_LEVELS = [8, 9, FINALE];
const MIN_MEAN_LIVES_DROP = 3;

function whole(value: number, min: number, max: number = Number.MAX_SAFE_INTEGER): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function validLevel(level: LevelDef): boolean {
  return whole(level.id, 1) && MAP_IDS.includes(level.map) &&
    whole(level.startGold, START_GOLD_MIN, START_GOLD_MAX) &&
    Number.isFinite(level.hpScale) && level.hpScale >= MIN_HP_SCALE && level.hpScale <= (HP_SCALE_EXCEPTIONS[level.id] ?? DEFAULT_MAX_HP_SCALE) &&
    (level.hpGrowthStart === null || whole(level.hpGrowthStart, 1, level.waves.length)) &&
    whole(level.waves.length, MIN_WAVES, MAX_WAVES) &&
    level.waves.every(wave =>
      (wave.hpMultiplier ?? 1) === 1 &&
      wave.groups.length > 0 && wave.groups.every(group =>
        Object.hasOwn(ENEMY_STATS, group.type) && whole(group.count, 1) &&
        Number.isFinite(group.delay) && group.delay >= 0 &&
        Number.isFinite(group.interval) && group.interval >= 0)) &&
    whole(level.maxTowerLevel, 1, 3) &&
    level.allowedTowers.length > 0 && level.allowedTowers.every(type => Object.hasOwn(TOWER_DEFS, type)) &&
    level.allowedSpecials.every(type => Object.hasOwn(SPECIAL_DEFS, type)) &&
    level.rewardWaves.length <= BOON_OFFER_WAVES.length &&
    level.rewardWaves.every((wave, i) => whole(wave, (level.rewardWaves[i - 1] ?? 0) + 1, level.waves.length));
}

function validSchedule(level: LevelDef): boolean {
  return level.waves.every(wave => {
    const walkers: number[] = [];
    const flyers: number[] = [];
    for (const group of wave.groups) {
      const ticks = ENEMY_STATS[group.type].flying ? flyers : walkers;
      const cap = ticks === flyers ? 4 : 6;
      if (spawnTick(group, group.count - 1) > LAST_SPAWN_SECONDS * TICKS_PER_SECOND ||
        ticks.length + group.count > (Math.floor(LAST_SPAWN_SECONDS / 3) + 1) * cap) return false;
      for (let i = 0; i < group.count; i++) ticks.push(spawnTick(group, i));
    }
    return maxIn3s(walkers) <= 6 && maxIn3s(flyers) <= 4;
  });
}

function withoutFeature(level: LevelDef, feature: LevelFeature): LevelDef {
  if ('towers' in feature) {
    return { ...level, allowedTowers: level.allowedTowers.filter(type => !feature.towers.includes(type)) };
  }
  if ('specials' in feature) {
    return { ...level, allowedSpecials: level.allowedSpecials.filter(type => !feature.specials.includes(type)) };
  }
  return { ...level, maxTowerLevel: Math.min(level.maxTowerLevel, feature.maxTowerLevel) as LevelDef['maxTowerLevel'] };
}

function compareScores(a: LevelScore, b: LevelScore): number {
  return a.stars - b.stars || a.lives - b.lives;
}

const scores = new WeakMap<LevelDef, { key: string; results: Map<string, LevelScore> }>();

function measure(level: LevelDef, variant = level, beginner = false): LevelScore {
  const key = JSON.stringify(level);
  let cached = scores.get(level);
  if (!cached || cached.key !== key) {
    cached = { key, results: new Map() };
    scores.set(level, cached);
  }
  const variantKey = beginner ? 'beginner' : JSON.stringify(variant);
  const previous = cached.results.get(variantKey);
  if (previous) return previous;
  const { state, refused, peakAlive } = runBot(createGame({ level: variant }), beginner ? botBeginner : botGood, Infinity, 2 * MAX_LEVEL_MINUTES * MINUTE);
  const { phase, lives, tick } = state;
  const result = { phase, lives, tick, refused, peakAlive, spawned: state.nextEnemyId, stars: levelStars(state) };
  cached.results.set(variantKey, result);
  return result;
}

function finished(score: LevelScore): boolean {
  return (score.phase === 'won' || score.phase === 'lost') && score.refused === 0 &&
    Number.isFinite(score.tick) && Number.isFinite(score.lives);
}

/** Omit the feature for the ten shipped stops, or supply the candidate's feature explicitly. */
export function checkLevel(level: LevelDef, feature = NEW_FEATURE[level.id], campaign?: readonly LevelDef[]): LevelCheck {
  if (campaign) {
    const index = campaign.findIndex(entry => entry.id === level.id);
    const entries = [...campaign];
    const slot = index === -1 ? entries.length : index;
    entries[slot] = level;
    const checked = checkCampaign(entries, { [level.id]: feature });
    const row = checked.levels[slot];
    const failed = new Set(row.failed);
    // A candidate can finish one streak and be part of either of the next two.
    for (let end = slot + 1; end < Math.min(slot + 3, entries.length); end++) {
      if (breaksSlope(checked.levels, end, slot)) failed.add('L4');
    }
    if (!validTotal(checked.totalTicks)) failed.add('L5');
    if ((EARLY_LEVELS.includes(level.id) || LATE_LEVELS.includes(level.id)) && breaksMeanDrop(checked.levels, entries)) {
      failed.add('L8');
    }
    return { ...row, ok: failed.size === 0, failed: [...failed].sort() };
  }
  if (!validLevel(level)) return { ok: false, failed: ['L7'] };
  if (!validSchedule(level)) return { ok: false, failed: ['L5'] };

  const failed: GateLabel[] = [];
  const good = measure(level);
  const beginner = measure(level, level, true);
  const forbidden = feature ? measure(level, withoutFeature(level, feature)) : undefined;
  const [lowerHp, higherHp] = HEALTH_VARIANTS.map(hp => measure(level, { ...level, hpScale: level.hpScale * hp }));

  if (good.stars < (level.id <= 3 ? 3 : 2)) failed.push('L1');
  if (level.id <= 3 ? beginner.stars === 0 : beginner.stars > (level.id <= 5 ? 2 : 1)) failed.push('L2');
  if (level.id !== 1 && (!forbidden || compareScores(good, forbidden) <= 0 ||
    (feature && 'mustLose' in feature && feature.mustLose && forbidden.phase !== 'lost'))) failed.push('L3');
  if (good.peakAlive > MAX_PEAK_ALIVE || good.tick < MIN_LEVEL_MINUTES * MINUTE || good.tick > MAX_LEVEL_MINUTES * MINUTE) failed.push('L5');
  if ([lowerHp, higherHp].some(score => Math.abs(score.stars - good.stars) > 1 ||
    (level.id <= 5 && good.phase === 'won' && score.phase !== 'won'))) failed.push('L6');
  if (![good, beginner, lowerHp, higherHp, ...(forbidden ? [forbidden] : [])].every(finished)) failed.push('L7');

  if (level.id === FINALE && (good.phase !== 'won' || !whole(good.lives, TWO_STAR_LIVES, FINALE_LIVES_MAX))) failed.push('L8');

  return { ok: failed.length === 0, failed, good, beginner, forbidden, lowerHp, higherHp };
}

function validTotal(tick: number): boolean {
  return tick >= MIN_CAMPAIGN_MINUTES * MINUTE && tick <= MAX_CAMPAIGN_MINUTES * MINUTE;
}

export interface CampaignCheck {
  ok: boolean;
  failed: readonly GateLabel[];
  levels: readonly LevelCheck[];
  totalTicks: number;
}

function breaksSlope(checks: readonly LevelCheck[], end: number, candidate = end): boolean {
  const current = checks[end];
  const previous = checks[end - 1];
  const earlier = checks[end - 2];
  if (candidate >= end - 1 && previous?.beginner && current.beginner &&
    current.beginner.stars > previous.beginner.stars + 1) return true;
  if (candidate < end - 2 || !earlier?.good || !previous.good || !current.good) return false;

  return earlier.good.lives < previous.good.lives && previous.good.lives < current.good.lives;
}

function breaksMeanDrop(checks: readonly LevelCheck[], levels: readonly LevelDef[]): boolean {
  const ids = levels.map(level => level.id);
  const cases = [...EARLY_LEVELS, ...LATE_LEVELS];
  if (cases.some(id => ids.indexOf(id) !== ids.lastIndexOf(id))) return true;
  if (cases.some(id => !ids.includes(id))) return levels.length >= FINALE;
  const lives = cases.map(id => checks[ids.indexOf(id)].good?.lives);
  if (lives.some(value => value === undefined)) return false;
  const sum = (group: readonly (number | undefined)[]) => group.reduce<number>((total, value) => total + (value ?? 0), 0);
  const early = sum(lives.slice(0, EARLY_LEVELS.length));
  const late = sum(lives.slice(EARLY_LEVELS.length));
  return late > early - MIN_MEAN_LIVES_DROP * EARLY_LEVELS.length;
}

/** In campaign order, also check the progression and combined running time. */
export function checkCampaign(levels: readonly LevelDef[], features: Readonly<Partial<Record<number, LevelFeature>>> = {}): CampaignCheck {
  const local = levels.map(level => checkLevel(level, features[level.id]));
  const checked = local.map((row, i) => breaksSlope(local, i)
    ? { ...row, ok: false, failed: [...row.failed, 'L4' as const] }
    : row);
  const totalTicks = checked.reduce((sum, row) => sum + (row.good?.tick ?? 0), 0);
  const failed = new Set(checked.flatMap(row => row.failed));
  if (!validTotal(totalTicks)) failed.add('L5');
  if (breaksMeanDrop(checked, levels)) failed.add('L8');
  return { ok: failed.size === 0, failed: [...failed].sort(), levels: checked, totalTicks };
}
