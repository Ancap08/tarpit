// Headless campaign acceptance checks. Only scores, never game states, are cached.
import { maxIn3s } from './balanceTargets';
import { BOON_OFFER_WAVES } from './boons';
import { levelStars } from './campaignProgress';
import { botBeginner, botFeathers, botGood, botGoodFeat, botPerson, botPersonFeat, runBot, type BotPolicy } from './bots';
import { ENEMY_STATS } from './enemies';
import { createGame, spawnTick } from './game';
import { CAMPAIGN_START_LIVES, TWO_STAR_LIVES, type LevelDef, type TaxKind } from './levelTypes';
import { MAP_IDS } from './map';
import { SPECIAL_DEFS, type SpecialType } from './specials';
import { TICKS_PER_SECOND } from './time';
import { TOWER_DEFS } from './towers';
import type { EnemyType, GameState, TowerLevel, TowerType } from './types';

type GateLabel = 'P1' | 'P2' | 'L1' | 'L1m' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8' | 'T1' | 'T2' | 'T3' | 'F1' | 'F2' | 'F3' | 'V1' | 'S1' | 'R6';

export type LevelFeature =
  | { readonly towers: readonly TowerType[] }
  | { readonly specials: readonly SpecialType[] }
  | { readonly maxTowerLevel: 1 | 2 };

type Introduction = LevelFeature | { readonly enemy: EnemyType; readonly control: LevelFeature; readonly mustLose?: boolean };

type Capability = TowerType | SpecialType | EnemyType | TowerLevel;

export interface LevelContext {
  band: 'intro' | 'middle' | 'transition' | 'late' | 'finale';
  introduces: Introduction | null;
  /** Other first appearances alongside the mechanic measured by the removal trial. */
  alsoIntroduces?: readonly Capability[];
  introducesTax?: TaxKind;
  /** The original campaign retains its shipped difficulty contract. */
  frozenFirstAct?: boolean;
}

export interface LevelScore {
  readonly towersBuilt: number;
  readonly waveOneLives: number;
  readonly peakAlive: number;
  readonly spawned: number;
  readonly phase: GameState['phase'];
  readonly lives: number;
  readonly tick: number;
  readonly stars: 0 | 1 | 2 | 3;
  readonly refused: number;
  readonly featherUse?: { pathBTowers: number; barrelCasts: number; feathered: number };
}

export interface LevelCheck {
  ok: boolean;
  failed: readonly GateLabel[];
  good?: LevelScore;
  beginner?: LevelScore;
  feathers?: LevelScore;
  forbidden?: LevelScore;
  person?: LevelScore;
  noSpecials?: LevelScore;
  featureTrials?: readonly FeatureTrial[];
  taxTrials?: readonly TaxTrial[];
  featGood?: LevelScore;
  featPerson?: LevelScore;
  featTrials?: readonly { variant: string; good: LevelScore }[];
  singleTowerTrials?: readonly { tower: TowerType; good: LevelScore }[];
  sensitivity?: readonly SensitivityTrial[];
  openingCount: number;
  endingCount: number;
  endingBosses: readonly EnemyType[];
  nominal: { id: number; hpScale: number; startGold: number; waveCount: number };
  scheduleIssue?: ScheduleIssue;
}

interface FeatureTrial {
  variant: string;
  good: LevelScore;
  goodWithout: LevelScore;
  person: LevelScore;
  personWithout: LevelScore;
}

interface TaxTrial {
  tax: TaxKind;
  variant: string;
  person: LevelScore;
  personWithout: LevelScore;
}

interface SensitivityTrial {
  variant: string;
  good: LevelScore;
  person: LevelScore;
}

