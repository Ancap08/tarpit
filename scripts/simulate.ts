// Deterministic campaign and endless balance report. Vite loads the
// TypeScript simulation in one module graph so the tables share run caches.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import type * as Sweeps from '../src/sim/barricadeSweep';
import type * as GuardSweeps from '../src/sim/guardSweep';
import type * as Bots from '../src/sim/bots';
import type * as Game from '../src/sim/game';
import type * as Levels from '../src/sim/levels';
import type * as Contexts from '../src/sim/campaignContexts';
import type * as Gate from '../src/sim/checkLevel';
import type * as Balance from '../src/sim/balanceRuns';
import type * as Targets from '../src/sim/balanceTargets';
import type * as Maps from '../src/sim/map';
import type * as Boons from '../src/sim/boonBalance';
import type * as Specials from '../src/sim/specials';
import type * as Paths from '../src/sim/pathBalance';
import type * as Encounters from '../src/sim/pathEncounter';

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, ws: false },
});

try {
  // M39 K1: the pre-Barricade report from main, excluding npm's launcher banner.
  const expected = 'ba27661ca58b79742b7311e37c3a721bab1dd119afcc89257547c0c5ce1808c3';
  const report = createHash('sha256');
  function print(message: string): void {
    const line = message + '\n';
    report.update(line);
    process.stdout.write(line);
  }

  const balance = await server.ssrLoadModule('/src/sim/balanceRuns.ts') as typeof Balance;
  const targets = await server.ssrLoadModule('/src/sim/balanceTargets.ts') as typeof Targets;
  const { MAP_IDS } = await server.ssrLoadModule('/src/sim/map.ts') as typeof Maps;
  const levels = ['easy', 'normal', 'hard'] as const;
  const columns = MAP_IDS.flatMap((map) => levels.map((level) => ({ map, level })));
  const nameWidth = Math.max(...balance.MATRIX_ARCHETYPES.map((name) => name.length));

  print('Balance targets');
  for (const target of targets.TARGETS) {
    const result = target.check();
    print(`${result.ok ? 'ok  ' : 'MISS'}  ${target.id.padEnd(3)} ${(target.map ?? '').padEnd(10)} ${target.label}: ${result.info}`);
    if (!result.ok) process.exitCode = 1;
  }

  const referenceSpecials = ['keg', 'tarBarrel', 'fireArrows'] as const satisfies readonly Specials.SpecialType[];
  print('\nNormal comboBuild with one special omitted (information only)');
  print('map'.padEnd(10) + ['all', ...referenceSpecials.map(type => `without ${type}`)].map(label => label.padStart(18)).join('  '));
  for (const map of MAP_IDS) {
    const all = balance.balanceRun('comboBuild', map, 'normal');
    const singles = referenceSpecials.map(type => targets.comboWithoutSpecialRun(type, map));
    print(map.padEnd(10) + [all, ...singles].map(run => balance.matrixCell(run).padStart(18)).join('  '));
  }

  for (const map of MAP_IDS) {
    print(`\n${map}, Normal: boon matrix (lives, kills, gold)`);
    for (const { picks, run } of targets.boonBalanceRuns(map)) {
      print(`${picks.join(' / ')}  ${balance.matrixCell(run)}, ${run.kills} kills, ${run.gold} gold`);
    }
  }

  const paths = await server.ssrLoadModule('/src/sim/pathBalance.ts') as typeof Paths;
  const rows = paths.PATH_SCENARIOS.map(paths.measurePathScenario);
  print('\nNormal, default rewards and specials: adaptive A/B, then matched A/B/copy');
  for (const row of rows) {
    if (!row.pathValid || !row.copyValid) process.exitCode = 1;
    print(`${row.pathValid && row.copyValid ? '' : 'MISS  purchase control  '}${row.tower} ${row.build}/${row.map}: ${[row.a, row.b, row.matchedA, row.matchedB, row.copy].map(balance.matrixCell).join(' / ')}`);
  }
  for (const s of paths.summarizePathBalance(rows)) {
    const checks = [
      ['P1', s.p1, `A minus B: ${s.ab.join('/')}`],
      ['P2', s.p2, `largest A/B gap: ${s.largestGap}`],
      ['P4', (s.p4.aWin || s.p4.bWin) && (s.p4.aCopy || s.p4.bCopy), `A minus copy: ${s.ac.join('/')}, B minus copy: ${s.bc.join('/')}`],
    ] as const;
    for (const [id, passed, evidence] of checks) {
      print(`${passed ? 'ok' : 'MISS'}  ${id} ${s.tower}: ${evidence}`);
      if (!passed) process.exitCode = 1;
    }
  }

  const encounters = await server.ssrLoadModule('/src/sim/pathEncounter.ts') as typeof Encounters;
  for (const row of encounters.measurePathEncounters()) {
    print(`${row.ok ? 'ok' : 'MISS'}  P3 ${row.tower}: lone Troll ${row.loneMetric} ${row.lone.join('/')}, ten Goblins ${row.packMetric} ${row.pack.join('/')}`);
    if (!row.ok) process.exitCode = 1;
  }

  const boons = await server.ssrLoadModule('/src/sim/boonBalance.ts') as typeof Boons;
  const impact = boons.compareBoonEffects();
  for (const [label, result] of [['N10c', impact.c], ['N10d', impact.d]] as const) {
    print(`${result.ok ? 'ok' : 'MISS'}  ${label}  ${result.info}`);
    if (!result.ok) process.exitCode = 1;
  }
  for (const effect of impact.effects) {
    const best = impact.measurements.filter(({ scenario }) => effect.best.includes(scenario));
    const witness = best.find(({ outcomes }) => outcomes.some(({ boon, actual }) => boon === effect.boon && actual.phase === 'won')) ?? best[0];
    const pairs = effect.changed.map(({ build, map }) => `${build}/${map}`).join(', ');
    if (witness) {
      const { build, map, difficulty, picks } = witness.scenario;
      const scores = witness.outcomes.map(({ boon, actual }) => `${boon} ${actual.lives} lives/${actual.kills} kills`).join(', ');
      print(`${effect.boon}: strict best ${build}/${map}/${difficulty}, picks ${picks.join('/')}: ${scores}; changes ${pairs}`);
    } else {
      print(`${effect.boon}: no strict best; changes ${pairs}`);
    }
  }

  const fight = balance.balanceRun('comboBuild', 'meadow', 'normal').bossFight;
  print('\nMeadow Normal, Grumblemaw (wave-20 ticks)');
  print(fight.map(({ tick, event, hp }) => `${tick}: ${hp === undefined ? event : Math.round(hp) + ' HP'}`).join(' | '));

  print('\nEndless');
  print('archetype      map         level   result  wave  lives  gold');
  for (const name of ['endlessIdle', 'endlessGreedy'] as const) {
    for (const { map, level } of columns) {
      const run = balance.balanceRun(name, map, level);
      print(`${name.padEnd(13)}  ${map.padEnd(10)}  ${level.padEnd(6)}  ${run.phase.padEnd(6)}  ${String(run.wave).padStart(4)}  ${String(run.lives).padStart(5)}  ${String(run.gold).padStart(4)}`);
    }
  }

  for (const map of MAP_IDS) {
    const run = balance.balanceRun('comboBuild', map, 'normal');
    print(`\n${map}, Normal: comboBuild by wave`);
    print('wave  lives  lost  gold before combat  ending gold  ticks  peak');
    for (const wave of run.waves) {
      print([wave.wave, wave.lives, wave.livesLost, wave.goldAfterPurchases, wave.gold, wave.ticks, wave.peak].map((value, i) => String(value).padStart(i === 3 ? 6 : 4)).join('  '));
    }
  }

  print('\nNormal ending gold                  Meadow / Switchback / Riverbend');
  for (const name of ['comboBuild', 'wideBuild', 'hardBuild', 'artilleryBuild', 'burnBuild', 'musketBuild'] as const) {
    print(`${name.padEnd(nameWidth)}  ${MAP_IDS.map((map) => balance.balanceRun(name, map, 'normal').gold).join(' / ')}`);
  }

  print('\nMatrix');
  print(`${''.padEnd(nameWidth)}  ${MAP_IDS.map((map) => map.padEnd(levels.length * 7 - 1)).join(' ')}`);
  print(`${'archetype'.padEnd(nameWidth)}  ${columns.map((column) => column.level.padStart(6)).join(' ')}`);
  for (const name of balance.MATRIX_ARCHETYPES) {
    const cells = columns.map(({ map, level }) => {
      if (!balance.runsOn(name, map)) return '-'.padStart(6);
      const run = balance.balanceRun(name, map, level);
      if (run.refused > 0) {
        console.error(`${name} on ${map} ${level}: ${run.refused} refused actions`);
        process.exitCode = 1;
      }
      return balance.matrixCell(run).padStart(6);
    });
    print(`${name.padEnd(nameWidth)}  ${cells.join(' ')}`);
  }
  const actual = report.digest('hex');
  if (actual !== expected) {
    console.error(`Reference balance report changed: expected SHA-256 ${expected}, got ${actual}`);
    process.exitCode = 1;
  }

  // Report the placement sweep separately so stdout stays byte-identical to main.
  const { sweepBarricades } = await server.ssrLoadModule('/src/sim/barricadeSweep.ts') as typeof Sweeps;
  for (const map of MAP_IDS) {
    for (const level of ['normal', 'hard'] as const) {
      const { best, points, held, hardWinsFromLoss, ok } = sweepBarricades(map, level);
      console.error(`${ok ? 'ok' : 'MISS'}  K3 ${map}/${level}: best at ${best.distance} px, gain ${best.gain}, ${points} points, ${held} permanent holds, ${hardWinsFromLoss} Hard losses turned into wins`);
      if (!ok) process.exitCode = 1;
    }
  }

  const { sweepGuards, sweepGuardsOnly } = await server.ssrLoadModule('/src/sim/guardSweep.ts') as typeof GuardSweeps;
  console.log('\nGuards');
  let improvedMaps = 0;
  for (const map of MAP_IDS) {
    for (const level of ['normal', 'hard'] as const) {
      const { best, points, hardWinsFromLoss, ok } = sweepGuards(map, level);
      console.log(`${ok ? 'ok' : 'MISS'}  G2 ${map}/${level}: best at ${best.distance} px, gain ${best.gain}, ${points} points, ${hardWinsFromLoss} Hard losses turned into wins`);
      if (level === 'normal' && best.gain >= 1) improvedMaps++;
      if (!ok) process.exitCode = 1;
    }
    for (const level of levels) {
      const { campaign, unlock, ok } = sweepGuardsOnly(map, level);
      const loss = ({ latest, survived }: typeof unlock) => survived
        ? `${survived} placements did not lose by wave 8` : `loss by wave ${latest}`;
      console.log(`${ok ? 'ok' : 'MISS'}  G3 ${map}/${level}: wave 1 start ${loss(campaign)}, full-lives wave 6 start ${loss(unlock)}`);
      if (!ok) process.exitCode = 1;
    }
  }
  console.log(`${improvedMaps >= 2 ? 'ok' : 'MISS'}  G2 Normal improved by at least one life on ${improvedMaps} maps`);
  if (improvedMaps < 2) process.exitCode = 1;

  const { botGood, botPerson, botBeginner, runBot } = await server.ssrLoadModule('/src/sim/bots.ts') as typeof Bots;
  const { createGame, TICKS_PER_SECOND } = await server.ssrLoadModule('/src/sim/game.ts') as typeof Game;
  console.log('\nFree play bots (W lives left, L wave lost)');
  console.log('map         difficulty  botGood  comboBuild  botBeginner  lazyBuild');
  for (const { map, level: difficulty } of columns) {
    const [good, beginner] = [botGood, botBeginner].map(policy => runBot(createGame({ map, difficulty }), policy));
    if (good.refused || beginner.refused) process.exitCode = 1;
    const combo = balance.balanceRun('comboBuild', map, difficulty);
    if (difficulty === 'normal' && good.state.phase !== combo.phase) {
      console.error(`MISS  Normal ${map}: botGood ${good.state.phase}, comboBuild ${combo.phase}`);
      process.exitCode = 1;
    }
    const cells = [good.state, combo,
      beginner.state, balance.balanceRun('lazyBuild', map, difficulty)].map(balance.matrixCell);
    console.log([map.padEnd(10), difficulty.padEnd(10), ...cells.map(cell => cell.padStart(8))].join('  '));
  }

  console.log('\nNormal Free play: Person and comboBuild (lives left)');
  for (const map of MAP_IDS) {
    const person = runBot(createGame({ map, difficulty: 'normal' }), botPerson);
    const combo = balance.balanceRun('comboBuild', map, 'normal');
    console.log(`${map.padEnd(10)}  ${balance.matrixCell(person.state)}  ${balance.matrixCell(combo)}`);
    if (person.refused) process.exitCode = 1;
  }

  const { LEVELS } = await server.ssrLoadModule('/src/sim/levels.ts') as typeof Levels;
  const { checkCampaign } = await server.ssrLoadModule('/src/sim/checkLevel.ts') as typeof Gate;
  const { CAMPAIGN_CONTEXTS } = await server.ssrLoadModule('/src/sim/campaignContexts.ts') as typeof Contexts;
  const campaign = checkCampaign(LEVELS, CAMPAIGN_CONTEXTS);
  const minutes = (ticks: number) => (ticks / TICKS_PER_SECOND / 60).toFixed(2);
  const score = (run?: Gate.LevelScore) => run ? `${run.stars}/${run.lives}` : '—';
  console.log('\nCampaign gate (stars/lives)');
  console.log('id  waves  enemies  gold  HP scale  Good  Person  Beginner  Person(no specials)  wave 1  minutes  peak alive  gate');
  campaign.levels.forEach((row, index) => {
    const level = LEVELS[index];
    console.log([level.id, level.waves.length, row.good?.spawned ?? '—', level.startGold, level.hpScale,
      score(row.good), score(row.person), score(row.beginner), score(row.noSpecials), row.openingCount, row.good ? minutes(row.good.tick) : '—', row.good?.peakAlive ?? '—',
      row.ok ? 'pass' : row.failed.join(',')].join('  '));
  });
  console.log(`Campaign: ${minutes(campaign.totalTicks)} minutes. ${campaign.ok ? 'P1–P2 and L1–L8 pass' : 'MISS ' + campaign.failed.join(', ')}`);
  if (!campaign.ok) process.exitCode = 1;
} finally {
  await server.close();
}
