import { boonOptions, type BoonId } from './boons';
import { cellKey } from './grid';
import { compareTowerPlan, type BoonChoices, type ChoiceBuild, type RecordedOutcome, type WaveScript } from './headless';
import type { MapId } from './map';
import { TOWER_DEFS, TOWER_PATHS } from './towers';
import type { TargetingMode, TowerType, UpgradePath } from './types';
import { ACT_ONE_LAST_WAVE } from './waves';

type Choice = UpgradePath | 'copy';

export interface PathScenario {
  build: ChoiceBuild;
  map: MapId;
  difficulty: 'normal' | 'hard';
  tower: TowerType;
  /** Set the focal towers to this mode and specialize them before other act-two buys. */
  targeting?: TargetingMode;
  useSpecials?: false;
  rewards?: readonly [BoonId, BoonId, BoonId];
}

export interface PathWitness extends PathScenario {
  winner: Choice;
  other: Choice;
  /** Only for a copy comparison where neither option has a strict edge. */
  tie?: true;
}

const defaultRewards = [boonOptions(5)[0], boonOptions(10)[0], boonOptions(15)[0]] as const;

function play(scenario: PathScenario, choice: Choice) {
  const { build, map, difficulty, tower, rewards = defaultRewards } = scenario;
  const boons: BoonChoices = { 5: rewards[0], 10: rewards[1], 15: rewards[2] };
  let outcome: RecordedOutcome | undefined;
  const script = compareTowerPlan(build, map, difficulty, tower, choice, (value) => { outcome = value; }, boons, scenario.targeting, scenario.useSpecials);
  if (!outcome) throw new Error(`No outcome for ${build}/${map}/${difficulty}/${tower}/${choice}`);
  return { outcome, script };
}

function buildCells(script: WaveScript, tower: TowerType): Set<number> {
  return new Set(script.flatMap((actions) =>
    actions.flatMap((action) => action.type === 'build' && action.tower === tower ? [cellKey(action.cell)] : []),
  ));
}

function purchases(script: WaveScript, ownCells: Set<number>, choice: Choice, peer: Set<number>): number {
  const eligible = new Set(ownCells);
  // A copy is an extra tower with its level-two upgrade completed in act two.
  for (const key of choice === 'copy' ? peer : []) eligible.delete(key);
  const path = choice === 'copy' ? undefined : choice;
  return new Set(script.slice(ACT_ONE_LAST_WAVE).flatMap((actions) => actions.flatMap((action) =>
    action.type === 'upgrade' && action.path === path && eligible.has(cellKey(action.cell)) ? [cellKey(action.cell)] : [],
  ))).size;
}

/** Compare the agreed campaign scores. Purchased paths use the same price as each other and as one level-2 copy. */
export function measurePathWitness(witness: PathWitness) {
  const a = play(witness, witness.winner);
  const b = play(witness, witness.other);
  const { tower } = witness;
  const aCells = buildCells(a.script, tower);
  const bCells = buildCells(b.script, tower);
  const winnerCount = purchases(a.script, aCells, witness.winner, bCells);
  const otherCount = purchases(b.script, bCells, witness.other, aCells);
  const winnerBuilt = aCells.size;
  const otherBuilt = bCells.size;
  const allBranched = (witness.winner === 'copy' || winnerCount === winnerBuilt)
    && (witness.other === 'copy' || otherCount === otherBuilt);
  const winner = a.outcome;
  const other = b.outcome;
  const completed = (outcome: RecordedOutcome) => outcome.phase === 'won' || outcome.phase === 'lost';
  const valid = completed(winner) && completed(other) && allBranched && winnerCount > 0 && winnerCount === otherCount
    && (witness.winner !== 'copy' && witness.other !== 'copy'
      || TOWER_PATHS[tower].cost === TOWER_DEFS[tower].cost + TOWER_DEFS[tower].upgradeCost);
  const delta = winner.lives - other.lives || winner.kills - other.kills;
  return { valid, delta, winner, other, winnerCount, otherCount, winnerBuilt, otherBuilt };
}

