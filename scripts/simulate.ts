// Headless balance report: `npm run sim`. Plays every balance archetype from
// src/sim/headless.ts and prints lives, gold and ticks after each wave, then
// a one-line summary per archetype. Loads src/sim through Vite's module
// runner, so it needs no extra dependency.
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import type * as Sim from '../src/sim/index';

const { module: sim } = await runnerImport<typeof Sim>('/src/sim/index.ts', {
  root: fileURLToPath(new URL('..', import.meta.url)),
  configFile: false,
  logLevel: 'error',
});

const summaries: string[] = [];

function report(name: string, script: Sim.WaveScript): void {
  const run = sim.playScripted(script);
  const s = run.state;
  const summary = `${name}: ${s.phase} on wave ${s.wave}, ${s.lives} lives, ${s.gold} gold`;
  summaries.push(summary);
  console.log(`\n${summary}`);
  console.log('wave  lives  gold  ticks');
  for (const w of run.waves) {
    console.log(
      `${String(w.wave).padStart(4)}  ${String(w.lives).padStart(5)}  ${String(w.gold).padStart(4)}  ${String(w.ticks).padStart(5)}`,
    );
  }
  const failed = run.log.filter((step) => 'result' in step && !step.result.ok);
  for (const step of failed) console.log('refused:', JSON.stringify(step));
}

for (const [name, archetype] of Object.entries(sim.ARCHETYPES)) report(name, archetype());
// Informational scripts (milestone 24: comboStrongest), no balance target.
for (const [name, script] of Object.entries(sim.INFORMATIONAL)) report(name, script());

console.log('\nSummary');
for (const line of summaries) console.log(line);
