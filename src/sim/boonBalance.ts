import { playWithStats, type BalanceRun } from './balanceRuns';
import { BOONS, boonOptions, type BoonId } from './boons';
import {
  ARCHETYPES,
  artilleryBuild,
  burnBuild,
  comboBuild,
  type BoonChoices,
  type RecordedOutcome,
} from './headless';
import type { MapId } from './map';

export const BOON_EFFECT_BUILDS = {
  comboBuild,
  hardBuild: ARCHETYPES.hardBuild,
  comboBuildNoFire: ARCHETYPES.comboBuildNoFire,
  longbowSpam: ARCHETYPES.longbowSpam,
  soundBuild: ARCHETYPES.soundBuild,
  lazyBuild: ARCHETYPES.lazyBuild,
  artilleryBuild,
  burnBuild,
};

export const BOON_WAVES = [5, 10, 15] as const;
export type BoonWave = (typeof BOON_WAVES)[number];
export type BoonEffectBuild = keyof typeof BOON_EFFECT_BUILDS;
export type BoonPicks = readonly [BoonId, BoonId, BoonId];

export interface BoonScenario {
  build: BoonEffectBuild;
  map: MapId;
  difficulty: 'normal' | 'hard';
  wave: BoonWave;
  /** The other two choices stay fixed. This offer replaces its pick for each comparison. */
  picks: BoonPicks;
}

export type BoonOutcome = Pick<BalanceRun, 'lives' | 'wave' | 'phase' | 'kills' | 'refused'>;

export interface BoonMeasurement {
  boon: BoonId;
  actual: BoonOutcome;
  neutral: BoonOutcome;
}

export interface BoonScenarioResult {
  scenario: BoonScenario;
  outcomes: readonly BoonMeasurement[];
}

export function defaultBoonPicks(): BoonPicks {
  return [boonOptions(5)[0], boonOptions(10)[0], boonOptions(15)[0]];
}

/**
 * Remove only the chosen option's benefit in the comparison run. The same
 * card is still picked by the standard script runner, and the other two
 * keep their real effects. The direct planners report their own runs,
 * saving a replay. Other builds record and replay under the same
 * temporary value because early purchases can depend on the effect.
 */
function runComparison(scenario: BoonScenario, picks: BoonChoices, neutral?: BoonId): BoonOutcome {
  const { build, difficulty, map } = scenario;
  const run = () => {
    if (build === 'comboBuild' || build === 'artilleryBuild' || build === 'burnBuild') {
      let outcome: RecordedOutcome | undefined;
      BOON_EFFECT_BUILDS[build](difficulty, map, picks, (recorded) => { outcome = recorded; });
      if (!outcome) throw new Error(`no recorded outcome for ${build}`);
      return { ...outcome, refused: 0 };
    }
    const { lives, wave, phase, kills, refused } = playWithStats(BOON_EFFECT_BUILDS[build](difficulty, map, picks), difficulty);
    return { lives, wave, phase, kills, refused };
  };
  if (neutral === undefined) return run();
  const def: { value: number } = BOONS[neutral];
  const value = def.value;
  def.value = neutral === 'warChest' || neutral === 'stoneWalls' ? 0 : 1;
  try {
    return run();
  } finally {
    def.value = value;
  }
}

/** A local cache shares repeated campaign runs across scenarios. */
export function createBoonScenarioMeasurer(): (scenario: BoonScenario) => BoonScenarioResult {
  const cache = new Map<string, BoonOutcome>();
  const measure = (scenario: BoonScenario, picks: BoonChoices, neutral?: BoonId) => {
    const key = JSON.stringify([scenario.build, scenario.map, scenario.difficulty, picks, neutral]);
    const known = cache.get(key);
    if (known) return known;
    const result = runComparison(scenario, picks, neutral);
    cache.set(key, result);
    return result;
  };
  return (scenario) => {
    const options = boonOptions(scenario.wave);
    const otherPicks = { 5: scenario.picks[0], 10: scenario.picks[1], 15: scenario.picks[2] };
    // Once the selected effect is zero, the three choices give the same state
    // for combat and purchases. Run this counterfactual once for the offer.
    const neutral = measure(scenario, { ...otherPicks, [scenario.wave]: options[0] }, options[0]);
    return {
      scenario,
      outcomes: options.map((boon) => ({
        boon,
        actual: measure(scenario, { ...otherPicks, [scenario.wave]: boon }),
        neutral,
      })),
    };
  };
}

export interface BoonEffect {
  boon: BoonId;
  best: BoonScenario[];
  changed: BoonScenario[];
}

