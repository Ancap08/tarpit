// The private Act Three gate uses the same level, bots and scoring as play.
import { buildTower, useSpecial } from './actions';
import { botBeginner, botGood, botGoodFeat, botPerson, botPersonFeat, runBot, type BotPolicy } from './bots';
import { levelStars } from './campaignProgress';
import { checkLevel } from './checkLevel';
import { canTarget, enemyPosition } from './combat';
import { createGame, startWave, tick } from './game';
import { repairGate } from './gate';
import { cellCenter, isBuildableTerrain } from './grid';
import { KEEP_LEVELS, type KeepLevel } from './keepLevels';
import { TWO_STAR_LIVES, type LevelDef } from './levelTypes';
import { LEVELS } from './levels';
import { projectOntoTrail, resolveMap } from './map';
import { distanceOnRoad, roadIds } from './roads';
import { TICKS_PER_SECOND } from './time';
import { TOWER_DEFS } from './towers';
import type { GameState, MapDef, Point } from './types';

type Road = 'east' | 'west';
type Label = 'W1' | 'W2' | 'W3' | 'W4' | 'W5' | 'W6' | 'W7' | 'W9' | 'W10' | 'W11' | 'W12' | 'W13' | 'W14';
const RUN_LIMIT = 18 * 60 * TICKS_PER_SECOND;

function score(level: LevelDef, policy: BotPolicy, adjust?: (state: GameState) => void) {
  const state = createGame({ level });
  adjust?.(state);
  const run = runBot(state, policy, Infinity, RUN_LIMIT);
  return {
    stars: levelStars(state), lives: Math.max(0, state.lives), won: state.phase === 'won',
    lowestHp: Math.ceil(run.siege?.lowestHp ?? 0), gateFell: state.gate?.fallen ?? true,
    repairs: run.log.filter(step => step.action === 'repairGate' && step.result.ok).length,
    windows: run.log.flatMap(step => step.action === 'shakeWindow' && step.result.ok ? [step.result.hits] : []),
    paid: run.log.some(step => step.action === 'payQuartering' && step.result.ok),
    livesLostWithGate: run.siege?.livesLostWithGate ?? 0,
    terminal: run.refused === 0 && (state.phase === 'won' || state.phase === 'lost'),
  };
}

type Score = ReturnType<typeof score>;
const result = (s: Score) => `${s.stars}/${s.lives}, gate ${s.lowestHp}, repairs ${s.repairs}, windows ${s.windows.join('+') || '0'}${s.paid ? ', paid Redcoat' : ''}`;
const falls = (s: Score) => s.terminal && s.gateFell;
const wins = (s: Score) => s.terminal && s.won;
const worse = (control: Score, full: Score, lives = 1) =>
  control.terminal && full.terminal && (control.stars < full.stars || full.lives - control.lives >= lives);

function singleRoadControl(level: LevelDef, defended: Road): Score {
  const map = resolveMap('keep');
  const branch = map.otherRoads![0];
  const east = { ...map, path: map.path.slice(0, branch.joinIndex + 1) };
  const west = { ...map, path: [...branch.approach, map.path[branch.joinIndex]] };
  function approach(point: Point): Road {
    const gap = (road: MapDef) => {
      const nearest = projectOntoTrail(road, point);
      return Math.hypot(point.x - nearest.x, point.y - nearest.y);
    };
    return gap(east) <= gap(west) ? 'east' : 'west';
  }
  return score(level, {
    ...botGood,
    special(state, lastZone) {
      const cast = botGood.special(state, lastZone);
      return cast && approach(cast) === defended ? cast : undefined;
    },
    window: defended === 'west' ? botGood.window : undefined,
  }, state => {
    state.map = { ...state.map, buildSites: state.map.buildSites!.filter(cell => approach(cellCenter(cell)) === defended) };
  });
}

/** Run the actual finale's Ram group alone against the same wall battery. */
export function ramTrial(level: LevelDef, reply: boolean) {
  const ramGroup = level.waves.at(-1)?.groups.find(group => group.type === 'ram');
  if (!ramGroup) return { fell: false, feathered: false, ended: false, hp: 0 };
  const state = createGame({ level: { ...level, waves: [{ groups: [ramGroup] }] } });
  const gate = state.gate!;
  buildTower(state, { col: 22, row: 10 }, 'firepot');
  startWave(state);
  let feathered = false;
  while (state.phase === 'wave' && state.tick < RUN_LIMIT) {
    const ram = state.enemies.find(enemy => enemy.type === 'ram');
    if (reply && !feathered && ram && ram.distance >= distanceOnRoad(state.map, ram.road, gate)! - 10) {
      const cast = useSpecial(state, 'tarBarrel', enemyPosition(ram, state.map));
      if (cast.ok) feathered = ram.feathered === true;
    }
    tick(state);
  }
  return { fell: gate.fallen, feathered, ended: state.phase === 'won', hp: Math.ceil(gate.hp) };
}