const MINUTE = 60 * TICKS_PER_SECOND;
export const GATE_LIMITS = {
  levelMinutes: [4, 9], averageMinutes: [6, 8], waveCount: [5, 10],
  hpScale: [0.85, 1.35], startGold: [100, 300], finaleLives: [TWO_STAR_LIVES, 16],
  lastSpawnSeconds: 90, peakAlive: 40, openingCount: 60, closingCount: 20,
  maxPersonDeficit: 6, goodFeatureLives: 2, personFeatureLives: 1, meanLivesDrop: 3,
  taxBiteLives: 3, featSpecialLives: 3, featExtraBuilds: 3, singleTowerMaxStars: 1,
  twoStarHeadroom: 1, priorStops: 3, actMeanDrop: 1.5, maxPersonCliff: 5, maxFeatherAdvantage: 3,
  featureHp: [0.98, 1.02], featureGold: [-10, 10], sensitivityHp: [0.95, 1.05], sensitivityGold: [0.85, 1.15],
} as const;

// Good minimum, Person minimum, Beginner minimum and maximum, Person must win without specials.
export const BAND_RULES = {
  intro: [3, 2, 1, 3, true], middle: [2, 2, 0, 2, true], transition: [2, 1, 0, 1, true],
  late: [2, 1, 0, 1, false], finale: [2, 1, 0, 1, false],
} as const;

function whole(value: number, min: number, max: number = Number.MAX_SAFE_INTEGER): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function taxKinds(level: LevelDef): TaxKind[] {
  return Object.keys(level.taxes ?? {}) as TaxKind[];
}

export const TAX_RANGES = {
  windowTax: [0.05, 0.10], forcedMarch: [0.15, 0.25], curfew: [0.10, 0.20], noLoitering: [8, 15],
} as const;

function validTax(level: LevelDef, key: TaxKind): boolean {
  const value = level.taxes?.[key];
  if (value === undefined || !Number.isFinite(value)) return false;
  if (key === 'rationing') return whole(value, 1);
  if (key === 'frozenPurse') return whole(value, 0);
  const range = TAX_RANGES[key];
  return range !== undefined && value >= range[0] && value <= range[1];
}

function validTaxesAndFeat(level: LevelDef): boolean {
  const keys = taxKinds(level);
  if (keys.length > 2 || !keys.every(key => validTax(level, key))) return false;
  const feat = level.feat;
  return !feat || feat.kind === 'noLeaks' || feat.kind === 'noSpecials' || feat.kind === 'noRepairs' ||
    (feat.kind === 'unbroken' && level.gate !== undefined) ||
    (feat.kind === 'maxTowers' && whole(feat.limit, 0));
}