/** Same-budget evidence for every tower. Exact ties are counted as neither a win nor a loss. */
export const COPY_WITNESSES: readonly PathWitness[] = [
  { tower: 'musketeer', build: 'musketBuild', map: 'meadow', difficulty: 'normal', winner: 'A', other: 'copy', tie: true },
  { tower: 'cannon', build: 'artilleryBuild', map: 'meadow', difficulty: 'hard', winner: 'A', other: 'copy', tie: true },
  { tower: 'cannon', build: 'artilleryBuild', map: 'riverbend', difficulty: 'normal', winner: 'B', other: 'copy',
    rewards: ['warChest', 'hotCoals', 'biggerBlasts'] },
  { tower: 'tarpit', build: 'burnBuild', map: 'riverbend', difficulty: 'normal', winner: 'A', other: 'copy', tie: true },
  { tower: 'longbow', build: 'artilleryBuild', map: 'meadow', difficulty: 'normal', winner: 'A', other: 'copy', tie: true },
  { tower: 'mortar', build: 'artilleryBuild', map: 'riverbend', difficulty: 'hard', winner: 'A', other: 'copy',
    rewards: ['warChest', 'hotCoals', 'biggerBlasts'], tie: true },
  { tower: 'firepot', build: 'burnBuild', map: 'meadow', difficulty: 'normal', winner: 'A', other: 'copy', tie: true },
  { tower: 'musketeer', build: 'musketBuild', map: 'riverbend', difficulty: 'hard', winner: 'copy', other: 'A',
    rewards: ['warChest', 'stickyTar', 'veteranCrews'] },
  { tower: 'tarpit', build: 'burnBuild', map: 'riverbend', difficulty: 'normal', winner: 'copy', other: 'B' },
  { tower: 'mortar', build: 'burnBuild', map: 'meadow', difficulty: 'normal', winner: 'B', other: 'copy', useSpecials: false },
  { tower: 'mortar', build: 'burnBuild', map: 'meadow', difficulty: 'normal', winner: 'copy', other: 'A', useSpecials: false },
  { tower: 'firepot', build: 'burnBuild', map: 'meadow', difficulty: 'hard', winner: 'A', other: 'copy',
    rewards: ['longBarrels', 'hotCoals', 'stoneWalls'] },
];

/** Frozen scenarios with an actual act-two purchase and a strict campaign result. */
export const PATH_WITNESSES: readonly PathWitness[] = [
  { tower: 'musketeer', build: 'comboBuild', map: 'meadow', difficulty: 'normal', winner: 'A', other: 'B',
    rewards: ['warChest', 'quickHands', 'stoneWalls'], targeting: 'last' },
  { tower: 'musketeer', build: 'musketBuild', map: 'riverbend', difficulty: 'hard', winner: 'B', other: 'A',
    rewards: ['warChest', 'stickyTar', 'veteranCrews'] },
  { tower: 'cannon', build: 'comboBuild', map: 'riverbend', difficulty: 'normal', winner: 'A', other: 'B',
    rewards: ['keenArrows', 'stickyTar', 'stoneWalls'], targeting: 'last' },
  { tower: 'cannon', build: 'artilleryBuild', map: 'meadow', difficulty: 'hard', winner: 'B', other: 'A',
    rewards: ['keenArrows', 'stickyTar', 'veteranCrews'], targeting: 'strongest' },
  { tower: 'tarpit', build: 'burnBuild', map: 'riverbend', difficulty: 'normal', winner: 'A', other: 'B' },
  { tower: 'tarpit', build: 'burnBuild', map: 'switchback', difficulty: 'hard', winner: 'B', other: 'A',
    rewards: ['warChest', 'quickHands', 'stoneWalls'], targeting: 'last' },
  { tower: 'longbow', build: 'artilleryBuild', map: 'switchback', difficulty: 'normal', winner: 'A', other: 'B',
    rewards: ['keenArrows', 'stickyTar', 'veteranCrews'], targeting: 'strongest' },
  { tower: 'longbow', build: 'artilleryBuild', map: 'switchback', difficulty: 'hard', winner: 'B', other: 'A',
    rewards: ['keenArrows', 'stickyTar', 'veteranCrews'], targeting: 'strongest' },
  { tower: 'mortar', build: 'artilleryBuild', map: 'meadow', difficulty: 'hard', winner: 'A', other: 'B' },
  { tower: 'mortar', build: 'burnBuild', map: 'meadow', difficulty: 'normal', winner: 'B', other: 'A', useSpecials: false },
  { tower: 'firepot', build: 'burnBuild', map: 'meadow', difficulty: 'hard', winner: 'A', other: 'B',
    rewards: ['longBarrels', 'hotCoals', 'stoneWalls'] },
  { tower: 'firepot', build: 'burnBuild', map: 'switchback', difficulty: 'hard', winner: 'B', other: 'A',
    targeting: 'last', useSpecials: false },
];