export function repairedFeatForfeited(level: LevelDef): boolean {
  const state = createGame({ level });
  state.gate!.hp--;
  state.phase = 'won';
  state.lives = TWO_STAR_LIVES;
  if (levelStars(state) !== 3) return false;
  state.phase = 'setup';
  if (!repairGate(state).ok) return false;
  state.phase = 'won';
  return levelStars(state) === 2;
}

const introductions = [
  [21, 'east', 'dusk', false, undefined, 'unbroken'],
  [22, 'west', 'dusk', true, undefined, 'noRepairs'],
  [23, 'both', 'night storm', true, 'royalSurvey', 'unbroken'],
  [24, 'both', 'night storm', true, 'quartering', 'noRepairs'],
  [25, 'both', 'dawn', true, undefined, 'unbroken'],
] as const;

export function introductionMatches(level: LevelDef, index: number): boolean {
  const expected = introductions[index];
  if (!expected) return false;
  const [id, roads, sky, windows, tax, feat] = expected;
  if (level.id !== id || level.map !== 'keep' || level.keepRoads !== roads || level.keepSky !== sky ||
      !level.gate || !level.featherBarrels || !!level.windows?.length !== windows ||
      level.wallSiteTax?.kind !== tax || level.feat?.kind !== feat || Object.keys(level.taxes ?? {}).length) return false;
  const priorKit = LEVELS.at(-1)!;
  if (level.maxTowerLevel !== priorKit.maxTowerLevel ||
      level.allowedTowers.join() !== priorKit.allowedTowers.join() ||
      level.allowedSpecials.join() !== priorKit.allowedSpecials.join()) return false;
  const active = roadIds(resolveMap(level.map, level.keepRoads));
  const groups = level.waves.flatMap(wave => wave.groups);
  if (groups.some(group => !group.road || !active.includes(group.road)) ||
      active.some(road => !groups.some(group => group.road === road))) return false;
  const final = level.waves.at(-1)?.groups ?? [];
  const rams = groups.filter(group => group.type === 'ram');
  const kings = groups.filter(group => group.type === 'grumblemaw');
  if (id !== 25) return rams.length === 0 && kings.length === 0 && !level.endingBoss;
  const [ram] = rams, [king] = kings;
  return rams.length === 1 && ram.count === 1 && kings.length === 1 && king.count === 1 &&
    final.includes(ram) && final.includes(king) && ram.delay < king.delay && level.endingBoss === 'grumblemaw';
}