function validLevel(level: LevelDef): boolean {
  return whole(level.id, 1) && MAP_IDS.some(id => id === level.map) && validTaxesAndFeat(level) &&
    whole(level.startGold, ...GATE_LIMITS.startGold) &&
    Number.isFinite(level.hpScale) && level.hpScale >= GATE_LIMITS.hpScale[0] && level.hpScale <= GATE_LIMITS.hpScale[1] &&
    (level.hpGrowthStart === null || whole(level.hpGrowthStart, 1, level.waves.length)) &&
    whole(level.waves.length, ...GATE_LIMITS.waveCount) &&
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

interface ScheduleIssue {
  wave: number;
  quantity: 'lastSpawnTick' | 'walkersIn3s' | 'flyersIn3s' | 'walkersInWave' | 'flyersInWave';
  actual: number;
  limit: number;
}

function scheduleIssue(level: LevelDef): ScheduleIssue | undefined {
  const lastTick = GATE_LIMITS.lastSpawnSeconds * TICKS_PER_SECOND;
  for (const [index, def] of level.waves.entries()) {
    const wave = index + 1;
    const walkers: number[] = [];
    const flyers: number[] = [];
    for (const group of def.groups) {
      const flying = ENEMY_STATS[group.type].flying;
      const ticks = flying ? flyers : walkers;
      const last = spawnTick(group, group.count - 1);
      if (last > lastTick) return { wave, quantity: 'lastSpawnTick', actual: last, limit: lastTick };
      // Bound allocation before expanding even a malformed candidate's groups.
      const capacity = (Math.floor(GATE_LIMITS.lastSpawnSeconds / 3) + 1) * (flying ? 4 : 6);
      const total = ticks.length + group.count;
      if (total > capacity) return { wave, quantity: flying ? 'flyersInWave' : 'walkersInWave', actual: total, limit: capacity };
      for (let i = 0; i < group.count; i++) ticks.push(spawnTick(group, i));
    }
    const groundPeak = maxIn3s(walkers);
    if (groundPeak > 6) return { wave, quantity: 'walkersIn3s', actual: groundPeak, limit: 6 };
    const airPeak = maxIn3s(flyers);
    if (airPeak > 4) return { wave, quantity: 'flyersIn3s', actual: airPeak, limit: 4 };
  }
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

// Share measurements between a candidate check and a campaign check. Reject stale
// entries if a caller edits a record in place. Scores contain no mutable game state.
const scores = new WeakMap<LevelDef, { key: string; results: Map<string, LevelScore> }>();

function measure(level: LevelDef, variant: LevelDef, policy: BotPolicy): LevelScore {
  const key = JSON.stringify(level);
  let cached = scores.get(level);
  if (!cached || cached.key !== key) {
    cached = { key, results: new Map() };
    scores.set(level, cached);
  }
  // Not a penny uses each player's ordinary policy. Reuse that exact measurement.
  if (variant.feat?.kind === 'noLeaks') {
    if (policy === botGoodFeat) policy = botGood;
    if (policy === botPersonFeat) policy = botPerson;
  }
  const bot = [botGood, botPerson, botBeginner, botGoodFeat, botPersonFeat, botFeathers].indexOf(policy);
  const variantKey = bot + JSON.stringify(variant);
  const previous = cached.results.get(variantKey);
  if (previous) return previous;
  const { state, log, refused, peakAlive, waveOneLives, setupTicks, feathered } = runBot(createGame({ level: variant }), policy, Infinity, 2 * GATE_LIMITS.levelMinutes[1] * MINUTE);
  const { phase } = state;
  const tick = state.tick - setupTicks;
  const lives = Math.max(0, state.lives);
  const featherUse = policy === botFeathers ? {
    pathBTowers: state.towers.filter(tower => tower.type === 'tarpit' && tower.path === 'B').length,
    barrelCasts: log.filter(step => step.action === 'special' && step.special === 'tarBarrel' && step.result.ok).length,
    feathered: feathered ?? 0,
  } : undefined;
  const result = { ...(featherUse && { featherUse }), phase, lives, towersBuilt: state.towersBuilt ?? state.towers.length, tick, refused, peakAlive, waveOneLives, spawned: state.nextEnemyId, stars: levelStars(state) };
  cached.results.set(variantKey, result);
  return result;
}

function finished(score: LevelScore): boolean {
  return (score.phase === 'won' || score.phase === 'lost') && score.refused === 0 &&
    Number.isFinite(score.tick) && Number.isFinite(score.lives);
}

function featureKeys(feature: Introduction | null): Capability[] {
  if (!feature) return [];
  if ('enemy' in feature) return [feature.enemy];
  if ('towers' in feature) return [...feature.towers];
  if ('specials' in feature) return [...feature.specials];
  return [feature.maxTowerLevel === 1 ? 2 : 3];
}

function capabilities(level: LevelDef): Set<Capability> {
  return new Set([
    ...level.allowedTowers, ...level.allowedSpecials,
    ...([1, 2, 3] as const).filter(tier => tier <= level.maxTowerLevel),
    ...level.waves.flatMap(wave => wave.groups.map(group => group.type)),
  ]);
}

/** Judge a candidate with the declared difficulty and introduced capability. */
export function checkLevel(level: LevelDef, context: LevelContext): LevelCheck {
  const count = (wave: LevelDef['waves'][number] | undefined) => wave?.groups.reduce((n, group) => n + group.count, 0) ?? 0;
  const last = level.waves.at(-1);
  const openingCount = count(level.waves[0]);
  const endingCount = count(last);
  const endingBosses = last?.groups.map(group => group.type).filter(type => type === 'boss' || type === 'grumblemaw') ?? [];
  const nominal = { id: level.id, hpScale: level.hpScale, startGold: level.startGold, waveCount: level.waves.length };
  const structure = { nominal, openingCount, endingCount, endingBosses };
  if (!validLevel(level)) return { ...structure, ok: false, failed: ['L7'] };
  const issue = scheduleIssue(level);
  if (issue) return { ...structure, ok: false, failed: ['L5'], scheduleIssue: issue };

  const failed = new Set<GateLabel>();
  const [goodMin, personMin, beginnerMin, beginnerMax, needsNoSpecials] = BAND_RULES[context.band];
  const good = measure(level, level, botGood);
  const person = measure(level, level, botPerson);
  const beginner = measure(level, level, botBeginner);
  const feathers = measure(level, level, botFeathers);
  if (feathers.lives - good.lives > GATE_LIMITS.maxFeatherAdvantage ||
      (feathers.stars === 3 && good.stars !== 3)) failed.add('R6');
  const noSpecials = measure(level, { ...level, allowedSpecials: [] }, botPerson);
  if (person.stars < personMin || good.lives - person.lives > GATE_LIMITS.maxPersonDeficit) failed.add('P1');
  if (needsNoSpecials && noSpecials.stars === 0) failed.add('P2');
  if (good.stars < goodMin) failed.add('L1');
  if (!whole(beginner.stars, beginnerMin, beginnerMax)) failed.add('L2');

  const taxes = taxKinds(level);
  const taxTrials: TaxTrial[] = [];
  if (context.introducesTax && (taxes.length !== 1 || taxes[0] !== context.introducesTax)) failed.add('T3');
  const feature = context.introduces;
  const featureTrials: FeatureTrial[] = [];
  const runs = [good, person, beginner, feathers, noSpecials];
  const featTrials: { variant: string; good: LevelScore }[] = [];
  const featPerson = level.feat ? measure(level, level, botPersonFeat) : undefined;
  if (featPerson) {
    runs.push(featPerson);
    if (beginner.stars === 3) failed.add('F1');
    if (person.stars === 3 || featPerson.stars === 3) failed.add('F2');
    if (level.feat?.kind === 'noSpecials' && person.lives - featPerson.lives < GATE_LIMITS.featSpecialLives) failed.add('F3');
    if (level.feat?.kind === 'maxTowers' && person.towersBuilt - level.feat.limit < GATE_LIMITS.featExtraBuilds) failed.add('F3');
  }
  const singleTowerTrials = [];
  if (!context.frozenFirstAct && (context.band === 'late' || context.band === 'finale')) {
    for (const tower of level.allowedTowers) {
      const single = measure(level, { ...level, allowedTowers: [tower] }, botGood);
      singleTowerTrials.push({ tower, good: single });
      runs.push(single);
      if (single.stars > GATE_LIMITS.singleTowerMaxStars) failed.add('V1');
    }
  }
  const available = capabilities(level);
  if (featureKeys(feature).some(key => !available.has(key))) failed.add('L3');
  const marginChanges = [
    ['base', level], ['hp-2%', { ...level, hpScale: level.hpScale * GATE_LIMITS.featureHp[0] }],
    ['hp+2%', { ...level, hpScale: level.hpScale * GATE_LIMITS.featureHp[1] }],
    ['gold-10', { ...level, startGold: level.startGold + GATE_LIMITS.featureGold[0] }],
    ['gold+10', { ...level, startGold: level.startGold + GATE_LIMITS.featureGold[1] }],
  ] as const;
  for (const [variant, test] of marginChanges) {
    const full = measure(level, test, botGood);
    runs.push(full);
    const nudged = variant !== 'base';
    const marginLives = TWO_STAR_LIVES + GATE_LIMITS.twoStarHeadroom;
    if (nudged && (full.stars < goodMin ||
      (!context.frozenFirstAct && goodMin === 2 && full.lives < marginLives))) failed.add('L1m');
    if (level.feat) {
      const deliberate = measure(level, test, botGoodFeat);
      featTrials.push({ variant, good: deliberate });
      runs.push(deliberate);
      if (deliberate.stars !== 3) failed.add('F1');
    }
    if (taxes.length) {
      const player = measure(level, test, botPerson);
      runs.push(player);
      if (player.stars < (nudged ? 1 : 2)) failed.add('T2');
      if (nudged && player.lives < marginLives) failed.add('L1m');
      for (const tax of taxes) {
        const remaining = { ...test.taxes };
        delete remaining[tax];
        const control = measure(level, { ...test, taxes: remaining }, botPerson);
        taxTrials.push({ variant, tax, person: player, personWithout: control });
        runs.push(control);
        if (control.lives - player.lives < GATE_LIMITS.taxBiteLives && control.stars <= player.stars) failed.add('T1');
      }
    }
    if (feature) {
      const removed = withoutFeature(test, 'enemy' in feature ? feature.control : feature);
      const goodWithout = measure(level, removed, botGood);
      const player = measure(level, test, botPerson);
      const personWithout = measure(level, removed, botPerson);
      runs.push(goodWithout, player, personWithout);
      featureTrials.push({ variant, good: full, goodWithout, person: player, personWithout });
      if ((full.lives - goodWithout.lives < GATE_LIMITS.goodFeatureLives && full.stars <= goodWithout.stars) ||
        player.lives - personWithout.lives < GATE_LIMITS.personFeatureLives ||
        (variant === 'base' && 'mustLose' in feature && feature.mustLose && goodWithout.stars !== 0)) failed.add('L3');
    }
  }

  if (openingCount > GATE_LIMITS.openingCount || person.waveOneLives !== CAMPAIGN_START_LIVES ||
    (endingCount < GATE_LIMITS.closingCount && endingBosses.length === 0) ||
    (level.endingBoss && !endingBosses.some(type => type === level.endingBoss)) ||
    good.peakAlive > GATE_LIMITS.peakAlive || good.tick < GATE_LIMITS.levelMinutes[0] * MINUTE || good.tick > GATE_LIMITS.levelMinutes[1] * MINUTE) failed.add('L5');

  const sensitivity: SensitivityTrial[] = [];
  const changes = [
    ['hp-5%', { ...level, hpScale: level.hpScale * GATE_LIMITS.sensitivityHp[0] }],
    ['hp+5%', { ...level, hpScale: level.hpScale * GATE_LIMITS.sensitivityHp[1] }],
    ['gold-15%', { ...level, startGold: Math.round(level.startGold * GATE_LIMITS.sensitivityGold[0]) }],
    ['gold+15%', { ...level, startGold: Math.round(level.startGold * GATE_LIMITS.sensitivityGold[1]) }],
  ] as const;
  for (const [variant, test] of changes) {
    const g = measure(level, test, botGood);
    const p = measure(level, test, botPerson);
    sensitivity.push({ variant, good: g, person: p });
    runs.push(g, p);
    if (Math.abs(g.stars - good.stars) > 1 || Math.abs(p.stars - person.stars) > 1 ||
      (personMin >= 2 && (!g.stars || !p.stars))) failed.add('L6');
  }
  if (!runs.every(finished)) failed.add('L7');
  if (context.band === 'finale' && !whole(good.lives, ...GATE_LIMITS.finaleLives)) failed.add('L8');
  return { ...structure, ok: failed.size === 0, failed: [...failed], good, beginner, person, feathers, noSpecials,
    forbidden: featureTrials[0]?.goodWithout, featureTrials, taxTrials, featGood: featTrials[0]?.good, featPerson, featTrials, singleTowerTrials, sensitivity };
}

export interface CampaignCheck {
  ok: boolean;
  failed: readonly GateLabel[];
  levels: readonly LevelCheck[];
  totalTicks: number;
  meanLivesDrop?: number;
  stepUp?: { previousMean: number; secondMean: number; handover: number; largestDrop: number };
}

/** Combine local checks in play order. Each cohort has floor(N/3) levels. */
export function checkCampaign(levels: readonly LevelDef[], contexts: readonly LevelContext[]): CampaignCheck {
  if (!levels.length || contexts.length !== levels.length) return { ok: false, failed: ['L7'], levels: [], totalTicks: 0 };
  const checked = levels.map((level, i) => checkLevel(level, contexts[i]));
  const failed = new Set(checked.flatMap(row => row.failed));
  const introduced = new Set<Capability>();
  const introducedTaxes = new Set<TaxKind>();
  for (const [i, row] of checked.entries()) {
    const context = contexts[i];
    const taxes = taxKinds(levels[i]);
    const freshTaxes = taxes.filter(tax => !introducedTaxes.has(tax));
    if (freshTaxes.length !== (context.introducesTax ? 1 : 0) ||
      (freshTaxes.length && (taxes.length !== 1 || freshTaxes[0] !== context.introducesTax))) failed.add('T3');
    for (const tax of taxes) introducedTaxes.add(tax);
    const declared = new Set([...featureKeys(context.introduces), ...context.alsoIntroduces ?? []]);
    const available = capabilities(levels[i]);
    for (const key of declared) {
      if (introduced.has(key) || !available.has(key)) failed.add('L3');
    }
    for (const key of available) {
      if (!introduced.has(key) && !declared.has(key)) failed.add('L3');
      introduced.add(key);
    }
    const prev = checked[i - 1];
    const earlier = checked[i - 2];
    if ((prev?.beginner && row.beginner && row.beginner.stars > prev.beginner.stars + 1) ||
      (earlier?.good && prev.good && row.good && earlier.good.lives < prev.good.lives && prev.good.lives < row.good.lives)) failed.add('L4');
  }
  let stepUp: CampaignCheck['stepUp'];
  const boundary = contexts.findIndex(context => !context.frozenFirstAct);
  if (boundary >= GATE_LIMITS.priorStops && checked.every(row => row.person)) {
    const lives = checked.map(row => row.person!.lives);
    const second = lives.slice(boundary);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    stepUp = {
      previousMean: mean(lives.slice(boundary - GATE_LIMITS.priorStops, boundary)),
      secondMean: mean(second),
      handover: second[0] - lives[boundary - 1],
      largestDrop: Math.max(0, ...second.slice(1).map((value, i) => second[i] - value)),
    };
    if (stepUp.handover < 0 || stepUp.previousMean - stepUp.secondMean < GATE_LIMITS.actMeanDrop ||
      stepUp.largestDrop > GATE_LIMITS.maxPersonCliff) failed.add('S1');
  }
  if (new Set(levels.map(level => level.id)).size !== levels.length) failed.add('L7');
  const totalTicks = checked.reduce((sum, row) => sum + (row.good?.tick ?? 0), 0);
  const minutesPerLevel = totalTicks / (MINUTE * levels.length);
  if (minutesPerLevel < GATE_LIMITS.averageMinutes[0] || minutesPerLevel > GATE_LIMITS.averageMinutes[1]) failed.add('L5');
  const cohort = Math.max(1, Math.floor(levels.length / 3));
  let meanLivesDrop: number | undefined;
  if (levels.length > 1 && checked.every(row => row.good)) {
    const mean = (rows: LevelCheck[]) => rows.reduce((sum, row) => sum + row.good!.lives, 0) / rows.length;
    meanLivesDrop = mean(checked.slice(0, cohort)) - mean(checked.slice(-cohort));
    if (meanLivesDrop < GATE_LIMITS.meanLivesDrop) failed.add('L8');
  }
  return { ok: failed.size === 0, failed: [...failed], levels: checked, totalTicks, meanLivesDrop, stepUp };
}
