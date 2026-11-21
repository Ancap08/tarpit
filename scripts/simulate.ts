// Headless balance report: `npm run sim`. Plays soundBuild() and lazyBuild()
// and prints lives, gold and ticks after each wave. Loads src/sim through
// Vite's module runner, so it needs no extra dependency.
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import type * as Sim from '../src/sim/index';

const { module: sim } = await runnerImport<typeof Sim>('/src/sim/index.ts', {
  root: fileURLToPath(new URL('..', import.meta.url)),
  configFile: false,
  logLevel: 'error',
});

function report(name: string, script: Sim.WaveScript): void {
  const run = sim.playScripted(script);
  console.log(`\n${name}: ${run.state.phase} on wave ${run.state.wave}, ${run.state.lives} lives, ${run.state.gold} gold`);
  console.log('wave  lives  gold  ticks');
  for (const w of run.waves) {
    console.log(
      `${String(w.wave).padStart(4)}  ${String(w.lives).padStart(5)}  ${String(w.gold).padStart(4)}  ${String(w.ticks).padStart(5)}`,
    );
  }
  const failed = run.log.filter((step) => 'result' in step && !step.result.ok);
  for (const step of failed) console.log('refused:', JSON.stringify(step));
}

report('soundBuild', sim.soundBuild());
report('lazyBuild', sim.lazyBuild());
