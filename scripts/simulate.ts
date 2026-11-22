// Headless balance report: `npm run sim`. Plays every balance archetype from
// src/sim/headless.ts on Normal and prints lives, gold and ticks after each
// wave, then a one-line summary per archetype, then (milestone 25) a compact
// table of every archetype on Easy and on Hard, then (milestone 26) the endless
// archetypes on every level, then (milestone 27) the other maps, then
// (milestone 28) every balance target and the matrix of every archetype by
// map and level. Loads src/sim through Vite's module runner, so it needs no
// extra dependency.
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import type * as Sim from '../src/sim/index';
import type * as Balance from '../src/sim/balanceRuns';
import type * as Targets from '../src/sim/balanceTargets';

const load = async <T>(path: string): Promise<T> =>
  (await runnerImport<T>(path, { root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, logLevel: 'error' })).module;
const sim = await load<typeof Sim>('/src/sim/index.ts');

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

// Milestone 27: the other maps, appended so Meadow's report above stays as it
// was. Per map: the Normal table for the archetypes that run on every map
// (milestone 28), with the lives left after each wave played.
const balance = await load<typeof Balance>('/src/sim/balanceRuns.ts');
const targets = await load<typeof Targets>('/src/sim/balanceTargets.ts');
const mapWidth = Math.max(...balance.ALL_MAP_ARCHETYPES.map((n) => n.length));
for (const map of sim.MAP_IDS) {
  if (map === 'meadow') continue;
  console.log(`\nMap: ${map} (path ${sim.pathLength(sim.MAPS[map])} px, ${sim.buildableCells(sim.MAPS[map]).filter(Boolean).length} buildable cells), Normal`);
  console.log(`${'archetype'.padEnd(mapWidth)}  result  wave  lives  gold  lives by wave`);
  for (const name of balance.ALL_MAP_ARCHETYPES) {
    const r = balance.balanceRun(name, map, 'normal');
    console.log(
      `${name.padEnd(mapWidth)}  ${r.phase.padEnd(6)}  ${String(r.wave).padStart(4)}  ${String(r.lives).padStart(5)}  ${String(r.gold).padStart(4)}  ${r.waves.map((w) => w.lives).join(' ')}${r.refused ? `  (${r.refused} refused)` : ''}`,
    );
  }
}

// Milestone 28: every balance target (balanceTargets.ts), then the matrix:
// rows archetype, columns map by level, "W 13" a win with 13 lives, "L 8" a
// loss on wave 8 (endlessIdle: the endless wave it was lost on).
console.log('\nBalance targets (docs/DESIGN.md "Balance targets")');
for (const t of targets.TARGETS) {
  const r = t.check();
  console.log(`${r.ok ? 'ok  ' : 'MISS'}  ${t.id.padEnd(3)} ${(t.map ?? '').padEnd(10)} ${t.label}: ${r.info}`);
}
const levels = ['easy', 'normal', 'hard'] as const;
const columns = sim.MAP_IDS.flatMap((map) => levels.map((level) => ({ map, level })));
const nameWidth = Math.max(...balance.MATRIX_ARCHETYPES.map((n) => n.length));
console.log('\nMatrix');
console.log(`${''.padEnd(nameWidth)}  ${sim.MAP_IDS.map((m) => m.padEnd(levels.length * 7 - 1)).join(' ')}`);
console.log(`${'archetype'.padEnd(nameWidth)}  ${columns.map((c) => c.level.padStart(6)).join(' ')}`);
for (const name of balance.MATRIX_ARCHETYPES) {
  const cells = columns.map(({ map, level }) => (balance.runsOn(name, map) ? balance.matrixCell(balance.balanceRun(name, map, level)) : '-').padStart(6));
  console.log(`${name.padEnd(nameWidth)}  ${cells.join(' ')}`);
}
