import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import type * as Bots from '../src/sim/bots';
import type * as Game from '../src/sim/game';
import type * as Levels from '../src/sim/levels';
import type * as Keep from '../src/sim/checkKeep';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true, ws: false } });
try {
  const { checkKeep } = await server.ssrLoadModule('/src/sim/checkKeep.ts') as typeof Keep;
  const { LEVELS } = await server.ssrLoadModule('/src/sim/levels.ts') as typeof Levels;
  const { createGame } = await server.ssrLoadModule('/src/sim/game.ts') as typeof Game;
  const { runBot, botPerson } = await server.ssrLoadModule('/src/sim/bots.ts') as typeof Bots;
  const actTwo = LEVELS.slice(10);
  const actTwoMean = actTwo.reduce((sum, level) => sum + runBot(createGame({ level }), botPerson).state.lives, 0) / actTwo.length;
  const report = checkKeep(actTwoMean);
  for (const target of report.targets) console.log(`${target.ok ? 'ok  ' : 'MISS'} ${target.label} ${target.detail}`);
  for (const { level, good, person, beginner, featGood, featPerson } of report.rows) {
    console.log(level.id, JSON.stringify({ good, person, beginner, featGood, featPerson }));
  }
  if (!report.ok) process.exitCode = 1;
} finally {
  await server.close();
}
