// Deterministic campaign and endless balance report. Vite loads the
// TypeScript simulation in one module graph so the tables share run caches.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import type * as Balance from '../src/sim/balanceRuns';
import type * as Targets from '../src/sim/balanceTargets';
import type * as Maps from '../src/sim/map';

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
    if (target.id === 'N10') continue; // The report checks the entire matrix below.
    const result = target.check();
    console.log(`${result.ok ? 'ok  ' : 'MISS'}  ${target.id.padEnd(3)} ${(target.map ?? '').padEnd(10)} ${target.label}: ${result.info}`);
    if (!result.ok) process.exitCode = 1;
  }

  for (const map of MAP_IDS) {
    console.log(`\n${map}, Normal: boon matrix (lives, kills, gold)`);
    for (const { picks, run } of targets.boonBalanceRuns(map, 'all')) {
      console.log(`${picks.join(' / ')}  ${balance.matrixCell(run)}, ${run.kills} kills, ${run.gold} gold`);
    }
    const result = targets.checkBoonBalance(map, 'all');
    console.log(`${result.ok ? 'ok' : 'MISS'}  N10  ${map}: ${result.info}`);
    if (!result.ok) process.exitCode = 1;
  }

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
    console.log('wave  lives  gold   ticks  peak');
    for (const wave of run.waves) {
      console.log([wave.wave, wave.lives, wave.gold, wave.ticks, wave.peak].map((value, i) => String(value).padStart(i === 3 ? 6 : 4)).join('  '));
    }
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