export function checkKeep(previousPersonMean: number, levels: readonly KeepLevel[] = KEEP_LEVELS) {
  const targets: { label: Label; ok: boolean; detail: string }[] = [];
  const add = (label: Label, ok: boolean, detail: string) => targets.push({ label, ok, detail });
  const rows = levels.map(level => {
    const good = score(level, botGood);
    const person = score(level, botPerson);
    const beginner = score(level, botBeginner);
    const featGood = score(level, botGoodFeat);
    const featPerson = score(level, botPersonFeat);
    const half = score({ ...level, gate: { ...level.gate, maxHp: Math.floor(level.gate.maxHp / 2) } }, botGood);
    const noRepair = score(level, { ...botGood, repair: undefined });
    return { level, good, person, beginner, featGood, featPerson, half, noRepair };
  });
  const each = (label: Label, trials: { id: number; ok: boolean; text: string }[]) =>
    add(label, trials.every(t => t.ok), trials.map(t => `${t.ok ? 'ok' : 'MISS'} ${t.id}: ${t.text}`).join(' | '));

  each('W1', rows.map(({ level, good, half }) => ({ id: level.id, ok: worse(half, good, 2), text: `${result(good)} vs half ${result(half)}` })));
  const repairWins = rows.filter(({ noRepair, good }) => worse(noRepair, good));
  const fallbackPrice = Math.min(...Object.values(TOWER_DEFS).map(tower => tower.cost));
  const costly = rows.every(({ level, person, half }) =>
    level.gate.repairCost >= fallbackPrice && (falls(person) || falls(half)));
  add('W2', repairWins.length >= 3 && costly,
    `${repairWins.length}/5 benefited (${repairWins.map(row => row.level.id).join(', ')}); full steps cost at least a tower and breaches possible: ${costly}; ` +
    rows.map(({ level, noRepair }) => `${level.id} without repair ${result(noRepair)}`).join(' | '));

  const rescue = rows.filter(({ person }) => wins(person) && falls(person));
  add('W3', rows.every(({ good }) => wins(good) && !falls(good)) && rescue.length >= 2,
    `Good held on ${rows.filter(({ good }) => wins(good) && !falls(good)).map(({ level }) => level.id).join(', ')}; Person won after breaches on ${rescue.map(({ level }) => level.id).join(', ')}`);
  each('W4', rows.filter(({ level }) => level.waves.some(wave => wave.groups.some(group => group.type === 'harpy')))
    .map(({ level }) => {
      const noAir = score({ ...level, allowedTowers: level.allowedTowers.filter(type => !canTarget(type, { type: 'harpy' })) }, botGood);
      return { id: level.id, ok: noAir.terminal && noAir.livesLostWithGate > 0, text: `${noAir.livesLostWithGate} lives lost with gate standing` };
    }));
  const unbroken = rows.filter(({ level }) => level.feat.kind === 'unbroken');
  add('W5', unbroken.every(({ featGood }) => featGood.stars === 3) && unbroken.filter(({ featPerson }) => featPerson.stars === 3).length <= 2,
    unbroken.map(({ level, featGood, featPerson }) => `${level.id} Good ${result(featGood)}; Person ${result(featPerson)}`).join(' | '));
  each('W6', rows.filter(({ level }) => level.keepRoads === 'both').map(({ level }) => {
    const east = singleRoadControl(level, 'east');
    const west = singleRoadControl(level, 'west');
    return { id: level.id, ok: falls(east) && falls(west), text: `east only ${result(east)}; west only ${result(west)}` };
  }));
  const personMean = rows.reduce((sum, { person }) => sum + person.lives, 0) / rows.length;
  add('W7', previousPersonMean - personMean >= 1.5 && rows.every(({ person }) => person.terminal),
    `Person mean ${previousPersonMean.toFixed(2)} to ${personMean.toFixed(2)} lives`);

  const oldRules = rows.map(({ level }) => {
    const review = checkLevel(level, { band: level.endingBoss ? 'finale' : 'late', introduces: null });
    const singles = review.singleTowerTrials?.filter(({ good }) => good.stars >= 2)
      .map(({ tower, good }) => `${tower} ${good.stars}/${good.lives}`);
    const info = [review.failed.join(', '), review.scheduleIssue && JSON.stringify(review.scheduleIssue), singles?.join(', ')].filter(Boolean).join(' / ');
    return { id: level.id, ok: review.ok, text: info || 'existing level rules pass', review };
  });
  each('W9', oldRules);
  const beds = rows[1];
  const noWindows = score(beds.level, { ...botGood, window: undefined });
  add('W10', wins(noWindows) && beds.good.windows.some(hits => hits > 0) && worse(noWindows, beds.good, 2),
    `${result(beds.good)} vs unused ${result(noWindows)}`);
  const ignored = ramTrial(rows[4].level, false);
  const feathered = ramTrial(rows[4].level, true);
  add('W11', ignored.ended && ignored.fell && feathered.ended && feathered.feathered && !feathered.fell,
    `Ram alone at the finale gate: ignored ${ignored.hp} HP; tarred and feathered ${feathered.hp} HP (feather applied: ${feathered.feathered})`);
  each('W12', rows.filter(({ level }) => level.wallSiteTax).map(({ level, good }) => {
    const noTax = score({ ...level, wallSiteTax: undefined }, botGood);
    return { id: level.id, ok: good.stars >= 2 && worse(good, noTax), text: `with ${result(good)}; without ${result(noTax)}` };
  }));
  const noNails = rows.filter(({ level }) => level.feat.kind === 'noRepairs');
  const forfeits = noNails.every(({ level }) => repairedFeatForfeited(level));
  add('W13', noNails.every(({ featGood }) => featGood.stars === 3) && noNails.filter(({ featPerson }) => featPerson.stars === 3).length <= 1 && forfeits,
    noNails.map(({ level, featGood, featPerson }) => `${level.id} Good ${result(featGood)}; Person ${result(featPerson)}`).join(' | ') + `; repair forfeits: ${forfeits}`);
  each('W14', rows.map(({ level }, index) => {
    const state = createGame({ level });
    const site = state.wallSiteTax?.site;
    const validSite = !site || isBuildableTerrain(site, state.map);
    return { id: level.id, ok: introductionMatches(level, index) && validSite, text: `${level.keepRoads}, ${level.keepSky}, windows ${level.windows?.length ?? 0}, ${level.wallSiteTax?.kind ?? 'no tax'}, ${level.feat.kind}` };
  }));
  return { ok: targets.every(target => target.ok), targets, rows };
}
