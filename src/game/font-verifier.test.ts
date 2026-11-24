// Milestone 44c verifier: the bundled font's files, licence, credit and glyph coverage.
import { createHash } from 'node:crypto';
import { globSync, readdirSync, readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const HASHES: Record<string, string> = {
  'LibreCaslonText-Regular-latin.woff2': '1471d8a9f22ba5c42c597c2dc582030297027d3e4c3b59a55aec81678f80485b',
  'LibreCaslonText-Bold-latin.woff2': '7dc7dc90fb6e140dcdfbfd85aae2bab1f368a448be129fecb953a8290501cef8',
};
const TAGS = 'cmap head hhea hmtx maxp name OS/2 post cvt  fpgm glyf loca prep CFF  VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB'.split(/ (?=\S)/);

/** The code points a WOFF2 font maps (cmap is never transformed, so a brotli pass is enough). */
function cmap(file: string): Set<number> {
  const b = readFileSync(file);
  let o = 48;
  const base128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const x = b[o++]!; v = v * 128 + (x & 127); if (!(x & 128)) break; } return v; };
  const tables: { tag: string; len: number }[] = [];
  for (let i = 0, n = b.readUInt16BE(12); i < n; i++) {
    const flags = b[o++]!;
    const tag = (flags & 63) === 63 ? (o += 4, b.toString('latin1', o - 4, o)) : TAGS[flags & 63]!;
    const version = flags >> 6;
    let len = base128();
    if (tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0) len = base128();
    tables.push({ tag, len });
  }
  const data = brotliDecompressSync(b.subarray(o, o + b.readUInt32BE(20)));
  let p = 0, t = data;
  for (const x of tables) { if (x.tag === 'cmap') t = data.subarray(p, p + x.len); p += x.len; }
  const set = new Set<number>();
  for (let i = 0, n = t.readUInt16BE(2); i < n; i++) {
    const off = t.readUInt32BE(4 + i * 8 + 4);
    const platform = t.readUInt16BE(4 + i * 8);
    const encoding = t.readUInt16BE(6 + i * 8);
    if (t.readUInt16BE(off) === 4 && (platform === 0 || (platform === 3 && encoding === 1))) {
      const segs = t.readUInt16BE(off + 6) / 2, end = off + 14, start = end + segs * 2 + 2;
      const deltas = start + segs * 2, offsets = deltas + segs * 2;
      for (let k = 0; k < segs; k++) {
        const first = t.readUInt16BE(start + k * 2), last = t.readUInt16BE(end + k * 2);
        const delta = t.readInt16BE(deltas + k * 2);
        const offsetPos = offsets + k * 2, offset = t.readUInt16BE(offsetPos);
        for (let c = first; c <= last && c < 0xffff; c++) {
          const glyph = offset ? t.readUInt16BE(offsetPos + offset + (c - first) * 2) : c;
          if (glyph && ((glyph + delta) & 0xffff)) set.add(c);
        }
      }
    }
  }
  return set;
}

describe('bundled font (44c verifier)', () => {
  it('assets/fonts holds only the two WOFF2 files and the licence, with the manifest hashes', () => {
    expect(readdirSync('assets/fonts').sort()).toEqual([...Object.keys(HASHES), 'OFL.txt'].sort());
    for (const [name, hash] of Object.entries(HASHES)) {
      expect(createHash('sha256').update(readFileSync(`assets/fonts/${name}`)).digest('hex'), name).toBe(hash);
    }
  });

  it('the README credits the font and the licence file is the OFL', () => {
    expect(readFileSync('README.md', 'utf8')).toContain('Libre Caslon Text');
    expect(readFileSync('assets/fonts/OFL.txt', 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });

  it('both weights cover every printable character in game strings', () => {
    const used = new Map<number, string>();
    for (const file of globSync('src/**/*.ts', { exclude: ['**/*.test.ts', '**/*.d.ts'] })) {
      const tree = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
      const visit = (node: ts.Node): void => {
        // The parsed text includes escaped characters and the literal parts of templates.
        if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
          for (const ch of node.text) {
            const code = ch.codePointAt(0)!;
            if (code > 126) used.set(code, file);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
    }
    for (const weight of ['Regular', 'Bold']) {
      const mapped = cmap(`assets/fonts/LibreCaslonText-${weight}-latin.woff2`);
      for (let c = 32; c < 127; c++) expect(mapped.has(c), `ASCII ${c} in ${weight}`).toBe(true);
      for (const [code, file] of used) expect(mapped.has(code), `${file}: U+${code.toString(16)} in ${weight}`).toBe(true);
    }
  });
});
