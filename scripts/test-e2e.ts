import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const playwright = createRequire(import.meta.url).resolve('@playwright/test/cli');
const filters = process.argv.slice(2);
const suite = spawnSync(process.execPath, [
  playwright, 'test', ...(filters.length ? filters : ['--grep-invert', '@keep-cost']),
], { stdio: 'inherit' });

if (suite.error) throw suite.error;
if (suite.status !== 0 || filters.length) process.exit(suite.status ?? 1);

// Let all other browser workers exit before sampling main-thread cost.
const cost = spawnSync('npm', ['run', 'test:e2e:keep-cost'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (cost.error) throw cost.error;
process.exitCode = cost.status ?? 1;
