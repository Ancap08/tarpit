import { cellKey } from './grid';
import { compareTowerPaths, compareTowerPlan, type ChoiceBuild, type RecordedOutcome, type WaveScript } from './headless';
import { MAP_IDS, type MapId } from './map';
import { TOWER_DEFS, TOWER_PATHS } from './towers';
import type { TowerType, UpgradePath } from './types';
import { ACT_ONE_LAST_WAVE } from './waves';

type Choice = UpgradePath | 'copy';
const SPECIALIST: Readonly<Record<TowerType, ChoiceBuild>> = {
  musketeer: 'musketBuild',
  cannon: 'artilleryBuild',
  tarpit: 'burnBuild',
  longbow: 'hardBuild',
  mortar: 'artilleryBuild',
  firepot: 'burnBuild',
};
const TYPES = Object.keys(SPECIALIST) as TowerType[];
const COPY_SUPPORT: Partial<Record<TowerType, Partial<Record<MapId, number>>>> = {
  musketeer: { riverbend: 6 },
  firepot: { meadow: 8 },
  tarpit: { meadow: 7 },
  mortar: { meadow: 1 },
};

export interface PathScenario {
  tower: TowerType;
  build: ChoiceBuild;
  map: MapId;
  /** Identical level-two reinforcements paid for after the focal purchases in P4. */
  support?: number;
}

export const PATH_SCENARIOS: readonly PathScenario[] = TYPES.flatMap((tower) =>
  MAP_IDS.flatMap((map) =>
    (['comboBuild', SPECIALIST[tower]] as const).map((build) => ({
      tower, build, map,
      // Shared reinforcements extend these fixed plans into the late act-two fights.
      support: build === 'comboBuild' ? COPY_SUPPORT[tower]?.[map] : undefined,
    })),
  ),
);

function play({ build, map, tower, support }: PathScenario, choice: Choice, adaptive = false) {
  let outcome: RecordedOutcome | undefined;
  const report = (value: RecordedOutcome) => { outcome = value; };
  const script = adaptive && choice !== 'copy' ? compareTowerPaths(build, map, tower, choice, report)
    : compareTowerPlan(build, map, tower, choice, report, support);
  if (!outcome) throw new Error(`No outcome for ${build}/${map}/${tower}/${choice}`);
  return { outcome, script };
}

function focalCells(script: WaveScript, tower: TowerType): Set<number> {
  return new Set(script.flatMap((wave) => wave.flatMap((action) =>
    action.type === 'build' && action.tower === tower ? [cellKey(action.cell)] : [],
  )));
}

function summarizePurchases(script: WaveScript, cells: Set<number>, tower: TowerType, choice: Choice) {
  const copies = new Map<number, number>();
  const purchased = new Set<number>();
  const common = [];
  let gold = 0;
  for (const [wave, actions] of script.entries()) {
    for (const action of actions) {
      const cell = cellKey(action.cell);
      if (choice === 'copy' && action.type === 'build' && action.tower === tower && !cells.has(cell)) {
        if (wave >= ACT_ONE_LAST_WAVE) {
          copies.set(cell, wave);
          gold += TOWER_DEFS[tower].cost;
          continue;
        }
      }
      if (wave >= ACT_ONE_LAST_WAVE && action.type === 'upgrade') {
        if (choice === 'copy' && !action.path && copies.get(cell) === wave) {
          purchased.add(cell);
          gold += TOWER_DEFS[tower].upgradeCost;
          continue;
        }
        if (choice !== 'copy' && action.path === choice && cells.has(cell)) {
          purchased.add(cell);
          gold += TOWER_PATHS[tower].cost;
          continue;
        }
      }
      common.push(action);
    }
  }
  return {
    gold,
    count: purchased.size,
    complete: purchased.size > 0 && purchased.size === cells.size && (choice !== 'copy' || copies.size === purchased.size),
    common: JSON.stringify(common),
  };
}

/** Normal campaign, default rewards and specials. Common purchases and actual choice spending must match. */
export function measurePathScenario(scenario: PathScenario) {
  const { tower } = scenario;
  const a = play(scenario, 'A', true);
  const b = play(scenario, 'B', true);
  const matchedA = play(scenario, 'A');
  const matchedB = play(scenario, 'B');
  const copy = play(scenario, 'copy');
  const cells = focalCells(matchedA.script, tower);
  const aBudget = summarizePurchases(matchedA.script, cells, tower, 'A');
  const bBudget = summarizePurchases(matchedB.script, cells, tower, 'B');
  const copyBudget = summarizePurchases(copy.script, cells, tower, 'copy');
  const finished = ({ outcome }: typeof a) => outcome.phase === 'won' || outcome.phase === 'lost';
  const equal = (other: typeof aBudget) =>
    other.complete && other.gold === aBudget.gold && other.count === aBudget.count && other.common === aBudget.common;
  const samePaths = aBudget.complete && equal(bBudget);
  const sameCopy = samePaths && equal(copyBudget);
  const lives = ({ outcome }: typeof a) => Math.max(0, outcome.lives);
  const purchasedPaths = ({ script }: typeof a) => {
    const focal = focalCells(script, tower);
    return script.flatMap((wave) => wave.flatMap((action) =>
      action.type === 'upgrade' && action.path && focal.has(cellKey(action.cell)) ? [action.path] : [],
    ));
  };
  const aPaths = purchasedPaths(a);
  const bPaths = purchasedPaths(b);
  const pathValid = [a, b].every(finished) && aPaths.length > 0 && bPaths.length > 0
    && aPaths.every((path) => path === 'A') && bPaths.every((path) => path === 'B');
  const copyValid = [matchedA, matchedB, copy].every(finished) && sameCopy;
  return {
    ...scenario,
    pathValid,
    copyValid,
    branches: [aPaths.length, bPaths.length],
    count: aBudget.count,
    gold: aBudget.gold,
    budgets: [aBudget.gold, bBudget.gold, copyBudget.gold],
    a: a.outcome,
    b: b.outcome,
    matchedA: matchedA.outcome,
    matchedB: matchedB.outcome,
    copy: copy.outcome,
    aMinusB: lives(a) - lives(b),
    aMinusCopy: lives(matchedA) - lives(copy),
    bMinusCopy: lives(matchedB) - lives(copy),
  };
}

export type PathRow = ReturnType<typeof measurePathScenario>;

export function summarizePathBalance(rows: readonly PathRow[]) {
  return TYPES.map((tower) => {
    const cases = rows.filter((row) => row.tower === tower);
    const ab = cases.map((row) => row.aMinusB);
    const ac = cases.map((row) => row.aMinusCopy);
    const bc = cases.map((row) => row.bMinusCopy);
    const pathsValid = cases.length > 0 && cases.every((row) => row.pathValid);
    const p1 = pathsValid && ab.some(gap => gap !== 0) && ab.some(gap => gap >= 0) && ab.some(gap => gap <= 0);
    const largestGap = Math.max(0, ...ab.map(Math.abs));
    const p2 = pathsValid && largestGap <= 9;
    const p4 = {
      aWin: cases.some((row) => row.copyValid && row.aMinusCopy >= 1),
      aCopy: cases.some((row) => row.copyValid && row.aMinusCopy <= 0),
      bWin: cases.some((row) => row.copyValid && row.bMinusCopy >= 1),
      bCopy: cases.some((row) => row.copyValid && row.bMinusCopy <= 0),
    };
    return { tower, ab, ac, bc, largestGap, p1, p2, p4 };
  });
}