export function evaluateBoonEffects(measurements: readonly BoonScenarioResult[]) {
  const effects: BoonEffect[] = Object.values(BOONS).map(({ id }) => ({ boon: id, best: [], changed: [] }));
  const byId = new Map(effects.map((effect) => [effect.boon, effect]));
  for (const { scenario, outcomes } of measurements) {
    const options = boonOptions(scenario.wave);
    if (outcomes.length !== options.length || !options.every((id) => outcomes.some(({ boon }) => boon === id))) continue;
    // A run that died before the offer contributes no boon evidence.
    const valid = (run: BoonOutcome) => run.refused === 0 && run.wave > scenario.wave &&
      (run.phase === 'won' || run.phase === 'lost');
    if (!outcomes.every(({ actual, neutral }) => valid(actual) && valid(neutral))) continue;
    for (const { boon, actual, neutral } of outcomes) {
      const effect = byId.get(boon)!;
      const peers = outcomes.filter((other) => other.boon !== boon);
      if (peers.every(({ actual: peer }) => actual.lives > peer.lives || (actual.lives === peer.lives && actual.kills > peer.kills))) {
        effect.best.push(scenario);
      }
      const defeatWave = (run: BoonOutcome) => run.phase === 'lost' ? run.wave : undefined;
      const changed = actual.lives !== neutral.lives || defeatWave(actual) !== defeatWave(neutral);
      if (changed && !effect.changed.some(({ build, map }) => build === scenario.build && map === scenario.map)) {
        effect.changed.push(scenario);
      }
    }
  }
  const cInfo = effects.map(({ boon, best }) => `${boon} ${best.length} strict best results`).join(', ');
  const dInfo = effects.map(({ boon, changed }) => `${boon} ${changed.length} build/map pairs`).join(', ');
  return {
    c: { ok: effects.every(({ best }) => best.length > 0), info: cInfo },
    d: { ok: effects.every(({ changed }) => changed.length >= 3), info: dInfo },
    effects,
  };
}

export interface BoonEffectWitness {
  scenario: BoonScenario;
  /** Relative best outcome, including when every run lost. */
  best?: BoonId;
  /** Effects this comparison must show, counted by distinct build/map pair. */
  changed: readonly BoonId[];
}

/** A compact set of real scenarios that proves both effectiveness targets. */
export const BOON_EFFECT_WITNESSES: readonly BoonEffectWitness[] = [
  {
    scenario: { build: 'burnBuild', map: 'meadow', difficulty: 'hard', wave: 5,
      picks: defaultBoonPicks() },
    best: 'warChest', changed: ['warChest', 'longBarrels', 'keenArrows'],
  },
  {
    scenario: { build: 'artilleryBuild', map: 'switchback', difficulty: 'hard', wave: 5,
      picks: defaultBoonPicks() },
    best: 'keenArrows', changed: ['keenArrows', 'longBarrels', 'warChest'],
  },
  {
    scenario: { build: 'artilleryBuild', map: 'riverbend', difficulty: 'normal', wave: 5,
      picks: ['longBarrels', 'stickyTar', 'biggerBlasts'] },
    best: 'longBarrels', changed: ['longBarrels', 'warChest', 'keenArrows'],
  },
  {
    scenario: { build: 'artilleryBuild', map: 'riverbend', difficulty: 'normal', wave: 15,
      picks: defaultBoonPicks() },
    best: 'biggerBlasts', changed: ['biggerBlasts', 'stoneWalls'],
  },
  {
    scenario: { build: 'burnBuild', map: 'meadow', difficulty: 'normal', wave: 15,
      picks: ['longBarrels', 'hotCoals', 'stoneWalls'] },
    best: 'veteranCrews', changed: ['veteranCrews', 'stoneWalls'],
  },
  {
    scenario: { build: 'artilleryBuild', map: 'meadow', difficulty: 'normal', wave: 15,
      picks: defaultBoonPicks() },
    best: 'stoneWalls', changed: ['stoneWalls'],
  },
  {
    scenario: { build: 'artilleryBuild', map: 'meadow', difficulty: 'hard', wave: 10,
      picks: ['longBarrels', 'stickyTar', 'veteranCrews'] },
    best: 'quickHands', changed: ['quickHands'],
  },
  {
    scenario: { build: 'burnBuild', map: 'meadow', difficulty: 'normal', wave: 10,
      picks: ['longBarrels', 'stickyTar', 'veteranCrews'] },
    best: 'hotCoals', changed: ['hotCoals'],
  },
  {
    scenario: { build: 'burnBuild', map: 'switchback', difficulty: 'normal', wave: 10,
      picks: ['warChest', 'stickyTar', 'stoneWalls'] },
    best: 'stickyTar', changed: ['stickyTar'],
  },
  {
    scenario: { build: 'burnBuild', map: 'riverbend', difficulty: 'hard', wave: 10,
      picks: ['warChest', 'stickyTar', 'stoneWalls'] },
    changed: ['quickHands', 'stickyTar', 'hotCoals'],
  },
  {
    scenario: { build: 'comboBuild', map: 'riverbend', difficulty: 'normal', wave: 10,
      picks: ['warChest', 'stickyTar', 'stoneWalls'] },
    changed: ['stickyTar', 'hotCoals', 'quickHands'],
  },
  {
    scenario: { build: 'artilleryBuild', map: 'meadow', difficulty: 'hard', wave: 15,
      picks: ['longBarrels', 'quickHands', 'stoneWalls'] },
    changed: ['veteranCrews', 'biggerBlasts'],
  },
  {
    scenario: { build: 'artilleryBuild', map: 'switchback', difficulty: 'hard', wave: 15,
      picks: ['warChest', 'stickyTar', 'stoneWalls'] },
    changed: ['veteranCrews', 'biggerBlasts'],
  },
];

/** One shared measurement pass for both effectiveness targets. */
export function compareBoonEffects(scenarios: readonly BoonScenario[] = BOON_EFFECT_WITNESSES.map(({ scenario }) => scenario)) {
  const measure = createBoonScenarioMeasurer();
  const measurements = scenarios.map(measure);
  return { ...evaluateBoonEffects(measurements), measurements };
}
