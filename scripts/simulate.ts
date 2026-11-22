// Headless balance report: `npm run sim`. Plays every balance archetype from
// src/sim/headless.ts on Normal and prints lives, gold and ticks after each
// wave, then a one-line summary per archetype, then (milestone 25) a compact
// table of every archetype on Easy and on Hard, then (milestone 26) the endless
// archetypes on every level. Loads src/sim through Vite's module runner, so it
// needs no extra dependency.
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

// Milestone 25: every archetype recorded and played on Easy and on Hard.
const all = { ...sim.ARCHETYPES, ...sim.INFORMATIONAL };
const width = Math.max(...Object.keys(all).map((n) => n.length));
for (const level of ['easy', 'hard'] as const) {
  console.log(`\n${level[0].toUpperCase()}${level.slice(1)}`);
  console.log(`${'archetype'.padEnd(width)}  result  wave  lives  gold`);
  for (const [name, archetype] of Object.entries(all)) {
    const run = sim.playScripted(archetype(level), undefined, level);
    const s = run.state;
    const refused = run.log.filter((step) => 'result' in step && !step.result.ok).length;
    console.log(
      `${name.padEnd(width)}  ${s.phase.padEnd(6)}  ${String(s.wave).padStart(4)}  ${String(s.lives).padStart(5)}  ${String(s.gold).padStart(4)}${refused ? `  (${refused} refused)` : ''}`,
    );
  }
}

// Milestone 26: endless archetypes (informational), on every level: the
// wave each run loses on and its waves cleared, or "capped" if it was still
// alive after ENDLESS_WAVE_CAP waves.
console.log(`\nEndless (cap ${sim.ENDLESS_WAVE_CAP} waves)`);
const endlessWidth = Math.max(...Object.keys(sim.ENDLESS_ARCHETYPES).map((n) => n.length));
console.log(`${'archetype'.padEnd(endlessWidth)}  level   result  wave  cleared  lives  gold`);
for (const level of ['easy', 'normal', 'hard'] as const) {
  for (const [name, archetype] of Object.entries(sim.ENDLESS_ARCHETYPES)) {
    const r = sim.endlessReport(archetype(level), level);
    console.log(
      `${name.padEnd(endlessWidth)}  ${level.padEnd(6)}  ${r.result.padEnd(6)}  ${String(r.wave).padStart(4)}  ${String(r.wavesCleared).padStart(7)}  ${String(r.lives).padStart(5)}  ${String(r.gold).padStart(4)}`,
    );
  }
}
