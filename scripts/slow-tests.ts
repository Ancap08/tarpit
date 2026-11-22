// `npm run test:slow`: run the unit suite once with vitest's JSON reporter
// and print every test slower than a threshold (default 3000 ms; pass
// another number of ms as the first argument), slowest first. For trimming
// slow whole-game tests (milestone 27 follow-up); not part of CI and never
// fails because of a slow test. It exits non-zero only if vitest itself
// produced no report. Times are this machine's: CI runners have been about
// 1.7 times slower.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface JsonReport {
  testResults: { name: string; assertionResults: { fullName: string; status: string; duration?: number | null }[] }[];
}

const threshold = Number(process.argv[2] ?? 3000);
const dir = mkdtempSync(join(tmpdir(), 'tarpit-slow-'));
const out = join(dir, 'vitest.json');
const run = spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${out}`], { stdio: ['ignore', 'ignore', 'inherit'] });

let report: JsonReport;
try {
  report = JSON.parse(readFileSync(out, 'utf8')) as JsonReport;
} catch {
  console.error(`test:slow: vitest wrote no report (exit ${run.status})`);
  process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const root = process.cwd() + '/';
const tests = report.testResults.flatMap((file) =>
  file.assertionResults.map((t) => ({ file: file.name.replace(root, ''), name: t.fullName, status: t.status, ms: t.duration ?? 0 })),
);
const slow = tests.filter((t) => t.ms > threshold).sort((a, b) => b.ms - a.ms);
console.log(`test:slow: ${slow.length} of ${tests.length} tests over ${threshold} ms (vitest exit ${run.status})`);
for (const t of slow) console.log(`${(t.ms / 1000).toFixed(1).padStart(6)} s  ${t.file} > ${t.name}${t.status === 'passed' ? '' : `  [${t.status}]`}`);
