// Deterministic campaign and endless balance report. Vite loads the
// TypeScript simulation in one module graph so the tables share run caches.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
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
  const balance = await server.ssrLoadModule('/src/sim/balanceRuns.ts') as typeof Balance;
  const targets = await server.ssrLoadModule('/src/sim/balanceTargets.ts') as typeof Targets;
  const { MAP_IDS } = await server.ssrLoadModule('/src/sim/map.ts') as typeof Maps;
  const levels = ['easy', 'normal', 'hard'] as const;
  const columns = MAP_IDS.flatMap((map) => levels.map((level) => ({ map, level })));
  const nameWidth = Math.max(...balance.MATRIX_ARCHETYPES.map((name) => name.length));

  console.log('Balance targets');
  for (const target of targets.TARGETS) {
    const result = target.check();
    console.log(`${result.ok ? 'ok  ' : 'MISS'}  ${target.id.padEnd(3)} ${(target.map ?? '').padEnd(10)} ${target.label}: ${result.info}`);
    if (!result.ok) process.exitCode = 1;
  }

  const { SPECIAL_TYPES } = await server.ssrLoadModule('/src/sim/specials.ts') as typeof Specials;
  console.log('\nNormal comboBuild with one special omitted (information only)');
  console.log('map'.padEnd(10) + ['all', ...SPECIAL_TYPES.map(type => `without ${type}`)].map(label => label.padStart(18)).join('  '));
  for (const map of MAP_IDS) {
    const all = balance.balanceRun('comboBuild', map, 'normal');
    const singles = SPECIAL_TYPES.map(type => targets.comboWithoutSpecialRun(type, map));
    console.log(map.padEnd(10) + [all, ...singles].map(run => balance.matrixCell(run).padStart(18)).join('  '));
  }

  for (const map of MAP_IDS) {
    console.log(`\n${map}, Normal: boon matrix (lives, kills, gold)`);
    for (const { picks, run } of targets.boonBalanceRuns(map)) {
      console.log(`${picks.join(' / ')}  ${balance.matrixCell(run)}, ${run.kills} kills, ${run.gold} gold`);
    }
  }

  const paths = await server.ssrLoadModule('/src/sim/pathBalance.ts') as typeof Paths;
  const rows = paths.PATH_SCENARIOS.map(paths.measurePathScenario);
  console.log('\nNormal, default rewards and specials: adaptive A/B, then matched A/B/copy');
  for (const row of rows) {
    if (!row.pathValid || !row.copyValid) process.exitCode = 1;
    console.log(`${row.pathValid && row.copyValid ? '' : 'MISS  purchase control  '}${row.tower} ${row.build}/${row.map}: ${[row.a, row.b, row.matchedA, row.matchedB, row.copy].map(balance.matrixCell).join(' / ')}`);
  }
  for (const s of paths.summarizePathBalance(rows)) {
    const checks = [
      ['P1', s.p1, `A minus B: ${s.ab.join('/')}`],
      ['P2', s.p2, `largest A/B gap: ${s.largestGap}`],
      ['P4', (s.p4.aWin || s.p4.bWin) && (s.p4.aCopy || s.p4.bCopy), `A minus copy: ${s.ac.join('/')}, B minus copy: ${s.bc.join('/')}`],
    ] as const;
    for (const [id, passed, evidence] of checks) {
      console.log(`${passed ? 'ok' : 'MISS'}  ${id} ${s.tower}: ${evidence}`);
      if (!passed) process.exitCode = 1;
    }
  }

  const encounters = await server.ssrLoadModule('/src/sim/pathEncounter.ts') as typeof Encounters;
  for (const row of encounters.measurePathEncounters()) {
    console.log(`${row.ok ? 'ok' : 'MISS'}  P3 ${row.tower}: lone Troll ${row.loneMetric} ${row.lone.join('/')}, ten Goblins ${row.packMetric} ${row.pack.join('/')}`);
    if (!row.ok) process.exitCode = 1;
  }

  const boons = await server.ssrLoadModule('/src/sim/boonBalance.ts') as typeof Boons;
  const impact = boons.compareBoonEffects();
  for (const [label, result] of [['N10c', impact.c], ['N10d', impact.d]] as const) {
    console.log(`${result.ok ? 'ok' : 'MISS'}  ${label}  ${result.info}`);
    if (!result.ok) process.exitCode = 1;
  }
  for (const effect of impact.effects) {
    const best = impact.measurements.filter(({ scenario }) => effect.best.includes(scenario));
    const witness = best.find(({ outcomes }) => outcomes.some(({ boon, actual }) => boon === effect.boon && actual.phase === 'won')) ?? best[0];
    const pairs = effect.changed.map(({ build, map }) => `${build}/${map}`).join(', ');
    if (witness) {
      const { build, map, difficulty, picks } = witness.scenario;
      const scores = witness.outcomes.map(({ boon, actual }) => `${boon} ${actual.lives} lives/${actual.kills} kills`).join(', ');
      console.log(`${effect.boon}: strict best ${build}/${map}/${difficulty}, picks ${picks.join('/')}: ${scores}; changes ${pairs}`);
    } else {
      console.log(`${effect.boon}: no strict best; changes ${pairs}`);
    }
  }

  const fight = balance.balanceRun('comboBuild', 'meadow', 'normal').bossFight;
  console.log('\nMeadow Normal, Grumblemaw (wave-20 ticks)');
  console.log(fight.map(({ tick, event, hp }) => `${tick}: ${hp === undefined ? event : Math.round(hp) + ' HP'}`).join(' | '));

  console.log('\nEndless');
  console.log('archetype      map         level   result  wave  lives  gold');
  for (const name of ['endlessIdle', 'endlessGreedy'] as const) {
    for (const { map, level } of columns) {
      const run = balance.balanceRun(name, map, level);
      console.log(`${name.padEnd(13)}  ${map.padEnd(10)}  ${level.padEnd(6)}  ${run.phase.padEnd(6)}  ${String(run.wave).padStart(4)}  ${String(run.lives).padStart(5)}  ${String(run.gold).padStart(4)}`);
    }
  }

  for (const map of MAP_IDS) {
    const run = balance.balanceRun('comboBuild', map, 'normal');
    console.log(`\n${map}, Normal: comboBuild by wave`);
    console.log('wave  lives  lost  gold before combat  ending gold  ticks  peak');
    for (const wave of run.waves) {
      console.log([wave.wave, wave.lives, wave.livesLost, wave.goldAfterPurchases, wave.gold, wave.ticks, wave.peak].map((value, i) => String(value).padStart(i === 3 ? 6 : 4)).join('  '));
    }
  }

  console.log('\nNormal ending gold                  Meadow / Switchback / Riverbend');
  for (const name of ['comboBuild', 'wideBuild', 'hardBuild', 'artilleryBuild', 'burnBuild', 'musketBuild'] as const) {
    console.log(`${name.padEnd(nameWidth)}  ${MAP_IDS.map((map) => balance.balanceRun(name, map, 'normal').gold).join(' / ')}`);
  }

  console.log('\nMatrix');
  console.log(`${''.padEnd(nameWidth)}  ${MAP_IDS.map((map) => map.padEnd(levels.length * 7 - 1)).join(' ')}`);
  console.log(`${'archetype'.padEnd(nameWidth)}  ${columns.map((column) => column.level.padStart(6)).join(' ')}`);
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
    console.log(`${name.padEnd(nameWidth)}  ${cells.join(' ')}`);
  }
} finally {
  await server.close();
}
