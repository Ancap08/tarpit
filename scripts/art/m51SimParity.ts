// Hash each complete campaign bot result, including its purchase log and terminal
// state. Run once with M51_SIM_ROOT pointing at main and once on the candidate.
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import type * as BotModule from '../../src/sim/bots';
import type * as GameModule from '../../src/sim/game';
import type * as LevelModule from '../../src/sim/levels';
const server = await createServer({root:process.env.M51_SIM_ROOT ?? process.cwd(),configFile:false,
  server:{middlewareMode:true,ws:false},logLevel:'error'});
try {
  const bots = await server.ssrLoadModule('/src/sim/bots.ts') as typeof BotModule;
  const { createGame } = await server.ssrLoadModule('/src/sim/game.ts') as typeof GameModule;
  const { LEVELS } = await server.ssrLoadModule('/src/sim/levels.ts') as typeof LevelModule;
  const policies = [bots.botGood,bots.botPerson,bots.botBeginner,bots.botFeathers,bots.botGoodFeat,bots.botPersonFeat,
    bots.preferFeathers(bots.botGood),bots.preferFeathers(bots.botPerson)];
  for (const level of LEVELS) {
    for (const [i,policy] of policies.entries()) {
      const result = bots.runBot(createGame({level}),policy);
      console.log(level.id,i,createHash('sha256').update(JSON.stringify(result)).digest('hex'));
    }
  }
} finally { await server.close(); }
