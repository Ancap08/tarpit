// `npm run check:size` (after `npm run build`): fail if the built site in
// dist/ is over the v3 size budget (docs/SCOPE-v3.md, "Hard rules"). Prints
// the total and the ten largest files.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 20 MB, the default budget from docs/SCOPE-v3.md. */
export const SIZE_BUDGET_BYTES = 20 * 1024 * 1024;

const dist = fileURLToPath(new URL('../dist', import.meta.url));

function walk(dir: string): { path: string; bytes: number }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [{ path: relative(dist, p).split(sep).join('/'), bytes: statSync(p).size }];
  });
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;

if (!existsSync(dist)) {
  console.error('check:size: dist/ is missing; run `npm run build` first');
  process.exit(1);
}
const files = walk(dist).sort((a, b) => b.bytes - a.bytes);
const keepArt = files.filter(file => file.path.startsWith('assets/keep/') && !file.path.endsWith('.js'))
  .reduce((sum, file) => sum + file.bytes, 0);
console.log(`check:size: Old Keep art ${keepArt} bytes of 8000000`);
if (keepArt > 8_000_000) process.exitCode = 1;
const total = files.reduce((s, f) => s + f.bytes, 0);
console.log(`check:size: dist/ is ${mb(total)} (${total} bytes) in ${files.length} files; budget ${mb(SIZE_BUDGET_BYTES)}`);
console.log('Largest files:');
for (const f of files.slice(0, 10)) console.log(`  ${mb(f.bytes).padStart(9)}  ${f.path}`);
if (total > SIZE_BUDGET_BYTES) {
  console.error(`check:size: over budget by ${mb(total - SIZE_BUDGET_BYTES)}`);
  process.exit(1);
}
