import { describe, expect, it } from 'vitest';
import { checkManifest, licenseKind, parseManifest, type ManifestRow } from './check-asset-manifest';

const row = (path: string, license = 'CC0 1.0', notes = ''): ManifestRow => ({
  path,
  source: 'https://example.invalid/pack',
  author: 'someone',
  license,
  notes,
});

describe('licenseKind', () => {
  it('accepts CC0 and CC-BY spellings', () => {
    expect(licenseKind('CC0')).toBe('cc0');
    expect(licenseKind('CC0 1.0')).toBe('cc0');
    expect(licenseKind('cc0 1.0 (derived)')).toBe('cc0');
    expect(licenseKind('CC-BY')).toBe('cc-by');
    expect(licenseKind('CC-BY 4.0')).toBe('cc-by');
  });
  it('rejects everything else', () => {
    for (const l of ['CC-BY-SA 4.0', 'CC-BY-NC 4.0', 'MIT-0', 'proprietary', '', 'CC0-ish', 'GPL']) {
      expect(licenseKind(l), l).toBeNull();
    }
  });
});

describe('checkManifest', () => {
  it('checks public/icons/ and allows MIT only for files a repo script drew', () => {
    const own = { ...row('public/icons/icon-192.png', 'MIT'), source: '`scripts/make-icons.ts`' };
    const atlas = { ...row('assets/art-painted/goblin.png', 'MIT'), source: 'scripts/art/slice_sheets.py' };
    const files = [own.path, atlas.path, 'public/icons/x.png', 'public/manifest.webmanifest'];
    const scripts = new Set(['scripts/make-icons.ts', 'scripts/art/slice_sheets.py']);
    const problems = checkManifest(files, [own, atlas, row('public/icons/x.png', 'MIT')], scripts);
    expect(licenseKind('MIT')).toBe('mit');
    expect(problems).toEqual([expect.stringMatching(/^public\/icons\/x\.png: MIT is allowed only/)]);
  });

  it('rejects a manifest row that names a missing source script', () => {
    const scripts = new Set(['scripts/art/slice_sheets.py', 'scripts/make-icons.ts']);
    for (const source of ['scripts/art/missing.py', 'scripts/missing.ts']) {
      const asset = { ...row('assets/a.png', 'MIT'), source };
      expect(checkManifest([asset.path], [asset], scripts)).toEqual([
        `assets/a.png: source script "${source}" does not exist in the repo`,
      ]);
    }
  });

  it('passes when every checked file is listed with an allowed license', () => {
    const files = ['assets/a.png', 'docs/art/mockups/b.png', 'src/main.ts'];
    expect(checkManifest(files, [row('assets/a.png'), row('docs/art/mockups/b.png')])).toEqual([]);
  });

  it('ignores files outside assets/ and docs/art/, Markdown and .DS_Store', () => {
    const files = ['src/x.png', 'docs/media/tarpit.gif', 'assets/MANIFEST.md', 'docs/art/INVENTORY.md', 'docs/art/.DS_Store'];
    expect(checkManifest(files, [])).toEqual([]);
  });

  it('fails an unlisted file, naming it', () => {
    const problems = checkManifest(['assets/a.png', 'assets/sprites/goblin.png'], [row('assets/a.png')]);
    expect(problems).toEqual([expect.stringMatching(/^assets\/sprites\/goblin\.png: not listed/)]);
  });

  it('matches paths exactly (no prefix or case matching)', () => {
    expect(checkManifest(['assets/a.png'], [row('assets/A.png')])).toHaveLength(2);
    expect(checkManifest(['assets/a.png.bak'], [row('assets/a.png')])).toHaveLength(2);
  });

  it('fails a disallowed license', () => {
    expect(checkManifest(['assets/a.png'], [row('assets/a.png', 'CC-BY-SA 4.0')])).toEqual([
      expect.stringMatching(/license "CC-BY-SA 4\.0" is not allowed/),
    ]);
  });

  it('requires a credit line for CC-BY', () => {
    expect(checkManifest(['assets/a.png'], [row('assets/a.png', 'CC-BY 4.0', 'from pack X')])).toEqual([
      expect.stringMatching(/CC-BY needs a credit line/),
    ]);
    expect(checkManifest(['assets/a.png'], [row('assets/a.png', 'CC-BY 4.0', 'Credit: Jane Doe, opengameart.org')])).toEqual([]);
  });

  it.each(['OFL.txt', 'OFL-Inter.txt'])('requires the bundled %s and pinned font hashes', name => {
    const license = `assets/fonts/${name}`;
    const font = 'assets/fonts/a.woff2';
    const digest = 'a'.repeat(64);
    const rows = [font, license].map((path) => row(path, 'SIL OFL 1.1', `License file: ${license}; SHA-256: ${digest}`));
    const hashes = new Map([[font, digest], [license, digest]]);
    expect(checkManifest([font, license], rows, new Set(), hashes)).toEqual([]);
    expect(checkManifest([font], rows, new Set(), hashes)).toContain(`${font}: OFL needs its bundled license file`);
    hashes.set(font, 'b'.repeat(64));
    expect(checkManifest([font, license], rows, new Set(), hashes)).toEqual([`${font}: SHA-256 missing or different from manifest`]);
  });

  it('flags rows for missing files and duplicate rows', () => {
    expect(checkManifest([], [row('assets/gone.png')])).toEqual([expect.stringMatching(/no such file/)]);
    expect(checkManifest(['assets/a.png'], [row('assets/a.png'), row('assets/a.png')])).toEqual([
      expect.stringMatching(/listed twice/),
    ]);
  });
});

describe('parseManifest', () => {
  const md = [
    '# Asset manifest',
    '',
    'Some text.',
    '',
    '| Path | Source | Author | License | Notes |',
    '|---|---|---|---|---|',
    '| `docs/art/mockups/A.png` | https://pixel-boy.itch.io/ninja-adventure-asset-pack | Pixel-boy | CC0 1.0 | derived |',
    '| assets/b.png | src | me | CC-BY 4.0 | Credit: me |',
    '',
    'Trailing text.',
  ].join('\n');

  it('reads the rows of the manifest table and strips backticks', () => {
    const rows = parseManifest(md);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      path: 'docs/art/mockups/A.png',
      source: 'https://pixel-boy.itch.io/ninja-adventure-asset-pack',
      author: 'Pixel-boy',
      license: 'CC0 1.0',
      notes: 'derived',
    });
    expect(rows[1].notes).toBe('Credit: me');
  });

  it('throws without the expected header, so a reformatted manifest fails loudly', () => {
    expect(() => parseManifest('| File | License |\n|---|---|\n| a | CC0 |')).toThrow(/no manifest table/);
  });

  it('throws on a row with the wrong number of cells', () => {
    expect(() => parseManifest('| Path | Source | Author | License | Notes |\n|---|---|---|---|---|\n| a | CC0 |')).toThrow(
      /does not have 5 cells/,
    );
  });
});
