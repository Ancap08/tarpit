import { BOONS, boonOptions, type BoonId } from './boons';
import {
  artilleryBuild,
  burnBuild,
  comboBuild,
  comboBuildNoFire,
  lazyBuild,
  longbowSpam,
  referenceBuild,
  soundBuild,
  type BoonChoices,
  type RecordedOutcome,
  type ReferenceBuild,
} from './headless';
import type { MapId } from './map';

function reportReference(build: ReferenceBuild) {
  return (difficulty: BoonScenario['difficulty'], map: MapId, picks: BoonChoices,
    report: (value: RecordedOutcome, refused: number) => void) => referenceBuild(build, difficulty, map, picks, undefined, report);
}

export const BOON_EFFECT_BUILDS = {
  comboBuild,
  hardBuild: reportReference('hardBuild'),
  comboBuildNoFire,
  longbowSpam,
  soundBuild,
  lazyBuild,
  artilleryBuild,
  burnBuild,
  musketBuild: reportReference('musketBuild'),
  wideBuild: reportReference('wideBuild'),
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

export type BoonOutcome = RecordedOutcome & { refused: number };

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
 * keep their real effects. The planners report the outcomes they record,
 * including any refused actions when adapting a script from another build.
 */
function runComparison(scenario: BoonScenario, picks: BoonChoices, neutral?: BoonId): BoonOutcome {
  const { build, difficulty, map } = scenario;
  const run = () => {
    let outcome: BoonOutcome | undefined;
    BOON_EFFECT_BUILDS[build](difficulty, map, picks, (recorded, refused) => { outcome = { ...recorded, refused }; });
    if (!outcome) throw new Error(`no recorded outcome for ${build}`);
    return outcome;
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
    scenario: { build: 'comboBuild', map: 'meadow', difficulty: 'normal', wave: 5, picks: defaultBoonPicks() },
    best: 'keenArrows', changed: ['longBarrels', 'keenArrows', 'warChest'],
  },
  {
    scenario: { build: 'comboBuild', map: 'meadow', difficulty: 'normal', wave: 10, picks: defaultBoonPicks() },
    best: 'stickyTar', changed: ['stickyTar', 'hotCoals', 'quickHands'],
  },
  {
    scenario: { build: 'comboBuild', map: 'meadow', difficulty: 'normal', wave: 15, picks: defaultBoonPicks() },
    best: 'stoneWalls', changed: ['stoneWalls', 'veteranCrews', 'biggerBlasts'],
  },
  {
    scenario: { build: 'comboBuild', map: 'switchback', difficulty: 'normal', wave: 15, picks: defaultBoonPicks() },
    best: 'biggerBlasts', changed: ['stoneWalls', 'veteranCrews', 'biggerBlasts'],
  },
  {
    scenario: { build: 'comboBuild', map: 'riverbend', difficulty: 'normal', wave: 10, picks: defaultBoonPicks() },
    best: 'quickHands', changed: ['stickyTar', 'hotCoals', 'quickHands'],
  },
  {
    scenario: { build: 'hardBuild', map: 'meadow', difficulty: 'normal', wave: 15, picks: defaultBoonPicks() },
    best: 'veteranCrews', changed: ['stoneWalls', 'veteranCrews', 'biggerBlasts'],
  },
  {
    scenario: { build: 'wideBuild', map: 'meadow', difficulty: 'normal', wave: 10, picks: defaultBoonPicks() },
    best: 'hotCoals', changed: ['stickyTar', 'hotCoals', 'quickHands'],
  },
  {
    scenario: { build: 'comboBuildNoFire', map: 'meadow', difficulty: 'normal', wave: 5, picks: defaultBoonPicks() },
    best: 'longBarrels', changed: ['longBarrels', 'keenArrows', 'warChest'],
  },
  {
    scenario: { build: 'musketBuild', map: 'meadow', difficulty: 'normal', wave: 5, picks: defaultBoonPicks() },
    best: 'warChest', changed: ['longBarrels', 'keenArrows', 'warChest'],
  },
];

/** One shared measurement pass for both effectiveness targets. */
export function compareBoonEffects(scenarios: readonly BoonScenario[] = BOON_EFFECT_WITNESSES.map(({ scenario }) => scenario)) {
  const measure = createBoonScenarioMeasurer();
  const measurements = scenarios.map(measure);
  return { ...evaluateBoonEffects(measurements), measurements };
}
