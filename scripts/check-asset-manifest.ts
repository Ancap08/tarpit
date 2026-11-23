// `npm run check:assets`: every file under assets/, docs/art/ and
// public/icons/ must be listed in assets/MANIFEST.md with a CC0 or CC-BY
// license (CC-BY with a credit line), or MIT when a script in this repo drew
// it (the project's own work, milestone 32a). See docs/SCOPE-v3.md, "Hard rules". The matching logic is
// pure (checkManifest, parseManifest) and tested in
// check-asset-manifest.test.ts; the file walk runs only when this file is
// the entry point.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** One row of the manifest table. */
export interface ManifestRow {
  path: string;
  source: string;
  author: string;
  license: string;
  notes: string;
}

/** Folders whose files must each be listed in the manifest. */
export const CHECKED_DIRS = ['assets/', 'docs/art/', 'public/icons/'];

/**
 * Files under the checked folders that are not assets: Markdown docs (the
 * manifest itself, the inventory) are project text under the repo's MIT
 * license, and .DS_Store is macOS litter (also in .gitignore).
 */
export function isIgnored(path: string): boolean {
  return path.endsWith('.md') || path.endsWith('/.DS_Store') || path === '.DS_Store';
}

/**
 * Licenses a committed asset may carry (docs/SCOPE-v3.md, "Hard rules").
 * 'mit' is the repo's own license; checkManifest allows it only for files a
 * repo script drew (see isOwnWork).
 */
export function licenseKind(license: string): 'cc0' | 'cc-by' | 'mit' | null {
  const l = license.trim().toUpperCase();
  if (l === 'MIT') return 'mit';
  if (/^CC0(\s|$)/.test(l)) return 'cc0';
  if (/^CC-BY(\s+\d(\.\d)?)?$/.test(l)) return 'cc-by';
  return null;
}

const HEADER = ['path', 'source', 'author', 'license', 'notes'];

/** Strip surrounding backticks and whitespace from a table cell. */
function cell(raw: string): string {
  const t = raw.trim();
  return t.startsWith('`') && t.endsWith('`') && t.length >= 2 ? t.slice(1, -1).trim() : t;
}

/**
 * Parse the first Markdown table whose header is exactly
 * `| Path | Source | Author | License | Notes |` (case-insensitive).
 * Throws if no such table exists, so a reformatted manifest fails loudly.
 */
export function parseManifest(markdown: string): ManifestRow[] {
  const lines = markdown.split(/\r?\n/);
  const split = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  const start = lines.findIndex((l) => {
    if (!l.trim().startsWith('|')) return false;
    const cells = split(l).map((c) => c.trim().toLowerCase());
    return cells.length === HEADER.length && cells.every((c, i) => c === HEADER[i]);
  });
  if (start < 0) throw new Error(`no manifest table with the header | ${HEADER.join(' | ')} |`);
  const rows: ManifestRow[] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith('|')) break;
    const cells = split(line).map(cell);
    if (cells.length !== HEADER.length) throw new Error(`manifest row does not have ${HEADER.length} cells: ${line}`);
    const [path, source, author, license, notes] = cells;
    rows.push({ path, source, author, license, notes });
  }
  return rows;
}

/** True if the row's source is a script in this repo (`scripts/...`): the project's own work. */
export function isOwnWork(row: ManifestRow): boolean {
  return /^scripts\/\S+\.(?:ts|py)(?=\s|$)/.test(row.source.replace(/`/g, '').trim());
}

/** True if the row's notes carry a credit line ("Credit: ..."), required for CC-BY. */
export function hasCredit(row: ManifestRow): boolean {
  return /credit:\s*\S/i.test(row.notes);
}

/**
 * Every problem with `files` (repo-relative, forward slashes) against the
 * manifest rows: unlisted files, disallowed licenses, CC-BY without a credit
 * line, and rows that point at no file. Empty means the check passes.
 */
export function checkManifest(files: string[], rows: ManifestRow[]): string[] {
  const problems: string[] = [];
  const checked = files.filter((f) => CHECKED_DIRS.some((d) => f.startsWith(d)) && !isIgnored(f)).sort();
  const byPath = new Map<string, ManifestRow>();
  for (const row of rows) {
    if (byPath.has(row.path)) problems.push(`${row.path}: listed twice in assets/MANIFEST.md`);
    byPath.set(row.path, row);
  }
  for (const f of checked) {
    const row = byPath.get(f);
    if (!row) {
      problems.push(`${f}: not listed in assets/MANIFEST.md (add a row with its source, author and license)`);
      continue;
    }
    const kind = licenseKind(row.license);
    if (kind === null) problems.push(`${f}: license "${row.license}" is not allowed (only CC0 or CC-BY)`);
    if (kind === 'mit' && !isOwnWork(row))
      problems.push(`${f}: MIT is allowed only for files drawn by a repo script (Source "scripts/...")`);
    if (kind === 'cc-by' && !hasCredit(row)) problems.push(`${f}: CC-BY needs a credit line in Notes ("Credit: ...")`);
  }
  const present = new Set(checked);
  for (const row of rows) {
    if (!present.has(row.path)) problems.push(`${row.path}: listed in assets/MANIFEST.md but no such file`);
  }
  return problems;
}

function walk(root: string, dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(root, join(dir, e.name)) : [relative(root, join(dir, e.name)).split(sep).join('/')],
  );
}

function main(): void {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const manifestPath = join(root, 'assets', 'MANIFEST.md');
  if (!existsSync(manifestPath)) {
    console.error('check:assets: assets/MANIFEST.md is missing');
    process.exit(1);
  }
  const rows = parseManifest(readFileSync(manifestPath, 'utf8'));
  const files = CHECKED_DIRS.flatMap((d) => walk(root, join(root, d)));
  const problems = checkManifest(files, rows);
  if (problems.length > 0) {
    console.error(`check:assets: ${problems.length} problem(s) with assets/MANIFEST.md:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `check:assets: ${rows.length} manifest rows; every file under ${CHECKED_DIRS.join(' and ')} is listed with an allowed license`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
